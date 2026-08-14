import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureValidToken, LazadaAccountRow } from '@/lib/lazada/api';
import {
  getSessionDetail, getSessionList, getMessages as getLazadaMessages,
  sendChatText, sendChatImage, parseLazadaMessageContent, LazadaImMessage, LazadaSession,
} from '@/lib/lazada/chat';
import { logIntegration } from '@/lib/integration-logger';
import type { SendMessageParams, SendMessageResult, GetMessagesParams } from './types';

// Lazada push payload (Push Mechanism). IM pushes carry session info in `data`;
// exact schema is not fully documented, so ingestion is notify-then-pull:
// any IM push just triggers a sync of that session via the IM API.
export interface LazadaPushPayload {
  seller_id?: string;
  message_type?: number;
  data?: Record<string, unknown>;
  timestamp?: number;
  site?: string;
}

export class LazadaChatService {
  // ─── Send Message ────────────────────────────────────────────────────

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { contactId, companyId, userId, type, text, imageUrl } = params;

    const { data: contact } = await supabaseAdmin
      .from('lazada_contacts')
      .select('id, session_id, seller_id, marketplace_account_id')
      .eq('id', contactId)
      .eq('company_id', companyId)
      .single();

    if (!contact) return { success: false, error: 'Contact not found' };

    const account = await this.resolveMarketplaceAccount(contact.marketplace_account_id, companyId, contact.seller_id);
    if (!account) {
      return { success: false, error: 'ร้าน Lazada ไม่ได้เชื่อมต่อหรือถูกปิดการใช้งาน — ตรวจสอบที่ ตั้งค่า > Integrations' };
    }

    let creds;
    try {
      creds = await ensureValidToken(account);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Lazada token หมดอายุ กรุณาเชื่อมต่อร้านใหม่' };
    }

    const startTime = Date.now();
    let sendResult: { message_id?: string; error?: string };

    if (type === 'text') {
      if (!text) return { success: false, error: 'Missing text' };
      sendResult = await sendChatText(creds, contact.session_id, text);
    } else if (type === 'image') {
      if (!imageUrl) return { success: false, error: 'Missing imageUrl' };
      sendResult = await sendChatImage(creds, contact.session_id, imageUrl);
    } else {
      return { success: false, error: 'Lazada รองรับเฉพาะข้อความและรูปภาพ' };
    }

    logIntegration({
      company_id: companyId,
      integration: 'lazada',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'chat_send_message',
      method: 'POST',
      api_path: '/im/message/send',
      status: sendResult.error ? 'error' : 'success',
      error_message: sendResult.error,
      reference_type: 'chat',
      reference_id: contact.session_id,
      reference_label: `Chat → session ${contact.session_id}`,
      duration_ms: Date.now() - startTime,
    });

    if (sendResult.error) {
      return { success: false, error: sendResult.error };
    }

    const messageContent = type === 'text' ? text! : '[รูปภาพ]';
    const rawMessage = type === 'image' ? { imageUrl } : null;

    const { data: savedMessage } = await supabaseAdmin
      .from('lazada_messages')
      .insert({
        company_id: companyId,
        lazada_contact_id: contactId,
        lazada_message_id: sendResult.message_id || null,
        direction: 'outgoing',
        message_type: type,
        content: messageContent,
        raw_message: rawMessage,
        sent_by: userId,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select('*, sent_by_user:user_profiles!sent_by(id, name)')
      .single();

    await supabaseAdmin
      .from('lazada_contacts')
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('company_id', companyId);

    return { success: true, message: savedMessage };
  }

  // ─── Get Messages ───────────────────────────────────────────────────

  async getMessages(params: GetMessagesParams) {
    const { contactId, companyId, limit, offset } = params;

    const { data: messages, error } = await supabaseAdmin
      .from('lazada_messages')
      .select('*, sent_by_user:user_profiles!sent_by(id, name)')
      .eq('company_id', companyId)
      .eq('lazada_contact_id', contactId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { messages: null, error: error.message };

    // Mark as read
    await supabaseAdmin
      .from('lazada_contacts')
      .update({ unread_count: 0 })
      .eq('id', contactId)
      .eq('company_id', companyId);

    return { messages: (messages || []).reverse(), error: null };
  }

  // ─── Webhook: notify-then-pull ──────────────────────────────────────

  /**
   * Process a Lazada push. IM payload schema varies, so this only extracts a
   * session_id hint and pulls the truth from the IM API. Idempotent.
   */
  async processPush(
    account: LazadaAccountRow,
    payload: LazadaPushPayload
  ): Promise<{ status: 'processed' | 'skipped'; detail?: string }> {
    const data = payload.data || {};
    const sessionId = (data.session_id || data.sessionId || data.session) as string | undefined;

    if (sessionId) {
      const synced = await this.syncSession(account, String(sessionId));
      return synced
        ? { status: 'processed', detail: `Synced session ${sessionId}` }
        : { status: 'skipped', detail: `Session sync failed: ${sessionId}` };
    }

    // No session id in payload — pull recent sessions (covers unknown shapes)
    const count = await this.syncRecentSessions(account, 5);
    return { status: 'processed', detail: `Synced ${count} recent sessions` };
  }

  /**
   * Pull one session (detail + latest messages) into DB.
   */
  async syncSession(account: LazadaAccountRow, sessionId: string): Promise<boolean> {
    try {
      const creds = await ensureValidToken(account);
      const detail = await getSessionDetail(creds, sessionId);
      const contact = await this.upsertContact(account, sessionId, detail);
      if (!contact) return false;

      const { messages } = await getLazadaMessages(creds, sessionId, { pageSize: 30 });
      await this.saveMessages(account, contact, messages);
      return true;
    } catch (err) {
      console.error('[Lazada Chat] syncSession error:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  /**
   * Pull the most recent N sessions + their latest messages.
   * Used for webhook payloads without session_id and initial backfill.
   */
  async syncRecentSessions(account: LazadaAccountRow, maxSessions = 10): Promise<number> {
    try {
      const creds = await ensureValidToken(account);
      const { sessions } = await getSessionList(creds, { pageSize: Math.min(maxSessions, 20) });
      let synced = 0;
      for (const session of sessions.slice(0, maxSessions)) {
        if (!session.session_id) continue;
        const contact = await this.upsertContact(account, session.session_id, session);
        if (!contact) continue;
        const { messages } = await getLazadaMessages(creds, session.session_id, { pageSize: 20 });
        await this.saveMessages(account, contact, messages);
        synced++;
      }
      return synced;
    } catch (err) {
      console.error('[Lazada Chat] syncRecentSessions error:', err instanceof Error ? err.message : err);
      return 0;
    }
  }

  // ─── Contact upsert ─────────────────────────────────────────────────

  private async upsertContact(
    account: LazadaAccountRow,
    sessionId: string,
    session: LazadaSession | null
  ) {
    const { data: existing } = await supabaseAdmin
      .from('lazada_contacts')
      .select('*')
      .eq('company_id', account.company_id)
      .eq('session_id', sessionId)
      .maybeSingle();

    if (existing) {
      // Refresh name/avatar/unread from Lazada when available
      if (session) {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (session.title && session.title !== existing.display_name) updates.display_name = session.title;
        if (session.head_url && session.head_url !== existing.picture_url) updates.picture_url = session.head_url;
        if (session.buyer_id && !existing.buyer_user_id) updates.buyer_user_id = session.buyer_id;
        if (typeof session.unread_count === 'number') updates.unread_count = session.unread_count;
        if (session.last_message_time) updates.last_message_at = new Date(session.last_message_time).toISOString();
        if (Object.keys(updates).length > 1) {
          await supabaseAdmin.from('lazada_contacts').update(updates).eq('id', existing.id);
          return { ...existing, ...updates };
        }
      }
      return existing;
    }

    const chatAccountId = await this.getOrCreateChatAccount(account);

    const { data: created, error } = await supabaseAdmin
      .from('lazada_contacts')
      .insert({
        company_id: account.company_id,
        chat_account_id: chatAccountId,
        marketplace_account_id: account.id,
        seller_id: account.shop_id,
        buyer_user_id: session?.buyer_id || null,
        session_id: sessionId,
        display_name: session?.title || 'Lazada User',
        picture_url: session?.head_url || null,
        status: 'active',
        unread_count: session?.unread_count ?? 0,
        last_message_at: session?.last_message_time ? new Date(session.last_message_time).toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: raced } = await supabaseAdmin
          .from('lazada_contacts')
          .select('*')
          .eq('company_id', account.company_id)
          .eq('session_id', sessionId)
          .single();
        return raced;
      }
      console.error('Failed to create Lazada contact:', error);
      return null;
    }
    return created;
  }

  // ─── Message persistence (dedupe by lazada_message_id) ──────────────

  private async saveMessages(
    account: LazadaAccountRow,
    contact: { id: string },
    messages: LazadaImMessage[]
  ) {
    if (messages.length === 0) return;

    const messageIds = messages.map(m => m.message_id).filter(Boolean);
    const { data: existingRows } = await supabaseAdmin
      .from('lazada_messages')
      .select('lazada_message_id')
      .eq('lazada_contact_id', contact.id)
      .in('lazada_message_id', messageIds);

    const existingIds = new Set((existingRows || []).map(r => r.lazada_message_id));
    const fresh = messages.filter(m => m.message_id && !existingIds.has(m.message_id));
    if (fresh.length === 0) return;

    const rows = fresh.map(m => {
      const { messageContent, messageType, metadata } = parseLazadaMessageContent(m);
      const isOutgoing = m.from_account_type === 2; // 2 = seller
      const messageTime = m.send_time ? new Date(m.send_time).toISOString() : new Date().toISOString();
      return {
        company_id: account.company_id,
        lazada_contact_id: contact.id,
        lazada_message_id: m.message_id,
        direction: isOutgoing ? 'outgoing' : 'incoming',
        message_type: messageType,
        content: messageContent,
        raw_message: Object.keys(metadata).length > 0 ? metadata : null,
        received_at: isOutgoing ? null : messageTime,
        sent_at: isOutgoing ? messageTime : null,
        created_at: messageTime, // keep thread order = actual send order
      };
    });

    const { error } = await supabaseAdmin.from('lazada_messages').insert(rows);
    if (error) console.error('Failed to save Lazada messages:', error);

    // Update last_message_at from the newest message
    const newest = Math.max(...fresh.map(m => m.send_time || 0));
    if (newest > 0) {
      await supabaseAdmin
        .from('lazada_contacts')
        .update({ last_message_at: new Date(newest).toISOString(), updated_at: new Date().toISOString() })
        .eq('id', contact.id);
    }
  }

  // ─── chat_accounts row (auto-created; honors settings toggle) ───────

  private async getOrCreateChatAccount(account: LazadaAccountRow): Promise<string | null> {
    const { data: accounts } = await supabaseAdmin
      .from('chat_accounts')
      .select('id, is_active, credentials')
      .eq('company_id', account.company_id)
      .eq('platform', 'lazada');

    for (const acc of accounts || []) {
      const creds = acc.credentials as Record<string, unknown>;
      if (creds?.marketplace_account_id === account.id || Number(creds?.shop_id) === account.shop_id) {
        return acc.id;
      }
    }

    const { data: created, error } = await supabaseAdmin
      .from('chat_accounts')
      .insert({
        company_id: account.company_id,
        platform: 'lazada',
        account_name: account.shop_name || `Lazada ${account.shop_id}`,
        credentials: { marketplace_account_id: account.id, shop_id: account.shop_id },
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create Lazada chat account:', error);
      return null;
    }
    return created?.id || null;
  }

  /** Chat enabled for this shop? (settings toggle) — used by webhook. */
  async isChatEnabled(account: LazadaAccountRow): Promise<boolean> {
    const { data: accounts } = await supabaseAdmin
      .from('chat_accounts')
      .select('id, is_active, credentials')
      .eq('company_id', account.company_id)
      .eq('platform', 'lazada');

    for (const acc of accounts || []) {
      const creds = acc.credentials as Record<string, unknown>;
      if (creds?.marketplace_account_id === account.id || Number(creds?.shop_id) === account.shop_id) {
        return acc.is_active;
      }
    }
    return true; // not created yet → will auto-create enabled on first message
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private async resolveMarketplaceAccount(
    marketplaceAccountId: string | null,
    companyId: string,
    sellerId: number
  ): Promise<LazadaAccountRow | null> {
    if (marketplaceAccountId) {
      const { data } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', marketplaceAccountId)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle();
      if (data) return data as LazadaAccountRow;
    }
    const { data } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('company_id', companyId)
      .eq('platform', 'lazada')
      .eq('shop_id', sellerId)
      .eq('is_active', true)
      .maybeSingle();
    return (data as LazadaAccountRow) || null;
  }
}

// ─── Standalone entry point for webhook ───────────────────────────────

const lazadaChatServiceSingleton = new LazadaChatService();

export async function processLazadaPush(
  account: LazadaAccountRow,
  payload: LazadaPushPayload
): Promise<{ status: 'processed' | 'skipped'; detail?: string }> {
  if (!(await lazadaChatServiceSingleton.isChatEnabled(account))) {
    return { status: 'skipped', detail: 'Lazada chat disabled for this shop' };
  }
  return lazadaChatServiceSingleton.processPush(account, payload);
}

export async function syncLazadaRecentSessions(account: LazadaAccountRow, maxSessions = 10): Promise<number> {
  return lazadaChatServiceSingleton.syncRecentSessions(account, maxSessions);
}

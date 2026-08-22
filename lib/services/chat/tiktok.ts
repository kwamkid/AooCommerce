import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureValidToken, TikTokAccountRow } from '@/lib/tiktok/api';
import {
  getConversations, getConversationMessages, sendChatText, sendChatImage,
  parseTikTokMessageContent, TikTokChatMessage, TikTokConversation,
} from '@/lib/tiktok/chat';
import { logIntegration } from '@/lib/integration-logger';
import type { SendMessageParams, SendMessageResult, GetMessagesParams } from './types';

// TikTok NEW_MESSAGE webhook payload — `data` carries conversation_id.
// Numeric push type codes for chat events are not pinned in the local docs,
// so the webhook route detects chat pushes by shape (data.conversation_id),
// and ingestion is notify-then-pull: pull the truth from the Customer
// Service API (idempotent, dedupe by message id).
export interface TikTokChatPushData {
  conversation_id?: string;
  message_id?: string;
  [key: string]: unknown;
}

export class TikTokChatService {
  // ─── Send Message ────────────────────────────────────────────────────

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { contactId, companyId, userId, type, text, imageUrl } = params;

    const { data: contact } = await supabaseAdmin
      .from('tiktok_contacts')
      .select('id, conversation_id, shop_id, marketplace_account_id, can_send_message')
      .eq('id', contactId)
      .eq('company_id', companyId)
      .single();

    if (!contact) return { success: false, error: 'Contact not found' };

    const account = await this.resolveMarketplaceAccount(contact.marketplace_account_id, companyId, contact.shop_id);
    if (!account) {
      return { success: false, error: 'ร้าน TikTok ไม่ได้เชื่อมต่อหรือถูกปิดการใช้งาน — ตรวจสอบที่ ตั้งค่า > ช่องทางขาย' };
    }

    let creds;
    try {
      creds = await ensureValidToken(account);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'TikTok token หมดอายุ กรุณาเชื่อมต่อร้านใหม่' };
    }

    const startTime = Date.now();
    let sendResult: { message_id?: string; error?: string };

    if (type === 'text') {
      if (!text) return { success: false, error: 'Missing text' };
      sendResult = await sendChatText(creds, contact.conversation_id, text);
    } else if (type === 'image') {
      if (!imageUrl) return { success: false, error: 'Missing imageUrl' };
      // sendChatImage ดาวน์โหลดจาก URL เราแล้วอัพโหลดเข้า TikTok เอง
      sendResult = await sendChatImage(creds, contact.conversation_id, imageUrl);
    } else {
      return { success: false, error: 'TikTok รองรับเฉพาะข้อความและรูปภาพ' };
    }

    logIntegration({
      company_id: companyId,
      integration: 'tiktok',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'chat_send_message',
      method: 'POST',
      api_path: `/customer_service/202309/conversations/${contact.conversation_id}/messages`,
      status: sendResult.error ? 'error' : 'success',
      error_message: sendResult.error,
      reference_type: 'chat',
      reference_id: contact.conversation_id,
      reference_label: `Chat → conversation ${contact.conversation_id}`,
      duration_ms: Date.now() - startTime,
    });

    if (sendResult.error) {
      return { success: false, error: sendResult.error };
    }

    const messageContent = type === 'text' ? text! : '[รูปภาพ]';
    const rawMessage = type === 'image' ? { imageUrl } : null;

    const { data: savedMessage } = await supabaseAdmin
      .from('tiktok_messages')
      .insert({
        company_id: companyId,
        tiktok_contact_id: contactId,
        tiktok_message_id: sendResult.message_id || null,
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
      .from('tiktok_contacts')
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('company_id', companyId);

    return { success: true, message: savedMessage };
  }

  // ─── Get Messages ───────────────────────────────────────────────────

  async getMessages(params: GetMessagesParams) {
    const { contactId, companyId, limit, offset } = params;

    const { data: messages, error } = await supabaseAdmin
      .from('tiktok_messages')
      .select('*, sent_by_user:user_profiles!sent_by(id, name)')
      .eq('company_id', companyId)
      .eq('tiktok_contact_id', contactId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { messages: null, error: error.message };

    // Mark as read
    await supabaseAdmin
      .from('tiktok_contacts')
      .update({ unread_count: 0 })
      .eq('id', contactId)
      .eq('company_id', companyId);

    return { messages: (messages || []).reverse(), error: null };
  }

  // ─── Webhook: notify-then-pull ──────────────────────────────────────

  async processPush(
    account: TikTokAccountRow,
    data: TikTokChatPushData
  ): Promise<{ status: 'processed' | 'skipped'; detail?: string }> {
    const conversationId = data.conversation_id ? String(data.conversation_id) : undefined;

    if (conversationId) {
      const synced = await this.syncConversation(account, conversationId);
      return synced
        ? { status: 'processed', detail: `Synced conversation ${conversationId}` }
        : { status: 'skipped', detail: `Conversation sync failed: ${conversationId}` };
    }

    // No conversation id — pull recent conversations (covers unknown shapes)
    const count = await this.syncRecentConversations(account, 5);
    return { status: 'processed', detail: `Synced ${count} recent conversations` };
  }

  /**
   * Pull one conversation's latest messages into DB.
   * Conversation detail comes from the list (Get Conversation 202601 needs a
   * newer API version) — the list carries participants + unread already.
   */
  async syncConversation(account: TikTokAccountRow, conversationId: string): Promise<boolean> {
    try {
      const creds = await ensureValidToken(account);

      // หา conversation จาก list หน้าแรก ๆ (ข้อความใหม่ดัน conversation ขึ้นบนเสมอ)
      let convo: TikTokConversation | null = null;
      let pageToken: string | undefined;
      for (let page = 0; page < 3 && !convo; page++) {
        const { conversations, nextPageToken, error } = await getConversations(creds, { pageSize: 20, pageToken });
        if (error) break;
        convo = conversations.find(c => c.id === conversationId) || null;
        if (!nextPageToken) break;
        pageToken = nextPageToken;
      }

      const contact = await this.upsertContact(account, conversationId, convo);
      if (!contact) return false;

      const { messages } = await getConversationMessages(creds, conversationId, { pageSize: 10 });
      await this.saveMessages(account, contact, messages);
      return true;
    } catch (err) {
      console.error('[TikTok Chat] syncConversation error:', err instanceof Error ? err.message : err);
      return false;
    }
  }

  /**
   * Pull the most recent N conversations + their latest messages.
   * Used for webhook payloads without conversation_id and initial backfill.
   */
  async syncRecentConversations(account: TikTokAccountRow, maxConversations = 10): Promise<number> {
    try {
      const creds = await ensureValidToken(account);
      const { conversations } = await getConversations(creds, { pageSize: Math.min(maxConversations, 20) });
      let synced = 0;
      for (const convo of conversations.slice(0, maxConversations)) {
        if (!convo.id) continue;
        const contact = await this.upsertContact(account, convo.id, convo);
        if (!contact) continue;
        const { messages } = await getConversationMessages(creds, convo.id, { pageSize: 10 });
        await this.saveMessages(account, contact, messages);
        synced++;
      }
      return synced;
    } catch (err) {
      console.error('[TikTok Chat] syncRecentConversations error:', err instanceof Error ? err.message : err);
      return 0;
    }
  }

  // ─── Contact upsert ─────────────────────────────────────────────────

  private async upsertContact(
    account: TikTokAccountRow,
    conversationId: string,
    convo: TikTokConversation | null
  ) {
    const buyer = convo?.participants?.find(p => p.role === 'BUYER');

    const { data: existing } = await supabaseAdmin
      .from('tiktok_contacts')
      .select('*')
      .eq('company_id', account.company_id)
      .eq('conversation_id', conversationId)
      .maybeSingle();

    if (existing) {
      if (convo) {
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (buyer?.nickname && buyer.nickname !== existing.display_name) updates.display_name = buyer.nickname;
        if (buyer?.avatar && buyer.avatar !== existing.picture_url) updates.picture_url = buyer.avatar;
        if (buyer?.user_id && !existing.buyer_user_id) updates.buyer_user_id = buyer.user_id;
        if (buyer?.im_user_id && !existing.buyer_im_user_id) updates.buyer_im_user_id = buyer.im_user_id;
        if (typeof convo.unread_count === 'number') updates.unread_count = convo.unread_count;
        if (typeof convo.can_send_message === 'boolean') updates.can_send_message = convo.can_send_message;
        if (convo.latest_message?.create_time) {
          updates.last_message_at = new Date(convo.latest_message.create_time * 1000).toISOString();
        }
        if (Object.keys(updates).length > 1) {
          await supabaseAdmin.from('tiktok_contacts').update(updates).eq('id', existing.id);
          return { ...existing, ...updates };
        }
      }
      return existing;
    }

    const chatAccountId = await this.getOrCreateChatAccount(account);

    const { data: created, error } = await supabaseAdmin
      .from('tiktok_contacts')
      .insert({
        company_id: account.company_id,
        chat_account_id: chatAccountId,
        marketplace_account_id: account.id,
        shop_id: account.shop_id,
        buyer_user_id: buyer?.user_id || null,
        buyer_im_user_id: buyer?.im_user_id || null,
        conversation_id: conversationId,
        display_name: buyer?.nickname || 'TikTok User',
        picture_url: buyer?.avatar || null,
        status: 'active',
        unread_count: convo?.unread_count ?? 0,
        can_send_message: convo?.can_send_message ?? true,
        last_message_at: convo?.latest_message?.create_time
          ? new Date(convo.latest_message.create_time * 1000).toISOString()
          : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: raced } = await supabaseAdmin
          .from('tiktok_contacts')
          .select('*')
          .eq('company_id', account.company_id)
          .eq('conversation_id', conversationId)
          .single();
        return raced;
      }
      console.error('Failed to create TikTok contact:', error);
      return null;
    }
    return created;
  }

  // ─── Message persistence (dedupe by tiktok_message_id) ──────────────

  private async saveMessages(
    account: TikTokAccountRow,
    contact: { id: string },
    messages: TikTokChatMessage[]
  ) {
    // ข้อความที่ระบบบอกว่าไม่ควรโชว์ฝั่งคนขาย (เช่นคำขอให้ลูกค้าให้คะแนน) ไม่เก็บ
    const visible = messages.filter(m => m.id && m.is_visible !== false);
    if (visible.length === 0) return;

    const messageIds = visible.map(m => m.id);
    const { data: existingRows } = await supabaseAdmin
      .from('tiktok_messages')
      .select('tiktok_message_id')
      .eq('tiktok_contact_id', contact.id)
      .in('tiktok_message_id', messageIds);

    const existingIds = new Set((existingRows || []).map(r => r.tiktok_message_id));
    const fresh = visible.filter(m => !existingIds.has(m.id));
    if (fresh.length === 0) return;

    const rows = fresh.map(m => {
      const { messageContent, messageType, metadata } = parseTikTokMessageContent(m);
      const isOutgoing = m.sender?.role === 'SHOP' || m.sender?.role === 'CUSTOMER_SERVICE';
      const messageTime = m.create_time ? new Date(m.create_time * 1000).toISOString() : new Date().toISOString();
      return {
        company_id: account.company_id,
        tiktok_contact_id: contact.id,
        tiktok_message_id: m.id,
        direction: isOutgoing ? 'outgoing' : 'incoming',
        message_type: messageType,
        content: messageContent,
        raw_message: Object.keys(metadata).length > 0 ? metadata : null,
        received_at: isOutgoing ? null : messageTime,
        sent_at: isOutgoing ? messageTime : null,
        created_at: messageTime, // keep thread order = actual send order
      };
    });

    const { error } = await supabaseAdmin.from('tiktok_messages').insert(rows);
    if (error) console.error('Failed to save TikTok messages:', error);

    const newest = Math.max(...fresh.map(m => m.create_time || 0));
    if (newest > 0) {
      await supabaseAdmin
        .from('tiktok_contacts')
        .update({ last_message_at: new Date(newest * 1000).toISOString(), updated_at: new Date().toISOString() })
        .eq('id', contact.id);
    }
  }

  // ─── chat_accounts row (auto-created; honors settings toggle) ───────

  private async getOrCreateChatAccount(account: TikTokAccountRow): Promise<string | null> {
    const { data: accounts } = await supabaseAdmin
      .from('chat_accounts')
      .select('id, is_active, credentials')
      .eq('company_id', account.company_id)
      .eq('platform', 'tiktok');

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
        platform: 'tiktok',
        account_name: account.shop_name || `TikTok ${account.shop_id}`,
        credentials: { marketplace_account_id: account.id, shop_id: account.shop_id },
        is_active: true,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create TikTok chat account:', error);
      return null;
    }
    return created?.id || null;
  }

  /** Chat enabled for this shop? (settings toggle) — used by webhook. */
  async isChatEnabled(account: TikTokAccountRow): Promise<boolean> {
    const { data: accounts } = await supabaseAdmin
      .from('chat_accounts')
      .select('id, is_active, credentials')
      .eq('company_id', account.company_id)
      .eq('platform', 'tiktok');

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
    shopId: number
  ): Promise<TikTokAccountRow | null> {
    if (marketplaceAccountId) {
      const { data } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', marketplaceAccountId)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle();
      if (data) return data as TikTokAccountRow;
    }
    const { data } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('company_id', companyId)
      .eq('platform', 'tiktok')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .maybeSingle();
    return (data as TikTokAccountRow) || null;
  }
}

// ─── Standalone entry point for webhook ───────────────────────────────

const tiktokChatServiceSingleton = new TikTokChatService();

export async function processTikTokChatPush(
  account: TikTokAccountRow,
  data: TikTokChatPushData
): Promise<{ status: 'processed' | 'skipped'; detail?: string }> {
  if (!(await tiktokChatServiceSingleton.isChatEnabled(account))) {
    return { status: 'skipped', detail: 'TikTok chat disabled for this shop' };
  }
  return tiktokChatServiceSingleton.processPush(account, data);
}

export async function syncTikTokRecentConversations(account: TikTokAccountRow, maxConversations = 10): Promise<number> {
  return tiktokChatServiceSingleton.syncRecentConversations(account, maxConversations);
}

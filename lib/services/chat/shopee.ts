import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendChatPush } from '@/lib/push/send';
import { ensureValidToken, ShopeeAccountRow } from '@/lib/shopee/api';
import { sendChatText, sendChatImage, getConversationInfo, resolveShopeeCdnUrl } from '@/lib/shopee/chat';
import { logIntegration } from '@/lib/integration-logger';
import type { SendMessageParams, SendMessageResult, GetMessagesParams } from './types';

// ─── Webhook payload types (push code 10 = webchat_push) ───────────────

export interface ShopeeWebchatMessageContent {
  text?: string;
  url?: string;              // image — may be a bare CDN file id
  thumb_url?: string;
  thumb_width?: number;
  thumb_height?: number;
  video_url?: string;        // video — may be a bare CDN file id
  duration_seconds?: number;
  sticker_id?: string;
  sticker_package_id?: string;
  item_id?: number;
  shop_id?: number;          // present for item messages
  order_sn?: string;
  [key: string]: unknown;
}

export interface ShopeeWebchatContent {
  message_id?: string;
  shop_id?: number;          // to_shop_id per Shopee docs
  from_id?: number;
  from_user_name?: string;
  to_id?: number;
  to_user_name?: string;
  from_shop_id?: number;
  to_shop_id?: number;
  message_type?: string;     // text | image | video | sticker | item | order | faq_liveagent | bundle_message
  content?: ShopeeWebchatMessageContent;
  conversation_id?: string;
  created_timestamp?: number;
  region?: string;
  status?: string;           // normal | auto_reply | web_chat | ...
  business_type?: number;    // 0 = buyer-seller, 11 = affiliate-seller
  messages?: string[];       // bundle_message
  [key: string]: unknown;
}

export interface ShopeeWebchatPayload {
  shop_id?: number;
  code?: number;
  timestamp?: number;
  data?: {
    type?: string;           // 'message' | 'notification'
    region?: string;
    content?: ShopeeWebchatContent;
  };
}

// ─── Service ───────────────────────────────────────────────────────────

export class ShopeeChatService {
  // ─── Send Message ────────────────────────────────────────────────────

  async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { contactId, companyId, userId, type, text, imageUrl } = params;

    const { data: contact } = await supabaseAdmin
      .from('shopee_contacts')
      .select('id, buyer_user_id, conversation_id, shop_id, marketplace_account_id')
      .eq('id', contactId)
      .eq('company_id', companyId)
      .single();

    if (!contact) return { success: false, error: 'Contact not found' };

    const account = await this.resolveMarketplaceAccount(contact.marketplace_account_id, companyId, contact.shop_id);
    if (!account) {
      return { success: false, error: 'ร้าน Shopee ไม่ได้เชื่อมต่อหรือถูกปิดการใช้งาน — ตรวจสอบที่ ตั้งค่า > Marketplace' };
    }

    let creds;
    try {
      creds = await ensureValidToken(account);
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Shopee token หมดอายุ กรุณาเชื่อมต่อร้านใหม่' };
    }

    const startTime = Date.now();
    let sendResult: { message_id?: string; error?: string; shopeeImageUrl?: string };

    if (type === 'text') {
      if (!text) return { success: false, error: 'Missing text' };
      sendResult = await sendChatText(creds, contact.buyer_user_id, text);
    } else if (type === 'image') {
      if (!imageUrl) return { success: false, error: 'Missing imageUrl' };
      sendResult = await sendChatImage(creds, contact.buyer_user_id, imageUrl);
    } else {
      return { success: false, error: 'Shopee รองรับเฉพาะข้อความและรูปภาพ' };
    }

    logIntegration({
      company_id: companyId,
      integration: 'shopee',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'chat_send_message',
      method: 'POST',
      api_path: '/api/v2/sellerchat/send_message',
      status: sendResult.error ? 'error' : 'success',
      error_message: sendResult.error,
      reference_type: 'chat',
      reference_id: contact.conversation_id,
      reference_label: `Chat → buyer ${contact.buyer_user_id}`,
      duration_ms: Date.now() - startTime,
    });

    if (sendResult.error) {
      return { success: false, error: sendResult.error };
    }

    // Save to DB
    const { messageContent, rawMessage } = this.buildMessageContent(type, text, imageUrl);

    const { data: savedMessage } = await supabaseAdmin
      .from('shopee_messages')
      .insert({
        company_id: companyId,
        shopee_contact_id: contactId,
        shopee_message_id: sendResult.message_id || null,
        direction: 'outgoing',
        message_type: type,
        content: messageContent,
        raw_message: Object.keys(rawMessage).length > 0 ? rawMessage : null,
        sent_by: userId,
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .select('*, sent_by_user:user_profiles!sent_by(id, name)')
      .single();

    await supabaseAdmin
      .from('shopee_contacts')
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', contactId)
      .eq('company_id', companyId);

    return { success: true, message: savedMessage };
  }

  // ─── Get Messages ───────────────────────────────────────────────────

  async getMessages(params: GetMessagesParams) {
    const { contactId, companyId, limit, offset } = params;

    const { data: messages, error } = await supabaseAdmin
      .from('shopee_messages')
      .select('*, sent_by_user:user_profiles!sent_by(id, name)')
      .eq('company_id', companyId)
      .eq('shopee_contact_id', contactId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return { messages: null, error: error.message };

    // Mark as read
    // .gt() ไม่ใช่การกันงานเปล่า — UPDATE ค่าเดิมก็ยังยิง Realtime event ทำให้ทุกหน้าแชท
    // ที่เปิดอยู่ + header ของทุกคนดึงรายชื่อใหม่ทั้งชุด (เปิดแชทที่อ่านแล้วก็เกิด)
    await supabaseAdmin
      .from('shopee_contacts')
      .update({ unread_count: 0 })
      .eq('id', contactId)
      .eq('company_id', companyId)
      .gt('unread_count', 0);

    return { messages: (messages || []).reverse(), error: null };
  }

  // ─── Webhook: process webchat push (code 10) ─────────────────────────

  /**
   * Process a webchat push. Returns processed/skipped so the webhook route
   * can update marketplace_webhook_log accordingly.
   */
  async processWebchatPush(
    account: ShopeeAccountRow,
    payload: ShopeeWebchatPayload
  ): Promise<{ status: 'processed' | 'skipped'; detail?: string }> {
    const data = payload.data;
    if (!data || data.type !== 'message') {
      return { status: 'skipped', detail: `webchat type: ${data?.type || 'unknown'}` };
    }

    const c = data.content;
    if (!c?.conversation_id || !c.message_id) {
      return { status: 'skipped', detail: 'Missing conversation_id or message_id' };
    }

    // Only buyer-seller chat (business_type 0/undefined); skip affiliate chat (11)
    if (c.business_type && c.business_type !== 0) {
      return { status: 'skipped', detail: `business_type: ${c.business_type}` };
    }

    // Direction: message sent BY our shop (from Shopee app/webchat/API) = outgoing
    const isOutgoing = c.from_shop_id != null
      ? c.from_shop_id === account.shop_id
      : c.from_user_name != null && c.from_user_name === account.shop_name;

    const buyerUserId = isOutgoing ? c.to_id : c.from_id;
    const buyerName = (isOutgoing ? c.to_user_name : c.from_user_name) || undefined;
    if (!buyerUserId) {
      return { status: 'skipped', detail: 'Missing buyer user id' };
    }

    // Honor the settings toggle: existing chat account with is_active=false → skip
    const chatAccount = await this.getOrCreateChatAccount(account);
    if (chatAccount && !chatAccount.is_active) {
      return { status: 'skipped', detail: 'Shopee chat disabled for this shop' };
    }

    const contact = await this.getOrCreateContact(account, c.conversation_id, buyerUserId, buyerName, chatAccount?.id || null);
    if (!contact) {
      return { status: 'skipped', detail: 'Failed to create contact' };
    }

    // Dedupe — our own API sends also arrive as pushes
    const { data: existing } = await supabaseAdmin
      .from('shopee_messages')
      .select('id')
      .eq('company_id', account.company_id)
      .eq('shopee_contact_id', contact.id)
      .eq('shopee_message_id', c.message_id)
      .maybeSingle();

    if (existing) {
      return { status: 'processed', detail: 'Duplicate message (already saved)' };
    }

    const { messageContent, messageType, metadata } = this.parseWebchatContent(c, data.region);
    const messageTime = c.created_timestamp
      ? new Date(c.created_timestamp * 1000).toISOString()
      : new Date().toISOString();

    const { error: insertError } = await supabaseAdmin
      .from('shopee_messages')
      .insert({
        company_id: account.company_id,
        shopee_contact_id: contact.id,
        shopee_message_id: c.message_id,
        direction: isOutgoing ? 'outgoing' : 'incoming',
        message_type: messageType,
        content: messageContent,
        raw_message: Object.keys(metadata).length > 0 ? metadata : null,
        received_at: isOutgoing ? null : messageTime,
        sent_at: isOutgoing ? messageTime : null,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      throw new Error(`Failed to save Shopee message: ${insertError.message}`);
    }

    const contactUpdate: Record<string, unknown> = {
      last_message_at: messageTime,
      updated_at: new Date().toISOString(),
    };
    if (!isOutgoing) {
      contactUpdate.unread_count = (contact.unread_count || 0) + 1;
    } else {
      // ร้านตอบไปแล้ว (ไม่ว่าจะตอบจากระบบเราหรือจากแอป Shopee) = อ่านแล้ว
      // ไม่เคลียร์ = ตัวเลขยังไม่อ่านค้างทั้งที่คุยจบไปแล้ว
      contactUpdate.unread_count = 0;
    }
    if (buyerName && contact.display_name !== buyerName && !isOutgoing) {
      contactUpdate.display_name = buyerName;
    }

    await supabaseAdmin
      .from('shopee_contacts')
      .update(contactUpdate)
      .eq('id', contact.id);

    // Push แจ้งเตือนแชทใหม่ — เฉพาะขาเข้าจากลูกค้า (ข้อความเก่าถูกกรองด้วยเวลาใน helper)
    if (!isOutgoing) {
      await sendChatPush(account.company_id, {
        platform: 'shopee',
        senderName: buyerName || contact.display_name,
        preview: messageContent,
        contactId: contact.id,
        messageTime: messageTime,
      });
    }

    return { status: 'processed' };
  }

  // ─── Webhook: Get or Create Contact ─────────────────────────────────

  async getOrCreateContact(
    account: ShopeeAccountRow,
    conversationId: string,
    buyerUserId: number,
    buyerName?: string,
    chatAccountId?: string | null
  ) {
    const { data: existing } = await supabaseAdmin
      .from('shopee_contacts')
      .select('*')
      .eq('company_id', account.company_id)
      .eq('conversation_id', conversationId)
      .single();

    if (existing) return existing;

    // Enrich with buyer name/avatar from get_one_conversation (best-effort)
    let displayName = buyerName || 'Shopee User';
    let pictureUrl: string | null = null;
    try {
      const creds = await ensureValidToken(account);
      const convo = await getConversationInfo(creds, conversationId);
      if (convo) {
        displayName = convo.to_name || displayName;
        pictureUrl = resolveShopeeCdnUrl(convo.to_avatar) || null;
      }
    } catch (err) {
      console.log('[Shopee Chat] Could not fetch conversation info:', err instanceof Error ? err.message : err);
    }

    const resolvedChatAccountId = chatAccountId !== undefined
      ? chatAccountId
      : (await this.getOrCreateChatAccount(account))?.id || null;

    const { data: newContact, error } = await supabaseAdmin
      .from('shopee_contacts')
      .insert({
        company_id: account.company_id,
        chat_account_id: resolvedChatAccountId,
        marketplace_account_id: account.id,
        shop_id: account.shop_id,
        buyer_user_id: buyerUserId,
        conversation_id: conversationId,
        display_name: displayName,
        picture_url: pictureUrl,
        status: 'active',
        unread_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      // Race: another push created it concurrently — refetch
      if (error.code === '23505') {
        const { data: raced } = await supabaseAdmin
          .from('shopee_contacts')
          .select('*')
          .eq('company_id', account.company_id)
          .eq('conversation_id', conversationId)
          .single();
        return raced;
      }
      console.error('Failed to create Shopee contact:', error);
      return null;
    }
    return newContact;
  }

  // ─── chat_accounts row (auto-created; links chat UI to the shop) ────

  private async getOrCreateChatAccount(account: ShopeeAccountRow): Promise<{ id: string; is_active: boolean } | null> {
    const { data: accounts } = await supabaseAdmin
      .from('chat_accounts')
      .select('id, is_active, credentials')
      .eq('company_id', account.company_id)
      .eq('platform', 'shopee');

    for (const acc of accounts || []) {
      const creds = acc.credentials as Record<string, unknown>;
      if (creds?.marketplace_account_id === account.id || Number(creds?.shop_id) === account.shop_id) {
        return { id: acc.id, is_active: acc.is_active };
      }
    }

    const { data: created, error } = await supabaseAdmin
      .from('chat_accounts')
      .insert({
        company_id: account.company_id,
        platform: 'shopee',
        account_name: account.shop_name || `Shopee ${account.shop_id}`,
        credentials: { marketplace_account_id: account.id, shop_id: account.shop_id },
        is_active: true,
      })
      .select('id, is_active')
      .single();

    if (error) {
      console.error('Failed to create Shopee chat account:', error);
      return null;
    }
    return created ? { id: created.id, is_active: created.is_active } : null;
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private async resolveMarketplaceAccount(
    marketplaceAccountId: string | null,
    companyId: string,
    shopId: number
  ): Promise<ShopeeAccountRow | null> {
    if (marketplaceAccountId) {
      const { data } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', marketplaceAccountId)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .maybeSingle();
      if (data) return data as ShopeeAccountRow;
    }
    // Fallback: by shop_id (e.g. shop re-connected under a new account row)
    const { data } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('company_id', companyId)
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .maybeSingle();
    return (data as ShopeeAccountRow) || null;
  }

  private buildMessageContent(type: string, text?: string, imageUrl?: string) {
    let messageContent = '';
    let rawMessage: Record<string, unknown> = {};

    if (type === 'text') {
      messageContent = text!;
    } else if (type === 'image') {
      messageContent = '[รูปภาพ]';
      rawMessage = { imageUrl };
    }

    return { messageContent, rawMessage };
  }

  private parseWebchatContent(c: ShopeeWebchatContent, region?: string): {
    messageContent: string; messageType: string; metadata: Record<string, unknown>;
  } {
    const body = c.content || {};
    const messageType = c.message_type || 'text';
    let messageContent = '';
    const metadata: Record<string, unknown> = {};

    if (messageType === 'text' || messageType === 'faq_liveagent') {
      messageContent = body.text || '[ข้อความ]';
    } else if (messageType === 'image') {
      messageContent = '[รูปภาพ]';
      const url = resolveShopeeCdnUrl(body.url, region) || resolveShopeeCdnUrl(body.thumb_url, region);
      if (url) metadata.imageUrl = url;
      const thumb = resolveShopeeCdnUrl(body.thumb_url, region);
      if (thumb) metadata.thumbUrl = thumb;
    } else if (messageType === 'video') {
      messageContent = '[วิดีโอ]';
      const videoUrl = resolveShopeeCdnUrl(body.video_url, region);
      if (videoUrl) metadata.videoUrl = videoUrl;
      const thumb = resolveShopeeCdnUrl(body.thumb_url, region);
      if (thumb) metadata.thumbUrl = thumb;
      if (body.duration_seconds) metadata.duration_seconds = body.duration_seconds;
    } else if (messageType === 'sticker') {
      messageContent = '[สติกเกอร์]';
      if (body.sticker_id) metadata.sticker_id = body.sticker_id;
      if (body.sticker_package_id) metadata.sticker_package_id = body.sticker_package_id;
    } else if (messageType === 'item') {
      messageContent = '[สินค้า]';
      if (body.item_id) {
        metadata.item_id = body.item_id;
        const shopId = body.shop_id || c.shop_id;
        if (shopId) {
          metadata.shop_id = shopId;
          const itemUrl = `https://shopee.co.th/product/${shopId}/${body.item_id}`;
          metadata.itemUrl = itemUrl;
          // linkUrl/linkTitle → renders as a link bubble (FallbackBubble)
          metadata.linkUrl = itemUrl;
          metadata.linkTitle = 'ดูสินค้าใน Shopee';
        }
      }
    } else if (messageType === 'order') {
      messageContent = body.order_sn ? `[คำสั่งซื้อ ${body.order_sn}]` : '[คำสั่งซื้อ]';
      if (body.order_sn) metadata.order_sn = body.order_sn;
    } else if (messageType === 'bundle_message') {
      messageContent = '[หลายข้อความ]';
      if (c.messages) metadata.bundle_message_ids = c.messages;
    } else {
      messageContent = `[${messageType}]`;
    }

    if (c.status && c.status !== 'normal') metadata.shopee_status = c.status;

    return { messageContent, messageType, metadata };
  }
}

// ─── Standalone entry point for webhook + retry worker ────────────────

const shopeeChatServiceSingleton = new ShopeeChatService();

export async function processShopeeWebchatPush(
  account: ShopeeAccountRow,
  payload: ShopeeWebchatPayload
): Promise<{ status: 'processed' | 'skipped'; detail?: string }> {
  return shopeeChatServiceSingleton.processWebchatPush(account, payload);
}

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendChatPush } from '@/lib/push/send';
import { ensureValidToken, ShopeeAccountRow } from '@/lib/shopee/api';
import {
  sendChatText, sendChatImage, getConversationInfo, resolveShopeeCdnUrl,
  getConversationMessages, getConversationList, type ShopeeChatApiMessage,
} from '@/lib/shopee/chat';
import {
  createShopeeEnrichContext, resolveShopeeItemCard, resolveShopeeOrderCard,
  type ShopeeEnrichContext,
} from '@/lib/shopee/chat-enrich';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
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
  item_id?: number | string;
  shop_id?: number;          // present for item messages
  order_sn?: string;
  /** bundle_message — id ของข้อความย่อยที่ Shopee "ไม่" push มาทีละใบ */
  messages?: string[];
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

// ─── Normalisation (ใช้ร่วมกันระหว่าง push กับ pull) ──────────────────
//
// ข้อความใบเดียวกันต้องหน้าตาเหมือนกันเป๊ะ ไม่ว่าจะเข้ามาทาง webhook push หรือถูก
// ดึงกลับมาด้วย get_message — ไม่งั้นแถวเดิมที่ pull มาซ้ำจะดูเป็นคนละใบ และ
// การ์ดสินค้า/ออเดอร์จะมีเฉพาะข้อความที่มาทางใดทางหนึ่ง

export interface ShopeeNormalizableMessage {
  message_type?: string;
  content?: ShopeeWebchatMessageContent;
  /** normal | offwork_autoreply | user_chat | auto_reply | ... */
  status?: string;
  /** openapi | ios | android | server (server = ระบบของ Shopee ตอบเอง) */
  source?: string;
  /** shop ที่การ์ดสินค้าอ้างถึง (push ใส่ไว้ระดับบนของ content) */
  shop_id?: number;
  /** bundle_message — id ของข้อความย่อย */
  bundle_message_ids?: string[];
}

export interface ShopeeNormalizedMessage {
  messageContent: string;
  messageType: string;
  metadata: Record<string, unknown>;
}

/** ระบบของ Shopee เป็นคนตอบ (ตอบอัตโนมัตินอกเวลา / แชทบอท) ไม่ใช่คนของร้าน */
function isShopeeAutomation(status?: string, source?: string): boolean {
  return (!!status && /autoreply|auto_reply/i.test(status)) || source === 'server';
}

export async function normalizeShopeeMessage(
  input: ShopeeNormalizableMessage,
  ctx: { enrich: ShopeeEnrichContext; region?: string }
): Promise<ShopeeNormalizedMessage> {
  const body = input.content || {};
  const messageType = input.message_type || 'text';
  let messageContent = '';
  const metadata: Record<string, unknown> = {};

  if (messageType === 'text') {
    messageContent = body.text || '[ข้อความ]';
  } else if (messageType === 'faq_liveagent') {
    // ลูกค้ากดปุ่ม "คุยกับเจ้าหน้าที่" — เป็นเหตุการณ์ ไม่ใช่คำพูด → หน้าแชทวาดเป็นชิปกลางจอ
    messageContent = body.text || 'ลูกค้าขอคุยกับเจ้าหน้าที่';
    metadata.system_event = 'faq_liveagent';
  } else if (messageType === 'image') {
    messageContent = '[รูปภาพ]';
    const url = resolveShopeeCdnUrl(body.url, ctx.region) || resolveShopeeCdnUrl(body.thumb_url, ctx.region);
    if (url) metadata.imageUrl = url;
    const thumb = resolveShopeeCdnUrl(body.thumb_url, ctx.region);
    if (thumb) metadata.thumbUrl = thumb;
  } else if (messageType === 'video') {
    messageContent = '[วิดีโอ]';
    const videoUrl = resolveShopeeCdnUrl(body.video_url, ctx.region);
    if (videoUrl) metadata.videoUrl = videoUrl;
    const thumb = resolveShopeeCdnUrl(body.thumb_url, ctx.region);
    if (thumb) metadata.thumbUrl = thumb;
    if (body.duration_seconds) metadata.duration_seconds = body.duration_seconds;
  } else if (messageType === 'sticker') {
    messageContent = '[สติกเกอร์]';
    if (body.sticker_id) metadata.sticker_id = body.sticker_id;
    if (body.sticker_package_id) metadata.sticker_package_id = body.sticker_package_id;
  } else if (messageType === 'item') {
    messageContent = '[สินค้า]';
    if (body.item_id != null) {
      const itemId = String(body.item_id);
      const shopId = body.shop_id ?? input.shop_id ?? ctx.enrich.account.shop_id;
      metadata.item_id = itemId;
      if (shopId) metadata.shop_id = shopId;

      const card = await resolveShopeeItemCard(ctx.enrich, itemId, shopId);
      metadata.item = card;
      // ชื่อสินค้าอยู่ในตัว content ด้วย — รายชื่อแชทกับช่องค้นหาอ่านจากคอลัมน์นี้
      if (card.name) messageContent = `[สินค้า] ${card.name}`;
      // ลิงก์เดิมยังอยู่ เผื่อ renderer เก่า/ข้อความที่เติมเนื้อไม่สำเร็จ
      metadata.itemUrl = card.shopee_url;
      metadata.linkUrl = card.shopee_url;
      metadata.linkTitle = 'ดูสินค้าใน Shopee';
    }
  } else if (messageType === 'order') {
    messageContent = body.order_sn ? `[คำสั่งซื้อ ${body.order_sn}]` : '[คำสั่งซื้อ]';
    if (body.order_sn) {
      metadata.order_sn = body.order_sn;
      const card = await resolveShopeeOrderCard(ctx.enrich, body.order_sn);
      metadata.order = card;
      if (card.order_id) metadata.order_id = card.order_id;
    }
  } else if (messageType === 'bundle_message') {
    // เก็บไว้เผื่อ debug — ปกติแถวชนิดนี้ไม่ถูกบันทึก (ดู processWebchatPush)
    messageContent = '[หลายข้อความ]';
    const ids = input.bundle_message_ids || body.messages;
    if (ids) metadata.bundle_message_ids = ids;
  } else {
    messageContent = `[${messageType}]`;
  }

  if (input.status && input.status !== 'normal') metadata.shopee_status = input.status;
  if (input.source) metadata.shopee_source = input.source;
  if (isShopeeAutomation(input.status, input.source)) metadata.auto_reply = true;

  return { messageContent, messageType, metadata };
}

/** แปลงข้อความจาก get_message ให้เข้ารูปเดียวกับ push ก่อนส่งเข้า normalize */
function toNormalizable(m: ShopeeChatApiMessage): ShopeeNormalizableMessage {
  return {
    message_type: m.message_type,
    content: (m.content || {}) as ShopeeWebchatMessageContent,
    status: m.status,
    source: m.source,
    shop_id: Number((m.content as Record<string, unknown> | undefined)?.shop_id) || undefined,
    bundle_message_ids: ((m.content as Record<string, unknown> | undefined)?.messages as string[]) || undefined,
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

    const messageTime = c.created_timestamp
      ? new Date(c.created_timestamp * 1000).toISOString()
      : new Date().toISOString();

    // bundle_message = "บทสนทนากับแชทบอทก่อนกดเรียกเจ้าหน้าที่" ที่ Shopee ส่งมาแค่
    // list ของ id · เก็บฟอง "[หลายข้อความ]" ไว้ก็ไม่มีใครอ่านออก → ดึงตัวจริงมาแทน
    // แล้วไม่บันทึกใบ bundle เอง (พร้อมลบใบเก่าที่เคยบันทึกไว้ก่อนมีการแก้นี้)
    if (c.message_type === 'bundle_message') {
      const bundleIds = c.messages || c.content?.messages || [];
      const pulled = await this.syncConversationMessages(account, contact, {
        pages: 3,
        targetMessageIds: bundleIds.length > 0 ? bundleIds : undefined,
        // ใบ bundle ไม่ได้ถูกบันทึก จึงยังไม่มีใครนับ unread ให้ข้อความชุดนี้
        countUnread: true,
      });

      // ลบทีหลัง (ไม่ใช่ก่อน) — ดึงเนื้อมาได้แล้วค่อยทิ้งฟองเปล่า
      await supabaseAdmin
        .from('shopee_messages')
        .delete()
        .eq('company_id', account.company_id)
        .eq('shopee_contact_id', contact.id)
        .eq('message_type', 'bundle_message');

      if (pulled.newestIncoming) {
        await sendChatPush(account.company_id, {
          platform: 'shopee',
          senderName: buyerName || contact.display_name,
          preview: pulled.newestIncoming.content,
          contactId: contact.id,
          messageTime: pulled.newestIncoming.at,
        });
      }
      return { status: 'processed', detail: `bundle_message → ดึงข้อความจริง ${pulled.inserted}/${bundleIds.length} ใบ` };
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

    const { messageContent, messageType, metadata } = await normalizeShopeeMessage(
      {
        message_type: c.message_type,
        content: c.content,
        status: c.status,
        source: c.source as string | undefined,
        shop_id: c.shop_id,
      },
      { enrich: createShopeeEnrichContext(account), region: data.region }
    );

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
        // เวลาของแพลตฟอร์ม ไม่ใช่เวลาที่เราบันทึก — ข้อความที่ดึงย้อนหลังมาต้อง
        // เรียงแทรกในสายสนทนาได้ถูกที่ (หน้าแชทเรียงด้วย created_at)
        created_at: messageTime,
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

    // notify-then-pull (แบบเดียวกับ Lazada): push บอกแค่ "มีความเคลื่อนไหว" —
    // ความจริงของห้องอยู่ที่ get_message · ข้อความที่ร้านตอบจากแอป Shopee หรือ
    // ข้อความอัตโนมัตินอกเวลา **ไม่ถูก push มาเลย** สายสนทนาของเราจึงเป็นรู
    // ถ้าไม่ตามเก็บ (ไม่แตะ unread — ใบที่ควรนับถูกนับไปแล้วข้างบน)
    //
    // ส่ง last_message_at ที่เพิ่งเขียนไป ไม่ใช่ค่าที่อ่านมาก่อนหน้า — ไม่งั้นข้อความเก่า
    // ที่เพิ่งดึงมาจะดันเวลาล่าสุดของห้อง "ถอยหลัง" กว่าใบที่เพิ่ง push เข้ามา
    await this.syncConversationMessages(account, { ...contact, last_message_at: messageTime }, { pages: 1 });

    return { status: 'processed' };
  }

  // ─── Pull: get_message (เติมข้อความที่ push ไม่ได้ส่งมา) ───────────────

  /**
   * ดึงข้อความล่าสุดของห้องสนทนาเข้า DB — idempotent (dedupe ด้วย shopee_message_id)
   *
   * @param pages            จำนวนหน้าสูงสุดที่ยอมไล่ย้อน (1 หน้า = pageSize ใบ)
   * @param targetMessageIds ถ้าระบุ จะไล่ย้อนจนกว่าจะเจอครบทุก id (ใช้กับ bundle_message)
   * @param countUnread      บวก unread ให้ข้อความขาเข้าที่เพิ่งเจอ — ปกติ **ไม่บวก**
   *                         เพราะ push นับให้แล้ว การนับซ้ำจะทำให้ตัวเลขบวม
   */
  async syncConversationMessages(
    account: ShopeeAccountRow,
    contact: { id: string; conversation_id: string; display_name?: string | null; last_message_at?: string | null },
    opts: { pages?: number; pageSize?: number; targetMessageIds?: string[]; countUnread?: boolean } = {}
  ): Promise<{ inserted: number; newestIncoming: { content: string; at: string } | null }> {
    const empty = { inserted: 0, newestIncoming: null };

    // แชทเป็นถังโควตาของตัวเอง — โดนพักอยู่แล้วยิงต่อ = success rate ยิ่งแย่
    const quota = await isQuotaBlocked('shopee', 'chat');
    if (quota.blocked) {
      console.warn(`[Shopee Chat] circuit breaker เปิดอยู่ (ถึง ${quota.until}) — ข้ามการ sync`);
      return empty;
    }

    let creds;
    try {
      creds = await ensureValidToken(account);
    } catch (err) {
      console.warn('[Shopee Chat] syncConversationMessages: token ใช้ไม่ได้', err instanceof Error ? err.message : err);
      return empty;
    }

    const maxPages = Math.max(1, opts.pages ?? 1);
    const pageSize = opts.pageSize ?? 20;
    const wanted = new Set(opts.targetMessageIds || []);

    const collected: ShopeeChatApiMessage[] = [];
    let offset: string | undefined;
    for (let page = 0; page < maxPages; page++) {
      const { messages, nextOffset, error } = await getConversationMessages(creds, contact.conversation_id, { pageSize, offset });
      if (error) break;
      collected.push(...messages);
      for (const m of messages) wanted.delete(String(m.message_id));
      if (!nextOffset || messages.length === 0) break;
      // ตามหา id เจาะจงอยู่แล้วเจอครบ = พอ · ไม่ได้ตามหาอะไร = ไล่ตามจำนวนหน้าที่ผู้เรียกยอม
      if (opts.targetMessageIds?.length && wanted.size === 0) break;
      offset = nextOffset;
    }

    if (collected.length === 0) return empty;
    return this.saveApiMessages(account, contact, collected, !!opts.countUnread);
  }

  /**
   * บันทึกข้อความที่ได้จาก get_message — ข้ามใบที่มีแล้ว (คีย์ = shopee_message_id)
   *
   * ⚠️ ไม่ส่ง push แจ้งเตือนจากทางนี้ — ใบที่ควรแจ้งถูกแจ้งไปแล้วตอน push เข้ามา
   * (ยกเว้น bundle ที่ผู้เรียกเป็นคนแจ้งเองจาก newestIncoming ที่คืนไป)
   */
  private async saveApiMessages(
    account: ShopeeAccountRow,
    contact: { id: string; conversation_id: string; last_message_at?: string | null },
    messages: ShopeeChatApiMessage[],
    countUnread: boolean
  ): Promise<{ inserted: number; newestIncoming: { content: string; at: string } | null }> {
    const ids = messages.map(m => String(m.message_id)).filter(Boolean);
    if (ids.length === 0) return { inserted: 0, newestIncoming: null };

    const { data: existingRows } = await supabaseAdmin
      .from('shopee_messages')
      .select('shopee_message_id')
      .eq('company_id', account.company_id)
      .eq('shopee_contact_id', contact.id)
      .in('shopee_message_id', ids);

    const existing = new Set((existingRows || []).map(r => r.shopee_message_id));
    const fresh = messages.filter(m => m.message_id && !existing.has(String(m.message_id)));
    if (fresh.length === 0) return { inserted: 0, newestIncoming: null };

    // enrich context เดียวทั้งหน้า — สินค้าตัวเดิมที่ถูกอ้างหลายครั้งยิงหาแค่รอบเดียว
    const enrich = createShopeeEnrichContext(account);
    const rows: Record<string, unknown>[] = [];
    let newestIncoming: { content: string; at: string } | null = null;
    let newestAt = 0;

    for (const m of fresh) {
      // ทิศทาง: ใบที่ออกจากร้านเรา (จากระบบเรา จากแอป Shopee หรือระบบตอบอัตโนมัติ) = ขาออก
      const isOutgoing = m.from_shop_id != null
        ? String(m.from_shop_id) === String(account.shop_id)
        : String(m.to_shop_id ?? '') !== String(account.shop_id);

      const { messageContent, messageType, metadata } = await normalizeShopeeMessage(
        toNormalizable(m),
        { enrich, region: m.region }
      );
      // bundle ไม่เก็บเป็นแถว — ข้อความจริงถูกดึงมาแล้ว เก็บไว้จะเป็นฟองว่างซ้ำซ้อน
      if (messageType === 'bundle_message') continue;

      const tsSec = m.created_timestamp || 0;
      const at = tsSec ? new Date(tsSec * 1000).toISOString() : new Date().toISOString();

      // ใบขาออกที่ "ไม่มีใน DB ตาม id" อาจเป็นใบที่เราส่งเองแล้วเก็บ id ไว้ไม่ตรง
      // (ก่อนมีการ parse แบบ BigInt-safe เลข 19 หลักถูกปัดตอนบันทึก) — ถ้าเจอใบเนื้อ
      // เดียวกันในช่วงเวลาใกล้กัน ให้ **ซ่อม id ของใบเดิม** แทนที่จะเพิ่มใบใหม่ซ้ำ
      if (isOutgoing) {
        const windowMs = 5 * 60 * 1000;
        const from = new Date(new Date(at).getTime() - windowMs).toISOString();
        const to = new Date(new Date(at).getTime() + windowMs).toISOString();
        const { data: twin } = await supabaseAdmin
          .from('shopee_messages')
          .select('id, shopee_message_id')
          .eq('company_id', account.company_id)
          .eq('shopee_contact_id', contact.id)
          .eq('direction', 'outgoing')
          .eq('content', messageContent)
          .gte('created_at', from)
          .lte('created_at', to)
          .limit(1)
          .maybeSingle();
        if (twin) {
          if (twin.shopee_message_id !== String(m.message_id)) {
            await supabaseAdmin
              .from('shopee_messages')
              .update({ shopee_message_id: String(m.message_id) })
              .eq('id', twin.id);
          }
          continue;   // มีอยู่แล้ว ไม่ต้องเพิ่มใบใหม่
        }
      }

      rows.push({
        company_id: account.company_id,
        shopee_contact_id: contact.id,
        shopee_message_id: String(m.message_id),
        direction: isOutgoing ? 'outgoing' : 'incoming',
        message_type: messageType,
        content: messageContent,
        raw_message: Object.keys(metadata).length > 0 ? metadata : null,
        received_at: isOutgoing ? null : at,
        sent_at: isOutgoing ? at : null,
        created_at: at,   // เวลาจริงของแพลตฟอร์ม = ลำดับในสายสนทนา
      });

      if (!isOutgoing && tsSec >= newestAt) {
        newestAt = tsSec;
        newestIncoming = { content: messageContent, at };
      }
    }

    if (rows.length === 0) return { inserted: 0, newestIncoming: null };

    const { error } = await supabaseAdmin.from('shopee_messages').insert(rows);
    if (error) {
      console.error('[Shopee Chat] Failed to save pulled messages:', error.message);
      return { inserted: 0, newestIncoming: null };
    }

    // last_message_at ขยับเฉพาะเมื่อของที่ดึงมาใหม่กว่าของเดิม — backfill ประวัติเก่า
    // ต้องไม่ดันห้องสนทนาขึ้นหัวรายชื่อ
    const newestRow = rows.reduce<string>((acc, r) => {
      const t = r.created_at as string;
      return t > acc ? t : acc;
    }, '');
    const contactUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (newestRow && (!contact.last_message_at || newestRow > contact.last_message_at)) {
      contactUpdate.last_message_at = newestRow;
    }
    if (countUnread) {
      const incoming = rows.filter(r => r.direction === 'incoming').length;
      if (incoming > 0) {
        const { data: current } = await supabaseAdmin
          .from('shopee_contacts')
          .select('unread_count')
          .eq('id', contact.id)
          .maybeSingle();
        contactUpdate.unread_count = (current?.unread_count || 0) + incoming;
      }
    }
    await supabaseAdmin.from('shopee_contacts').update(contactUpdate).eq('id', contact.id);

    return { inserted: rows.length, newestIncoming };
  }

  /**
   * ดึงห้องสนทนาล่าสุด + ข้อความของแต่ละห้อง — ใช้ตอนเปิดสวิตช์แชทของร้าน
   * เพื่อไม่ให้หน้าแชทว่างเปล่าจนกว่าจะมีคนทักคนแรก (เหมือนที่ Lazada/TikTok ทำ)
   */
  async syncRecentConversations(account: ShopeeAccountRow, maxConversations = 10): Promise<number> {
    const quota = await isQuotaBlocked('shopee', 'chat');
    if (quota.blocked) return 0;

    let creds;
    try {
      creds = await ensureValidToken(account);
    } catch {
      return 0;
    }

    const { conversations, error } = await getConversationList(creds, { pageSize: Math.min(maxConversations, 50) });
    if (error || conversations.length === 0) return 0;

    const chatAccount = await this.getOrCreateChatAccount(account);
    let synced = 0;

    for (const convo of conversations.slice(0, maxConversations)) {
      const conversationId = convo.conversation_id ? String(convo.conversation_id) : '';
      if (!conversationId) continue;

      // buyer_user_id เป็น NOT NULL — list บางรุ่นไม่ส่ง to_id มาให้ ต้องถามรายห้อง
      let buyerUserId = Number(convo.to_id) || 0;
      if (!buyerUserId) {
        const info = await getConversationInfo(creds, conversationId);
        buyerUserId = Number(info?.to_id) || 0;
      }
      if (!buyerUserId) continue;

      const contact = await this.getOrCreateContact(
        account, conversationId, buyerUserId, convo.to_name || undefined, chatAccount?.id || null
      );
      if (!contact) continue;

      await this.syncConversationMessages(account, contact, { pages: 1, pageSize: 20 });
      synced++;
    }

    return synced;
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

}

// ─── Standalone entry point for webhook + retry worker ────────────────

const shopeeChatServiceSingleton = new ShopeeChatService();

export async function processShopeeWebchatPush(
  account: ShopeeAccountRow,
  payload: ShopeeWebchatPayload
): Promise<{ status: 'processed' | 'skipped'; detail?: string }> {
  return shopeeChatServiceSingleton.processWebchatPush(account, payload);
}

/** ดึงข้อความล่าสุดของห้องสนทนาหนึ่งห้อง (backfill / เติมรู) */
export async function syncShopeeConversationMessages(
  account: ShopeeAccountRow,
  contact: { id: string; conversation_id: string; display_name?: string | null; last_message_at?: string | null },
  opts: { pages?: number; pageSize?: number; targetMessageIds?: string[]; countUnread?: boolean } = {}
) {
  return shopeeChatServiceSingleton.syncConversationMessages(account, contact, opts);
}

/** backfill ตอนเปิดสวิตช์แชทของร้าน — ห้องสนทนาล่าสุด + ข้อความของแต่ละห้อง */
export async function syncShopeeRecentConversations(
  account: ShopeeAccountRow,
  maxConversations = 10
): Promise<number> {
  return shopeeChatServiceSingleton.syncRecentConversations(account, maxConversations);
}

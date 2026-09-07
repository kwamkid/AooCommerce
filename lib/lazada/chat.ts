import { LazadaCredentials, lazadaApiRequest } from '@/lib/lazada/api';
import { parseAmount } from '@/lib/marketplace/fee-types';
import { unwrapI18nText } from '@/lib/chat/message-preview';

// Lazada Instant Messaging (IM) API wrappers.
// Message template ids ที่เจอจริง: 1=text 2=system 3=image 4=emoji 6=video
// 10006=item 10007=order 10008=voucher 10010=ชวนติดตามร้าน 10015=ข้อความต้อนรับของร้าน
// 200016=ประกาศ/โปรโมชันที่ Lazada ยิงหาผู้ขาย (HTML)

export interface LazadaSession {
  session_id: string;
  title?: string;            // buyer nickname
  head_url?: string;
  buyer_id?: number;
  unread_count?: number;
  last_message_time?: number; // ms
  last_message_id?: string;
  summary?: string;
  site_id?: string;
}

export interface LazadaImMessage {
  message_id: string;
  session_id: string;
  from_account_type?: number; // 1=buyer 2=seller
  to_account_type?: number;
  from_account_id?: string;
  to_account_id?: string;
  template_id?: number;
  type?: number;              // 1=userSend 2=systemSend
  content?: string;           // JSON string per template
  send_time?: number;         // ms
  status?: number;            // 1 = recalled
  auto_reply?: boolean;
  process_msg?: string;
}

export async function getSessionList(
  creds: LazadaCredentials,
  opts: { startTime?: number; pageSize?: number; lastSessionId?: string } = {}
): Promise<{ sessions: LazadaSession[]; hasMore: boolean; nextStartTime?: number; lastSessionId?: string; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'GET', '/im/session/list', {
    start_time: String(opts.startTime ?? Date.now()),
    page_size: String(opts.pageSize ?? 20),
    ...(opts.lastSessionId ? { last_session_id: opts.lastSessionId } : {}),
  });
  if (error || !data) return { sessions: [], hasMore: false, error };
  const d = data as Record<string, unknown>;
  return {
    sessions: (d.session_list as LazadaSession[]) || [],
    hasMore: Boolean(d.has_more),
    nextStartTime: d.next_start_time as number | undefined,
    lastSessionId: d.last_session_id as string | undefined,
  };
}

export async function getSessionDetail(
  creds: LazadaCredentials,
  sessionId: string
): Promise<LazadaSession | null> {
  const { data, error } = await lazadaApiRequest(creds, 'GET', '/im/session/get', {
    session_id: sessionId,
  });
  if (error || !data) return null;
  return data as LazadaSession;
}

export async function getMessages(
  creds: LazadaCredentials,
  sessionId: string,
  opts: { startTime?: number; pageSize?: number; lastMessageId?: string } = {}
): Promise<{ messages: LazadaImMessage[]; hasMore: boolean; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'GET', '/im/message/list', {
    session_id: sessionId,
    start_time: opts.startTime ?? Date.now(),
    page_size: opts.pageSize ?? 30,
    ...(opts.lastMessageId ? { last_message_id: opts.lastMessageId } : {}),
  });
  if (error || !data) return { messages: [], hasMore: false, error };
  const d = data as Record<string, unknown>;
  return {
    messages: (d.message_list as LazadaImMessage[]) || [],
    hasMore: Boolean(d.has_more),
  };
}

export async function sendChatText(
  creds: LazadaCredentials,
  sessionId: string,
  text: string
): Promise<{ message_id?: string; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'POST', '/im/message/send', {
    session_id: sessionId,
    template_id: '1',
    txt: text,
  });
  if (error) return { error };
  const d = data as Record<string, unknown> | null;
  return { message_id: (d?.message_id as string) || undefined };
}

export async function sendChatImage(
  creds: LazadaCredentials,
  sessionId: string,
  imageUrl: string,
  width = 600,
  height = 600
): Promise<{ message_id?: string; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'POST', '/im/message/send', {
    session_id: sessionId,
    template_id: '3',
    img_url: imageUrl,
    width: String(width),
    height: String(height),
  });
  if (error) return { error };
  const d = data as Record<string, unknown> | null;
  return { message_id: (d?.message_id as string) || undefined };
}

/** Mark session read on the Lazada side (best-effort). */
export async function readSession(
  creds: LazadaCredentials,
  sessionId: string,
  lastReadMessageId: string
): Promise<void> {
  await lazadaApiRequest(creds, 'POST', '/im/session/read', {
    session_id: sessionId,
    last_read_message_id: lastReadMessageId,
  }).catch(() => {});
}

// ─── ตัวแปลงข้อความ IM → ฟองในหน้าแชท ──────────────────────────────────────
//
// `content` ของ Lazada เป็น JSON string ที่ **โครงต่างกันทุก template** และหลาย
// template ห่อค่ามาอีกชั้น (`ext` เป็น JSON string ซ้อนใน JSON · ข้อความตอบอัตโนมัติ
// เป็น `{"th":…,"en":…}` ในช่อง txt · ประกาศของ Lazada ยัด HTML มาในช่อง txt)
// ถ้าไม่แกะให้ครบ ผู้ใช้จะเห็น JSON/แท็ก HTML ดิบ ๆ ในรายชื่อแชท (เจอจริง ก.ย. 2026)
//
// ตัวแปลงนี้ **pure + sync** — การเติมเนื้อการ์ด (หาสินค้า/ออเดอร์ในระบบเรา) อยู่ที่
// lib/lazada/chat-enrich.ts ซึ่งเรียกตัวนี้ต่ออีกที

export { unwrapI18nText };

function toPlainObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** ค่าที่ใช้ได้จริงเท่านั้น — Lazada ส่ง `""` มาแทน "ไม่มี" เต็มไปหมด */
function str(v: unknown): string | undefined {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return undefined;
  return v.trim() ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** "฿ 1,990.00" → 1990 — สัญลักษณ์สกุลเงิน/ช่องว่างถูกตัดก่อนส่งเข้า parseAmount */
function price(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const cleaned = v.replace(/[^0-9.,]/g, '').trim();
  if (!cleaned) return undefined;
  const n = parseAmount(cleaned);
  return n > 0 ? n : undefined;
}

/** ข้อความ text ที่เป็น "ข้อความจากระบบ" ได้ (การ์ดที่ระบบส่งมายังเป็นการ์ดเหมือนเดิม) */
const TEXT_TEMPLATES = new Set([1, 2, 4, 10015, 200016]);

/**
 * Parse a Lazada IM message content (JSON string keyed by template) into
 * display text + metadata. Defensive — unknown templates fall back to labels.
 */
export function parseLazadaMessageContent(msg: LazadaImMessage): {
  messageContent: string; messageType: string; metadata: Record<string, unknown>;
} {
  const metadata: Record<string, unknown> = {};
  let obj: Record<string, unknown> = {};
  if (msg.content) {
    try { obj = toPlainObject(JSON.parse(msg.content)); } catch { obj = { txt: msg.content }; }
  }

  // `ext` เป็น JSON **string** ซ้อนอยู่ใน JSON อีกที (บาง template ส่งเป็น object มาเลย)
  let ext: Record<string, unknown> = {};
  if (typeof obj.ext === 'string') {
    try { ext = toPlainObject(JSON.parse(obj.ext)); } catch { /* ext พัง = ไม่มี ext เฉย ๆ */ }
  } else {
    ext = toPlainObject(obj.ext);
  }

  const templateId = num(msg.template_id) ?? 1;
  metadata.lazada_template_id = templateId;

  const txt = str(obj.txt) ?? str(obj.text) ?? str(obj.content);
  let messageType = 'text';
  let messageContent = '';

  switch (templateId) {
    case 1: // text
    case 4: { // emoji — แสดงเหมือนข้อความ
      messageContent = unwrapI18nText(txt ?? '') || '[ข้อความ]';
      // แชทบอทของ Lazada ส่งคำถามนำ (เช่น "โปรดเลือกคำสั่งซื้อ…") พร้อม actionType
      const actionType = num(ext.actionType);
      if (actionType !== undefined) metadata.action_type = actionType;
      break;
    }

    case 3: { // image
      messageType = 'image';
      messageContent = '[รูปภาพ]';
      const img = str(obj.imgUrl) ?? str(obj.img_url) ?? str(obj.url);
      if (img) metadata.imageUrl = img;
      const width = num(obj.width);
      const height = num(obj.height);
      if (width) metadata.width = width;
      if (height) metadata.height = height;
      break;
    }

    case 6: { // video — ยังไม่เคยเห็นของจริง เดาชื่อฟิลด์ไว้หลายแบบ
      messageType = 'video';
      messageContent = '[วิดีโอ]';
      const video = str(obj.videoUrl) ?? str(obj.video_url) ?? str(obj.url) ?? str(obj.mediaUrl);
      if (video) metadata.videoUrl = video;
      const cover = str(obj.coverUrl) ?? str(obj.cover_url) ?? str(obj.thumbUrl)
        ?? str(obj.thumbnailUrl) ?? str(obj.imgUrl);
      if (cover) metadata.previewUrl = cover;
      break;
    }

    case 10006: { // การ์ดสินค้า
      messageType = 'item';
      const title = str(obj.title) ?? str(obj.name);
      messageContent = title ? `[สินค้า] ${title}` : '[สินค้า]';

      const itemId = str(obj.itemId) ?? str(obj.item_id);
      if (itemId) metadata.item_id = itemId;
      const skuId = str(obj.skuId) ?? str(obj.sku_id);
      if (skuId) metadata.sku_id = skuId;

      const itemUrl = str(obj.actionUrl) ?? str(obj.pcUrl) ?? str(obj.url);
      if (itemUrl) {
        metadata.itemUrl = itemUrl;
        metadata.linkUrl = itemUrl;
        metadata.linkTitle = 'ดูสินค้าใน Lazada';
      }

      // ค่าที่ Lazada ให้มา — ตัวเติมเนื้อ (chat-enrich) เอาไปทับด้วยของในระบบเราถ้าหาเจอ
      const newProduct = toPlainObject(obj.newProduct);
      metadata.lazada_item = {
        title,
        price: price(obj.price),
        old_price: price(obj.oldPrice),
        voucher_price: price(newProduct.voucherPrice),
        image_url: str(obj.iconUrl) ?? str(obj.imgUrl),
        stock: str(newProduct.stock),
      };
      break;
    }

    case 10007: { // การ์ดคำสั่งซื้อ
      messageType = 'order';
      const orderId = str(obj.orderId) ?? str(obj.order_id) ?? str(ext.contextOrderId);
      messageContent = orderId ? `[คำสั่งซื้อ ${orderId}]` : '[คำสั่งซื้อ]';

      // ⚠️ `order_id` สงวนไว้ให้ uuid ออเดอร์ของเรา (chat-enrich เป็นคนใส่) — เลขของ
      // Lazada อยู่ที่ `order_sn` เสมอ เหมือน Shopee
      if (orderId) metadata.order_sn = orderId;
      const subOrderId = str(obj.subOrderId) ?? str(obj.sub_order_id);
      if (subOrderId) metadata.sub_order_id = subOrderId;

      const newOrder = toPlainObject(obj.newOrder);
      metadata.lazada_order = {
        title: str(obj.title),
        item_name: str(obj.content),
        image_url: str(obj.iconUrl),
        total: price(obj.totalPrice) ?? price(newOrder.orderAmount),
        order_type: str(newOrder.orderType),
        action_url: str(obj.actionUrl),
      };
      break;
    }

    case 10008: { // คูปอง — ยังไม่เคยเห็นของจริง เก็บเท่าที่มีตามชื่อที่พบได้
      messageType = 'voucher';
      const title = str(obj.title) ?? str(obj.name) ?? str(obj.voucherName);
      messageContent = title ? `[คูปองส่วนลด] ${title}` : '[คูปองส่วนลด]';

      const voucher: Record<string, string | number> = {};
      const put = (key: string, value: string | number | undefined) => {
        if (value !== undefined && value !== '') voucher[key] = value;
      };
      put('title', title);
      put('discount', str(obj.discount) ?? str(obj.value) ?? str(obj.discountAmount) ?? str(obj.amount));
      put('code', str(obj.code) ?? str(obj.voucherCode) ?? str(obj.couponCode));
      put('start', str(obj.startTime) ?? str(obj.start) ?? str(obj.validFrom));
      put('end', str(obj.endTime) ?? str(obj.end) ?? str(obj.validTo) ?? str(obj.expireTime));
      put('validity', str(obj.validity) ?? str(obj.validPeriod) ?? str(obj.period));
      put('image_url', str(obj.iconUrl) ?? str(obj.imgUrl));
      put('link_url', str(obj.actionUrl) ?? str(obj.url));
      if (Object.keys(voucher).length > 0) metadata.voucher = voucher;
      break;
    }

    case 10010: { // ชวนกดติดตามร้าน
      messageType = 'follow_invite';
      messageContent = 'ชวนติดตามร้าน';
      const url = str(obj.actionUrl) ?? str(obj.url) ?? str(obj.shopUrl);
      if (url) metadata.link_url = url;
      break;
    }

    case 10015: // ข้อความต้อนรับอัตโนมัติของร้าน — txt เป็น JSON หลายภาษา
      messageContent = unwrapI18nText(txt ?? '') || '[ข้อความ]';
      break;

    case 200016: { // ประกาศ/โปรโมชันที่ Lazada ยิงหาผู้ขาย — txt เป็น HTML
      // เก็บ HTML ดิบไว้ให้ฟองในหน้าแชทวาดรูป+ลิงก์จริง (app/chat/lib/richText.ts)
      // ส่วนพรีวิวในรายชื่อแชทถอดแท็กเองที่ lib/chat/message-preview.ts
      messageContent = txt ?? str(ext.summary) ?? '[ประกาศจาก Lazada]';
      const summary = str(ext.summary)?.replace(/^\[image\]\s*/i, '').trim();
      metadata.broadcast = { topic: str(obj.topic), summary };
      break;
    }

    default:
      messageContent = unwrapI18nText(txt ?? '') || str(obj.title) || str(ext.summary)
        || `[ข้อความชนิด ${templateId}]`;
  }

  if (msg.auto_reply) metadata.auto_reply = true;
  if (msg.process_msg) metadata.process_msg = msg.process_msg;

  // ประกาศเรื่องความปลอดภัย/ข้อจำกัดที่ระบบของ Lazada ส่งเอง — ไม่ใช่คำพูดของใคร
  // หน้าแชทจัดกลางจอให้เองเมื่อเห็น system_event · การ์ด (item/order) ที่ระบบส่งมา
  // ยังเป็นการ์ดเหมือนเดิม ไม่ยุบเป็นข้อความ
  if (messageType === 'text' && !metadata.broadcast
      && (templateId === 2 || (msg.type === 2 && TEXT_TEMPLATES.has(templateId)))) {
    messageType = 'system';
    metadata.system_event = 'lazada_system';
  }

  if (msg.status === 1) {
    messageContent = '[ข้อความถูกเรียกคืน]';
    metadata.recalled = true;
  }

  return { messageContent, messageType, metadata };
}

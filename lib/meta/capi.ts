// Path: lib/meta/capi.ts
//
// ประกอบ body ของ Conversions API — **pure ทั้งไฟล์ ไม่มี import ฝั่ง node**
// (หน้าจอเรียกได้ด้วย: อยากพรีวิวว่าออเดอร์ใบนี้จะถูกส่งเป็น event แบบไหน)
//
// ทำไมแยกออกมาจากตัวยิง: รูปร่างของ body คือสิ่งเดียวที่ Meta ตรวจ ถ้าเพี้ยนไปคีย์เดียว
// event ทั้ง request ถูกปฏิเสธ — แยกเป็น pure function แล้วเทียบรูปร่างในเทสต์ได้โดยไม่ต้องยิงจริง
//
// ⚠️ **สัญญาที่ห้ามพัง**: `buildCapiRequest([buildCapiEvent({...business_messaging})])`
// ต้องได้ก้อนเดียวกับที่ `lib/meta/conversions.ts` → `buildPurchaseEventBody()` คืนอยู่ทุกวันนี้เป๊ะ ๆ
// (ไฟล์นั้นยิง Purchase ของ Messenger อยู่จริงบน production — เพี้ยนเมื่อไหร่ โฆษณา
// Click-to-Messenger จะ optimize ผิดโดยไม่มีใครรู้)

/**
 * ที่มาของ conversion — Meta รับเฉพาะค่าในลิสต์นี้ ส่งค่าอื่น = ทั้ง request ถูกปฏิเสธ
 * `business_messaging` ใช้คู่กับ `messaging_channel` เท่านั้น (แชทที่มาจากโฆษณา)
 */
export type CapiActionSource =
  | 'website'
  | 'app'
  | 'email'
  | 'phone_call'
  | 'chat'
  | 'physical_store'
  | 'business_messaging'
  | 'system_generated'
  | 'other';

export interface CapiEventInput {
  eventName: string;
  /** Meta ใช้ dedupe — ยิงซ้ำด้วย id เดิมจะถูกนับครั้งเดียว (ใส่ order id ไปเลย) */
  eventId: string;
  /** unix **วินาที** ไม่ใช่มิลลิวินาที */
  eventTime: number;
  actionSource: CapiActionSource;
  userData: Record<string, unknown>;
  customData?: Record<string, unknown>;
  /** ใส่เฉพาะเมื่อ actionSource เป็น business_messaging */
  messagingChannel?: 'messenger' | 'instagram';
  /** true = ห้าม Meta เอา event นี้ไปใช้ปรับจูนโฆษณา (ลูกค้าขอไม่ให้ติดตาม) */
  optOut?: boolean;
}

export interface CapiRequestBody {
  data: Record<string, unknown>[];
  partner_agent: 'aoocommerce';
  test_event_code?: string;
}

/**
 * ประกอบ event หนึ่งใบ
 * — `messaging_channel` / `custom_data` / `opt_out` ใส่**เฉพาะเมื่อมีค่าจริง**
 *   (คีย์เปล่า ๆ ทำให้ก้อนต่างจากของเดิม และ Meta บางตัวตีความ null ต่างจากไม่มีคีย์)
 */
export function buildCapiEvent(input: CapiEventInput): Record<string, unknown> {
  const event: Record<string, unknown> = {
    event_name: input.eventName,
    event_time: input.eventTime,
    event_id: input.eventId,
    action_source: input.actionSource,
  };
  if (input.messagingChannel) event.messaging_channel = input.messagingChannel;
  event.user_data = input.userData;
  if (input.customData && Object.keys(input.customData).length > 0) {
    event.custom_data = input.customData;
  }
  if (input.optOut) event.opt_out = true;
  return event;
}

export function buildCapiRequest(
  events: Record<string, unknown>[],
  testEventCode?: string,
): CapiRequestBody {
  return {
    data: events,
    partner_agent: 'aoocommerce',
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };
}

/** ออเดอร์ที่เกิดในแพลตฟอร์มคนอื่น — เราไม่ได้เป็นคนพาลูกค้ามา จะเคลมเป็นผลของโฆษณาไม่ได้ */
export const MARKETPLACE_SOURCES: ReadonlySet<string> = new Set([
  'shopee',
  'lazada',
  'tiktok',
  'line_shopping',
]);

export function isMarketplaceOrder(o: { source?: string | null; marketplace_account_id?: string | null }): boolean {
  if (o.marketplace_account_id) return true;
  return MARKETPLACE_SOURCES.has((o.source || '').trim().toLowerCase());
}

/** ช่องทางที่บิลเกิดจาก "คุยกันในแชท" */
export const CHAT_SOURCES: ReadonlySet<string> = new Set([
  'line',
  'facebook',
  'instagram',
  'shopee',
  'lazada',
  'tiktok',
]);

/**
 * ออเดอร์ใบนี้ควรรายงานเป็น conversion ที่เกิดตรงไหน
 *
 * ⚠️ เช็ค marketplace **ก่อน** แชทเสมอ — ออเดอร์ Shopee/Lazada/TikTok ถึงจะมีห้องแชท
 * ผูกอยู่ก็ตาม บทสนทนานั้นอยู่ในแอปของแพลตฟอร์ม ไม่ใช่ช่องทางที่โฆษณาของเราพาไป
 * ⇒ ตกเป็น 'other' (ค่ากลาง ๆ ที่ไม่เคลมเครดิตให้ใคร) ไม่ใช่ 'chat'
 */
export function actionSourceForOrder(o: { source?: string | null; chat_contact_id?: string | null }): CapiActionSource {
  const source = (o.source || '').trim().toLowerCase();
  if (source === 'pos') return 'physical_store';
  if (source === 'storefront') return 'website';
  if (isMarketplaceOrder({ source })) return 'other';
  if (o.chat_contact_id) return 'chat';
  if (CHAT_SOURCES.has(source)) return 'chat';
  return 'other';
}

/**
 * Meta รับ `event_time` ย้อนหลังได้ 7 วัน — เกินนี้ **ทั้ง request** ถูกปฏิเสธ
 * (เผื่อ 1 ชม.กันชนเส้นตายระหว่างที่รอบกวาดกำลังทำงาน)
 */
export const MAX_EVENT_AGE_SEC = 7 * 86400 - 3600;
/** ยกเว้น physical_store (ขายหน้าร้าน) ที่ Meta ให้ย้อนได้ถึง 62 วัน */
export const MAX_EVENT_AGE_PHYSICAL_STORE_SEC = 62 * 86400 - 3600;
/** ล้ำหน้าเกินนี้ = นาฬิกาเพี้ยน ไม่ใช่เวลาจริงของการจ่ายเงิน */
export const MAX_EVENT_FUTURE_SEC = 300;

/**
 * เวลานี้ยังส่งได้ไหม — **เช็คก่อนจองสิทธิ์/ก่อนยิงเสมอ**
 * (ยิงไปแล้วโดนปฏิเสธ = เสียโควตา + ออเดอร์ถูกปิดตายทั้งที่ไม่เคยส่งสำเร็จ)
 */
export function isEventTimeAcceptable(
  eventTimeSec: number,
  actionSource: CapiActionSource,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!Number.isFinite(eventTimeSec)) return false;
  const maxAge = actionSource === 'physical_store' ? MAX_EVENT_AGE_PHYSICAL_STORE_SEC : MAX_EVENT_AGE_SEC;
  if (nowSec - eventTimeSec > maxAge) return false;
  if (eventTimeSec - nowSec > MAX_EVENT_FUTURE_SEC) return false;
  return true;
}

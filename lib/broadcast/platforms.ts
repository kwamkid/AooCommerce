// Path: lib/broadcast/platforms.ts
//
// ทะเบียนช่องทางส่งข้อความหาลูกค้าหลายคน — แต่ละเจ้าทำได้แค่ไหน และ "ถึงใครได้"
//
// client-safe (ไม่แตะ supabaseAdmin) เพราะหน้าเลือกช่องทางอ่านตัวนี้ **และ** API ก็อ่าน
// ตัวเดียวกันตอนปฏิเสธช่องทางที่ยังส่งไม่ได้ — เหตุผลที่ผู้ใช้เห็นบนหน้าจอกับเหตุผลที่
// API ตอบกลับจึงเป็นข้อความเดียวกันเสมอ
//
// ═══ สิ่งที่ต้องเข้าใจก่อนแก้ไฟล์นี้ ═══
//
// เส้นแบ่งจริงของทุกแพลตฟอร์ม **ไม่ใช่** "ส่งทีเดียวหลายคน vs ทักทีละคน"
// แต่คือ **"ถึงคนที่ยังไม่ได้เริ่มคุยกับเราได้ไหม"**
//
//   • LINE เจ้าเดียวที่ให้ถึง "ผู้ติดตามทุกคน" แม้ไม่เคยทักมา  → บรอดแคสต์จริง
//   • ที่เหลือให้ทักได้เฉพาะคนที่ **เริ่มก่อน** (ทักมา / ซื้อของ) ภายในกรอบเวลาที่เขากำหนด
//     → ทำได้ ปลอดภัย และคุ้ม แต่ต้องเรียกว่า "ตามลูกค้าเก่า" ไม่ใช่ "บรอดแคสต์"
//
// นอกกรอบเวลาพวกนั้น **API ปฏิเสธเอง** — ส่งไม่ออกเลย ไม่ใช่แค่ "เสี่ยง"
// (เช่น Lazada ตอบ error -22, Meta ตอบ outside allowed window)
// ⛔ ห้ามหาทางอ้อมกรอบพวกนี้ — ที่แพลตฟอร์มวัดว่าใครสแปมคือ **ปฏิกิริยาของผู้รับ**
//    (block / report) ไม่ใช่วิธีที่เรากดส่ง ทักคนที่ไม่อยากคุยทีละคนก็โดนคะแนนโทษเท่ากัน

export type BroadcastPlatform = 'line' | 'tiktok' | 'lazada' | 'shopee' | 'facebook' | 'instagram';

/**
 * ready    = ต่อแล้ว ใช้งานได้ตอนนี้
 * possible = แพลตฟอร์มเปิดให้ทำได้จริง (ในกรอบของ `audience`) แต่เรายังไม่ได้ต่อ
 */
export type BroadcastPlatformStatus = 'ready' | 'possible';

/**
 * broadcast = แพลตฟอร์มมี API ส่งเป็นชุดให้ ยิงใบเดียวถึงหลายคน (เร็ว ไม่กิน rate limit ต่อคน)
 * bulk_dm   = ไม่มี API ส่งเป็นชุด ต้องไล่ทักทีละห้อง (ช้ากว่า ต้องคุมจังหวะ + กดต่อได้เมื่อค้าง)
 */
export type BroadcastKind = 'broadcast' | 'bulk_dm';

export interface BroadcastPlatformInfo {
  id: BroadcastPlatform;
  label: string;
  kind: BroadcastKind;
  /** ส่งถึงใครได้บ้าง — บรรทัดเดียวบนการ์ดเลือกช่องทาง */
  audience: string;
  status: BroadcastPlatformStatus;
  /** ข้อจำกัด/สิ่งที่ต้องทำก่อน — ขึ้นบนการ์ด และเป็นข้อความ error ของ API ด้วย */
  reason?: string;
}

export const BROADCAST_PLATFORMS: Record<BroadcastPlatform, BroadcastPlatformInfo> = {
  // Messaging API: /message/multicast (500 คน/ใบ) + /message/broadcast (ผู้ติดตามทุกคน)
  // ทุกใบกินโควตารายเดือนของ OA · reply token เท่านั้นที่ฟรี (ใช้กับบรอดแคสต์ไม่ได้)
  line: {
    id: 'line',
    label: 'LINE OA',
    kind: 'broadcast',
    audience: 'ผู้ติดตามทุกคน แม้ไม่เคยทักมา — หรือเลือกเฉพาะกลุ่ม/แท็ก',
    status: 'ready',
  },

  // Customer Engagement API — ของจริงที่ TikTok ทำมาเพื่องานนี้โดยเฉพาะ:
  //   POST /customer_engagement/202502/engagement_tasks/custom  (หัวข้อ ≤70 + เนื้อ ≤500
  //        + การ์ดสินค้า ≤4 + คูปอง 1 + วันหมดอายุของแคมเปญ)
  //   POST /customer_engagement/202412/messages                 (ส่งด้วย buyer_emails หลายคน/ใบ)
  //   POST /customer_engagement/202412/performances             (ยอดอ่าน / ยอดสั่งซื้อกลับ)
  //   GET  /customer_engagement/202502/permissions              (ร้านนี้ได้สิทธิ์หรือยัง)
  // buyer_email = อีเมลนิรนามจาก Get Order Details, ส่งได้เฉพาะคนที่เคยสั่งใน 365 วัน
  tiktok: {
    id: 'tiktok',
    label: 'TikTok Shop',
    kind: 'broadcast',
    audience: 'ลูกค้าที่เคยสั่งซื้อภายใน 365 วัน',
    status: 'possible',
    reason: 'TikTok มี API การตลาดให้ส่งเป็นชุดได้จริง (ข้อความของเราเอง + การ์ดสินค้า + คูปอง + ดูยอดอ่าน/ยอดสั่งกลับ) — เรายังไม่ได้ต่อ และร้านต้องได้รับสิทธิ์ฟีเจอร์นี้จาก TikTok ก่อน',
  },

  // /im/session/open **บังคับ order_id** และตอบ error -22 "order out of day limit: 30"
  // → เปิดห้องได้เฉพาะออเดอร์ ≤30 วัน แล้วส่งทีละห้องผ่าน /im/message/send
  lazada: {
    id: 'lazada',
    label: 'Lazada',
    kind: 'bulk_dm',
    audience: 'ลูกค้าที่มีออเดอร์ไม่เกิน 30 วัน หรือห้องที่คุยกันอยู่',
    status: 'possible',
    reason: 'Lazada ไม่มี API บรอดแคสต์ — เปิดห้องได้จากออเดอร์ที่ไม่เกิน 30 วัน แล้วส่งทีละห้อง (เกิน 30 วันเปิดห้องไม่ได้เลย) เรายังไม่ได้ต่อ',
  },

  // sellerchat มีแค่ send_message เข้าห้องที่มีอยู่ — ไม่มีทางเปิดห้องใหม่กับคนที่ไม่เคยทัก
  shopee: {
    id: 'shopee',
    label: 'Shopee',
    kind: 'bulk_dm',
    audience: 'ลูกค้าที่เคยทักเข้ามาในแชทแล้วเท่านั้น',
    status: 'possible',
    reason: 'Shopee ไม่มี API บรอดแคสต์ (Chat Broadcast มีเฉพาะให้กดเองใน Seller Center) — ผ่าน API ส่งได้ทีละห้องเฉพาะห้องที่ลูกค้าทักมาแล้ว เรายังไม่ได้ต่อ',
  },

  // กรอบ 24 ชม. ของ Meta — นอกกรอบ API ปฏิเสธเอง เหลือแค่ message tag ที่ห้ามเนื้อหาโปรโมชัน
  // และไม่มี endpoint ส่งเป็นชุด ต้องยิงทีละ PSID
  facebook: {
    id: 'facebook',
    label: 'Facebook',
    kind: 'bulk_dm',
    audience: 'คนที่ทักมาภายใน 24 ชม. ล่าสุด',
    status: 'possible',
    reason: 'Meta ให้ส่งได้เฉพาะภายใน 24 ชม. นับจากลูกค้าทักล่าสุด — เลยกรอบนั้น API ปฏิเสธเอง (message tag ที่เหลือห้ามเนื้อหาโปรโมชัน) เรายังไม่ได้ต่อ',
  },

  instagram: {
    id: 'instagram',
    label: 'Instagram',
    kind: 'bulk_dm',
    audience: 'คนที่ทักมาภายใน 24 ชม. ล่าสุด',
    status: 'possible',
    reason: 'กติกาเดียวกับ Facebook — นอกกรอบ 24 ชม. เหลือแค่ human agent 7 วัน ซึ่งมีไว้ตอบเรื่องบริการลูกค้า ไม่ใช่ส่งโปรโมชัน เรายังไม่ได้ต่อ',
  },
};

/** เรียงตาม "ใช้ได้ก่อน" แล้วตามความกว้างของกลุ่มผู้รับ */
export const BROADCAST_PLATFORM_LIST: BroadcastPlatformInfo[] = [
  BROADCAST_PLATFORMS.line,
  BROADCAST_PLATFORMS.tiktok,
  BROADCAST_PLATFORMS.lazada,
  BROADCAST_PLATFORMS.shopee,
  BROADCAST_PLATFORMS.facebook,
  BROADCAST_PLATFORMS.instagram,
];

export function isBroadcastPlatform(value: unknown): value is BroadcastPlatform {
  return typeof value === 'string' && value in BROADCAST_PLATFORMS;
}

/** ส่งผ่านช่องทางนี้ได้จริงหรือยัง — ใช้ทั้งหน้าจอ (ปุ่มกดได้ไหม) และ API (รับ request ไหม) */
export function canBroadcastVia(platform: BroadcastPlatform): boolean {
  return BROADCAST_PLATFORMS[platform].status === 'ready';
}

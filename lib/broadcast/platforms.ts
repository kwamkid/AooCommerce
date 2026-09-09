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

/**
 * ชนิดเนื้อหาของบรอดแคสต์ — **เป็นชนิดกลาง ไม่ผูกกับแพลตฟอร์มไหน**
 * แต่ละเจ้าแปลงเป็นของตัวเอง (LINE → template/carousel · TikTok → title+body+product_ids)
 * ⛔ ห้ามให้ผู้ใช้เลือกเป็นศัพท์ของ LINE ('flex'/'carousel') — พอไปเจ้าอื่นจะแปลไม่ได้
 *
 *  announce = ข้อความ (+รูป) เฉย ๆ — รูปเลือกได้ว่าเป็นฟองรูปธรรมดา หรือรูปเต็มจอที่กดได้
 *  poster   = รูปทั้งใบเป็นโปสเตอร์ + ลิงก์ปลายทาง (ข้อความ/ราคา/ปุ่ม อยู่ในรูปเอง)
 *  promo    = แบนเนอร์ + หัวข้อ + ข้อความ + ปุ่มกด
 *  products = การ์ดสินค้าเลื่อนได้ เลือกจากคลังสินค้าของเรา
 */
export type BroadcastContentKind = 'announce' | 'poster' | 'promo' | 'products';

/**
 * ข้อความที่แต่ละเจ้ารับได้ — **หน้าจอกับ API ตรวจจากตัวเลขชุดนี้ชุดเดียว**
 * ห้าม hardcode ลิมิตซ้ำในหน้าหรือ route (เคยมี LINE_TEXT_MAX ลอยอยู่ในหน้าแล้ว)
 */
export interface BroadcastCompose {
  /** มีหัวข้อแยกไหม + ยาวได้เท่าไหร่ (TikTok 70 · LINE ไม่มีหัวข้อในโหมด announce) */
  titleMax?: number;
  /** ตัวเนื้อความ (LINE 5,000 · TikTok 500) */
  bodyMax: number;
  /** แนบรูปได้ไหม (TikTok custom message มีแค่ข้อความล้วน) */
  image: boolean;
  /** ชนิดเนื้อหาที่ช่องทางนี้ทำได้จริง */
  kinds: BroadcastContentKind[];
  /** ปุ่มลิงก์ต่อข้อความ (0 = ช่องทางนี้ไม่มีปุ่ม ต้องเอาลิงก์ไปแปะท้ายข้อความแทน) */
  buttonsMax: number;
  /** การ์ดสินค้าต่อข้อความ */
  productsMax: number;
  /** ปุ่มตอบเร็ว (0 = ไม่มี) */
  quickReplyMax: number;
}

export interface BroadcastPlatformInfo {
  id: BroadcastPlatform;
  label: string;
  kind: BroadcastKind;
  compose: BroadcastCompose;
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
    // LINE นับโควตาต่อ "การส่ง 1 ครั้ง" (สูงสุด 3 bubble = ยัง 1 credit) — การ์ดที่มีรูป
    // + หัวข้อ + ปุ่ม เป็น message object เดียว จึงไม่แพงกว่าส่งข้อความเปล่าเลย
    compose: {
      bodyMax: 5000, image: true,
      kinds: ['announce', 'poster', 'promo', 'products'],
      buttonsMax: 4, productsMax: 10, quickReplyMax: 13,
    },
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
    // custom_message: title [1,70] · body [1,500] · ไม่มีช่องรูป (การ์ดสินค้า/คูปองเป็นของแยก)
    compose: {
      titleMax: 70, bodyMax: 500, image: false,
      // ไม่มีปุ่มลิงก์อิสระ — การ์ดสินค้าเป็นของ TikTok เอง (product_ids)
      kinds: ['announce', 'products'],
      buttonsMax: 0, productsMax: 4, quickReplyMax: 0,
    },
    audience: 'ลูกค้าที่เคยสั่งซื้อภายใน 365 วัน',
    status: 'possible',
    reason: 'โค้ดฝั่งเราพร้อมแล้ว แต่ยังส่งไม่ได้ — **Partner Center ไม่มี scope ของ Customer Engagement ให้ขอ** ทั้ง app หมวด Order Management และ Customer Support (ยิงจริงตอบ 105005) ต้องรู้ก่อนว่ามันอยู่ใน scope/หมวดไหน · ตรวจซ้ำด้วย `node scripts/check-tiktok-engagement.mjs`',
  },

  // /im/session/open **บังคับ order_id** และตอบ error -22 "order out of day limit: 30"
  // → เปิดห้องได้เฉพาะออเดอร์ ≤30 วัน แล้วส่งทีละห้องผ่าน /im/message/send
  lazada: {
    id: 'lazada',
    label: 'Lazada',
    kind: 'bulk_dm',
    // ตัวเลขนี้ ยังไม่ยืนยันกับของจริง — ยืนยันตอนต่อ API จริง
    compose: {
      bodyMax: 4000, image: true,
      kinds: ['announce'], buttonsMax: 0, productsMax: 0, quickReplyMax: 0,
    },
    audience: 'ลูกค้าที่มีออเดอร์ไม่เกิน 30 วัน หรือห้องที่คุยกันอยู่',
    status: 'possible',
    reason: 'Lazada ไม่มี API บรอดแคสต์ — เปิดห้องได้จากออเดอร์ที่ไม่เกิน 30 วัน แล้วส่งทีละห้อง (เกิน 30 วันเปิดห้องไม่ได้เลย) เรายังไม่ได้ต่อ',
  },

  // sellerchat มีแค่ send_message เข้าห้องที่มีอยู่ — ไม่มีทางเปิดห้องใหม่กับคนที่ไม่เคยทัก
  shopee: {
    id: 'shopee',
    label: 'Shopee',
    kind: 'bulk_dm',
    // ตัวเลขนี้ ยังไม่ยืนยันกับของจริง — ยืนยันตอนต่อ API จริง
    compose: {
      bodyMax: 2000, image: true,
      kinds: ['announce'], buttonsMax: 0, productsMax: 0, quickReplyMax: 0,
    },
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
    // ตัวเลขนี้ ยังไม่ยืนยันกับของจริง — ยืนยันตอนต่อ API จริง
    compose: {
      bodyMax: 2000, image: true,
      kinds: ['announce'], buttonsMax: 0, productsMax: 0, quickReplyMax: 0,
    },
    audience: 'คนที่ทักมาภายใน 24 ชม. ล่าสุด',
    status: 'possible',
    reason: 'Meta ให้ส่งได้เฉพาะภายใน 24 ชม. นับจากลูกค้าทักล่าสุด — เลยกรอบนั้น API ปฏิเสธเอง (message tag ที่เหลือห้ามเนื้อหาโปรโมชัน) เรายังไม่ได้ต่อ',
  },

  instagram: {
    id: 'instagram',
    label: 'Instagram',
    kind: 'bulk_dm',
    // ตัวเลขนี้ ยังไม่ยืนยันกับของจริง — ยืนยันตอนต่อ API จริง
    compose: {
      bodyMax: 1000, image: true,
      kinds: ['announce'], buttonsMax: 0, productsMax: 0, quickReplyMax: 0,
    },
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

/**
 * ลิมิตร่วมของหลายช่องทาง — เลือกส่งพร้อมกันหลายบัญชี/หลายเจ้า เนื้อหาชุดเดียวต้องผ่าน
 * **ทุกเจ้าที่เลือก** จึงเอาค่าที่แคบที่สุดของแต่ละช่อง
 *
 * เลือก LINE (5,000 ตัว มีรูปได้) + TikTok (500 ตัว ไม่มีรูป) ⇒ ได้ 500 ตัว ไม่มีรูป
 * และหัวข้อกลายเป็นบังคับ เพราะ TikTok บังคับ — หน้าจอจะบอกลิมิตที่แคบลงทันทีที่ติ๊กเพิ่ม
 */
export function intersectCompose(platforms: BroadcastPlatform[]): BroadcastCompose | null {
  if (platforms.length === 0) return null;
  const list = platforms.map(p => BROADCAST_PLATFORMS[p].compose);
  const titleMaxes = list.map(c => c.titleMax).filter((v): v is number => typeof v === 'number');
  return {
    // มีเจ้าไหนบังคับหัวข้อ = ทุกใบต้องมีหัวข้อ · ยาวได้เท่าเจ้าที่ให้สั้นที่สุด
    titleMax: titleMaxes.length ? Math.min(...titleMaxes) : undefined,
    bodyMax: Math.min(...list.map(c => c.bodyMax)),
    image: list.every(c => c.image),
    kinds: (['announce', 'poster', 'promo', 'products'] as BroadcastContentKind[])
      .filter(k => list.every(c => c.kinds.includes(k))),
    buttonsMax: Math.min(...list.map(c => c.buttonsMax)),
    productsMax: Math.min(...list.map(c => c.productsMax)),
    quickReplyMax: Math.min(...list.map(c => c.quickReplyMax)),
  };
}

export function isBroadcastPlatform(value: unknown): value is BroadcastPlatform {
  return typeof value === 'string' && value in BROADCAST_PLATFORMS;
}

/** ส่งผ่านช่องทางนี้ได้จริงหรือยัง — ใช้ทั้งหน้าจอ (ปุ่มกดได้ไหม) และ API (รับ request ไหม) */
export function canBroadcastVia(platform: BroadcastPlatform): boolean {
  return BROADCAST_PLATFORMS[platform].status === 'ready';
}

// Path: lib/coupons.ts
//
// **กติกาคูปองทั้งระบบอยู่ที่ไฟล์นี้ที่เดียว** — client-safe (ไม่แตะ DB ไม่ import supabase)
// ฝั่งเซิร์ฟเวอร์โหลดแถวจาก DB แล้วส่งเข้ามาที่นี่ · ฝั่งหน้าจอใช้ตัวเดียวกันโชว์ผลก่อนกดบันทึก
// ⛔ ห้ามคิดส่วนลดหรือแปลเหตุผลที่ปฏิเสธเองในหน้า/route อื่น — เพิ่มเคสที่นี่แทน
//
// ส่วนลดที่คิดได้จะไปลงช่อง `orders.discount_amount` เดิม (สูตรยอดเงินอยู่ที่ lib/order-totals.ts
// ไม่ต้องแก้) · คูปองใช้ได้เฉพาะช่องทางที่ร้านออกบิลเอง — **marketplace ใช้ไม่ได้** เพราะยอดของ
// Shopee/Lazada/TikTok มาจากแพลตฟอร์มแล้ว แก้ยอดเองจะไม่ตรงกับเงินที่โอนเข้าจริง

/** ช่องทางที่ใช้คูปองได้ — ไม่มี marketplace และไม่มีบิลตัวแทน/ฝากขาย/ส่งห้าง (มีโครงสร้างราคาของตัวเอง) */
export const COUPON_CHANNELS = ['chat_order', 'bill_online', 'storefront', 'pos', 'counter'] as const;
export type CouponChannel = (typeof COUPON_CHANNELS)[number];

export const COUPON_CHANNEL_LABEL: Record<CouponChannel, string> = {
  chat_order: 'เปิดบิลในแชท',
  bill_online: 'บิลออนไลน์ (ลูกค้ากรอกเอง)',
  storefront: 'หน้าร้านออนไลน์',
  pos: 'ขายหน้าร้าน (POS)',
  counter: 'เคาน์เตอร์ห้าง',
};

export type CouponDiscountType = 'percent' | 'amount';
/** manual = ร้านสร้างเอง · fb_optin = ออกให้ตอนลูกค้ากดรับข่าวสารบน Messenger · auto = กติกาอัตโนมัติอื่น ๆ */
export type CouponSource = 'manual' | 'fb_optin' | 'auto';

export interface Coupon {
  id: string;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  /** เพดานส่วนลดเมื่อคิดเป็น % (null = ไม่จำกัด) */
  max_discount: number | null;
  min_spend: number;
  valid_from: string | null;
  valid_until: string | null;
  /** null = ไม่จำกัดจำนวนครั้งรวม */
  usage_limit_total: number | null;
  /** null = ไม่จำกัดต่อคน */
  usage_limit_per_customer: number | null;
  used_count: number;
  /** มีค่า = คูปองเฉพาะคน ใช้ได้เฉพาะลูกค้ารายนี้ */
  customer_id: string | null;
  /** ออกให้ผู้ติดต่อในแชทที่ยังไม่ได้จับคู่เป็นลูกค้า — ผูก customer_id ตอนเปิดบิลครั้งแรก */
  fb_contact_id: string | null;
  channels: CouponChannel[];
  is_active: boolean;
}

/** ตัวอักษรที่ไม่ชวนอ่านผิด — ตัด 0/O · 1/I/L · 5/S · 8/B ออก เพราะลูกค้าต้องอ่านโค้ดให้แอดมินฟัง */
const CODE_ALPHABET = '23467 9ACDEFGHJKMNPQRTUVWXYZ'.replace(/\s/g, '');

/** สุ่มโค้ดสำหรับคูปองเฉพาะคน เช่น `ADF-7KQ2M` — ผู้เรียกต้องเช็คซ้ำกับ DB แล้วสุ่มใหม่ถ้าชน */
export function generateCouponCode(prefix = '', length = 5): string {
  let body = '';
  for (let i = 0; i < length; i++) {
    body += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  const clean = normalizeCouponCode(prefix);
  return clean ? `${clean}-${body}` : body;
}

/** โค้ดเทียบแบบไม่สนตัวพิมพ์และช่องว่าง — เก็บลง DB เป็นตัวพิมพ์ใหญ่เสมอ */
export function normalizeCouponCode(input: string): string {
  return (input || '').trim().toUpperCase().replace(/\s+/g, '');
}

/** ส่วนลดที่คูปองใบนี้ให้กับยอดสินค้าก้อนนี้ (ปัด 2 ตำแหน่ง · ไม่เกินยอดสินค้า) */
export function computeCouponDiscount(coupon: Pick<Coupon, 'discount_type' | 'discount_value' | 'max_discount'>, itemsTotal: number): number {
  const base = Math.max(0, itemsTotal || 0);
  let discount = coupon.discount_type === 'percent'
    ? base * ((coupon.discount_value || 0) / 100)
    : (coupon.discount_value || 0);
  if (coupon.discount_type === 'percent' && coupon.max_discount != null) {
    discount = Math.min(discount, coupon.max_discount);
  }
  return Math.round(Math.min(discount, base) * 100) / 100;
}

export interface CouponCheckInput {
  coupon: Coupon;
  itemsTotal: number;
  channel: CouponChannel;
  /** ลูกค้าที่กำลังเปิดบิล (null = ยังไม่ได้เลือกลูกค้า) */
  customerId?: string | null;
  /** จำนวนครั้งที่ลูกค้ารายนี้ใช้คูปองใบนี้ไปแล้ว */
  usedByCustomer?: number;
  /** เวลาที่ใช้ตัดสิน (เผื่อทดสอบ) */
  now?: Date;
}

export type CouponCheckResult =
  | { ok: true; discount: number }
  | { ok: false; reason: string };

/**
 * ตรวจว่าคูปองใบนี้ใช้กับบิลตรงหน้าได้ไหม — **เหตุผลที่ปฏิเสธต้องบอกให้ลงมือแก้ได้**
 * (เช่น ยอดไม่ถึงเท่าไหร่ ไม่ใช่แค่ "ใช้ไม่ได้")
 */
export function checkCoupon({
  coupon,
  itemsTotal,
  channel,
  customerId = null,
  usedByCustomer = 0,
  now = new Date(),
}: CouponCheckInput): CouponCheckResult {
  if (!coupon.is_active) return { ok: false, reason: 'คูปองนี้ถูกปิดใช้งานแล้ว' };

  if (coupon.valid_from && now < new Date(coupon.valid_from)) {
    return { ok: false, reason: `คูปองนี้เริ่มใช้ได้ ${formatThaiDay(coupon.valid_from)}` };
  }
  if (coupon.valid_until && now > new Date(coupon.valid_until)) {
    return { ok: false, reason: `คูปองนี้หมดอายุแล้ว (${formatThaiDay(coupon.valid_until)})` };
  }

  if (!coupon.channels.includes(channel)) {
    return { ok: false, reason: `คูปองนี้ใช้กับ${COUPON_CHANNEL_LABEL[channel]}ไม่ได้` };
  }

  if (coupon.customer_id && coupon.customer_id !== customerId) {
    return {
      ok: false,
      reason: customerId
        ? 'คูปองนี้เป็นของลูกค้าคนอื่น'
        : 'คูปองนี้เป็นคูปองเฉพาะคน — เลือกลูกค้าก่อนจึงจะใช้ได้',
    };
  }

  if (coupon.usage_limit_total != null && coupon.used_count >= coupon.usage_limit_total) {
    return { ok: false, reason: 'คูปองนี้ถูกใช้ครบจำนวนแล้ว' };
  }
  if (coupon.usage_limit_per_customer != null && usedByCustomer >= coupon.usage_limit_per_customer) {
    return { ok: false, reason: 'ลูกค้ารายนี้ใช้คูปองใบนี้ครบจำนวนแล้ว' };
  }

  if ((itemsTotal || 0) < (coupon.min_spend || 0)) {
    return { ok: false, reason: `ต้องซื้อครบ ${formatBaht(coupon.min_spend)} ขึ้นไปจึงจะใช้คูปองนี้ได้` };
  }

  const discount = computeCouponDiscount(coupon, itemsTotal);
  if (discount <= 0) return { ok: false, reason: 'คูปองนี้คิดส่วนลดได้ 0 บาทกับบิลนี้' };

  return { ok: true, discount };
}

function formatBaht(n: number): string {
  return `${(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`;
}

function formatThaiDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

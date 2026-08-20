// การ์ดอวยพร — บริการเสริมระดับร้าน ไม่ใช่ของหน้าร้านออนไลน์อย่างเดียว
//
// ลูกค้าสั่งผ่านแชท FB/LINE แล้วพนักงานเปิดบิลให้ ก็ต้องแนบการ์ดได้เหมือนกัน
// จึงเก็บที่ `companies.settings.gift_card` ไม่ใช่ใน settings.storefront
// (ถ้าอยู่ใต้ storefront ร้านที่ไม่ได้เปิดหน้าร้านออนไลน์จะตั้งค่าไม่ได้เลย)
//
// ค่าการ์ดลงที่ `orders.gift_card_fee` ส่วนข้อความลง `orders.gift_message`
// ซึ่งเป็นคอลัมน์ของออเดอร์ ทุกช่องทางที่สร้างออเดอร์จึงใช้ร่วมกันได้

export interface GiftCardSettings {
  /** ร้านมีบริการการ์ดไหม — ปิดเป็นค่าเริ่มต้น ไม่ใช่ทุกแบรนด์มี */
  enabled: boolean;
  /** ค่าการ์ดต่อใบ — 0 = แถมฟรี */
  fee: number;
}

export const DEFAULT_GIFT_CARD: GiftCardSettings = { enabled: false, fee: 0 };

export function parseGiftCard(settings: Record<string, unknown> | null | undefined): GiftCardSettings {
  const raw = (settings?.gift_card as Partial<GiftCardSettings> | undefined) || {};
  return {
    enabled: raw.enabled ?? DEFAULT_GIFT_CARD.enabled,
    fee: Math.max(0, Number(raw.fee) || 0),
  };
}

// การส่งมอบของให้ขนส่ง — ภาษากลางของทุก marketplace (client-safe)
//
// ══════════════════════════════════════════════════════════════════════════
//  หลักการ: **อย่าถามตามแพลตฟอร์ม ให้ถามตามคำถาม**
// ══════════════════════════════════════════════════════════════════════════
//  พนักงานไม่ควรต้องรู้ว่าออเดอร์นี้มาจากที่ไหนถึงจะกดรับเป็น — สิ่งเดียวที่เขาต้องตอบคือ
//  "ของออกจากร้านยังไง" ซึ่งมีแค่ 2 คำตอบที่คนทำงานเข้าใจ:
//    • ขนส่งมารับที่ร้าน  → บางเจ้าต้องเลือกรอบเวลาด้วย
//    • เอาไปส่งเองที่จุดรับ → ไม่ต้องตอบอะไรเพิ่ม
//
//  ของจริงหลังบ้านต่างกันมาก:
//    Shopee — PICKUP (ต้องเลือกรอบ) / DROPOFF (เลือกสาขาให้เอง) / NON_INTEGRATED (กรอกเลขพัสดุ)
//    TikTok — PICKUP (ต้องเลือกรอบ) / DROP_OFF (ไม่ต้องตอบ)
//    Lazada — dropship อย่างเดียว ไม่มีอะไรให้เลือก
//  ความต่างพวกนี้ **ต้องไม่โผล่ไปถึงหน้าจอ** — แปลงให้จบตรงนี้

/** สิ่งที่ออเดอร์นี้ยังขาดก่อนจะส่งได้ — ถ้าเป็น 'none' คือกดส่งได้เลย ไม่ต้องถามใคร */
export type HandoverNeed = 'pickup_slot' | 'none';

/**
 * รอบเวลาให้ขนส่งมารับ ในรูปแบบที่ HandoverPickerPanel ใช้
 * (รูปนี้มาจาก Shopee ก่อน — เจ้าอื่นแปลงเข้ามาให้ตรง จะได้ใช้จอเดียวกัน)
 */
export interface HandoverSlot {
  pickup_time_id: string;
  date: number;
  display: string;
  recommended: boolean;
  /** ช่วงเวลาตามที่แพลตฟอร์มเขียนมา เช่น "08:30 - 12:30" (Shopee บางช่องทางไม่ส่งมา) */
  time_text?: string;
}

/**
 * ที่อยู่ที่ให้ขนส่งมารับ — ร้านหนึ่งมีได้หลายที่ (ABC the Baby มี 10 ที่)
 * **เลือกผิด = รถไปจอดผิดที่** โดยเฉพาะขนส่งด่วนที่มารับทันที
 */
export interface HandoverAddress {
  address_id: number;
  /** บรรทัดแรก — ที่อยู่ตามที่ร้านพิมพ์ไว้ */
  label: string;
  /** บรรทัดรอง — แขวง/เขต/จังหวัด/รหัสไปรษณีย์ ที่ยังไม่ได้อยู่ใน label */
  detail: string;
  /** ป้ายจาก Shopee (default_address / pickup_address / return_address / current_address) */
  flags: string[];
  /** ร้านนี้เคยเลือกที่อยู่นี้ครั้งล่าสุด */
  last_used: boolean;
  time_slots: HandoverSlot[];
}

/** คำตอบของ "ให้มารับที่ไหน เมื่อไหร่" ต่อออเดอร์หนึ่งใบ */
export interface HandoverSelection {
  /** เฉพาะแพลตฟอร์มที่ให้เลือกที่อยู่ได้ (Shopee) — TikTok ไม่มี */
  address_id?: number;
  /** '' = ช่องทางนี้ไม่มีรอบให้เลือก แพลตฟอร์มจัดให้เอง */
  pickup_time_id: string;
}

/** ออเดอร์หนึ่งใบในจอ "ให้ขนส่งมารับที่ไหน เมื่อไหร่" */
export interface HandoverOrder {
  orderId: string;
  orderSn: string;
  orderNumber: string;
  /** รอบเวลาของที่อยู่ที่เลือกอยู่ (ไม่มี addresses = รอบของแพลตฟอร์มตรง ๆ เช่น TikTok) */
  timeSlots: HandoverSlot[];
  /** ที่อยู่ให้เลือก — มีเฉพาะ Shopee */
  addresses?: HandoverAddress[];
  /** ชื่อร้าน — ใช้แยกกลุ่มที่อยู่เมื่อกดรับหลายร้านพร้อมกัน */
  shopName?: string;
  /**
   * มาจากแพลตฟอร์มไหน — จอนี้ไม่ได้ใช้แสดงผล แต่ผู้เรียกใช้ตัดสินว่าจะยิงปลายทางไหน
   * ตอนยืนยัน · **เจตนาให้ผู้ใช้ไม่เห็นความต่างตรงนี้เลย** ทุกใบหน้าตาเหมือนกันหมด
   */
  source?: string;
}

/** ป้ายของ Shopee ที่บอกว่าที่อยู่นี้ถูกตั้งเป็นอะไรไว้ — แปลให้คนอ่านรู้เรื่อง */
export const ADDRESS_FLAG_LABELS: Record<string, string> = {
  pickup_address: 'ที่อยู่รับพัสดุ',
  default_address: 'ค่าเริ่มต้นใน Shopee',
  return_address: 'ที่อยู่รับคืน',
  current_address: 'คลังปัจจุบัน',
};

/**
 * TikTok บอกรอบเวลาเป็นช่วง unix (start/end) ไม่มี id ให้
 * → ประกอบ id เองจากช่วงเวลา แล้วถอดกลับตอนจะส่งจริง
 * รูปแบบ: `<start>:<end>` — ทั้งคู่เป็นวินาที
 */
export function encodeTikTokSlotId(startTime: number, endTime: number): string {
  return `${startTime}:${endTime}`;
}

export function decodeTikTokSlotId(id: string): { start_time: number; end_time: number } | null {
  const [a, b] = id.split(':');
  const start = Number(a);
  const end = Number(b);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start_time: start, end_time: end };
}

/** "จ. 1 ก.ย. 09:00–12:00" — อ่านแล้วรู้เลยว่าต้องอยู่รอของตอนไหน */
export function formatSlotRange(startSec: number, endSec: number): string {
  const start = new Date(startSec * 1000);
  const end = new Date(endSec * 1000);
  const day = start.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  const t = (d: Date) => d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${t(start)}–${t(end)}`;
}

/** แปลงรอบเวลาของ TikTok ให้อยู่ในรูปที่จอเดียวกันใช้ได้ */
export function toHandoverSlots(
  slots: { start_time: number; end_time: number }[]
): HandoverSlot[] {
  return slots.map((s, i) => ({
    pickup_time_id: encodeTikTokSlotId(s.start_time, s.end_time),
    date: s.start_time,
    display: formatSlotRange(s.start_time, s.end_time),
    // รอบแรกสุดคือรอบที่ของออกเร็วที่สุด — แนะนำตัวนั้น (Shopee ก็ใช้เกณฑ์นี้)
    recommended: i === 0,
  }));
}

/** ปลายทางที่ต้องยิงเมื่อกดรับออเดอร์ของแต่ละที่ */
export const ACCEPT_ENDPOINTS: Record<string, string> = {
  shopee: '/api/shopee/orders/bulk-ship',
  tiktok: '/api/tiktok/orders/ship',
  lazada: '/api/lazada/orders/ship',
};

/**
 * "วันนี้ 08:30 - 12:30" / "ศ. 12 ก.ย." — คิดจาก **เขตเวลาของเบราว์เซอร์**
 * (ห้ามคิดที่เซิร์ฟเวอร์ Vercel รันเป็น UTC จะเพี้ยนไปทั้งวัน)
 *
 * ⚠️ ไม่มี `timeText` = ช่องทางนั้นไม่ได้บอกช่วงเวลามา **ห้ามแต่งเวลาขึ้นมาเอง**
 * ค่า `date` ของ Shopee ฝั่งไทยเป็นแค่ตัวบอกวัน ไม่ใช่เวลานัดจริง
 */
export function formatShopeeSlot(dateSec: number, timeText?: string): string {
  const d = new Date(dateSec * 1000);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const dayLabel = d.toDateString() === now.toDateString()
    ? 'วันนี้'
    : d.toDateString() === tomorrow.toDateString()
      ? 'พรุ่งนี้'
      : d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });

  return timeText ? `${dayLabel} ${timeText}` : dayLabel;
}

/** รอบเวลาของ Shopee ที่ API ส่งมาแล้ว → รูปที่จอเดียวกันใช้ (ประกอบข้อความที่เบราว์เซอร์) */
export function toShopeeHandoverSlots(
  rows: { pickup_time_id: string; date: number; time_text?: string; recommended: boolean }[]
): HandoverSlot[] {
  return rows.map(r => ({
    pickup_time_id: r.pickup_time_id,
    date: r.date,
    display: formatShopeeSlot(r.date, r.time_text),
    recommended: r.recommended,
    ...(r.time_text ? { time_text: r.time_text } : {}),
  }));
}

/** รูปที่ `/api/shopee/orders/bulk-ship` ส่งกลับมาในสนาม `pickup_addresses` */
interface ShopeePickupAddressLike {
  address_id: number;
  label: string;
  detail: string;
  flags: string[];
  last_used: boolean;
  time_slots: { pickup_time_id: string; date: number; time_text?: string; recommended: boolean }[];
}

export function toShopeeHandoverAddresses(rows: ShopeePickupAddressLike[]): HandoverAddress[] {
  return rows.map(r => ({
    address_id: r.address_id,
    label: r.label,
    detail: r.detail,
    flags: r.flags || [],
    last_used: !!r.last_used,
    time_slots: toShopeeHandoverSlots(r.time_slots || []),
  }));
}

/**
 * ที่อยู่ที่ควรถูกเลือกไว้ให้ตั้งแต่แรก — **กฎเดียวทั้งเซิร์ฟเวอร์และหน้าจอ**
 * (lib/shopee/pickup.ts import ตัวนี้ไปใช้ จะได้ไม่มีสองความจริง)
 * ลำดับ: ที่ร้านเพิ่งใช้ → ที่ตั้งไว้เป็นที่รับพัสดุ → ค่าเริ่มต้นใน Shopee → ตัวแรก
 */
export function pickDefaultAddress<T extends { flags: string[]; last_used: boolean }>(rows: T[]): T | undefined {
  return rows.find(r => r.last_used)
    || rows.find(r => r.flags?.includes('pickup_address'))
    || rows.find(r => r.flags?.includes('default_address'))
    || rows[0];
}

export function pickDefaultHandoverAddress(addresses: HandoverAddress[]): HandoverAddress | undefined {
  return pickDefaultAddress(addresses);
}

/** ผลลัพธ์ `needs_pickup_choice` จาก bulk-ship → ออเดอร์หนึ่งใบในจอเลือก */
export function shopeeResultToHandoverOrder(
  r: {
    order_id: string;
    order_sn?: string;
    pickup_addresses?: ShopeePickupAddressLike[];
    shop_name?: string;
  },
  orderNumber: string,
): HandoverOrder {
  const addresses = toShopeeHandoverAddresses(r.pickup_addresses || []);
  const preselected = pickDefaultHandoverAddress(addresses);
  return {
    orderId: r.order_id,
    orderSn: r.order_sn || '',
    orderNumber,
    addresses,
    timeSlots: preselected?.time_slots || [],
    shopName: r.shop_name,
    source: 'shopee',
  };
}

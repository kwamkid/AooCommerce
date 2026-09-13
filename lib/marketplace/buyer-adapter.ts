// ข้อมูลผู้ซื้อจาก payload ดิบของ marketplace — **สัญญาเดียวที่ทุก platform ทำตาม**
//
// ══════════════════════════════════════════════════════════════════════════
//  ➕ เพิ่ม marketplace ใหม่ = สร้าง `lib/<platform>/buyer-adapter.ts`
//     แล้วลงทะเบียน 1 บรรทัดใน BUYER_ADAPTERS ข้างล่าง
//     ⛔ ห้าม `switch (platform)` ในชั้นกลาง / route / UI
// ══════════════════════════════════════════════════════════════════════════
//
// ทำไมต้องมีชั้นนี้: ทั้งสามเจ้า **ปิดบัง (mask) ข้อมูลผู้ซื้อไม่เท่ากัน** และปิดบังคนละฟิลด์
//   Shopee  — ปิดหมดทุกช่อง (`****`)
//   Lazada  — บอกอำเภอ (`city`) + รหัสไปรษณีย์ ที่เหลือเป็น `*`
//   TikTok  — บอกจังหวัด/อำเภอใน `district_info` รหัสไปรษณีย์ปิดบางส่วน (`43***`)
// กติกาเดียวที่ทุก adapter ต้องทำตาม: **ค่าที่ถูกปิดบัง = null** ห้ามส่งขยะ (`****`,
// `43***`, `(+66)095*****86`) ต่อไปให้ใครทั้งสิ้น — เก็บลง DB ก็ผิด โชว์บนจอก็หลอกตา

import { shopeeBuyerAdapter } from '@/lib/shopee/buyer-adapter';
import { lazadaBuyerAdapter } from '@/lib/lazada/buyer-adapter';
import { tiktokBuyerAdapter } from '@/lib/tiktok/buyer-adapter';

export interface MarketplaceBuyer {
  name?: string | null;
  phone?: string | null;
  /** บรรทัดที่อยู่ตามที่แพลตฟอร์มให้มา (บ้านเลขที่/ถนน) — null เมื่อถูกปิดบัง */
  address_line?: string | null;
  district?: string | null;
  amphoe?: string | null;
  province?: string | null;
  postal_code?: string | null;
  /** ข้อความที่ผู้ซื้อฝากไว้ตอนสั่ง */
  note?: string | null;
}

export interface BuyerAdapter {
  /** `externalData` = `orders.external_data` ของออเดอร์ใบนั้น (หรือ payload ดิบของออเดอร์) */
  extract(externalData: unknown): MarketplaceBuyer;
}

/** ไม่มีอะไรเลย — ใช้เป็นค่าตั้งต้น/ค่าคืนเมื่อ payload ไม่มีที่อยู่ */
export const EMPTY_BUYER: MarketplaceBuyer = {
  name: null,
  phone: null,
  address_line: null,
  district: null,
  amphoe: null,
  province: null,
  postal_code: null,
  note: null,
};

/** อ่าน object อย่างปลอดภัย — payload จากแพลตฟอร์มเป็น `unknown` เสมอ */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * ค่าที่ใช้ได้จริงเท่านั้น — **มี `*` อยู่ที่ไหนก็ตาม = ถูกปิดบัง = null**
 * (ไม่ใช่แค่ "ทั้งช่องเป็นดอกจัน" เพราะ `43***` / `095*****86` ก็ใช้ไม่ได้เหมือนกัน)
 */
export function unmasked(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.includes('*')) return null;
  return v;
}

/** ข้อความอิสระของผู้ซื้อ — ไม่ใช่ฟิลด์ที่แพลตฟอร์มปิดบัง จึงแค่ตัดช่องว่าง */
export function plainText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v || null;
}

export const BUYER_ADAPTERS: Record<string, BuyerAdapter> = {
  shopee: shopeeBuyerAdapter,
  lazada: lazadaBuyerAdapter,
  tiktok: tiktokBuyerAdapter,
};

export function getBuyerAdapter(platform: string | null | undefined): BuyerAdapter | null {
  if (!platform) return null;
  return BUYER_ADAPTERS[platform] || null;
}

/** ทางลัดที่ route/ชั้นกลางเรียก — ไม่มี adapter = ไม่รู้อะไรเลย (ไม่ใช่ error) */
export function extractBuyer(platform: string | null | undefined, externalData: unknown): MarketplaceBuyer {
  const adapter = getBuyerAdapter(platform);
  if (!adapter) return { ...EMPTY_BUYER };
  return adapter.extract(externalData);
}

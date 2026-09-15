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

import { EMPTY_BUYER, type BuyerAdapter, type MarketplaceBuyer } from './buyer-shared';

// Preserve existing imports for consumers; platform adapters import the leaf module directly.
export { EMPTY_BUYER, asRecord, plainText, unmasked } from './buyer-shared';
export type { BuyerAdapter, MarketplaceBuyer } from './buyer-shared';

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

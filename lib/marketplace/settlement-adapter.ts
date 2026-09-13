// สัญญาของ "ตัวดึงยอดเงินรายออเดอร์" ต่อ marketplace + ทะเบียนรวม (server-only)
//
// ══════════════════════════════════════════════════════════════════════════
//  ➕ เพิ่ม platform ใหม่ (LINE My Shop / Shopify / …) ทำแค่ 2 อย่าง
// ══════════════════════════════════════════════════════════════════════════
//  1. สร้าง `lib/<platform>/settlement-adapter.ts` ที่ export ตัวแปรชนิด `SettlementAdapter`
//     — ข้างในมีแค่ "ยิง API ของเจ้านั้นยังไง แล้วเรียก normalizer ของตัวเอง"
//  2. ลงทะเบียน 1 บรรทัดใน `SETTLEMENT_ADAPTERS` ข้างล่าง
//
//  ⛔ **ห้าม `switch (platform)` ที่ไหนอีกนอกจากทะเบียนนี้** — ชั้นกลาง
//     (`syncOrderSettlement` ใน settlement.ts) · route · การ์ดบนหน้าออเดอร์
//     ห้ามรู้จักชื่อ platform เลยสักที่
//  ⛔ **ห้ามเขียน DB ใน adapter** — คืน `NormalizedSettlement` แล้วให้ชั้นกลาง
//     `saveSettlement()` เป็นคนบันทึก (ต้นทุน/กันซ้ำ/บรรทัดค่าธรรมเนียมอยู่ที่นั่นที่เดียว)
//  ⛔ **ห้าม normalize ซ้ำ** — ตัวแปลงของแต่ละเจ้ามีอยู่แล้วที่ `lib/<platform>/settlement.ts`
//     (ตัวเดียวกับที่ cron รายวันใช้) adapter แค่เรียกมัน
// ══════════════════════════════════════════════════════════════════════════

import type { NormalizedSettlement } from '@/lib/marketplace/fee-types';
import { shopeeSettlementAdapter } from '@/lib/shopee/settlement-adapter';
import { lazadaSettlementAdapter } from '@/lib/lazada/settlement-adapter';
import { tiktokSettlementAdapter } from '@/lib/tiktok/settlement-adapter';

/**
 * แถว `marketplace_accounts` เท่าที่งาน settlement ต้องใช้
 * (หลวมไว้เพราะทุก call site ส่ง row ดิบจาก `select('*')` — adapter cast เป็น row ของตัวเอง)
 */
export interface SettlementAccount {
  id: string;
  company_id: string;
  platform?: string | null;
  shop_name?: string | null;
  [key: string]: unknown;
}

/** แถว `orders` เท่าที่ adapter ต้องใช้ — ห้ามให้ adapter ไป query orders เอง */
export interface SettlementOrder {
  id: string;
  company_id: string;
  /** เลขออเดอร์ฝั่งแพลตฟอร์ม (Shopee order_sn · TikTok order id · Lazada order_no) */
  external_order_sn: string | null;
  created_at?: string | null;
}

/**
 * ผลของการถามแพลตฟอร์มว่า "ออเดอร์ใบนี้ได้เงินเท่าไหร่"
 * - `NormalizedSettlement` — ได้ยอดแล้ว (ชั้นกลางเอาไป `saveSettlement`)
 * - `'pending'` — แพลตฟอร์มตอบปกติแต่ยังไม่มียอด (ยังไม่ถึงรอบโอน)
 *   ⚠️ **ห้ามบันทึกเป็นแถว ฿0** — รายงานจะอ่านว่า "ขายแล้วไม่ได้เงินเลย" ทั้งที่แค่ยังไม่ถึงรอบ
 * - `null` — ไม่พบรายการของออเดอร์นี้ในข้อมูลที่ดึงมา (ชั้นกลางถือว่ายังไม่ถึงรอบเช่นกัน)
 *
 * ยิง API ไม่สำเร็จให้ **throw** ไปเลย — ชั้นกลางแยก "ยังไม่ถึงรอบ" กับ "พัง" คนละข้อความ
 */
export type SettlementFetchResult = NormalizedSettlement | 'pending' | null;

export interface SettlementAdapter {
  fetchOrderSettlement(
    account: SettlementAccount,
    order: SettlementOrder,
  ): Promise<SettlementFetchResult>;
}

// ── ทะเบียน ──────────────────────────────────────────────────────────────────

export const SETTLEMENT_ADAPTERS: Record<string, SettlementAdapter> = {
  shopee: shopeeSettlementAdapter,
  lazada: lazadaSettlementAdapter,
  tiktok: tiktokSettlementAdapter,
};

export function getSettlementAdapter(platform: string | null | undefined): SettlementAdapter | null {
  if (!platform) return null;
  return SETTLEMENT_ADAPTERS[platform] || null;
}

// สัญญาของ "ตัวต่อสต็อก" ต่อ marketplace + ทะเบียนรวม (server-only)
//
// ══════════════════════════════════════════════════════════════════════════
//  ➕ เพิ่ม platform ใหม่ (LINE My Shop / Shopify / …) ทำแค่ 2 อย่าง
// ══════════════════════════════════════════════════════════════════════════
//  1. สร้าง `lib/<platform>/stock-adapter.ts` ที่ export ตัวแปรชนิด `StockAdapter`
//     — ข้างในมีแค่ "ยิง API ของเจ้านั้นยังไง" เท่านั้น
//  2. ลงทะเบียน 1 บรรทัดใน `STOCK_ADAPTERS` ข้างล่าง
//
//  ⛔ **ห้าม `switch (platform)` ที่ไหนอีกนอกจากทะเบียนนี้** และห้ามย้ายตรรกะร่วม
//     (gate แพ็กเกจ · หาคลังของร้าน · คิดยอดที่จะส่ง · dedupe link · fill_blank/overwrite ·
//      สูตร `quantity = platformStock + reserved` · `adjustStock` · stamp
//      `last_stock_pushed_at` · integration log · chunk/cursor) ไปไว้ในไฟล์ของ platform
//     ของพวกนั้นอยู่ที่ `lib/marketplace/stock-push.ts` ที่เดียว
// ══════════════════════════════════════════════════════════════════════════

import { MARKETPLACE_PLATFORMS } from '@/lib/marketplace/platforms';
import { shopeeStockAdapter } from '@/lib/shopee/stock-adapter';
import { lazadaStockAdapter } from '@/lib/lazada/stock-adapter';
import { tiktokStockAdapter } from '@/lib/tiktok/stock-adapter';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * แถว `marketplace_accounts` เท่าที่งานสต็อกต้องใช้
 * (หลวมไว้เพราะทุก call site ส่ง row ดิบจาก `select('*')`)
 */
export interface StockSyncAccount {
  id: string;
  company_id: string;
  platform?: string | null;
  shop_name?: string | null;
  warehouse_id?: string | null;
}

/** แถวใน `marketplace_product_links` เท่าที่งานสต็อกใช้ */
export interface StockLink {
  id: string;
  external_item_id: string;
  external_model_id: string;
  variation_id: string | null;
  platform_data?: Record<string, unknown> | null;
}

export interface PushStockResult {
  success: boolean;
  updated_models: number;
  errors: string[];
  /**
   * link ที่ส่งขึ้นร้านสำเร็จจริง — ชั้นกลางเอาไป stamp `last_stock_pushed_at`
   * (ค่านี้คือสัญญาณจับ "พังเงียบ" จึงต้องมาจาก adapter ที่รู้ว่าใบไหนผ่าน ไม่ใช่เดาเอา)
   */
  pushed_link_ids?: string[];
}

/**
 * โหมดการดึงยอด
 * - `fill_blank` (default) — เติมเฉพาะช่องที่ของเราเป็น 0 และร้าน > 0
 *   ใช้ตอน "ตั้งยอดตั้งต้น" ครั้งแรก ไม่ทับของที่พนักงานตั้งไว้
 * - `overwrite` — **ยึดร้านเป็นความจริง** ทับทุกช่องรวมถึงตัวที่ร้านเป็น 0
 *   ใช้ตอน reconcile หลัง push ตายจนยอดสองฝั่งหลุดกัน (ดู fix-bug.md 2026-08-29)
 */
export type PullStockMode = 'fill_blank' | 'overwrite';

export interface PullStockChange {
  variation_id: string;
  from: number;      // ยอดที่ขายได้ของเราตอนนี้ (quantity - reserved)
  to: number;        // ยอดบนร้าน
}

export interface PullStockResult {
  success: boolean;
  checked: number;         // จำนวน variation ที่ผูกกับร้านนี้และเจอยอดบนร้าน
  filled: number;          // เติมยอดให้ (ช่องที่เดิมเป็น 0 / ยังไม่มีแถว)
  skipped_nonzero: number; // ข้ามเพราะคลังเรามียอดจริงอยู่แล้ว — ไม่ทับเด็ดขาด (โหมด fill_blank)
  overwritten?: number;    // ทับยอดเดิมที่ไม่ใช่ 0 (โหมด overwrite เท่านั้น)
  unchanged?: number;      // ยอดตรงกันอยู่แล้ว ไม่ต้องเขียน
  dry_run?: boolean;
  changes?: PullStockChange[];       // รายการที่จะเปลี่ยน (ใส่ครบเสมอ ใช้ทำ preview)
  desired?: Record<string, number>;  // variation_id → ยอดบนร้าน (ทุกตัวที่เจอ ไม่ใช่แค่ที่เปลี่ยน)
  errors: string[];
}

/** ผลการอ่านยอดจากร้าน — ชั้นกลางเป็นคนเขียนลง inventory ต่อเอง */
export interface PlatformStockRead {
  /** variation_id → ยอดที่ขายได้บนร้าน */
  stock: Map<string, number>;
  errors: string[];
}

export interface StockAdapter {
  /** path จริงที่ยิงตอน push — ลง `integration_logs.api_path` */
  pushApiPath: string;
  /** path จริงที่ยิงตอน pull */
  pullApiPath: string;
  /**
   * 2 แถว link ที่คีย์นี้ตรงกัน = SKU เดียวกันบนร้าน (ชั้นกลางจะยุบให้เหลือใบเดียวก่อนยิง)
   * ไม่ใส่ = `external_item_id:external_model_id` ตามปกติ
   * — Lazada ต้องใส่เพราะ import กับ order sync เก็บ `external_item_id` คนละรูปของ SKU เดียวกัน
   */
  linkIdentity?(link: StockLink): string;
  /**
   * ส่งยอดของสินค้าหนึ่งตัวขึ้นร้าน
   * @param links แถวที่ยุบซ้ำแล้วของ product นี้ใน account นี้ (`sync_enabled` เท่านั้น)
   * @param quantities variation_id → ยอดที่ต้องส่ง (ชั้นกลางคิดมาให้แล้ว — ห้ามอ่าน inventory เอง)
   */
  pushStock(
    account: StockSyncAccount,
    productId: string,
    quantities: Map<string, number>,
    links: StockLink[],
  ): Promise<PushStockResult>;
  /**
   * อ่านยอดจากร้านทั้งร้าน → variation_id → ยอดที่ขายได้บนร้าน
   * **ห้ามเขียน `inventory` เอง** — ชั้นกลางเขียนผ่าน `adjustStock` ให้ (มีร่องรอย + กติกา mode)
   */
  fetchPlatformStock(account: StockSyncAccount, links: StockLink[]): Promise<PlatformStockRead>;
}

// ── ทะเบียน ──────────────────────────────────────────────────────────────────

export const STOCK_ADAPTERS: Record<string, StockAdapter> = {
  shopee: shopeeStockAdapter,
  lazada: lazadaStockAdapter,
  tiktok: tiktokStockAdapter,
};

export function getStockAdapter(platform: string | null | undefined): StockAdapter | null {
  if (!platform) return null;
  return STOCK_ADAPTERS[platform] || null;
}

/** ชื่อที่ผู้ใช้เห็น — ใช้ registry ของ marketplace ก่อน ไม่มีค่อยคืนชื่อ platform ดิบ */
export function stockPlatformLabel(platform: string | null | undefined): string {
  if (!platform) return 'แพลตฟอร์มนี้';
  return MARKETPLACE_PLATFORMS[platform as keyof typeof MARKETPLACE_PLATFORMS]?.label || platform;
}

/**
 * ที่มาของรายการสต็อกที่บันทึกลง `inventory_transactions` — `shopee_sync` · `lazada_sync` · …
 * ป้ายภาษาไทยอยู่ที่ `REFERENCE_TYPE_LABELS` (`app/inventory/components/types.ts`)
 */
export function stockSyncReferenceType(platform: string): string {
  return `${platform}_sync`;
}

// สัญญาของ "ตัวต่อนำเข้าสินค้า" ต่อ marketplace + ทะเบียนรวม (server-only)
//
// ══════════════════════════════════════════════════════════════════════════
//  ➕ เพิ่ม platform ใหม่ (LINE My Shop / Shopify / …) ทำแค่ 2 อย่าง
// ══════════════════════════════════════════════════════════════════════════
//  1. สร้าง `lib/<platform>/product-import-adapter.ts` ที่ export ตัวแปรชนิด
//     `ProductImportAdapter` — ข้างในมีแค่ "ยิง API ของเจ้านั้นยังไง แล้วแปลงเป็น
//     `MarketplaceImportItem`" กับ "แถว link ของเจ้านี้เก็บอะไรเพิ่ม" เท่านั้น
//  2. ลงทะเบียน 1 บรรทัดใน `PRODUCT_IMPORT_ADAPTERS` ข้างล่าง
//
//  ⛔ **ห้าม `switch (platform)` ที่ไหนอีกนอกจากทะเบียนนี้** — ตรรกะร่วมทั้งหมด
//     (จับคู่ link → code → ปลุกของที่ลบ → SKU → สร้างใหม่ · รูป · ประเภทตัวเลือก ·
//      เคารพ `source` ที่ผู้ใช้แก้เอง · upsert link · เติมสต็อกแบบ fill_blank ·
//      syncStockNow · SSE · งบเวลา/cursor · quota · log) อยู่ที่
//      `lib/marketplace/product-import.ts` ที่เดียว
// ══════════════════════════════════════════════════════════════════════════

import { MARKETPLACE_PLATFORMS } from '@/lib/marketplace/platforms';
import { shopeeProductImportAdapter } from '@/lib/shopee/product-import-adapter';
import { lazadaProductImportAdapter } from '@/lib/lazada/product-import-adapter';
import { tiktokProductImportAdapter } from '@/lib/tiktok/product-import-adapter';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * แถว `marketplace_accounts` เท่าที่งานนำเข้าสินค้าต้องใช้
 * (หลวมไว้เพราะทุก call site ส่ง row ดิบจาก `select('*')` แล้ว adapter cast เป็น
 *  type ของ platform ตัวเองอีกที — แบบเดียวกับ `StockSyncAccount`)
 */
export interface ProductImportAccount {
  id: string;
  company_id: string;
  platform?: string | null;
  shop_id?: number | string | null;
  shop_name?: string | null;
  warehouse_id?: string | null;
}

/** ตัวเลือกหนึ่งตัวของสินค้าบนร้าน (Shopee model · Lazada SKU · TikTok SKU) */
export interface MarketplaceImportModel {
  /** id ของตัวเลือกบนร้าน — **string เสมอ** (TikTok/Lazada ยาวเกิน JS number) */
  external_model_id: string;
  /** ชื่อที่ร้านเรียกตัวเลือกนี้ เช่น "แดง,XL" (ว่างได้เมื่อเป็นสินค้าเดี่ยว) */
  name: string;
  /** SKU ที่ร้านตั้ง — ว่างได้ (ชั้นกลาง generate `<codePrefix>{item}-{model}` ให้) */
  sku: string;
  /** ราคาขายจริงตอนนี้ */
  price: number;
  /** ราคาก่อนลด — 0/ไม่ใส่ = ไม่มีส่วนลด (ชั้นกลางคิด default/discount จากคู่นี้) */
  original_price?: number;
  /** ยอดคงเหลือบนร้าน — ใช้ตั้งยอดตั้งต้นแบบ fill_blank เท่านั้น */
  stock: number;
  image?: string | null;
  /** { 'สี': 'แดง', 'ขนาด': 'XL' } → `product_variations.attributes` */
  attributes: Record<string, string>;
}

/** สินค้าหนึ่งตัวบนร้าน หลัง normalize แล้ว — รูปเดียวที่ชั้นกลางรู้จัก */
export interface MarketplaceImportItem {
  /** id ของสินค้าบนร้าน — **string เสมอ** */
  external_item_id: string;
  name: string;
  /**
   * SKU ระดับสินค้าที่จะใช้เป็น `products.code` — ว่างได้
   * (ว่าง = ชั้นกลางใช้ `<codePrefix>{external_item_id}`)
   */
  sku?: string;
  /** รูปหลัก (= images[0] ปกติ) */
  image?: string | null;
  images: string[];
  /** ราคาตัวแทนที่โชว์ในหน้าเลือก */
  price: number;
  /** สถานะดิบของร้าน (NORMAL / ACTIVE / …) — โชว์เป็น InfoChip เฉย ๆ */
  status: string | null;
  has_variation: boolean;
  models: MarketplaceImportModel[];
  /** ชื่อประเภทตัวเลือกเรียงตามลำดับ เช่น ['สี','ขนาด'] → `variation_types` */
  variation_type_names: string[];
  /** คำอธิบายแบบข้อความล้วน → `products.description` */
  description?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  brand_name?: string | null;
  /** กิโลกรัม */
  weight?: number | null;
  /** ก้อนดิบของ platform — adapter เอาไปใช้ต่อใน `linkPayload` ได้ */
  raw?: unknown;
}

export interface ProductImportPage {
  items: MarketplaceImportItem[];
  /** cursor ของหน้าถัดไป — **opaque string** (offset / page_token แล้วแต่เจ้า) · ไม่มี = หมดแล้ว */
  nextCursor?: string;
  /** จำนวนสินค้าทั้งร้าน (ถ้า platform บอก) */
  total?: number;
}

export interface ProductImportAdapter {
  /** path จริงที่ยิงตอนไล่รายการ — ลง `integration_logs.api_path` */
  listApiPath: string;
  /** ขึ้นต้นรหัสสินค้า/SKU ที่ generate ให้ตอนร้านไม่ได้ตั้ง — `SP-` · `LZ-` · `TT-` */
  codePrefix: string;
  /**
   * ไล่รายการสินค้าในร้านทีละหน้า
   * @param cursor cursor ที่ได้จากหน้าก่อน (ไม่ส่ง = หน้าแรก)
   */
  listProducts(
    account: ProductImportAccount,
    cursor?: string,
    pageSize?: number,
  ): Promise<ProductImportPage>;
  /**
   * ดึงรายละเอียดเฉพาะ id ที่ผู้ใช้เลือก
   * ไม่มี = ชั้นกลางจะไล่ `listProducts` หาเอาเอง (ช้ากว่ามาก — ควรมีทุกเจ้า)
   */
  fetchDetails?(account: ProductImportAccount, ids: string[]): Promise<MarketplaceImportItem[]>;
  /**
   * คอลัมน์เฉพาะ platform ที่ต้องลง `marketplace_product_links`
   * (`platform_price` · `platform_description` · `weight` · `platform_data` ·
   *  `shopee_*` ฯลฯ) — ชั้นกลาง merge ทับคอลัมน์กลางให้
   */
  linkPayload(item: MarketplaceImportItem, model: MarketplaceImportModel): Record<string, unknown>;
}

// ── ทะเบียน ──────────────────────────────────────────────────────────────────

export const PRODUCT_IMPORT_ADAPTERS: Record<string, ProductImportAdapter> = {
  shopee: shopeeProductImportAdapter,
  lazada: lazadaProductImportAdapter,
  tiktok: tiktokProductImportAdapter,
};

export function getProductImportAdapter(platform: string | null | undefined): ProductImportAdapter | null {
  if (!platform) return null;
  return PRODUCT_IMPORT_ADAPTERS[platform] || null;
}

/** ชื่อที่ผู้ใช้เห็น — registry เดียวกับทุกที่ ห้าม map ป้ายซ้ำ */
export function importPlatformLabel(platform: string | null | undefined): string {
  if (!platform) return 'แพลตฟอร์มนี้';
  return MARKETPLACE_PLATFORMS[platform as keyof typeof MARKETPLACE_PLATFORMS]?.label || platform;
}

// สัญญาของ "ตัวต่อส่งสินค้าขึ้นร้าน" ต่อ marketplace + ทะเบียนรวม (server-only)
//
// ══════════════════════════════════════════════════════════════════════════
//  ➕ เพิ่ม platform ใหม่ (LINE My Shop / Shopify / …) ทำแค่ 2 อย่าง
// ══════════════════════════════════════════════════════════════════════════
//  1. สร้าง `lib/<platform>/product-export-adapter.ts` ที่ export ตัวแปรชนิด
//     `ProductExportAdapter` — ข้างในมีแค่ "ยิง API ของเจ้านั้นยังไง แล้วแปลง
//     `ExportPayload` กลางเป็น body ของตัวเอง" เท่านั้น
//  2. ลงทะเบียน 1 บรรทัดใน `PRODUCT_EXPORT_ADAPTERS` ข้างล่าง
//
//  ⛔ **ห้าม `switch (platform)` ที่ไหนอีกนอกจากทะเบียนนี้** — ตรรกะร่วมทั้งหมด
//     (กันส่งซ้ำ · กันสินค้าชุด · อ่านสินค้า/รูป/ตัวเลือก · คิดยอดสต็อกที่จะตั้งต้น ·
//      อัปโหลดรูป · upsert `marketplace_product_links` · integration log ·
//      `syncStockNow` · งบเวลา/cursor ของโหมดหลายรายการ) อยู่ที่
//      `lib/marketplace/product-export.ts` ที่เดียว
// ══════════════════════════════════════════════════════════════════════════

import { MARKETPLACE_PLATFORMS } from '@/lib/marketplace/platforms';
import { shopeeProductExportAdapter } from '@/lib/shopee/product-export-adapter';
import { lazadaProductExportAdapter } from '@/lib/lazada/product-export-adapter';
import { tiktokProductExportAdapter } from '@/lib/tiktok/product-export-adapter';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * แถว `marketplace_accounts` เท่าที่งานส่งสินค้าต้องใช้
 * (หลวมไว้เพราะทุก call site ส่ง row ดิบจาก `select('*')` แล้ว adapter cast เป็น
 *  type ของ platform ตัวเองอีกที — แบบเดียวกับ `ProductImportAccount`)
 */
export interface ProductExportAccount {
  id: string;
  company_id: string;
  platform?: string | null;
  shop_id?: number | string | null;
  shop_name?: string | null;
  warehouse_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** หมวดหมู่หนึ่งใบของร้าน — ต้นไม้ถูกแบนแล้ว (โยงกันด้วย `parent_id`) */
export interface MarketplaceCategory {
  /** id ของหมวดบนร้าน — **string เสมอ** (TikTok ยาวเกิน JS number) */
  id: string;
  /** null = หมวดระดับบนสุด */
  parent_id: string | null;
  name: string;
  /** ปลายกิ่ง = ใช้ลงประกาศได้จริง (หมวดกลางเลือกไม่ได้) */
  is_leaf: boolean;
}

export interface MarketplaceAttributeOption {
  id: string;
  name: string;
}

/** คุณสมบัติที่หมวดนั้นขอ — ฟอร์มในหน้า wizard สร้างจากก้อนนี้ */
export interface MarketplaceAttribute {
  id: string;
  name: string;
  required: boolean;
  /** `text` = พิมพ์เอง · `select` = เลือกหนึ่ง · `multi` = เลือกได้หลายค่า */
  input_type: 'text' | 'select' | 'multi';
  options: MarketplaceAttributeOption[];
}

export interface MarketplaceBrand {
  id: string;
  name: string;
}

/** ตัวเลือกหนึ่งตัวของสินค้าที่จะส่งขึ้นร้าน */
export interface ExportModel {
  /** `product_variations.id` — null = สินค้าที่ยังไม่มีแถว variation จริง */
  variation_id: string | null;
  /** ชื่อที่ผู้ใช้เห็น เช่น "แดง,XL" (สินค้าเดี่ยวใช้ชื่อสินค้า) */
  name: string;
  sku: string;
  /** ราคาขายจริง (หลังส่วนลดของเรา) */
  price: number;
  /** ยอดที่จะตั้งให้ตอนสร้าง — ชั้นกลางคิดมาให้แล้ว (ห้าม adapter อ่าน inventory เอง) */
  stock: number;
  /** [{ type_name: 'สี', value: 'แดง' }] เรียงตามลำดับประเภทตัวเลือก */
  attributes: { type_name: string; value: string }[];
  image?: string | null;
}

/**
 * สินค้าหนึ่งตัวในรูปกลาง — สิ่งเดียวที่ adapter รู้จัก
 * (adapter **ไม่** ต้องรู้จักตาราง `products` / `product_variations` / `inventory`)
 */
export interface ExportPayload {
  product_id: string;
  code: string;
  name: string;
  description: string;
  /** URL รูปของเรา (storage) เรียงตามลำดับ — รูปแรก = หน้าปก */
  images: string[];
  /**
   * id/URL ของรูปบนแพลตฟอร์มหลังชั้นกลางอัปโหลดผ่าน `uploadImage` แล้ว
   * (ลำดับตรงกับ `images` · ตัวที่อัปไม่สำเร็จถูกตัดออก)
   */
  uploaded_images: string[];
  category_id: string;
  category_name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  /** กิโลกรัม */
  weight: number;
  /** เซนติเมตร */
  dimensions?: { length: number; width: number; height: number };
  /** ราคาตัวแทน (ของตัวเลือกแรก) */
  price: number;
  has_variation: boolean;
  models: ExportModel[];
  /** คุณสมบัติเพิ่มของแพลตฟอร์ม — key = `MarketplaceAttribute.id` */
  attributes: Record<string, string | string[]>;
}

/** link หนึ่งใบที่เกิดขึ้นจริงบนร้าน */
export interface ExportedModel {
  variation_id: string | null;
  external_model_id: string;
  /** SKU ที่ร้านจดไว้จริง — ไม่ส่ง = ชั้นกลางใช้ SKU ของเรา */
  external_sku?: string;
}

export interface CreateProductResult {
  /** id ของสินค้าบนร้าน — **string เสมอ** */
  external_item_id: string;
  models: ExportedModel[];
  /** เรื่องที่ผู้ใช้ควรรู้แต่ไม่ถือว่าล้ม (ตัวเลือกสร้างไม่ครบ · แพลตฟอร์มเตือน) */
  warnings: string[];
  /** ก้อนเพิ่มที่จะ merge ลง `platform_data` ของแถว link */
  platform_data?: Record<string, unknown>;
  /** ประกาศนี้ถูกสร้างเป็นแบบร่าง/ปิดขายไว้แล้วจริงไหม */
  draft?: boolean;
}

export interface ProductExportAdapter {
  /** path จริงที่ยิงตอนสร้างสินค้า — ลง `integration_logs.api_path` */
  createApiPath: string;
  /** หมวดหมู่ทั้งร้าน (ต้นไม้แบนแล้ว) */
  getCategories(account: ProductExportAccount): Promise<MarketplaceCategory[]>;
  /** คุณสมบัติที่หมวดนั้นขอ */
  getCategoryAttributes(account: ProductExportAccount, categoryId: string): Promise<MarketplaceAttribute[]>;
  /** ค้นแบรนด์ — ไม่มี = หน้า wizard ซ่อนช่องแบรนด์ของ platform นั้น */
  searchBrands?(
    account: ProductExportAccount,
    query: string,
    opts?: { categoryId?: string | null },
  ): Promise<MarketplaceBrand[]>;
  /** true = ทะเบียนแบรนด์ขึ้นกับหมวด (Shopee) — หน้า wizard ให้เลือกหมวดก่อนถึงค้นได้ */
  brandsNeedCategory?: boolean;
  /**
   * อัปรูปจาก URL ของเราขึ้นร้าน → id/URL ที่ใช้ใน payload ของแพลตฟอร์มนั้น
   * (throw เมื่ออัปไม่ได้ — ชั้นกลางจะนับเป็นรูปที่ตกไปแล้วไปต่อ)
   */
  uploadImage(account: ProductExportAccount, imageUrl: string): Promise<string>;
  /** สร้างสินค้าบนร้าน — `opts.draft` = อย่าเพิ่งเปิดขาย */
  createProduct(
    account: ProductExportAccount,
    payload: ExportPayload,
    opts: { draft: boolean },
  ): Promise<CreateProductResult>;
  /** ปิดขายประกาศที่เพิ่งสร้าง (ใช้กับแพลตฟอร์มที่ไม่มีโหมดร่างในตัว) */
  deactivate?(account: ProductExportAccount, externalItemId: string): Promise<void>;
  /**
   * คอลัมน์เฉพาะ platform ที่ต้องลง `marketplace_product_links` เพิ่มจากคอลัมน์กลาง
   * (เช่น `shopee_category_id` / `shopee_attributes` ที่หน้าแก้สินค้าอ่านอยู่)
   */
  linkPayload?(payload: ExportPayload, result: CreateProductResult, model: ExportModel): Record<string, unknown>;
}

// ── ทะเบียน ──────────────────────────────────────────────────────────────────

export const PRODUCT_EXPORT_ADAPTERS: Record<string, ProductExportAdapter> = {
  shopee: shopeeProductExportAdapter,
  lazada: lazadaProductExportAdapter,
  tiktok: tiktokProductExportAdapter,
};

export function getProductExportAdapter(platform: string | null | undefined): ProductExportAdapter | null {
  if (!platform) return null;
  return PRODUCT_EXPORT_ADAPTERS[platform] || null;
}

/** ชื่อที่ผู้ใช้เห็น — registry เดียวกับทุกที่ ห้าม map ป้ายซ้ำ */
export function exportPlatformLabel(platform: string | null | undefined): string {
  if (!platform) return 'แพลตฟอร์มนี้';
  return MARKETPLACE_PLATFORMS[platform as keyof typeof MARKETPLACE_PLATFORMS]?.label || platform;
}

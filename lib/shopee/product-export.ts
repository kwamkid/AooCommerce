// Shopee — ชั้นบาง ๆ ที่เหลือไว้ให้ call site เดิมเรียกได้เหมือนเดิม
//
// ⚠️ **ของจริงย้ายไปชั้นกลางแล้ว** (2026-09-13):
//   · ตรรกะร่วมทุก platform → `lib/marketplace/product-export.ts`
//   · "ยิง API ของ Shopee ยังไง" → `lib/shopee/product-export-adapter.ts`
//   · route + หน้า wizard → `/api/marketplace/products/export` + `/marketplace/export`
//
// ไฟล์นี้เหลือไว้เพราะยังมีคนเรียกอยู่ 2 ที่: `lib/shopee/sync-one-product.ts`
// (อัปรูปขึ้นประกาศเดิม) และ `app/api/shopee/deals/route.ts` (ส่งสินค้าอัตโนมัติ
// ก่อนดัน deal) — **โค้ดใหม่ให้เรียกชั้นกลางตรง ๆ ห้ามเพิ่มของลงไฟล์นี้**

import { exportProduct, type ExportConfig } from '@/lib/marketplace/product-export';
import type { ProductExportAccount } from '@/lib/marketplace/product-export-adapter';
import type { ShopeeAccountRow } from '@/lib/shopee/api';

export { uploadProductImages } from '@/lib/shopee/product-export-adapter';

/** ตัวเลือกแบบเดิมของ Shopee — แปลงเป็น `ExportConfig` กลางให้ข้างใน */
export interface ExportOptions {
  shopee_category_id: number;
  shopee_category_name?: string;
  /** kg — ไม่ส่ง = 0.5 */
  weight?: number;
  cover_image_url?: string;
}

export interface ExportResult {
  success: boolean;
  item_id?: number;
  error?: string;
  product_name?: string;
}

/**
 * ส่งสินค้าหนึ่งตัวขึ้นร้าน Shopee (พฤติกรรมเดิม — รวมถึง "ผูกอยู่แล้ว = สำเร็จ")
 * @deprecated ใช้ `exportProduct()` จาก `lib/marketplace/product-export.ts` แทน
 */
export async function exportProductToShopee(
  account: ShopeeAccountRow,
  productId: string,
  companyId: string,
  options: ExportOptions,
): Promise<ExportResult> {
  const config: ExportConfig = {
    category_id: String(options.shopee_category_id || ''),
    category_name: options.shopee_category_name || null,
    weight: options.weight,
    cover_image_url: options.cover_image_url || null,
  };

  const result = await exportProduct(
    { ...(account as unknown as ProductExportAccount), company_id: companyId, platform: 'shopee' },
    productId,
    config,
  );

  const itemId = result.external_item_id ? parseInt(result.external_item_id, 10) : undefined;

  // เคยผูกไว้แล้วไม่ใช่ความล้มเหลว — ของเดิมคืน success พร้อม item_id เดิม
  if (result.already_linked) {
    return { success: true, item_id: itemId, product_name: result.product_name };
  }
  return {
    success: result.success,
    item_id: itemId,
    error: result.errors[0],
    product_name: result.product_name,
  };
}

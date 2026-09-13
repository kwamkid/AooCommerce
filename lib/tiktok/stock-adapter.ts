// TikTok Shop — ตัวต่อสต็อก (ยิง API เท่านั้น · ตรรกะร่วมอยู่ lib/marketplace/stock-push.ts)

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  getProductDetail,
  searchProducts,
  updateTikTokInventory,
  TikTokAccountRow,
  TikTokCredentials,
} from '@/lib/tiktok/api';
import { parallelLimit } from '@/lib/parallel';
import type {
  PlatformStockRead,
  PushStockResult,
  StockAdapter,
  StockLink,
  StockSyncAccount,
} from '@/lib/marketplace/stock-adapter';

const asTikTokAccount = (account: StockSyncAccount) => account as unknown as TikTokAccountRow;

/** คีย์ใน `marketplace_product_links.platform_data` ที่จำคลังของ SKU ไว้ (กันยิง detail ซ้ำทุกครั้งที่ push) */
const WAREHOUSE_CACHE_KEY = 'tiktok_warehouse_ids';

function cachedWarehouseIds(link: StockLink): string[] | null {
  const raw = (link.platform_data as Record<string, unknown> | null | undefined)?.[WAREHOUSE_CACHE_KEY];
  if (!Array.isArray(raw)) return null;
  const ids = raw.map(v => String(v)).filter(Boolean);
  return ids.length > 0 ? ids : null;
}

/** เก็บคลังลง platform_data — **merge ของเดิม** ไม่ทับทั้งก้อน (ในนั้นมี category/brand อยู่ด้วย) */
async function cacheWarehouseIds(link: StockLink, ids: string[]): Promise<void> {
  const merged = { ...(link.platform_data || {}), [WAREHOUSE_CACHE_KEY]: ids };
  link.platform_data = merged;
  await supabaseAdmin
    .from('marketplace_product_links')
    .update({ platform_data: merged })
    .eq('id', link.id);
}

/** คลังของทุก SKU ในสินค้าหนึ่งตัว (ยิง detail 1 ครั้งแล้วใช้ร่วมทั้ง item) */
async function fetchWarehouseIdsBySku(
  creds: TikTokCredentials,
  productId: string,
): Promise<Map<string, string[]>> {
  const detail = await getProductDetail(creds, productId);
  const out = new Map<string, string[]>();
  for (const sku of detail.skus) {
    out.set(sku.sku_id, sku.inventory.map(inv => inv.warehouse_id).filter(Boolean));
  }
  return out;
}

export const tiktokStockAdapter: StockAdapter = {
  pushApiPath: '/product/202309/products/{product_id}/inventory/update',
  pullApiPath: '/product/202502/products/search',

  async pushStock(account, productId, quantities, links): Promise<PushStockResult> {
    const errors: string[] = [];
    const creds = await ensureValidToken(asTikTokAccount(account));

    // TikTok ยิงทีละ product (1 product = หลาย SKU)
    const itemGroups = new Map<string, StockLink[]>();
    for (const link of links) {
      const group = itemGroups.get(link.external_item_id) || [];
      group.push(link);
      itemGroups.set(link.external_item_id, group);
    }

    let updated = 0;
    const pushedLinkIds: string[] = [];

    for (const [externalItemId, groupLinks] of itemGroups) {
      let warehousesBySku: Map<string, string[]> | null = null;
      // มีใบไหนยังไม่รู้คลัง = ต้องถาม TikTok รอบเดียวแล้วจำไว้ให้ทุกใบของ item นี้
      if (groupLinks.some(l => !cachedWarehouseIds(l))) {
        try {
          warehousesBySku = await fetchWarehouseIdsBySku(creds, externalItemId);
        } catch (e) {
          errors.push(`Product ${externalItemId}: อ่านคลังของสินค้าไม่สำเร็จ — ${e instanceof Error ? e.message : 'unknown'}`);
          continue;
        }
      }

      const skus: { id: string; inventory: { warehouse_id?: string; quantity: number }[] }[] = [];
      const okLinkIds: string[] = [];

      for (const link of groupLinks) {
        // id ของ TikTok ยาว 18-19 หลัก — string เสมอ ห้าม Number()
        const skuId = String(link.external_model_id || '').trim();
        if (!skuId) {
          errors.push(`Product ${externalItemId}: link ไม่มี sku_id`);
          continue;
        }
        const quantity = link.variation_id ? (quantities.get(link.variation_id) ?? 0) : 0;

        let warehouseIds = cachedWarehouseIds(link);
        if (!warehouseIds && warehousesBySku) {
          const fresh = warehousesBySku.get(skuId) || [];
          if (fresh.length > 0) {
            warehouseIds = fresh;
            await cacheWarehouseIds(link, fresh);
          }
        }

        // หลายคลังบน TikTok = เราตัดสินใจแทนไม่ได้ว่ายอดของเราไปลงคลังไหน
        // ส่งมั่วแล้วของจริงในคลังใดคลังหนึ่งจะเพี้ยน — บอกให้คนไปจัดการดีกว่า
        if (warehouseIds && warehouseIds.length > 1) {
          errors.push(`SKU ${skuId}: SKU นี้มีหลายคลังบน TikTok — ยังไม่รองรับ`);
          continue;
        }

        skus.push({
          id: skuId,
          inventory: [warehouseIds?.[0] ? { warehouse_id: warehouseIds[0], quantity } : { quantity }],
        });
        okLinkIds.push(link.id);
      }

      if (skus.length === 0) continue;

      const { ok, errors: apiErrors } = await updateTikTokInventory(creds, externalItemId, skus);
      errors.push(...apiErrors);
      updated += ok;
      if (apiErrors.length === 0) pushedLinkIds.push(...okLinkIds);
    }

    return {
      success: errors.length === 0,
      updated_models: updated,
      errors,
      pushed_link_ids: pushedLinkIds,
    };
  },

  async fetchPlatformStock(account, links): Promise<PlatformStockRead> {
    const errors: string[] = [];
    const stock = new Map<string, number>();
    const creds = await ensureValidToken(asTikTokAccount(account));

    const variationBySku = new Map<string, string>();
    for (const l of links) {
      const skuId = String(l.external_model_id || '').trim();
      if (l.variation_id && skuId) variationBySku.set(skuId, l.variation_id);
    }
    if (variationBySku.size === 0) return { stock, errors };

    // เดินทั้งร้านด้วย page_token (TikTok ไม่มี offset)
    let pageToken: string | undefined;
    let sawSkusInSearch = false;
    try {
      do {
        const page = await searchProducts(creds, { pageSize: 100, pageToken });
        for (const product of page.products) {
          if (!product.skus) continue;
          sawSkusInSearch = true;
          for (const sku of product.skus) {
            const variationId = variationBySku.get(sku.id);
            if (!variationId) continue;
            const qty = sku.inventory.reduce((sum, inv) => sum + (inv.quantity || 0), 0);
            stock.set(variationId, Math.max(0, qty));
          }
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
    } catch (e) {
      errors.push(`อ่านสินค้าจาก TikTok ไม่สำเร็จ: ${e instanceof Error ? e.message : 'unknown'}`);
    }

    // บางร้าน/บางเวอร์ชัน search ไม่คืน `skus` — ถอยไปยิง detail เฉพาะ item ที่เราผูกไว้
    if (!sawSkusInSearch && stock.size === 0) {
      const itemIds = [...new Set(links.map(l => String(l.external_item_id)).filter(Boolean))];
      await parallelLimit(itemIds, async (itemId) => {
        try {
          const detail = await getProductDetail(creds, itemId);
          for (const sku of detail.skus) {
            const variationId = variationBySku.get(sku.sku_id);
            if (variationId) stock.set(variationId, Math.max(0, sku.stock));
          }
        } catch (e) {
          errors.push(`Product ${itemId}: ${e instanceof Error ? e.message : 'unknown'}`);
        }
      }, 3);
    }

    return { stock, errors };
  },
};

// Lazada — ตัวต่อสต็อก (ยิง API เท่านั้น · ตรรกะร่วมอยู่ lib/marketplace/stock-push.ts)

import {
  ensureValidToken,
  getLazadaProducts,
  lazadaItemIdOf,
  updateLazadaSellableStock,
  LazadaAccountRow,
} from '@/lib/lazada/api';
import type { LazadaStockUpdateSku } from '@/lib/lazada/api';
import { parseAmount } from '@/lib/marketplace/fee-types';
import type {
  PlatformStockRead,
  PushStockResult,
  StockAdapter,
  StockLink,
  StockSyncAccount,
} from '@/lib/marketplace/stock-adapter';

const asLazadaAccount = (account: StockSyncAccount) => account as unknown as LazadaAccountRow;

/** `/products/get` — limit ≤ 50 และ offset ตันที่ 10000 (ของ Lazada เอง) */
const PAGE_LIMIT = 50;
const MAX_OFFSET = 10_000;

export const lazadaStockAdapter: StockAdapter = {
  pushApiPath: '/product/stock/sellable/update',
  pullApiPath: '/products/get',

  // SKU เดียวกันมีได้ 2 แถว — ใบจาก product import (external_item_id = ItemId ตัวเลข) กับ
  // ใบจาก order sync (external_item_id = ShopSku) · ยิงซ้ำ 2 รอบเปลืองโควตาเปล่า ๆ
  linkIdentity(link: StockLink) {
    return `sku:${link.external_model_id}`;
  },

  async pushStock(account, productId, quantities, links): Promise<PushStockResult> {
    const errors: string[] = [];
    const creds = await ensureValidToken(asLazadaAccount(account));

    const skus: LazadaStockUpdateSku[] = [];
    const pushedLinkIds: string[] = [];
    for (const link of links) {
      const itemId = lazadaItemIdOf(link.external_item_id);
      const skuId = String(link.external_model_id || '').trim();
      if (!itemId || !skuId || skuId === '0') {
        errors.push(`SKU ${link.external_model_id || '-'}: ไม่รู้ ItemId/SkuId บน Lazada (link เก่าที่ยังไม่ได้ import สินค้า)`);
        continue;
      }
      skus.push({
        itemId,
        skuId,
        quantity: link.variation_id ? (quantities.get(link.variation_id) ?? 0) : 0,
      });
      pushedLinkIds.push(link.id);
    }

    if (skus.length === 0) {
      return { success: false, updated_models: 0, errors: errors.length ? errors : ['No linked items found'] };
    }

    const { ok, errors: apiErrors } = await updateLazadaSellableStock(creds, skus);
    errors.push(...apiErrors);

    return {
      success: errors.length === 0,
      updated_models: ok,
      errors,
      // ล้มรายตัวแล้วยังบอกไม่ได้ว่าใบไหนผ่าน — ไม่ stamp ทั้งชุดดีกว่า stamp ผิด
      pushed_link_ids: errors.length === 0 ? pushedLinkIds : [],
    };
  },

  async fetchPlatformStock(account, links): Promise<PlatformStockRead> {
    const errors: string[] = [];
    const stock = new Map<string, number>();
    const creds = await ensureValidToken(asLazadaAccount(account));

    // SkuId คือคีย์เดียวที่ทั้งสองรูปของ external_item_id มีเหมือนกัน
    const variationBySkuId = new Map<string, string>();
    for (const l of links) {
      const skuId = String(l.external_model_id || '').trim();
      if (l.variation_id && skuId && skuId !== '0') variationBySkuId.set(skuId, l.variation_id);
    }
    if (variationBySkuId.size === 0) return { stock, errors };

    for (let offset = 0; offset <= MAX_OFFSET; offset += PAGE_LIMIT) {
      const { products, total, error } = await getLazadaProducts(creds, { offset, limit: PAGE_LIMIT });
      if (error) {
        errors.push(`อ่านสินค้าจาก Lazada ไม่สำเร็จ (offset ${offset}): ${error}`);
        break;
      }
      for (const product of products) {
        for (const sku of product.skus || []) {
          const variationId = variationBySkuId.get(String(sku.SkuId));
          if (!variationId) continue;
          // `quantity` = ยอดที่ผู้ขายตั้งไว้ (ตัวเดียวกับที่เราส่งขึ้นด้วย SellableQuantity)
          // — ต้องใช้ตัวนี้เพื่อให้ push/pull สมมาตร · `Available` หัก order ที่ Lazada ค้างอยู่
          //   ซึ่งฝั่งเราหักเป็น reserved ไปแล้ว ใช้แล้วจะหักซ้ำสองรอบ
          // ตัวเลขจาก Lazada มีคอมมาได้ — ห้าม Number() ตรง (กติกา fee-types.ts)
          const qty = parseAmount(sku.quantity ?? sku.Available ?? 0);
          stock.set(variationId, Math.max(0, qty));
        }
      }
      if (products.length < PAGE_LIMIT) break;
      if (total && offset + PAGE_LIMIT >= total) break;
    }

    return { stock, errors };
  },
};

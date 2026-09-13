// TikTok Shop — ตัวต่อนำเข้าสินค้า (ยิง API + แปลงรูป เท่านั้น)
// ตรรกะร่วมอยู่ `lib/marketplace/product-import.ts` — ห้ามย้ายมาไว้ที่นี่
//
// ต่างจาก Shopee/Lazada: **ไม่มี batch detail** — `products/search` คืนแค่ id/ชื่อ/สถานะ
// ต้องยิง `GetProduct` ทีละตัว จึงคุม concurrency ด้วย `parallelLimit` · แบ่งหน้าด้วย
// `page_token` (ข้ามไปหน้า N ตรง ๆ ไม่ได้ — cursor จึงต้องเป็น opaque string)

import {
  ensureValidToken,
  searchProducts,
  getProductDetail,
  type TikTokAccountRow,
  type TikTokProductFullDetail,
} from '@/lib/tiktok/api';
import { parallelLimit } from '@/lib/parallel';
import type {
  MarketplaceImportItem,
  MarketplaceImportModel,
  ProductImportAccount,
  ProductImportAdapter,
  ProductImportPage,
} from '@/lib/marketplace/product-import-adapter';

const asTikTokAccount = (account: ProductImportAccount) => account as unknown as TikTokAccountRow;

function toImportItem(product: TikTokProductFullDetail): MarketplaceImportItem {
  const models: MarketplaceImportModel[] = product.skus.map(sku => {
    const attrs: Record<string, string> = {};
    for (const a of sku.salesAttributes) {
      if (a.name) attrs[a.name] = a.value_name || '';
    }
    return {
      external_model_id: sku.sku_id,
      name: sku.salesAttributes.map(a => a.value_name).filter(Boolean).join(','),
      sku: sku.seller_sku || '',
      price: sku.price,
      original_price: sku.listPrice,
      stock: sku.stock ?? 0,
      image: sku.imageUrl || null,
      attributes: product.hasVariation ? attrs : {},
    };
  });

  return {
    external_item_id: product.product_id,
    name: product.title,
    sku: product.skus.find(s => s.seller_sku)?.seller_sku || '',
    image: product.images[0] || null,
    images: product.images || [],
    price: models[0]?.price || 0,
    status: product.status || null,
    has_variation: product.hasVariation,
    models,
    variation_type_names: product.hasVariation ? product.salesAttributeNames : [],
    description: product.description || null,
    category_id: product.categoryId || null,
    category_name: product.categoryName || null,
    brand_name: product.brandName || null,
    weight: product.weight || null,
    raw: product,
  };
}

export const tiktokProductImportAdapter: ProductImportAdapter = {
  listApiPath: '/product/202502/products/search',
  codePrefix: 'TT-',

  async listProducts(account, cursor, pageSize = 20): Promise<ProductImportPage> {
    const creds = await ensureValidToken(asTikTokAccount(account));
    const page = await searchProducts(creds, { pageSize, pageToken: cursor });
    if (page.products.length === 0) {
      return { items: [], total: page.totalCount };
    }

    const items = await parallelLimit(page.products, async (p) => {
      try {
        return toImportItem(await getProductDetail(creds, p.id));
      } catch {
        // ตัวเดียวพังไม่ควรทำให้ทั้งหน้าพัง — โชว์เท่าที่รู้จาก search
        // (ไม่มี `models` → ชั้นกลางจะรายงานเป็น error ของรายการนั้นตอนกดนำเข้า)
        return {
          external_item_id: p.id,
          name: p.title,
          image: null,
          images: [],
          price: 0,
          status: p.status || null,
          has_variation: false,
          models: [],
          variation_type_names: [],
        } as MarketplaceImportItem;
      }
    }, 3);

    return {
      items,
      total: page.totalCount,
      nextCursor: page.nextPageToken || undefined,
    };
  },

  async fetchDetails(account, ids): Promise<MarketplaceImportItem[]> {
    const creds = await ensureValidToken(asTikTokAccount(account));
    return parallelLimit(ids, async (id) => toImportItem(await getProductDetail(creds, id)), 3);
  },

  linkPayload(item, model) {
    const product = item.raw as TikTokProductFullDetail | undefined;
    const sku = product?.skus.find(s => s.sku_id === model.external_model_id);
    return {
      platform_price: model.price || null,
      platform_description: product?.descriptionHtml || null,
      weight: item.weight || null,
      platform_data: {
        category_id: item.category_id || null,
        category_name: item.category_name || null,
        brand_name: item.brand_name || null,
        sales_attributes: sku?.salesAttributes || [],
      },
    };
  },
};

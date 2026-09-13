// Shopee — ตัวต่อนำเข้าสินค้า (ยิง API + แปลงรูป เท่านั้น)
// ตรรกะร่วมอยู่ `lib/marketplace/product-import.ts` — ห้ามย้ายมาไว้ที่นี่

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  getItemList,
  getItemFullDetails,
  getShopeeCategories,
  type ShopeeAccountRow,
  type ShopeeItemFullDetail,
} from '@/lib/shopee/api';
import { buildVariationAttributes, getCategoryName } from '@/lib/shopee/product-helpers';
import { parallelLimit } from '@/lib/parallel';
import type {
  MarketplaceImportItem,
  MarketplaceImportModel,
  ProductImportAccount,
  ProductImportAdapter,
  ProductImportPage,
} from '@/lib/marketplace/product-import-adapter';

const asShopeeAccount = (account: ProductImportAccount) => account as unknown as ShopeeAccountRow;

/**
 * หมวดหมู่ของ Shopee อ่านจาก `marketplace_category_cache` — ร้านที่ยังไม่เคยมีแคช
 * ต้องดึงครั้งเดียวก่อน ไม่งั้นชื่อหมวดในแถว link ว่างตลอดไป (พฤติกรรมเดิมของ import)
 */
async function ensureCategoryCache(account: ProductImportAccount, creds: Awaited<ReturnType<typeof ensureValidToken>>): Promise<void> {
  try {
    const { data: existing } = await supabaseAdmin
      .from('marketplace_category_cache')
      .select('id')
      .eq('account_id', account.id)
      .maybeSingle();
    if (existing) return;

    const { data: catData } = await getShopeeCategories(creds);
    const categoryList = (catData as { category_list?: unknown[] } | null)?.category_list || [];
    if (categoryList.length === 0) return;

    await supabaseAdmin.from('marketplace_category_cache').upsert({
      account_id: account.id,
      company_id: account.company_id,
      category_data: categoryList,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'account_id' });
  } catch {
    // ไม่ใช่เรื่องคอขาดบาดตาย — import ต่อได้ แค่ชื่อหมวดว่าง
  }
}

async function toImportItem(accountId: string, item: ShopeeItemFullDetail): Promise<MarketplaceImportItem> {
  // "มีตัวเลือกจริง" ตามนิยามเดิม: Shopee บอกเอง + มี model ที่ id ไม่ใช่ 0
  const hasVariation = item.has_model && item.models.length >= 1 && item.models.some(m => m.model_id > 0);

  const rawModels = item.models.length > 0 ? item.models : [{
    model_id: 0,
    model_sku: item.item_sku || '',
    model_name: '',
    tier_index: [],
    current_price: 0,
    original_price: 0,
    stock: 0,
  }];

  const models: MarketplaceImportModel[] = rawModels.map(m => ({
    external_model_id: String(m.model_id),
    name: m.model_name || '',
    sku: m.model_sku || '',
    price: m.current_price || 0,
    original_price: m.original_price || 0,
    stock: m.stock ?? 0,
    image: m.image_url || null,
    attributes: hasVariation ? buildVariationAttributes(item.tierVariations || [], m.model_name) : {},
  }));

  let categoryName = '';
  if (item.category_id) {
    try { categoryName = await getCategoryName(accountId, item.category_id); } catch { /* แคชยังไม่มา */ }
  }

  return {
    external_item_id: String(item.item_id),
    name: item.item_name,
    // สินค้าเดี่ยว: รหัสยึด SKU ของ model ก่อน (พฤติกรรมเดิมของ Shopee import)
    sku: hasVariation ? (item.item_sku || '') : (rawModels[0].model_sku || item.item_sku || ''),
    image: item.images[0] || null,
    images: item.images || [],
    price: models[0]?.price || 0,
    status: item.item_status || null,
    has_variation: hasVariation,
    models,
    variation_type_names: hasVariation ? (item.tierVariations || []) : [],
    description: item.description || null,
    category_id: item.category_id ? String(item.category_id) : null,
    category_name: categoryName || null,
    brand_name: item.brand?.display_brand_name || item.brand?.original_brand_name || null,
    weight: item.weight ?? null,
    raw: item,
  };
}

export const shopeeProductImportAdapter: ProductImportAdapter = {
  listApiPath: '/api/v2/product/get_item_list',
  codePrefix: 'SP-',

  async listProducts(account, cursor, pageSize = 20): Promise<ProductImportPage> {
    const creds = await ensureValidToken(asShopeeAccount(account));
    const offset = Math.max(Number(cursor || 0) || 0, 0);

    const page = await getItemList(creds, { offset, pageSize, itemStatus: 'NORMAL' });
    if (page.items.length === 0) return { items: [], total: page.totalCount };

    await ensureCategoryCache(account, creds);

    const details = await getItemFullDetails(creds, page.items.map(i => i.item_id));
    const items: MarketplaceImportItem[] = [];
    for (const raw of page.items) {
      const detail = details.get(raw.item_id);
      if (detail) items.push(await toImportItem(account.id, detail));
    }

    return {
      items,
      total: page.totalCount,
      nextCursor: page.hasMore ? String(page.nextOffset) : undefined,
    };
  },

  async fetchDetails(account, ids): Promise<MarketplaceImportItem[]> {
    const creds = await ensureValidToken(asShopeeAccount(account));
    await ensureCategoryCache(account, creds);

    const numericIds = ids.map(id => Number(id)).filter(Boolean);
    const out: MarketplaceImportItem[] = [];
    // Shopee ดึงรายละเอียดได้ทีละ 50 ใบ
    for (let i = 0; i < numericIds.length; i += 50) {
      const details = await getItemFullDetails(creds, numericIds.slice(i, i + 50));
      const entries = [...details.values()];
      const mapped = await parallelLimit(entries, item => toImportItem(account.id, item), 5);
      out.push(...mapped);
    }
    return out;
  },

  linkPayload(item, model) {
    const detail = item.raw as ShopeeItemFullDetail | undefined;
    return {
      platform_price: model.price || null,
      platform_description: item.description || null,
      platform_description_images: detail?.descriptionImages || [],
      weight: item.weight || null,
      shopee_category_id: item.category_id || null,
      shopee_category_name: item.category_name || null,
      shopee_attributes: detail?.attribute_list || null,
      shopee_brand_id: detail?.brand?.brand_id || null,
      shopee_brand_name: item.brand_name || null,
      platform_data: {
        category_id: item.category_id ? Number(item.category_id) : null,
        category_name: item.category_name || null,
        attributes: detail?.attribute_list || null,
        brand_id: detail?.brand?.brand_id || null,
        brand_name: item.brand_name || null,
      },
    };
  },
};

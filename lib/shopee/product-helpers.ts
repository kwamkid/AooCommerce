/**
 * Shared Shopee product helpers.
 * Used by both order sync (sync.ts) and product import (product-sync.ts).
 * Consolidates duplicate functions that previously existed in both files.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeItemAttribute, ShopeeModelDetail, ShopeeItemFullDetail } from '@/lib/shopee/api';

// ============================================
// Types
// ============================================

/** Shopee item info carried through order sync for product matching/creation */
export interface ShopeeItemInfo {
  shopeeItemId: number;
  shopeeItemName: string;
  shopeeModelId: number;
  shopeeModelName: string;
  shopeeModelSku: string;
  shopeeItemSku: string;
  shopeeImageUrl: string;         // per-item image (from model or order detail)
  tierVariationNames: string[];   // e.g. ["สี", "ขนาด"] from get_model_list
  parentImageUrl: string;         // first image from get_item_base_info
  parentImages: string[];         // all images from get_item_base_info
  allModels?: ShopeeModelDetail[];  // ALL models from getItemFullDetails
  accountId?: string;
  accountName?: string;
  // Enrichment for marketplace link creation
  itemDetail?: ShopeeItemFullDetail;
}

/** Parameters for upserting a marketplace_product_links record */
export interface UpsertMarketplaceLinkParams {
  companyId: string;
  accountId: string;
  accountName: string;
  productId: string;
  variationId: string | null;
  itemId: number;
  modelId: number;
  sku: string;
  status?: string;
  price?: number;
  primaryImage?: string;
  categoryId?: number;
  weight?: number;
  platformProductName?: string;
  brand?: { brand_id: number; original_brand_name: string; display_brand_name?: string };
  attributes?: ShopeeItemAttribute[];
}

// ============================================
// Caches (shared singletons)
// ============================================

const variationTypeCache: Record<string, string> = {};

// categoryNameCache: accountId → Map<categoryId, fullPath>
const categoryNameCache: Record<string, Map<number, string>> = {};

// ============================================
// Variation Type Management
// ============================================

/**
 * Get or create variation type IDs from Shopee tier_variation names.
 * e.g. ["สี", "ขนาด"] → [uuid1, uuid2]
 * Falls back to "ตัวเลือกสินค้า" if no names provided.
 */
export async function getOrCreateVariationTypeIds(companyId: string, tierVariationNames: string[]): Promise<string[]> {
  const names = tierVariationNames.length > 0 ? tierVariationNames : ['ตัวเลือกสินค้า'];
  const ids: string[] = [];

  for (const name of names) {
    const cacheKey = `${companyId}:${name}`;
    if (variationTypeCache[cacheKey]) {
      ids.push(variationTypeCache[cacheKey]);
      continue;
    }

    const { data: existing } = await supabaseAdmin
      .from('variation_types')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', name)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (existing) {
      variationTypeCache[cacheKey] = existing.id;
      ids.push(existing.id);
      continue;
    }

    // Check if it exists globally with a different company_id (seeded types)
    const { data: globalExisting } = await supabaseAdmin
      .from('variation_types')
      .select('id, company_id')
      .eq('name', name)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (globalExisting) {
      if (globalExisting.company_id !== companyId) {
        await supabaseAdmin
          .from('variation_types')
          .update({ company_id: companyId })
          .eq('id', globalExisting.id);
      }
      variationTypeCache[cacheKey] = globalExisting.id;
      ids.push(globalExisting.id);
      continue;
    }

    const { data: maxData } = await supabaseAdmin
      .from('variation_types')
      .select('sort_order')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const { data: newType, error } = await supabaseAdmin
      .from('variation_types')
      .insert({ company_id: companyId, name, sort_order: (maxData?.sort_order || 0) + 1 })
      .select()
      .single();

    if (error || !newType) {
      console.error(`[Shopee] Failed to create variation type "${name}":`, error);
      continue;
    }

    variationTypeCache[cacheKey] = newType.id;
    ids.push(newType.id);
  }

  return ids;
}

// ============================================
// Price Resolution
// ============================================

/** Resolve default_price and discount_price from Shopee original/current prices */
export function resolveShopeePrice(originalPrice: number, currentPrice: number): { defaultPrice: number; discountPrice: number } {
  const defaultPrice = originalPrice > 0 ? originalPrice : currentPrice;
  const discountPrice = (originalPrice > 0 && currentPrice < originalPrice) ? currentPrice : 0;
  return { defaultPrice, discountPrice };
}

// ============================================
// Attribute Building
// ============================================

/**
 * Build variation attributes from Shopee tier_variation names + model_name.
 * e.g. tierNames=["สี","ขนาด"], modelName="แดง,XL" → {"สี":"แดง","ขนาด":"XL"}
 * Falls back to {"ตัวเลือกสินค้า": modelName} if no tier names.
 */
export function buildVariationAttributes(tierVariationNames: string[], modelName: string): Record<string, string> {
  if (!modelName) return {};

  if (tierVariationNames.length === 0) {
    return { 'ตัวเลือกสินค้า': modelName };
  }

  const values = modelName.split(',').map(v => v.trim());
  const attributes: Record<string, string> = {};

  for (let i = 0; i < tierVariationNames.length; i++) {
    attributes[tierVariationNames[i]] = values[i] || modelName;
  }

  return attributes;
}

// ============================================
// Image Management
// ============================================

/**
 * Insert image into product_images table if not already present.
 * Updates sort_order if the image exists but sort_order changed.
 * For Shopee external URLs, uses 'shopee-external' as storage_path.
 */
export async function upsertProductImage(
  companyId: string,
  productId: string | null,
  variationId: string | null,
  imageUrl: string,
  sortOrder: number = 0
): Promise<void> {
  if (!imageUrl) return;
  try {
    let query = supabaseAdmin.from('product_images').select('id, sort_order').eq('image_url', imageUrl).eq('company_id', companyId);
    if (productId) query = query.eq('product_id', productId);
    if (variationId) query = query.eq('variation_id', variationId);
    const { data: existing } = await query.limit(1).single();
    if (existing) {
      if (existing.sort_order !== sortOrder) {
        await supabaseAdmin.from('product_images').update({ sort_order: sortOrder }).eq('id', existing.id);
      }
      return;
    }

    await supabaseAdmin.from('product_images').insert({
      company_id: companyId,
      product_id: productId,
      variation_id: variationId,
      image_url: imageUrl,
      storage_path: 'shopee-external',
      sort_order: sortOrder,
    });
  } catch (e) {
    console.error('[Shopee] Failed to upsert product image:', e);
  }
}

/** Batch insert multiple product images in parallel */
export async function upsertProductImages(
  companyId: string,
  productId: string | null,
  variationId: string | null,
  imageUrls: string[]
): Promise<void> {
  const urls = imageUrls.filter(Boolean);
  if (urls.length === 0) return;
  await Promise.all(urls.map((url, i) => upsertProductImage(companyId, productId, variationId, url, i)));
}

// ============================================
// Category Name Lookup
// ============================================

export async function getCategoryName(accountId: string, categoryId: number): Promise<string> {
  if (!categoryId) return '';

  if (categoryNameCache[accountId]?.has(categoryId)) {
    return categoryNameCache[accountId].get(categoryId)!;
  }

  if (!categoryNameCache[accountId]) {
    categoryNameCache[accountId] = new Map();
    const { data: cache } = await supabaseAdmin
      .from('marketplace_category_cache')
      .select('category_data')
      .eq('account_id', accountId)
      .single();

    if (cache?.category_data) {
      const categories = cache.category_data as Array<{
        category_id: number;
        parent_category_id: number;
        display_category_name: string;
      }>;

      const catMap = new Map(categories.map(c => [c.category_id, c]));

      for (const cat of categories) {
        const path: string[] = [];
        let current: typeof cat | undefined = cat;
        while (current) {
          path.unshift(current.display_category_name);
          if (current.parent_category_id === 0) break;
          current = catMap.get(current.parent_category_id);
        }
        categoryNameCache[accountId].set(cat.category_id, path.join(' > '));
      }
    }
  }

  return categoryNameCache[accountId].get(categoryId) || '';
}

// ============================================
// Marketplace Link
// ============================================

export async function findExistingLink(accountId: string, itemId: number, modelId: number) {
  const { data } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('id, product_id, variation_id')
    .eq('account_id', accountId)
    .eq('external_item_id', String(itemId))
    .eq('external_model_id', String(modelId))
    .limit(1)
    .maybeSingle();
  return data;
}

export async function upsertMarketplaceLink(params: UpsertMarketplaceLinkParams): Promise<void> {
  const categoryName = params.categoryId
    ? await getCategoryName(params.accountId, params.categoryId)
    : '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertData: Record<string, any> = {
    company_id: params.companyId,
    platform: 'shopee',
    account_id: params.accountId,
    account_name: params.accountName,
    product_id: params.productId,
    variation_id: params.variationId,
    external_item_id: String(params.itemId),
    external_model_id: String(params.modelId),
    external_sku: params.sku,
    external_item_status: params.status || null,
    platform_product_name: params.platformProductName || null,
    platform_price: params.price || null,
    platform_primary_image: params.primaryImage || null,
    shopee_category_id: params.categoryId ? String(params.categoryId) : null,
    shopee_category_name: categoryName || null,
    weight: params.weight || null,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (params.attributes && params.attributes.length > 0) {
    upsertData.shopee_attributes = params.attributes;
  }
  if (params.brand) {
    upsertData.shopee_brand_id = params.brand.brand_id;
    upsertData.shopee_brand_name = params.brand.display_brand_name || params.brand.original_brand_name;
  }

  upsertData.platform_data = {
    category_id: upsertData.shopee_category_id ? Number(upsertData.shopee_category_id) : null,
    category_name: upsertData.shopee_category_name || null,
    attributes: upsertData.shopee_attributes || null,
    brand_id: upsertData.shopee_brand_id || null,
    brand_name: upsertData.shopee_brand_name || null,
  };

  await supabaseAdmin.from('marketplace_product_links').upsert(
    upsertData,
    { onConflict: 'account_id,external_item_id,external_model_id' }
  );
}

// ============================================
// SKU Matching
// ============================================

export async function tryAutoMatchBySku(companyId: string, sku: string): Promise<{ product_id: string; variation_id: string } | null> {
  if (!sku) return null;

  // Try active products first
  const { data } = await supabaseAdmin
    .from('product_variations')
    .select('id, product_id')
    .eq('company_id', companyId)
    .eq('sku', sku)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (data) {
    return { product_id: data.product_id, variation_id: data.id };
  }

  // Then try inactive products — reactivate them
  const { data: inactive } = await supabaseAdmin
    .from('product_variations')
    .select('id, product_id')
    .eq('company_id', companyId)
    .eq('sku', sku)
    .eq('is_active', false)
    .limit(1)
    .single();

  if (inactive) {
    await reactivateProduct(inactive.product_id);
    return { product_id: inactive.product_id, variation_id: inactive.id };
  }

  return null;
}

// ============================================
// Re-activation
// ============================================

/** Re-activate a soft-deleted product and all its variations */
export async function reactivateProduct(productId: string): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin.from('products').update({ is_active: true, source: 'shopee', updated_at: now }).eq('id', productId);
  await supabaseAdmin.from('product_variations').update({ is_active: true, updated_at: now }).eq('product_id', productId);
  console.log(`[Shopee] Reactivated product ${productId}`);
}

// ============================================
// Sibling Backfill (for order sync — create ALL variations)
// ============================================

/**
 * Backfill missing sibling variations for an existing parent product.
 * Uses ShopeeModelDetail from getItemFullDetails (has current_price, original_price, stock, image_url).
 * Creates marketplace_product_links for each sibling.
 */
export async function backfillSiblingVariations(
  companyId: string,
  parentId: string,
  shopeeInfo: ShopeeItemInfo
): Promise<number> {
  if (!shopeeInfo.allModels || shopeeInfo.allModels.length === 0) return 0;

  let sibCategoryName = '';
  const sibCategoryId = shopeeInfo.itemDetail?.category_id;
  if (sibCategoryId && shopeeInfo.accountId) {
    try { sibCategoryName = await getCategoryName(shopeeInfo.accountId, sibCategoryId); } catch { /* ignore */ }
  }

  // Batch check: which SKUs already exist under this parent?
  const allSkus = shopeeInfo.allModels.map(m => m.model_sku || `SP-${shopeeInfo.shopeeItemId}-${m.model_id}`);
  const { data: existingVariations } = await supabaseAdmin
    .from('product_variations')
    .select('sku')
    .eq('company_id', companyId)
    .eq('product_id', parentId)
    .in('sku', allSkus);
  const existingSkuSet = new Set((existingVariations || []).map(v => v.sku));

  let siblingCount = 0;
  for (const model of shopeeInfo.allModels) {
    const sibSku = model.model_sku || `SP-${shopeeInfo.shopeeItemId}-${model.model_id}`;

    if (existingSkuSet.has(sibSku)) continue;

    try {
      const sibAttributes = buildVariationAttributes(shopeeInfo.tierVariationNames, model.model_name);

      const { defaultPrice, discountPrice } = resolveShopeePrice(model.original_price, model.current_price);

      const { data: sibVar } = await supabaseAdmin
        .from('product_variations')
        .insert({
          company_id: companyId,
          product_id: parentId,
          variation_label: model.model_name || sibSku,
          sku: sibSku,
          attributes: sibAttributes,
          default_price: defaultPrice,
          discount_price: discountPrice,
          stock: 0,
          min_stock: 0,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      // Insert sibling variation image
      if (sibVar && model.image_url) {
        await upsertProductImage(companyId, parentId, sibVar.id, model.image_url);
      }

      // Create marketplace_product_links for sibling
      if (sibVar && shopeeInfo.accountId) {
        try {
          const detail = shopeeInfo.itemDetail;
          await upsertMarketplaceLink({
            companyId,
            accountId: shopeeInfo.accountId,
            accountName: shopeeInfo.accountName || '',
            productId: parentId,
            variationId: sibVar.id,
            itemId: shopeeInfo.shopeeItemId,
            modelId: model.model_id,
            sku: model.model_sku || '',
            price: model.current_price || undefined,
            platformProductName: detail?.item_name || shopeeInfo.shopeeItemName || undefined,
            primaryImage: detail?.images?.[0] || undefined,
            status: detail?.item_status || undefined,
            categoryId: detail?.category_id || undefined,
            weight: detail?.weight || undefined,
            brand: detail?.brand || undefined,
            attributes: detail?.attribute_list || undefined,
          });
        } catch (linkErr) {
          console.error(`[Shopee] Failed to create marketplace link for sibling SKU=${sibSku}:`, linkErr);
        }
      }

      siblingCount++;
    } catch (sibErr) {
      console.error(`[Shopee] Failed to create sibling variation SKU=${sibSku}:`, sibErr);
    }
  }

  if (siblingCount > 0) {
    console.log(`[Shopee] Backfilled ${siblingCount} sibling variations for product ${parentId}`);
  }
  return siblingCount;
}

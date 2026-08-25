/**
 * Shared Shopee product helpers.
 * Used by both order sync (sync.ts) and product import (product-sync.ts).
 * Consolidates duplicate functions that previously existed in both files.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeItemAttribute, ShopeeModelDetail, ShopeeItemFullDetail } from '@/lib/shopee/api';
import {
  getOrCreateVariationTypeIds,
  upsertProductImage,
  upsertProductImages,
  reactivateProduct,
  tryAutoMatchBySku,
  findMarketplaceLink,
} from '@/lib/marketplace/product-helpers';

// helper ที่ทุก marketplace ใช้ร่วมกันย้ายไป lib/marketplace/product-helpers.ts แล้ว
// (Shopee เป็น platform default ของทุกตัว → พฤติกรรมเดิมไม่เปลี่ยน)
// re-export ไว้เพื่อให้ call site เดิมที่ import จากไฟล์นี้ยังใช้ได้เหมือนเดิม
export {
  getOrCreateVariationTypeIds,
  upsertProductImage,
  upsertProductImages,
  reactivateProduct,
  tryAutoMatchBySku,
} from '@/lib/marketplace/product-helpers';

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
  platformDescription?: string;
  platformDescriptionImages?: string[];
  brand?: { brand_id: number; original_brand_name: string; display_brand_name?: string };
  attributes?: ShopeeItemAttribute[];
}

// ============================================
// Caches (shared singletons)
// ============================================

// categoryNameCache: accountId → Map<categoryId, fullPath>
const categoryNameCache: Record<string, Map<number, string>> = {};

// ============================================
// Variation Type Management
// ============================================

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
  return findMarketplaceLink(accountId, String(itemId), String(modelId));
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
    platform_description: params.platformDescription || null,
    platform_description_images: params.platformDescriptionImages || [],
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

// ============================================
// Central Upsert (shared by UI import / bulk sync / order sync)
// ============================================

export interface UpsertShopeeProductResult {
  productId: string;
  variationIds: string[];
  isNewProduct: boolean;
  variationsCreated: number;
}

export interface UpsertShopeeProductOptions {
  /** When true, copy SKU into product_variations.barcode (UI import opt-in). */
  copySkuToBarcode?: boolean;
  /**
   * When called from order sync we only have the specific model that the buyer ordered;
   * pass it here so we don't accidentally backfill missing siblings as "simple" rows.
   * Defaults to creating ALL siblings present in item.models.
   */
  onlyModelId?: number;
}

/**
 * Single entry point for turning a `ShopeeItemFullDetail` into local product rows
 * (+ marketplace_product_links + extracted description). Used by UI import, bulk sync,
 * and order sync to keep the create / link / backfill behavior identical everywhere.
 *
 * Behavior:
 *  - Treat as variation product when item.has_model AND item.models.length >= 1.
 *    Simple-product fallback is reserved for items where Shopee itself reports has_model=false.
 *  - Reuse existing product when found by:
 *     1) marketplace_product_links (item_id) → product_id
 *     2) products.code matching SKU / SP-{item_id} (including reactivating soft-deleted rows)
 *  - For variation products: create the parent (or reuse), then create EVERY variation present
 *    in item.models via the same backfillSiblingVariations path so all variations are imported.
 *  - Always write platform_description / platform_description_images on the links.
 */
export async function upsertShopeeProduct(
  companyId: string,
  accountId: string,
  accountName: string,
  item: ShopeeItemFullDetail,
  options: UpsertShopeeProductOptions = {}
): Promise<UpsertShopeeProductResult> {
  const primaryImage = item.images[0] || undefined;
  const tierVariationNames = item.tierVariations || [];

  const baseLinkParams = (productId: string, variationId: string | null, model: ShopeeModelDetail, sku: string, image?: string): UpsertMarketplaceLinkParams => ({
    companyId,
    accountId,
    accountName,
    productId,
    variationId,
    itemId: item.item_id,
    modelId: model.model_id,
    sku,
    status: item.item_status,
    price: model.current_price || undefined,
    primaryImage: image || primaryImage,
    categoryId: item.category_id,
    weight: item.weight,
    platformProductName: item.item_name,
    platformDescription: item.description || undefined,
    platformDescriptionImages: item.descriptionImages || [],
    brand: item.brand,
    attributes: item.attribute_list,
  });

  const isVariation = item.has_model && item.models.length >= 1
    && item.models.some(m => m.model_id > 0);

  if (isVariation) {
    return upsertVariationProduct(companyId, accountId, accountName, item, baseLinkParams, tierVariationNames, options);
  }
  return upsertSimpleProduct(companyId, accountId, accountName, item, baseLinkParams, options);
}

async function upsertVariationProduct(
  companyId: string,
  accountId: string,
  accountName: string,
  item: ShopeeItemFullDetail,
  buildLinkParams: (productId: string, variationId: string | null, model: ShopeeModelDetail, sku: string, image?: string) => UpsertMarketplaceLinkParams,
  tierVariationNames: string[],
  options: UpsertShopeeProductOptions
): Promise<UpsertShopeeProductResult> {
  const parentCode = item.item_sku || `SP-${item.item_id}`;
  const primaryImage = item.images[0] || null;

  let parentProductId: string | null = null;
  let isNewProduct = false;

  // 1) Match by existing marketplace link (any model)
  const { data: anyLink } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id')
    .eq('account_id', accountId)
    .eq('external_item_id', String(item.item_id))
    .limit(1)
    .maybeSingle();
  if (anyLink?.product_id) parentProductId = anyLink.product_id;

  // 2) Match by product code (active)
  if (!parentProductId) {
    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('company_id', companyId)
      .eq('code', parentCode)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      parentProductId = existing.id;
      await maybeUpdateProductMeta(companyId, existing.id, item);
    }
  }

  // 3) Reactivate soft-deleted parent
  if (!parentProductId) {
    const { data: inactive } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('company_id', companyId)
      .eq('code', parentCode)
      .eq('is_active', false)
      .limit(1)
      .maybeSingle();
    if (inactive?.id) {
      await reactivateProduct(inactive.id);
      await maybeUpdateProductMeta(companyId, inactive.id, item);
      parentProductId = inactive.id;
    }
  }

  // 4) Create new parent
  if (!parentProductId) {
    const variationTypeIds = await getOrCreateVariationTypeIds(companyId, tierVariationNames);
    const { data: newParent, error: parentErr } = await supabaseAdmin
      .from('products')
      .insert({
        company_id: companyId,
        code: parentCode,
        name: item.item_name,
        variation_label: null,
        image: primaryImage,
        source: 'shopee',
        selected_variation_types: variationTypeIds,
        description: item.description || null,
        is_active: true,
      })
      .select('id')
      .single();
    if (parentErr || !newParent) {
      throw new Error(`Failed to create parent product: ${parentErr?.message}`);
    }
    parentProductId = newParent.id;
    isNewProduct = true;

    for (let i = 0; i < item.images.length; i++) {
      await upsertProductImage(companyId, parentProductId, null, item.images[i], i);
    }
  }

  // Defensive: every branch above either sets parentProductId or throws.
  if (!parentProductId) {
    throw new Error(`Failed to resolve parent product for item ${item.item_id}`);
  }
  const parentId: string = parentProductId;

  // 5) Create / update every variation present in item.models
  const variationIds: string[] = [];
  let variationsCreated = 0;
  const targetModels = options.onlyModelId
    ? item.models.filter(m => m.model_id === options.onlyModelId)
    : item.models;

  for (const model of targetModels) {
    const sku = model.model_sku || `SP-${item.item_id}-${model.model_id}`;
    const existingLink = await findExistingLink(accountId, item.item_id, model.model_id);

    let variationId: string | null = null;

    if (existingLink?.variation_id) {
      variationId = existingLink.variation_id;
    } else {
      const matched = await tryAutoMatchBySku(companyId, sku);
      if (matched) {
        variationId = matched.variation_id;
      } else {
        // Check sibling under THIS parent (e.g. created from a prior call within same order)
        const { data: siblingVar } = await supabaseAdmin
          .from('product_variations')
          .select('id')
          .eq('company_id', companyId)
          .eq('product_id', parentId)
          .eq('sku', sku)
          .limit(1)
          .maybeSingle();
        if (siblingVar?.id) {
          variationId = siblingVar.id;
        } else {
          const created = await createVariationRow(companyId, parentId, item, model, options.copySkuToBarcode);
          if (created) {
            variationId = created;
            variationsCreated++;
          }
        }
      }
    }

    if (variationId) {
      variationIds.push(variationId);
      await upsertMarketplaceLink(buildLinkParams(parentId, variationId, model, sku, model.image_url || primaryImage || undefined));
    }
  }

  // 6) Backfill any missing siblings (covers order-sync case where we only had 1 model in the order
  //    but the Shopee item has more) — only when caller didn't restrict to a single model.
  if (!options.onlyModelId && item.models.length > 0) {
    const backfilled = await backfillSiblingVariations(companyId, parentId, {
      shopeeItemId: item.item_id,
      shopeeItemName: item.item_name,
      shopeeModelId: 0,
      shopeeModelName: '',
      shopeeModelSku: '',
      shopeeItemSku: item.item_sku,
      shopeeImageUrl: primaryImage || '',
      tierVariationNames,
      parentImageUrl: primaryImage || '',
      parentImages: item.images,
      allModels: item.models,
      accountId,
      accountName,
      itemDetail: item,
    });
    variationsCreated += backfilled;
  }

  return { productId: parentId, variationIds, isNewProduct, variationsCreated };
}

async function upsertSimpleProduct(
  companyId: string,
  accountId: string,
  accountName: string,
  item: ShopeeItemFullDetail,
  buildLinkParams: (productId: string, variationId: string | null, model: ShopeeModelDetail, sku: string, image?: string) => UpsertMarketplaceLinkParams,
  options: UpsertShopeeProductOptions
): Promise<UpsertShopeeProductResult> {
  const model = item.models[0] || {
    model_id: 0,
    model_sku: item.item_sku || '',
    model_name: '',
    tier_index: [],
    current_price: 0,
    original_price: 0,
    stock: 0,
  } as ShopeeModelDetail;
  const sku = model.model_sku || item.item_sku || '';
  const productCode = sku || `SP-${item.item_id}`;
  const simpleLabel = sku || item.item_name;
  const primaryImage = item.images[0] || null;

  let productId: string | null = null;
  let variationId: string | null = null;
  let isNewProduct = false;
  let variationsCreated = 0;

  // 1) Match by link
  const existingLink = await findExistingLink(accountId, item.item_id, 0);
  if (existingLink?.product_id) {
    const pid = existingLink.product_id;
    productId = pid;
    variationId = existingLink.variation_id;
    await maybeUpdateProductMeta(companyId, pid, item);
  }

  // 2) Match by SKU
  if (!productId) {
    const matched = await tryAutoMatchBySku(companyId, sku);
    if (matched) {
      productId = matched.product_id;
      variationId = matched.variation_id;
      await maybeUpdateProductMeta(companyId, productId, item);
    }
  }

  // 3) Match by code (active)
  if (!productId) {
    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('company_id', companyId)
      .eq('code', productCode)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      const pid = existing.id;
      productId = pid;
      const { data: existingVar } = await supabaseAdmin
        .from('product_variations')
        .select('id')
        .eq('product_id', pid)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      variationId = existingVar?.id || null;
      await maybeUpdateProductMeta(companyId, pid, item);
    }
  }

  // 4) Reactivate soft-deleted
  if (!productId) {
    const { data: inactive } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('company_id', companyId)
      .eq('code', productCode)
      .eq('is_active', false)
      .limit(1)
      .maybeSingle();
    if (inactive?.id) {
      await reactivateProduct(inactive.id);
      await maybeUpdateProductMeta(companyId, inactive.id, item);
      productId = inactive.id;
      const { data: existingVar } = await supabaseAdmin
        .from('product_variations')
        .select('id')
        .eq('product_id', productId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      variationId = existingVar?.id || null;
    }
  }

  // 5) Create new
  if (!productId) {
    const { data: created, error } = await supabaseAdmin
      .from('products')
      .insert({
        company_id: companyId,
        code: productCode,
        name: item.item_name,
        variation_label: simpleLabel,
        image: primaryImage,
        source: 'shopee',
        description: item.description || null,
        is_active: true,
      })
      .select('id')
      .single();
    if (error || !created) throw new Error(`Failed to create simple product: ${error?.message}`);
    productId = created.id;
    isNewProduct = true;

    for (let i = 0; i < item.images.length; i++) {
      await upsertProductImage(companyId, productId, null, item.images[i], i);
    }

    const { defaultPrice, discountPrice } = resolveShopeePrice(model.original_price, model.current_price);
    const { data: newVar } = await supabaseAdmin
      .from('product_variations')
      .insert({
        company_id: companyId,
        product_id: productId,
        variation_label: simpleLabel,
        sku: sku || null,
        barcode: (options.copySkuToBarcode && sku) ? sku : null,
        default_price: defaultPrice,
        discount_price: discountPrice,
        stock: 0,
        min_stock: 0,
        is_active: true,
      })
      .select('id')
      .single();
    variationId = newVar?.id || null;
    if (variationId) variationsCreated++;
  }

  if (!productId) {
    throw new Error(`Failed to resolve simple product for item ${item.item_id}`);
  }
  await upsertMarketplaceLink(buildLinkParams(productId, variationId, model, sku, primaryImage || undefined));

  return {
    productId,
    variationIds: variationId ? [variationId] : [],
    isNewProduct,
    variationsCreated,
  };
}

/** Create one variation row + its image, returns its id. */
async function createVariationRow(
  companyId: string,
  parentProductId: string,
  item: ShopeeItemFullDetail,
  model: ShopeeModelDetail,
  copySkuToBarcode?: boolean
): Promise<string | null> {
  const sku = model.model_sku || `SP-${item.item_id}-${model.model_id}`;
  const attributes = buildVariationAttributes(item.tierVariations, model.model_name);
  const { defaultPrice, discountPrice } = resolveShopeePrice(model.original_price, model.current_price);

  const { data, error } = await supabaseAdmin
    .from('product_variations')
    .insert({
      company_id: companyId,
      product_id: parentProductId,
      variation_label: model.model_name || sku,
      sku,
      barcode: (copySkuToBarcode && sku) ? sku : null,
      attributes,
      default_price: defaultPrice,
      discount_price: discountPrice,
      stock: model.stock ?? 0,
      min_stock: 0,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error(`[Shopee] Failed to create variation ${sku}:`, error);
    return null;
  }
  if (model.image_url) {
    await upsertProductImage(companyId, null, data.id, model.image_url);
  }
  return data.id;
}

/**
 * Update name + first image on the parent product, but leave description alone if the
 * product has been edited locally (`source` in ['shopee_edited', 'manual']).
 * Description is filled only when the local row is empty so we don't overwrite user edits.
 */
async function maybeUpdateProductMeta(companyId: string, productId: string, item: ShopeeItemFullDetail): Promise<void> {
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('source, description')
    .eq('id', productId)
    .single();

  if (product?.source === 'shopee_edited' || product?.source === 'manual') return;

  const updates: Record<string, unknown> = {
    name: item.item_name,
    image: item.images[0] || null,
    updated_at: new Date().toISOString(),
  };
  if (!product?.description && item.description) {
    updates.description = item.description;
  }
  await supabaseAdmin.from('products').update(updates).eq('id', productId);

  for (let i = 0; i < item.images.length; i++) {
    await upsertProductImage(companyId, productId, null, item.images[i], i);
  }
}

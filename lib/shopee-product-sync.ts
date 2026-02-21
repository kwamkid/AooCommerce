import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  getItemList,
  getItemFullDetails,
  updatePrice,
  updateStock,
  ShopeeAccountRow,
  ShopeeItemFullDetail,
} from '@/lib/shopee-api';
import { SyncProgressCallback } from '@/lib/shopee-sync';

// --- Types ---

export interface ProductSyncResult {
  products_created: number;
  products_updated: number;
  products_skipped: number;
  links_created: number;
  errors: string[];
}

// --- Helpers (reused patterns from shopee-sync.ts) ---

const variationTypeCache: Record<string, string> = {};

async function getOrCreateVariationTypeIds(companyId: string, tierVariationNames: string[]): Promise<string[]> {
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

    const { data: globalExisting } = await supabaseAdmin
      .from('variation_types')
      .select('id, company_id')
      .eq('name', name)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (globalExisting) {
      if (globalExisting.company_id !== companyId) {
        await supabaseAdmin.from('variation_types').update({ company_id: companyId }).eq('id', globalExisting.id);
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
      console.error(`[Product Sync] Failed to create variation type "${name}":`, error);
      continue;
    }

    variationTypeCache[cacheKey] = newType.id;
    ids.push(newType.id);
  }

  return ids;
}

function buildVariationAttributes(tierVariationNames: string[], modelName: string): Record<string, string> {
  if (!modelName) return {};
  if (tierVariationNames.length === 0) return { 'ตัวเลือกสินค้า': modelName };

  const values = modelName.split(',').map(v => v.trim());
  const attributes: Record<string, string> = {};
  for (let i = 0; i < tierVariationNames.length; i++) {
    attributes[tierVariationNames[i]] = values[i] || modelName;
  }
  return attributes;
}

async function upsertProductImage(companyId: string, productId: string | null, variationId: string | null, imageUrl: string, sortOrder: number = 0): Promise<void> {
  if (!imageUrl) return;
  try {
    let query = supabaseAdmin.from('product_images').select('id, sort_order').eq('image_url', imageUrl).eq('company_id', companyId);
    if (productId) query = query.eq('product_id', productId);
    if (variationId) query = query.eq('variation_id', variationId);
    const { data: existing } = await query.limit(1).single();
    if (existing) {
      // Update sort_order if it changed
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
    console.error('[Product Sync] Failed to insert product image:', e);
  }
}

// --- Link helpers ---

async function findExistingLink(accountId: string, itemId: number, modelId: number) {
  const { data } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('id, product_id, variation_id')
    .eq('account_id', accountId)
    .eq('external_item_id', String(itemId))
    .eq('external_model_id', String(modelId))
    .limit(1)
    .single();
  return data;
}

// --- Category Name Lookup ---

// Cache: accountId → Map<categoryId, fullPath>
const categoryNameCache: Record<string, Map<number, string>> = {};

export async function getCategoryName(accountId: string, categoryId: number): Promise<string> {
  if (!categoryId) return '';

  // Check memory cache
  if (categoryNameCache[accountId]?.has(categoryId)) {
    return categoryNameCache[accountId].get(categoryId)!;
  }

  // Load from DB cache if not loaded yet
  if (!categoryNameCache[accountId]) {
    categoryNameCache[accountId] = new Map();
    const { data: cache } = await supabaseAdmin
      .from('shopee_category_cache')
      .select('category_data')
      .eq('account_id', accountId)
      .single();

    if (cache?.category_data) {
      const categories = cache.category_data as Array<{
        category_id: number;
        parent_category_id: number;
        display_category_name: string;
      }>;

      // Build a lookup map
      const catMap = new Map(categories.map(c => [c.category_id, c]));

      // Build full path for each category
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

async function createLink(params: {
  companyId: string;
  accountId: string;
  accountName: string;
  productId: string;
  variationId: string | null;
  itemId: number;
  modelId: number;
  sku: string;
  status: string;
  price: number;
  primaryImage?: string;
  categoryId?: number;
  weight?: number;
  platformProductName?: string;
}) {
  // Lookup category name from cache
  const categoryName = params.categoryId
    ? await getCategoryName(params.accountId, params.categoryId)
    : '';

  await supabaseAdmin.from('marketplace_product_links').upsert({
    company_id: params.companyId,
    platform: 'shopee',
    account_id: params.accountId,
    account_name: params.accountName,
    product_id: params.productId,
    variation_id: params.variationId,
    external_item_id: String(params.itemId),
    external_model_id: String(params.modelId),
    external_sku: params.sku,
    external_item_status: params.status,
    platform_product_name: params.platformProductName || null,
    platform_price: params.price || null,
    platform_primary_image: params.primaryImage || null,
    shopee_category_id: params.categoryId ? String(params.categoryId) : null,
    shopee_category_name: categoryName || null,
    weight: params.weight || null,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id,external_item_id,external_model_id' });
}

// --- Auto-match by SKU ---

async function tryAutoMatchBySku(companyId: string, sku: string): Promise<{ product_id: string; variation_id: string } | null> {
  if (!sku) return null;

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
  return null;
}

// Also try matching by product code (for order-sync created products: SP-{item_id})
async function tryMatchByProductCode(companyId: string, itemId: number): Promise<string | null> {
  const codes = [`SP-${itemId}`];
  const { data } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .in('code', codes)
    .eq('is_active', true)
    .limit(1)
    .single();

  return data?.id || null;
}

// ============================================
// Main Import: syncProductsFromShopee
// ============================================

export async function syncProductsFromShopee(account: ShopeeAccountRow, onProgress?: SyncProgressCallback): Promise<ProductSyncResult> {
  const companyId = account.company_id;
  const accountName = account.shop_name || `Shop ${account.shop_id}`;
  const result: ProductSyncResult = {
    products_created: 0,
    products_updated: 0,
    products_skipped: 0,
    links_created: 0,
    errors: [],
  };

  try {
    const creds = await ensureValidToken(account);

    // Step 1: Collect all item IDs
    const allItemIds: number[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const page = await getItemList(creds, { offset, pageSize: 100, itemStatus: 'NORMAL' });
      allItemIds.push(...page.items.map(i => i.item_id));
      onProgress?.({
        phase: 'collecting',
        current: allItemIds.length,
        total: null,
        label: `กำลังดึงรายการสินค้า... (${allItemIds.length} รายการ)`,
      });
      hasMore = page.hasMore;
      offset = page.nextOffset;
    }

    console.log(`[Product Sync] Found ${allItemIds.length} items in shop ${account.shop_id}`);

    // Step 2: Process in batches of 50
    let processedCount = 0;
    const totalItems = allItemIds.length;

    for (let i = 0; i < allItemIds.length; i += 50) {
      const batch = allItemIds.slice(i, i + 50);

      try {
        const details = await getItemFullDetails(creds, batch);

        for (const [itemId, item] of details) {
          try {
            await processShopeeItem(companyId, account.id, accountName, item, result);
          } catch (e) {
            const msg = `Item ${itemId}: ${e instanceof Error ? e.message : 'Unknown error'}`;
            result.errors.push(msg);
            console.error(`[Product Sync] ${msg}`);
          }
          processedCount++;
          onProgress?.({
            phase: 'processing',
            current: processedCount,
            total: totalItems,
            label: `กำลังประมวลผลสินค้า ${processedCount}/${totalItems}`,
          });
        }
      } catch (e) {
        const msg = `Batch error (items ${batch[0]}-${batch[batch.length - 1]}): ${e instanceof Error ? e.message : 'Unknown error'}`;
        result.errors.push(msg);
        console.error(`[Product Sync] ${msg}`);
        processedCount += batch.length;
      }
    }

    // Step 3: Update last_product_sync_at
    await supabaseAdmin
      .from('shopee_accounts')
      .update({ last_product_sync_at: new Date().toISOString() })
      .eq('id', account.id);

  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'Unknown error');
  }

  console.log(`[Product Sync] Done: created=${result.products_created} updated=${result.products_updated} skipped=${result.products_skipped} links=${result.links_created} errors=${result.errors.length}`);
  return result;
}

async function processShopeeItem(
  companyId: string,
  accountId: string,
  accountName: string,
  item: ShopeeItemFullDetail,
  result: ProductSyncResult
) {
  const primaryImage = item.images[0] || undefined;

  if (item.has_model && item.models.length > 0) {
    // --- Variation product ---
    // First, ensure parent product exists
    const parentProductId = await ensureParentProduct(companyId, accountId, accountName, item, result);
    if (!parentProductId) return;

    // Process each model (variation)
    for (const model of item.models) {
      const sku = model.model_sku || '';
      const existingLink = await findExistingLink(accountId, item.item_id, model.model_id);

      if (existingLink) {
        // Update existing linked product
        await updateLinkedVariation(companyId, existingLink.variation_id, model, item);
        await createLink({
          companyId, accountId, accountName,
          productId: existingLink.product_id,
          variationId: existingLink.variation_id,
          itemId: item.item_id, modelId: model.model_id,
          sku, status: item.item_status, price: model.current_price,
          primaryImage: model.image_url || primaryImage,
          categoryId: item.category_id,
          weight: item.weight,
          platformProductName: item.item_name,
        });
        // Don't count as updated — counted at parent level
      } else {
        // Try auto-match by SKU
        const match = await tryAutoMatchBySku(companyId, sku);
        if (match) {
          await createLink({
            companyId, accountId, accountName,
            productId: match.product_id,
            variationId: match.variation_id,
            itemId: item.item_id, modelId: model.model_id,
            sku, status: item.item_status, price: model.current_price,
            primaryImage: model.image_url || primaryImage,
            categoryId: item.category_id,
            weight: item.weight,
          });
          result.links_created++;
        } else {
          // Create variation under parent
          const variationId = await createVariation(companyId, parentProductId, item, model);
          if (variationId) {
            await createLink({
              companyId, accountId, accountName,
              productId: parentProductId,
              variationId,
              itemId: item.item_id, modelId: model.model_id,
              sku, status: item.item_status, price: model.current_price,
              primaryImage: model.image_url || primaryImage,
              categoryId: item.category_id,
              weight: item.weight,
            });
            result.links_created++;
          }
        }
      }
    }
  } else {
    // --- Simple product ---
    const model = item.models[0];
    const sku = model?.model_sku || item.item_sku || '';
    const existingLink = await findExistingLink(accountId, item.item_id, 0);

    if (existingLink) {
      // Update existing
      await updateLinkedProduct(companyId, existingLink.product_id, item);
      await createLink({
        companyId, accountId, accountName,
        productId: existingLink.product_id,
        variationId: existingLink.variation_id,
        itemId: item.item_id, modelId: 0,
        sku, status: item.item_status, price: model?.current_price || 0,
        primaryImage,
        categoryId: item.category_id,
        weight: item.weight,
      });
      result.products_updated++;
    } else {
      // Try auto-match by SKU
      const match = await tryAutoMatchBySku(companyId, sku);
      if (match) {
        await createLink({
          companyId, accountId, accountName,
          productId: match.product_id,
          variationId: match.variation_id,
          itemId: item.item_id, modelId: 0,
          sku, status: item.item_status, price: model?.current_price || 0,
          primaryImage,
          categoryId: item.category_id,
          weight: item.weight,
          platformProductName: item.item_name,
        });
        result.links_created++;
        result.products_updated++;
      } else {
        // Try match by product code (SP-{item_id})
        const existingProductId = await tryMatchByProductCode(companyId, item.item_id);
        if (existingProductId) {
          // Find its variation
          const { data: variation } = await supabaseAdmin
            .from('product_variations')
            .select('id')
            .eq('product_id', existingProductId)
            .eq('is_active', true)
            .limit(1)
            .single();

          await createLink({
            companyId, accountId, accountName,
            productId: existingProductId,
            variationId: variation?.id || null,
            itemId: item.item_id, modelId: 0,
            sku, status: item.item_status, price: model?.current_price || 0,
            primaryImage,
            categoryId: item.category_id,
            weight: item.weight,
          });
          result.links_created++;
          result.products_updated++;
        } else {
          // Create new simple product
          const productId = await createSimpleProduct(companyId, item, model);
          if (productId) {
            const { data: variation } = await supabaseAdmin
              .from('product_variations')
              .select('id')
              .eq('product_id', productId)
              .eq('is_active', true)
              .limit(1)
              .single();

            await createLink({
              companyId, accountId, accountName,
              productId,
              variationId: variation?.id || null,
              itemId: item.item_id, modelId: 0,
              sku, status: item.item_status, price: model?.current_price || 0,
              primaryImage,
              categoryId: item.category_id,
              weight: item.weight,
            });
            result.products_created++;
            result.links_created++;
          }
        }
      }
    }
  }
}

// --- Product creation/update helpers ---

async function ensureParentProduct(
  companyId: string,
  accountId: string,
  accountName: string,
  item: ShopeeItemFullDetail,
  result: ProductSyncResult
): Promise<string | null> {
  const parentCode = item.item_sku || `SP-${item.item_id}`;

  // Check if parent product already linked via any model of this item
  const { data: existingLink } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id')
    .eq('account_id', accountId)
    .eq('external_item_id', String(item.item_id))
    .limit(1)
    .single();

  if (existingLink) {
    await updateLinkedProduct(companyId, existingLink.product_id, item);
    result.products_updated++;
    return existingLink.product_id;
  }

  // Check if parent exists by code
  const { data: existingParent } = await supabaseAdmin
    .from('products')
    .select('id, source')
    .eq('company_id', companyId)
    .eq('code', parentCode)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (existingParent) {
    await updateLinkedProduct(companyId, existingParent.id, item);
    result.products_updated++;
    return existingParent.id;
  }

  // Create new parent product
  const variationTypeIds = await getOrCreateVariationTypeIds(companyId, item.tierVariations);
  const parentImg = item.images[0] || null;

  const { data: newParent, error } = await supabaseAdmin
    .from('products')
    .insert({
      company_id: companyId,
      code: parentCode,
      name: item.item_name,
      variation_label: null,
      image: parentImg,
      source: 'shopee',
      selected_variation_types: variationTypeIds,
      description: `Shopee Item #${item.item_id}`,
      is_active: true,
    })
    .select()
    .single();

  if (error || !newParent) {
    console.error(`[Product Sync] Failed to create parent product:`, error);
    return null;
  }

  // Insert images (preserve Shopee order)
  for (let i = 0; i < item.images.length; i++) {
    await upsertProductImage(companyId, newParent.id, null, item.images[i], i);
  }

  result.products_created++;
  console.log(`[Product Sync] Created parent product "${item.item_name}" (${parentCode})`);
  return newParent.id;
}

async function createVariation(
  companyId: string,
  parentProductId: string,
  item: ShopeeItemFullDetail,
  model: { model_id: number; model_sku: string; model_name: string; current_price: number; original_price: number; stock?: number; image_url?: string }
): Promise<string | null> {
  const sku = model.model_sku || `SP-${item.item_id}-${model.model_id}`;
  const attributes = buildVariationAttributes(item.tierVariations, model.model_name);

  // Use original_price as default_price, current_price as discount_price (if discounted)
  const defaultPrice = model.original_price > 0 ? model.original_price : model.current_price;
  const discountPrice = (model.original_price > 0 && model.current_price < model.original_price)
    ? model.current_price : 0;

  const { data, error } = await supabaseAdmin
    .from('product_variations')
    .insert({
      company_id: companyId,
      product_id: parentProductId,
      variation_label: model.model_name || sku,
      sku,
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
    console.error(`[Product Sync] Failed to create variation ${sku}:`, error);
    return null;
  }

  if (model.image_url) {
    await upsertProductImage(companyId, null, data.id, model.image_url);
  }

  return data.id;
}

async function createSimpleProduct(
  companyId: string,
  item: ShopeeItemFullDetail,
  model?: { model_sku: string; current_price: number; original_price: number; stock?: number }
): Promise<string | null> {
  const sku = model?.model_sku || item.item_sku || '';
  const productCode = sku || `SP-${item.item_id}`;
  const simpleLabel = sku || item.item_name;
  const img = item.images[0] || null;

  const { data: product, error: productError } = await supabaseAdmin
    .from('products')
    .insert({
      company_id: companyId,
      code: productCode,
      name: item.item_name,
      variation_label: simpleLabel,
      image: img,
      source: 'shopee',
      is_active: true,
    })
    .select()
    .single();

  if (productError || !product) {
    console.error(`[Product Sync] Failed to create simple product:`, productError);
    return null;
  }

  // Images (preserve Shopee order)
  for (let i = 0; i < item.images.length; i++) {
    await upsertProductImage(companyId, product.id, null, item.images[i], i);
  }

  // Variation row — use original_price as default_price, current_price as discount if discounted
  const simpleDefaultPrice = (model?.original_price && model.original_price > 0) ? model.original_price : (model?.current_price || 0);
  const simpleDiscountPrice = (model?.original_price && model.original_price > 0 && model.current_price < model.original_price)
    ? model.current_price : 0;

  await supabaseAdmin.from('product_variations').insert({
    company_id: companyId,
    product_id: product.id,
    variation_label: simpleLabel,
    sku: sku || null,
    default_price: simpleDefaultPrice,
    discount_price: simpleDiscountPrice,
    stock: model?.stock ?? 0,
    min_stock: 0,
    is_active: true,
  });

  console.log(`[Product Sync] Created simple product "${item.item_name}" (${productCode})`);
  return product.id;
}

async function updateLinkedProduct(companyId: string, productId: string, item: ShopeeItemFullDetail) {
  // Check source — skip if user-edited
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('source')
    .eq('id', productId)
    .single();

  if (product?.source === 'shopee_edited' || product?.source === 'manual') {
    return; // Don't overwrite user edits
  }

  // Update product info
  await supabaseAdmin.from('products').update({
    name: item.item_name,
    image: item.images[0] || null,
    updated_at: new Date().toISOString(),
  }).eq('id', productId);

  // Update images (preserve Shopee order)
  for (let i = 0; i < item.images.length; i++) {
    await upsertProductImage(companyId, productId, null, item.images[i], i);
  }
}

async function updateLinkedVariation(companyId: string, variationId: string | null, model: { model_sku: string; current_price: number; original_price: number; stock: number; image_url?: string }, item: ShopeeItemFullDetail) {
  if (!variationId) return;

  // Check product source
  const { data: variation } = await supabaseAdmin
    .from('product_variations')
    .select('product_id')
    .eq('id', variationId)
    .single();

  if (variation) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('source')
      .eq('id', variation.product_id)
      .single();

    if (product?.source === 'shopee_edited' || product?.source === 'manual') {
      return; // Don't overwrite
    }
  }

  // Update variation price (stock managed locally)
  const updDefaultPrice = model.original_price > 0 ? model.original_price : model.current_price;
  const updDiscountPrice = (model.original_price > 0 && model.current_price < model.original_price)
    ? model.current_price : 0;

  await supabaseAdmin.from('product_variations').update({
    default_price: updDefaultPrice,
    discount_price: updDiscountPrice,
    updated_at: new Date().toISOString(),
  }).eq('id', variationId);

  if (model.image_url) {
    await upsertProductImage(companyId, null, variationId, model.image_url);
  }
}

// ============================================
// Export: Push Price to Shopee
// ============================================

export async function pushPriceToShopee(
  account: ShopeeAccountRow,
  productId: string
): Promise<{ success: boolean; updated_models: number; errors: string[] }> {
  const errors: string[] = [];
  let updatedModels = 0;

  try {
    const creds = await ensureValidToken(account);

    // Get all links for this product + account
    const { data: links } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('id, external_item_id, external_model_id, variation_id, platform_price')
      .eq('product_id', productId)
      .eq('account_id', account.id)
      .eq('sync_enabled', true);

    if (!links || links.length === 0) {
      return { success: false, updated_models: 0, errors: ['No linked items found'] };
    }

    // Group by external_item_id
    const itemGroups = new Map<string, typeof links>();
    for (const link of links) {
      const group = itemGroups.get(link.external_item_id) || [];
      group.push(link);
      itemGroups.set(link.external_item_id, group);
    }

    for (const [externalItemId, groupLinks] of itemGroups) {
      const priceList: { model_id: number; original_price: number }[] = [];

      for (const link of groupLinks) {
        let price = link.platform_price;

        if (!price && link.variation_id) {
          const { data: variation } = await supabaseAdmin
            .from('product_variations')
            .select('default_price, discount_price')
            .eq('id', link.variation_id)
            .single();

          if (variation) {
            price = variation.discount_price > 0 ? variation.discount_price : variation.default_price;
          }
        }

        if (price && price > 0) {
          priceList.push({
            model_id: parseInt(link.external_model_id) || 0,
            original_price: price,
          });
        }
      }

      if (priceList.length > 0) {
        const { error } = await updatePrice(creds, parseInt(externalItemId), priceList);
        if (error) {
          errors.push(`Item ${externalItemId}: ${error}`);
        } else {
          updatedModels += priceList.length;
          // Update timestamps
          const linkIds = groupLinks.map(l => l.id);
          await supabaseAdmin
            .from('marketplace_product_links')
            .update({ last_price_pushed_at: new Date().toISOString() })
            .in('id', linkIds);
        }
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Unknown error');
  }

  return { success: errors.length === 0, updated_models: updatedModels, errors };
}

// ============================================
// Export: Push Stock to Shopee
// ============================================

export async function pushStockToShopee(
  account: ShopeeAccountRow,
  productId: string
): Promise<{ success: boolean; updated_models: number; errors: string[] }> {
  const errors: string[] = [];
  let updatedModels = 0;

  try {
    const creds = await ensureValidToken(account);

    const { data: links } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('id, external_item_id, external_model_id, variation_id')
      .eq('product_id', productId)
      .eq('account_id', account.id)
      .eq('sync_enabled', true);

    if (!links || links.length === 0) {
      return { success: false, updated_models: 0, errors: ['No linked items found'] };
    }

    const itemGroups = new Map<string, typeof links>();
    for (const link of links) {
      const group = itemGroups.get(link.external_item_id) || [];
      group.push(link);
      itemGroups.set(link.external_item_id, group);
    }

    for (const [externalItemId, groupLinks] of itemGroups) {
      const stockList: { model_id: number; seller_stock: { stock: number }[] }[] = [];

      for (const link of groupLinks) {
        let stock = 0;

        if (link.variation_id) {
          // Read actual stock from inventory table (sum across all warehouses)
          const { data: inventoryRows } = await supabaseAdmin
            .from('inventory')
            .select('quantity, reserved_quantity')
            .eq('variation_id', link.variation_id);

          if (inventoryRows && inventoryRows.length > 0) {
            const totalQty = inventoryRows.reduce((sum, inv) => sum + (inv.quantity || 0), 0);
            const totalReserved = inventoryRows.reduce((sum, inv) => sum + (inv.reserved_quantity || 0), 0);
            stock = totalQty - totalReserved;
          } else {
            // Fallback to legacy product_variations.stock if no inventory rows
            const { data: variation } = await supabaseAdmin
              .from('product_variations')
              .select('stock')
              .eq('id', link.variation_id)
              .single();
            stock = variation?.stock ?? 0;
          }
        }

        stockList.push({
          model_id: parseInt(link.external_model_id) || 0,
          seller_stock: [{ stock: Math.max(0, stock) }],
        });
      }

      if (stockList.length > 0) {
        const { error } = await updateStock(creds, parseInt(externalItemId), stockList);
        if (error) {
          errors.push(`Item ${externalItemId}: ${error}`);
        } else {
          updatedModels += stockList.length;
          const linkIds = groupLinks.map(l => l.id);
          await supabaseAdmin
            .from('marketplace_product_links')
            .update({ last_stock_pushed_at: new Date().toISOString() })
            .in('id', linkIds);
        }
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : 'Unknown error');
  }

  return { success: errors.length === 0, updated_models: updatedModels, errors };
}

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  getItemList,
  getItemFullDetails,
  updatePrice,
  updateStock,
  updateItemInfo,
  getShopeeCategoryAttributes,
  ShopeeAccountRow,
  ShopeeCredentials,
  ShopeeItemFullDetail,
} from '@/lib/shopee/api';
import { SyncProgressCallback } from '@/lib/shopee/sync';
import { parallelLimit } from '@/lib/parallel';
import {
  getOrCreateVariationTypeIds,
  buildVariationAttributes,
  upsertProductImage,
  findExistingLink,
  upsertMarketplaceLink,
  tryAutoMatchBySku,
  reactivateProduct,
  resolveShopeePrice,
} from '@/lib/shopee/product-helpers';

// Re-export getCategoryName for backward compatibility
export { getCategoryName } from '@/lib/shopee/product-helpers';

// --- Types ---

export interface ProductSyncResult {
  products_created: number;
  products_updated: number;
  products_skipped: number;
  links_created: number;
  errors: string[];
}

// --- Local-only helpers (product sync specific) ---

// Also try matching by product code (for order-sync created products: SP-{item_id})
async function tryMatchByProductCode(companyId: string, itemId: number): Promise<string | null> {
  const codes = [`SP-${itemId}`];

  // First try active products
  const { data } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .in('code', codes)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (data?.id) return data.id;

  // Then try inactive (previously deleted) — reactivate
  const { data: inactive } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .in('code', codes)
    .eq('is_active', false)
    .limit(1)
    .single();

  if (inactive?.id) {
    await reactivateProduct(inactive.id);
    console.log(`[Product Sync] Reactivated inactive product ${inactive.id} matched by code SP-${itemId}`);
    return inactive.id;
  }

  return null;
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

        const detailEntries = [...details.entries()];
        await parallelLimit(detailEntries, async ([itemId, item]) => {
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
        }, 3);
      } catch (e) {
        const msg = `Batch error (items ${batch[0]}-${batch[batch.length - 1]}): ${e instanceof Error ? e.message : 'Unknown error'}`;
        result.errors.push(msg);
        console.error(`[Product Sync] ${msg}`);
        processedCount += batch.length;
      }
    }

    // Step 3: Update last_product_sync_at
    await supabaseAdmin
      .from('marketplace_accounts')
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

  const linkParams = (productId: string, variationId: string | null, modelId: number, sku: string, price: number, image?: string) => ({
    companyId, accountId, accountName,
    productId, variationId,
    itemId: item.item_id, modelId,
    sku, status: item.item_status, price,
    primaryImage: image || primaryImage,
    categoryId: item.category_id,
    weight: item.weight,
    platformProductName: item.item_name,
    brand: item.brand,
    attributes: item.attribute_list,
  });

  if (item.has_model && item.models.length > 0) {
    // --- Variation product ---
    const parentProductId = await ensureParentProduct(companyId, accountId, item, result);
    if (!parentProductId) return;

    for (const model of item.models) {
      const sku = model.model_sku || '';
      const existingLink = await findExistingLink(accountId, item.item_id, model.model_id);

      if (existingLink) {
        await updateLinkedVariation(companyId, existingLink.variation_id, model, item);
        await upsertMarketplaceLink(linkParams(existingLink.product_id, existingLink.variation_id, model.model_id, sku, model.current_price, model.image_url || primaryImage));
      } else {
        const match = await tryAutoMatchBySku(companyId, sku);
        if (match) {
          await upsertMarketplaceLink(linkParams(match.product_id, match.variation_id, model.model_id, sku, model.current_price, model.image_url || primaryImage));
          result.links_created++;
        } else {
          const variationId = await createVariation(companyId, parentProductId, item, model);
          if (variationId) {
            await upsertMarketplaceLink(linkParams(parentProductId, variationId, model.model_id, sku, model.current_price, model.image_url || primaryImage));
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
      await updateLinkedProduct(companyId, existingLink.product_id, item);
      await upsertMarketplaceLink(linkParams(existingLink.product_id, existingLink.variation_id, 0, sku, model?.current_price || 0));
      result.products_updated++;
    } else {
      const match = await tryAutoMatchBySku(companyId, sku);
      if (match) {
        await upsertMarketplaceLink(linkParams(match.product_id, match.variation_id, 0, sku, model?.current_price || 0));
        result.links_created++;
        result.products_updated++;
      } else {
        const existingProductId = await tryMatchByProductCode(companyId, item.item_id);
        if (existingProductId) {
          const { data: variation } = await supabaseAdmin
            .from('product_variations')
            .select('id')
            .eq('product_id', existingProductId)
            .eq('is_active', true)
            .limit(1)
            .single();

          await upsertMarketplaceLink(linkParams(existingProductId, variation?.id || null, 0, sku, model?.current_price || 0));
          result.links_created++;
          result.products_updated++;
        } else {
          const productId = await createSimpleProduct(companyId, item, model);
          if (productId) {
            const { data: variation } = await supabaseAdmin
              .from('product_variations')
              .select('id')
              .eq('product_id', productId)
              .eq('is_active', true)
              .limit(1)
              .single();

            await upsertMarketplaceLink(linkParams(productId, variation?.id || null, 0, sku, model?.current_price || 0));
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

  // Check if parent exists by code (active)
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

  // Check if parent exists but is inactive — reactivate
  const { data: inactiveParent } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .eq('code', parentCode)
    .eq('is_active', false)
    .limit(1)
    .single();

  if (inactiveParent) {
    const now = new Date().toISOString();
    await supabaseAdmin.from('products').update({
      name: item.item_name, image: item.images[0] || null, source: 'shopee', is_active: true, updated_at: now,
    }).eq('id', inactiveParent.id);
    await supabaseAdmin.from('product_variations').update({ is_active: true, updated_at: now }).eq('product_id', inactiveParent.id);
    console.log(`[Product Sync] Reactivated inactive parent product "${item.item_name}" (${parentCode})`);
    result.products_updated++;
    return inactiveParent.id;
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

  const { defaultPrice, discountPrice } = resolveShopeePrice(model.original_price, model.current_price);

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

  // Check for inactive product with same code — reactivate instead of creating
  const { data: inactiveProduct } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .eq('code', productCode)
    .eq('is_active', false)
    .limit(1)
    .single();

  if (inactiveProduct) {
    const now = new Date().toISOString();
    await supabaseAdmin.from('products').update({
      name: item.item_name, image: img, source: 'shopee', is_active: true, updated_at: now,
    }).eq('id', inactiveProduct.id);
    await supabaseAdmin.from('product_variations').update({ is_active: true, updated_at: now }).eq('product_id', inactiveProduct.id);
    console.log(`[Product Sync] Reactivated inactive simple product "${item.item_name}" (${productCode})`);
    for (let i = 0; i < item.images.length; i++) {
      await upsertProductImage(companyId, inactiveProduct.id, null, item.images[i], i);
    }
    return inactiveProduct.id;
  }

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

  for (let i = 0; i < item.images.length; i++) {
    await upsertProductImage(companyId, product.id, null, item.images[i], i);
  }

  const { defaultPrice: simpleDefaultPrice, discountPrice: simpleDiscountPrice } = resolveShopeePrice(model?.original_price || 0, model?.current_price || 0);

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
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('source')
    .eq('id', productId)
    .single();

  if (product?.source === 'shopee_edited' || product?.source === 'manual') {
    return;
  }

  await supabaseAdmin.from('products').update({
    name: item.item_name,
    image: item.images[0] || null,
    updated_at: new Date().toISOString(),
  }).eq('id', productId);

  for (let i = 0; i < item.images.length; i++) {
    await upsertProductImage(companyId, productId, null, item.images[i], i);
  }
}

async function updateLinkedVariation(companyId: string, variationId: string | null, model: { model_sku: string; current_price: number; original_price: number; stock: number; image_url?: string }, item: ShopeeItemFullDetail) {
  if (!variationId) return;

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
      return;
    }
  }

  const { defaultPrice: updDefaultPrice, discountPrice: updDiscountPrice } = resolveShopeePrice(model.original_price, model.current_price);

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

    const { data: links } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('id, external_item_id, external_model_id, variation_id, platform_price')
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

    const priceVariationIds = links.filter(l => !l.platform_price && l.variation_id).map(l => l.variation_id) as string[];
    const priceMap = new Map<string, number>();
    if (priceVariationIds.length > 0) {
      const { data: variations } = await supabaseAdmin
        .from('product_variations')
        .select('id, default_price, discount_price')
        .in('id', priceVariationIds);
      if (variations) {
        for (const v of variations) {
          priceMap.set(v.id, v.discount_price > 0 ? v.discount_price : v.default_price);
        }
      }
    }

    for (const [externalItemId, groupLinks] of itemGroups) {
      const priceList: { model_id: number; original_price: number }[] = [];

      for (const link of groupLinks) {
        const price = link.platform_price || (link.variation_id ? priceMap.get(link.variation_id) : null) || 0;

        if (price > 0) {
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

    const allVariationIds = links.map(l => l.variation_id).filter(Boolean) as string[];
    const inventoryMap = new Map<string, number>();
    if (allVariationIds.length > 0) {
      const { data: inventoryRows } = await supabaseAdmin
        .from('inventory')
        .select('variation_id, quantity, reserved_quantity')
        .in('variation_id', allVariationIds);
      if (inventoryRows) {
        for (const inv of inventoryRows) {
          const current = inventoryMap.get(inv.variation_id) || 0;
          inventoryMap.set(inv.variation_id, current + (inv.quantity || 0) - (inv.reserved_quantity || 0));
        }
      }
    }

    for (const [externalItemId, groupLinks] of itemGroups) {
      const stockList: { model_id: number; seller_stock: { stock: number }[] }[] = [];

      for (const link of groupLinks) {
        let stock = 0;
        if (link.variation_id) {
          stock = inventoryMap.get(link.variation_id) ?? 0;
          if (!inventoryMap.has(link.variation_id)) {
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

// ============================================
// Export: Push Product Info (name) to Shopee
// ============================================

export async function pushInfoToShopee(
  account: ShopeeAccountRow,
  itemId: number,
  itemName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const creds = await ensureValidToken(account);
    const { error } = await updateItemInfo(creds, itemId, { item_name: itemName });
    if (error) return { success: false, error };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ============================================
// Export: Push Category to Shopee
// ============================================

interface AttributeEntry {
  attribute_id: number;
  attribute_value_list: Array<{ value_id: number; original_value_name: string }>;
}

async function buildAttributesForCategoryUpdate(
  creds: ShopeeCredentials,
  categoryId: number,
  existingAttributes: AttributeEntry[],
  companyId?: string
): Promise<{ attributes: AttributeEntry[]; missingMandatory: string[] }> {
  const existingMap = new Map<number, AttributeEntry>();
  for (const attr of existingAttributes) {
    existingMap.set(attr.attribute_id, attr);
  }

  if (companyId) {
    try {
      const { data } = await supabaseAdmin
        .from('marketplace_product_links')
        .select('shopee_attributes')
        .eq('company_id', companyId)
        .eq('shopee_category_id', categoryId)
        .not('shopee_attributes', 'is', null)
        .limit(1)
        .single();

      if (data?.shopee_attributes && Array.isArray(data.shopee_attributes)) {
        const storedAttrs = data.shopee_attributes as AttributeEntry[];
        for (const sa of storedAttrs) {
          if (!existingMap.has(sa.attribute_id)) {
            existingMap.set(sa.attribute_id, sa);
          }
        }
      }
    } catch { /* no stored attrs */ }
  }

  try {
    const { data, error } = await getShopeeCategoryAttributes(creds, categoryId);
    if (error || !data) return { attributes: Array.from(existingMap.values()), missingMandatory: [] };

    const response = data as { attribute_list?: Array<{
      attribute_id: number;
      original_attribute_name: string;
      is_mandatory: boolean;
      attribute_value_list?: Array<{ value_id: number; original_value_name: string }>;
    }> };
    const attributes = response.attribute_list || [];
    const result: AttributeEntry[] = [];
    const missingMandatory: string[] = [];

    for (const attr of attributes.filter(a => a.is_mandatory)) {
      const existing = existingMap.get(attr.attribute_id);
      if (existing && existing.attribute_value_list?.length > 0) {
        result.push(existing);
        continue;
      }

      const values = attr.attribute_value_list || [];
      if (values.length > 0) {
        // Auto-pick first preset value — safe for DROP_DOWN types
        result.push({
          attribute_id: attr.attribute_id,
          attribute_value_list: [{ value_id: values[0].value_id, original_value_name: values[0].original_value_name }],
        });
      } else {
        // No preset values available AND no existing value — we can't safely auto-fill
        // this attribute. Record it so the caller can skip the update with a clear error
        // instead of sending value_id:0 which Shopee rejects.
        missingMandatory.push(attr.original_attribute_name);
      }
    }
    return { attributes: result, missingMandatory };
  } catch {
    return { attributes: Array.from(existingMap.values()), missingMandatory: [] };
  }
}

export async function pushCategoryToShopee(
  account: ShopeeAccountRow,
  itemId: number,
  categoryId: number,
  linkId: string,
  companyId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const creds = await ensureValidToken(account);

    let existingAttributes: AttributeEntry[] = [];
    try {
      const { data: linkData } = await supabaseAdmin
        .from('marketplace_product_links')
        .select('shopee_attributes')
        .eq('id', linkId)
        .single();
      if (linkData?.shopee_attributes && Array.isArray(linkData.shopee_attributes)) {
        existingAttributes = linkData.shopee_attributes as AttributeEntry[];
      }
    } catch { /* no existing attrs */ }

    const { attributes: attributeList, missingMandatory } = await buildAttributesForCategoryUpdate(creds, categoryId, existingAttributes, companyId);

    if (missingMandatory.length > 0) {
      return {
        success: false,
        error: `หมวดหมู่นี้ต้องระบุ attribute ที่จำเป็น: ${missingMandatory.join(', ')} — กรุณาตั้งค่าใน Shopee Seller Center ก่อน`,
      };
    }

    const { error } = await updateItemInfo(creds, itemId, {
      category_id: Number(categoryId),
      attribute_list: attributeList,
    });
    if (error) return { success: false, error };
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

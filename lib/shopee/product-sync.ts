import { supabaseAdmin } from '@/lib/supabase-admin';
import { pushStockForAccount, pullStockForAccount } from '@/lib/marketplace/stock-push';
import type { PushStockResult, PullStockMode, PullStockResult } from '@/lib/marketplace/stock-push';
import {
  ensureValidToken,
  getItemList,
  getItemFullDetails,
  updatePrice,
  updateItemInfo,
  getShopeeCategoryAttributes,
  ShopeeAccountRow,
  ShopeeCredentials,
  ShopeeItemFullDetail,
} from '@/lib/shopee/api';
import { SyncProgressCallback } from '@/lib/shopee/sync';
import { parallelLimit } from '@/lib/parallel';
import { upsertShopeeProduct } from '@/lib/shopee/product-helpers';
import { sellingPrice } from '@/lib/product-display';

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
  const before = await supabaseAdmin
    .from('marketplace_product_links')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('external_item_id', String(item.item_id));

  const res = await upsertShopeeProduct(companyId, accountId, accountName, item);

  if (res.isNewProduct) {
    result.products_created++;
  } else {
    result.products_updated++;
  }
  // Treat newly-attached link rows as "links created"
  const linksAfter = await supabaseAdmin
    .from('marketplace_product_links')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .eq('external_item_id', String(item.item_id));
  const beforeCount = before.count || 0;
  const afterCount = linksAfter.count || 0;
  result.links_created += Math.max(0, afterCount - beforeCount);
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
          priceMap.set(v.id, sellingPrice(v));
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

/**
 * ตัวห่อบางเพื่อให้ call site เดิมของ Shopee (import สินค้า · sync รายสินค้า) เรียกได้เหมือนเดิม
 * — ของจริงอยู่ที่ชั้นกลาง `lib/marketplace/stock-push.ts` + `lib/shopee/stock-adapter.ts`
 */
export async function pushStockToShopee(
  account: ShopeeAccountRow,
  productId: string
): Promise<PushStockResult> {
  return pushStockForAccount({ ...account, platform: 'shopee' }, productId);
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

// ============================================
// Pull stock: Shopee → คลัง default ของเรา (ตั้งยอดตั้งต้น)
// ============================================

// type ของ pull ย้ายไป `lib/marketplace/stock-push.ts` แล้ว (ใช้ร่วม 3 platform)
// — re-export ไว้ให้ call site เดิมไม่ต้องแก้
export type { PullStockResult, PullStockChange, PullStockMode } from '@/lib/marketplace/stock-push';

/**
 * ดึงยอดสต็อกจาก Shopee ลงคลังของร้าน — สำหรับ "ตั้งยอดตั้งต้น" ของสินค้าที่ผูก link ไว้แล้ว
 *
 * ตัวห่อบางของชั้นกลาง (`lib/marketplace/stock-push.ts` + `lib/shopee/stock-adapter.ts`)
 * — เหลือไว้ให้ call site เดิมเรียกได้เหมือนเดิม
 */
export async function pullStockFromShopee(
  account: ShopeeAccountRow,
  opts: { mode?: PullStockMode; dryRun?: boolean } = {}
): Promise<PullStockResult> {
  return pullStockForAccount({ ...account, platform: 'shopee' }, opts);
}


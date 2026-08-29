import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveAccountWarehouseId } from '@/lib/marketplace/warehouse';
import { getStockConfig } from '@/lib/stock-utils';
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
import { upsertShopeeProduct } from '@/lib/shopee/product-helpers';

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
    // แพ็กเกจที่ไม่มีระบบคลัง = ไม่มี "ยอดของเรา" ที่จะส่งขึ้นไปตั้งแต่แรก
    // ยิงไปก็ได้เลข 0 ทับของจริงบนร้าน — อันตรายกว่าไม่ทำ
    const stockConfig = await getStockConfig(account.company_id);
    if (!stockConfig.stockEnabled) {
      errors.push('แพ็คเกจปัจจุบันยังไม่รองรับระบบคลังสินค้า — ซิงค์สต็อกไม่ได้');
      return { success: false, updated_models: 0, errors };
    }

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
      // สต็อกที่ส่งขึ้นร้าน = ของคลังที่ร้านนี้เลือกไว้ (ไม่ได้เลือก = คลัง default)
      // ต้องเป็นคลังเดียวกับที่ออเดอร์ของร้านนี้ตัดสต็อก ไม่งั้นจะส่งยอดของคลังหนึ่ง
      // แต่ตัดอีกคลังหนึ่ง — ดู lib/marketplace/warehouse.ts
      const warehouseId = await resolveAccountWarehouseId(account);

      if (warehouseId) {
        const { data: inventoryRows } = await supabaseAdmin
          .from('inventory')
          .select('variation_id, quantity, reserved_quantity')
          .eq('warehouse_id', warehouseId)
          .in('variation_id', allVariationIds);
        if (inventoryRows) {
          for (const inv of inventoryRows) {
            inventoryMap.set(inv.variation_id, (inv.quantity || 0) - (inv.reserved_quantity || 0));
          }
        }
      } else {
        console.warn(`[Shopee Stock] No warehouse found for company ${account.company_id} — stock push will send 0`);
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
        const { data: stockResult, error } = await updateStock(creds, parseInt(externalItemId), stockList);
        if (error) {
          errors.push(`Item ${externalItemId}: ${error}`);
          // Log detailed failure for debugging Shopee 44% success rate issue
          console.warn(`[Shopee Stock] update_stock FAIL item=${externalItemId}:`, {
            error,
            stockList: stockList.map(s => ({ model_id: s.model_id, stock: s.seller_stock[0]?.stock })),
          });
        } else {
          // Check for partial failure in response (failure_list)
          // Shopee ตอบสนามนี้ว่า `failed_reason` (เคยอ่านผิดเป็น fail_message → ขึ้น "undefined"
          // เวลาพัง = อ่านไม่ออกว่าเกิดอะไร) · เผื่อ fail_message ไว้ด้วยกันสองชื่อในอนาคต
          const resp = stockResult as { failure_list?: { model_id: number; failed_reason?: string; fail_message?: string }[] } | null;
          if (resp?.failure_list && resp.failure_list.length > 0) {
            const failMsgs = resp.failure_list.map(f => `model_id=${f.model_id}: ${f.failed_reason || f.fail_message || 'ไม่ทราบสาเหตุ'}`);
            errors.push(`Item ${externalItemId} partial fail: ${failMsgs.join('; ')}`);
            console.warn(`[Shopee Stock] update_stock PARTIAL FAIL item=${externalItemId}:`, failMsgs);
          }
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

// ============================================
// Pull stock: Shopee → คลัง default ของเรา (ตั้งยอดตั้งต้น)
// ============================================

export interface PullStockResult {
  success: boolean;
  checked: number;        // จำนวน variation ที่ผูกกับร้านนี้และเจอยอดบน Shopee
  filled: number;         // เติมยอดให้ (ช่องที่เดิมเป็น 0 / ยังไม่มีแถว)
  skipped_nonzero: number; // ข้ามเพราะคลังเรามียอดจริงอยู่แล้ว — ไม่ทับเด็ดขาด (โหมด fill_blank)
  overwritten?: number;    // ทับยอดเดิมที่ไม่ใช่ 0 (โหมด overwrite เท่านั้น)
  unchanged?: number;      // ยอดตรงกันอยู่แล้ว ไม่ต้องเขียน
  dry_run?: boolean;
  changes?: PullStockChange[]; // รายการที่จะเปลี่ยน (ใส่ครบเสมอ ใช้ทำ preview)
  desired?: Record<string, number>; // variation_id → ยอดบน Shopee (ทุกตัวที่เจอ ไม่ใช่แค่ที่เปลี่ยน)
  errors: string[];
}

export interface PullStockChange {
  variation_id: string;
  from: number;      // ยอดที่ขายได้ของเราตอนนี้ (quantity - reserved)
  to: number;        // ยอดบน Shopee
}

/**
 * โหมดการดึงยอด
 * - `fill_blank` (default, พฤติกรรมเดิม) — เติมเฉพาะช่องที่ของเราเป็น 0 และ Shopee > 0
 *   ใช้ตอน "ตั้งยอดตั้งต้น" ครั้งแรก ไม่ทับของที่พนักงานตั้งไว้
 * - `overwrite` — **ยึด Shopee เป็นความจริง** ทับทุกช่องรวมถึงตัวที่ Shopee เป็น 0
 *   ใช้ตอน reconcile หลัง push ตายจนยอดสองฝั่งหลุดกัน (ดู fix-bug.md 2026-08-29)
 */
export type PullStockMode = 'fill_blank' | 'overwrite';

/**
 * ดึงยอดสต็อกจาก Shopee ลงคลัง default — สำหรับ "ตั้งยอดตั้งต้น" ของสินค้าที่
 * ผูก link ไว้แล้ว (ตอน import ด้วย action "สร้างใหม่" ระบบเติมให้เฉพาะตัวที่
 * import ตอนนั้น — ตัวที่ผูกทีหลัง/ผูกแบบ match ไม่เคยได้ยอด)
 *
 * กติกาเดียวกับ importStockFromShopee: เขียนเฉพาะช่องที่ยอดปัจจุบันเป็น 0
 * หรือยังไม่มีแถว inventory — ยอดที่พนักงานตั้ง/นับจริงไว้แล้วห้ามทับ
 * (Shopee เป็นแค่ตัวตั้งต้น ความจริงอยู่ที่คลังเรา)
 *
 * ต้นทุน quota: get_item_list ~หน้าละ 100 + รายละเอียดชุดละ 50 → ร้าน ~1,000
 * สินค้า ≈ 30 คอล
 */
export async function pullStockFromShopee(
  account: ShopeeAccountRow,
  opts: { mode?: PullStockMode; dryRun?: boolean } = {}
): Promise<PullStockResult> {
  const mode = opts.mode || 'fill_blank';
  const dryRun = opts.dryRun === true;
  const result: PullStockResult = {
    success: false, checked: 0, filled: 0, skipped_nonzero: 0,
    overwritten: 0, unchanged: 0, dry_run: dryRun, changes: [], errors: [],
  };
  const companyId = account.company_id;

  try {
    const stockConfig = await getStockConfig(companyId);
    if (!stockConfig.stockEnabled) {
      result.errors.push('แพ็คเกจปัจจุบันยังไม่รองรับระบบคลังสินค้า — ซิงค์สต็อกไม่ได้');
      return result;
    }

    const creds = await ensureValidToken(account);

    // คลังของร้านนี้ — convention เดียวกับ pushStockToShopee (ต้องเป็นคลังเดียวกันเสมอ)
    const warehouseId = await resolveAccountWarehouseId(account);
    if (!warehouseId) {
      result.errors.push('ยังไม่มีคลังที่ใช้งานได้ — สร้างคลังก่อน');
      return result;
    }
    const warehouse = { id: warehouseId };

    // links ของร้านนี้: (item_id, model_id) → variation_id
    const { data: links } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('external_item_id, external_model_id, variation_id')
      .eq('account_id', account.id)
      .not('variation_id', 'is', null);
    if (!links || links.length === 0) {
      result.errors.push('ร้านนี้ยังไม่มีสินค้าที่ผูก link');
      return result;
    }
    const linkMap = new Map<string, string>(); // `${item}:${model}` → variation_id
    for (const l of links) linkMap.set(`${l.external_item_id}:${l.external_model_id}`, l.variation_id as string);

    // ไล่ยอดจาก Shopee — **เดินจาก link ที่เราผูกไว้ ไม่ใช่จากรายการสินค้าของร้าน**
    //
    // เดิมเดินด้วย getItemList(itemStatus:'NORMAL') ซึ่งคืนเฉพาะประกาศที่ยังโชว์ขายอยู่
    // → ประกาศที่ถูก UNLIST / SELLER_DELETE หลุดออกจากการ reconcile ทั้งหมด
    // **UNLIST = คนขายกดซ่อนเอง ไม่ได้แปลว่าของหมด** (พบจริง 2026-08-29: ประกาศที่ปิดขาย
    // แต่ยังมีของเหลือ 50 / 16 / 4 ชิ้น) พอเปิดขายกลับ เลขสองฝั่งจะขัดกันตั้งแต่วินาทีแรก
    //
    // เดินจาก link แทน = ครอบคลุมทุกตัวที่เราผูกไว้ไม่ว่าสถานะอะไร และประหยัด
    // get_item_list ทั้งร้านไปด้วย (สินค้าที่ไม่ได้ผูกก็ไม่ต้องดึงมาตั้งแต่แรก)
    const stockByVariation = new Map<string, number>();
    const linkedItemIds = [...new Set(links.map(l => Number(l.external_item_id)))].filter(Boolean);
    for (let i = 0; i < linkedItemIds.length; i += 50) {
      const details = await getItemFullDetails(creds, linkedItemIds.slice(i, i + 50));
      for (const [itemId, item] of details) {
        const models = item.models.length > 0
          ? item.models
          : [{ model_id: 0, stock: 0 }];
        for (const m of models) {
          const variationId = linkMap.get(`${itemId}:${m.model_id}`);
          if (variationId) stockByVariation.set(variationId, m.stock ?? 0);
        }
      }
    }
    result.checked = stockByVariation.size;
    result.desired = Object.fromEntries(stockByVariation);

    // เขียนลง inventory — เฉพาะช่องว่าง/ศูนย์
    const variationIds = [...stockByVariation.keys()];
    // อ่านทีละ 150 id — `.in()` ที่ยาวเกินทำ URL ทะลุลิมิตของ PostgREST แล้ว **ล้มเงียบ**
    // (คืน error ไม่ใช่แถว) → โค้ดจะนึกว่าไม่มีแถวเดิมเลยแล้วไป insert ทับของที่มีอยู่
    // ร้าน 300 สินค้ายังรอด แต่ร้านใหญ่กว่านั้นพังแน่ — เจอตอน reconcile 2026-08-29
    const invByVariation = new Map<string, { id: string; variation_id: string; quantity: number; reserved_quantity: number }>();
    for (let i = 0; i < variationIds.length; i += 150) {
      const { data: existingInv, error: invError } = await supabaseAdmin
        .from('inventory')
        .select('id, variation_id, quantity, reserved_quantity')
        .eq('warehouse_id', warehouse.id)
        .in('variation_id', variationIds.slice(i, i + 150));
      if (invError) {
        result.errors.push(`อ่านคลังเดิมไม่สำเร็จ: ${invError.message}`);
        return result;
      }
      for (const row of existingInv || []) {
        invByVariation.set(row.variation_id as string, row as { id: string; variation_id: string; quantity: number; reserved_quantity: number });
      }
    }

    for (const [variationId, shopeeStock] of stockByVariation) {
      const inv = invByVariation.get(variationId);
      const reserved = inv?.reserved_quantity || 0;
      const ourAvailable = (inv?.quantity || 0) - reserved;

      if (mode === 'fill_blank') {
        if (shopeeStock <= 0) continue;
        if (inv && (inv.quantity || 0) > 0) { result.skipped_nonzero++; continue; }
      } else if (ourAvailable === shopeeStock) {
        result.unchanged!++;
        continue;
      }

      // เขียน quantity = shopeeStock + reserved เพื่อให้ "ยอดขายได้" (quantity - reserved)
      // เท่ากับเลขบน Shopee เป๊ะ — ต้องสมมาตรกับ pushStockToShopee ที่ส่ง quantity - reserved
      // ไม่งั้น pull เสร็จปุ๊บ push รอบถัดไปจะส่งเลขคนละตัวแล้วหลุดกันใหม่ทันที
      const newQuantity = shopeeStock + reserved;
      result.changes!.push({ variation_id: variationId, from: ourAvailable, to: shopeeStock });

      if (!dryRun) {
        if (inv) {
          await supabaseAdmin.from('inventory')
            .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
            .eq('id', inv.id);
        } else {
          await supabaseAdmin.from('inventory').insert({
            company_id: companyId,
            warehouse_id: warehouse.id,
            variation_id: variationId,
            quantity: newQuantity,
            reserved_quantity: 0,
          });
        }
      }

      if (mode === 'overwrite' && ourAvailable > 0) result.overwritten!++;
      else result.filled++;
    }

    result.success = true;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'Unknown error');
  }
  return result;
}

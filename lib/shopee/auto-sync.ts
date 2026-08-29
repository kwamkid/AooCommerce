import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow, isShopeeQuotaBlocked } from '@/lib/shopee/api';
import type { QuotaTarget } from '@/lib/marketplace/quota';
import { resolveAccountWarehouseId } from '@/lib/marketplace/warehouse';
import { pushStockToShopee, pushPriceToShopee, pushInfoToShopee, pushCategoryToShopee } from '@/lib/shopee/product-sync';
import { logIntegration } from '@/lib/integration-logger';
import { parallelLimit } from '@/lib/parallel';

/**
 * โควตาของ scope นั้นหมดแล้ว = ยิงไปก็ fail ทุกตัว (Shopee นับ success rate จาก call จริง)
 * — งาน push เป็นงานเบื้องหลัง เลื่อนไปรอบหน้าได้ ไม่ต้องเผาโควตา/คะแนนทิ้ง
 *
 * scope ของ push: update_stock/update_price = `inventory` · update_item = `product`
 * (ตาราง path→scope อยู่ lib/marketplace/platforms.ts)
 */
async function quotaBlocked(scope: QuotaTarget, what: string): Promise<boolean> {
  const { blocked, until } = await isShopeeQuotaBlocked(scope);
  if (blocked) {
    console.warn(`[Shopee Auto-Sync] ข้าม ${what} — โควตา scope "${scope}" เต็มถึง ${until}`);
  }
  return blocked;
}

/**
 * Fire-and-forget: trigger stock sync to Shopee for variation(s).
 * Checks account-level auto_sync_stock flag before pushing.
 *
 * ⚠️ **ใน route handler ให้ใช้ `after(() => syncStockNow(ids))` แทน** — งานที่ปล่อยลอย
 * แบบนี้จะถูก Vercel freeze ทิ้งทันทีที่ response ออก (สาเหตุที่ push stock ตายเงียบ
 * ตั้งแต่ พ.ค. 2026 ดู fix-bug.md 2026-08-29) · ตัวนี้เหลือไว้ให้ที่ที่ไม่มี request context
 */
export function triggerShopeeStockSync(variationIds: string[]): void {
  if (!variationIds || variationIds.length === 0) return;
  syncStockNow(variationIds).catch(err => {
    console.error('[Shopee Auto-Sync] Stock sync error:', err);
  });
}

/**
 * ส่งยอดสต็อกขึ้นร้าน Shopee ที่ผูกกับ variation เหล่านี้
 *
 * @param changedWarehouseIds คลังที่เพิ่งเปลี่ยนจริง — ส่งมาแล้วจะข้ามร้านที่ใช้คลังอื่น
 *   เพราะยอดของร้านนั้นไม่ได้ขยับ ยิงไปก็ส่งเลขเดิม เผาโควตาเปล่า ๆ
 *   (สำคัญขึ้นมากตั้งแต่แต่ละร้านเลือกคลังเองได้ — ขายที่สาขาไม่ควรไปกวนร้านที่แพ็คจากคลังกลาง)
 *   ไม่ส่ง = ยิงทุกร้านเหมือนเดิม (call site เก่าที่ยังไม่รู้คลัง)
 */
export async function syncStockNow(variationIds: string[], changedWarehouseIds?: (string | null | undefined)[]): Promise<void> {
  if (await quotaBlocked('inventory', 'stock sync')) return;
  const changed = (changedWarehouseIds || []).filter(Boolean) as string[];

  const { data: links } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id, account_id')
    .in('variation_id', variationIds)
    .eq('sync_enabled', true)
    .eq('platform', 'shopee');

  if (!links || links.length === 0) return;

  const seen = new Set<string>();
  const uniquePairs: { product_id: string; account_id: string }[] = [];
  for (const link of links) {
    const key = `${link.product_id}:${link.account_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniquePairs.push({ product_id: link.product_id, account_id: link.account_id });
    }
  }

  // Process all pairs in parallel (5 concurrent)
  await parallelLimit(uniquePairs, async ({ product_id, account_id }) => {
    try {
      const { data: account } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', account_id)
        .eq('is_active', true)
        .single();

      if (!account) return;
      // Check account-level toggle
      if (account.auto_sync_stock === false) return;

      // ร้านนี้แพ็คจากคลังที่ไม่ได้ขยับ → ยอดเท่าเดิม ไม่ต้องยิง
      if (changed.length > 0) {
        const accountWarehouseId = await resolveAccountWarehouseId(account);
        if (accountWarehouseId && !changed.includes(accountWarehouseId)) return;
      }

      const startMs = Date.now();
      const result = await pushStockToShopee(account as ShopeeAccountRow, product_id);
      const durationMs = Date.now() - startMs;

      logIntegration({
        company_id: account.company_id,
        integration: 'shopee',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'outgoing',
        action: 'auto_push_stock',
        method: 'POST',
        api_path: '/api/v2/product/update_stock',
        request_body: { product_id, trigger: 'auto_sync' },
        response_body: result,
        status: result.success ? 'success' : 'error',
        error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
        duration_ms: durationMs,
      });

      console.log(`[Shopee Auto-Sync] Stock pushed for product ${product_id} to account ${account_id}: success=${result.success}`);
    } catch (err) {
      console.error(`[Shopee Auto-Sync] Stock push failed for product ${product_id}:`, err);
    }
  }, 5);
}

/**
 * Fire-and-forget: trigger price sync to Shopee for a product.
 * Checks account-level auto_sync_product_info flag before pushing.
 */
export function triggerShopeePriceSync(productId: string): void {
  if (!productId) return;
  syncPriceNow(productId).catch(err => {
    console.error('[Shopee Auto-Sync] Price sync error:', err);
  });
}

export async function syncPriceNow(productId: string): Promise<void> {
  if (await quotaBlocked('inventory', 'price sync')) return;

  const { data: links } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('account_id')
    .eq('product_id', productId)
    .eq('sync_enabled', true)
    .eq('platform', 'shopee');

  if (!links || links.length === 0) return;

  const uniqueAccountIds = [...new Set(links.map(l => l.account_id))];

  // Process all accounts in parallel (5 concurrent)
  await parallelLimit(uniqueAccountIds, async (accountId) => {
    try {
      const { data: account } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('is_active', true)
        .single();

      if (!account) return;
      // Check account-level toggle
      if (account.auto_sync_product_info === false) return;

      const startMs = Date.now();
      const result = await pushPriceToShopee(account as ShopeeAccountRow, productId);
      const durationMs = Date.now() - startMs;

      logIntegration({
        company_id: account.company_id,
        integration: 'shopee',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'outgoing',
        action: 'auto_push_price',
        method: 'POST',
        api_path: '/api/v2/product/update_price',
        request_body: { product_id: productId, trigger: 'auto_sync' },
        response_body: result,
        status: result.success ? 'success' : 'error',
        error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
        duration_ms: durationMs,
      });

      console.log(`[Shopee Auto-Sync] Price pushed for product ${productId} to account ${accountId}: success=${result.success}`);
    } catch (err) {
      console.error(`[Shopee Auto-Sync] Price push failed for product ${productId}:`, err);
    }
  }, 5);
}

/**
 * Fire-and-forget: trigger product info (name) sync to Shopee for a product.
 * Checks account-level auto_sync_product_info flag before pushing.
 */
export function triggerShopeeInfoSync(productId: string, productName: string): void {
  if (!productId || !productName) return;
  syncInfoNow(productId, productName).catch(err => {
    console.error('[Shopee Auto-Sync] Info sync error:', err);
  });
}

export async function syncInfoNow(productId: string, productName: string): Promise<void> {
  if (await quotaBlocked('product', 'info sync')) return;

  const { data: links } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('account_id, external_item_id')
    .eq('product_id', productId)
    .eq('sync_enabled', true)
    .eq('platform', 'shopee');

  if (!links || links.length === 0) return;

  // Deduplicate by (account_id, external_item_id)
  const seen = new Set<string>();
  const uniqueItems: { account_id: string; external_item_id: string }[] = [];
  for (const link of links) {
    const key = `${link.account_id}:${link.external_item_id}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueItems.push({ account_id: link.account_id, external_item_id: link.external_item_id });
    }
  }

  // Process all items in parallel (5 concurrent)
  await parallelLimit(uniqueItems, async ({ account_id, external_item_id }) => {
    try {
      const { data: account } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', account_id)
        .eq('is_active', true)
        .single();

      if (!account) return;
      if (account.auto_sync_product_info === false) return;

      const startMs = Date.now();
      const result = await pushInfoToShopee(account as ShopeeAccountRow, parseInt(external_item_id), productName);
      const durationMs = Date.now() - startMs;

      logIntegration({
        company_id: account.company_id,
        integration: 'shopee',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'outgoing',
        action: 'auto_push_info',
        method: 'POST',
        api_path: '/api/v2/product/update_item',
        request_body: { product_id: productId, item_name: productName, trigger: 'auto_sync' },
        response_body: result,
        status: result.success ? 'success' : 'error',
        error_message: result.error || undefined,
        duration_ms: durationMs,
      });

      console.log(`[Shopee Auto-Sync] Info pushed for item ${external_item_id} to account ${account_id}: success=${result.success}`);
    } catch (err) {
      console.error(`[Shopee Auto-Sync] Info push failed for product ${productId}:`, err);
    }
  }, 5);
}

/**
 * Fire-and-forget: trigger category sync to Shopee for a specific link.
 * Fetches mandatory attributes and fills N/A defaults.
 */
export function triggerShopeeCategorySync(linkId: string, categoryId: number | string): void {
  if (!linkId || !categoryId) return;
  const numericId = Number(categoryId);
  if (!Number.isFinite(numericId) || numericId <= 0) return;
  syncCategoryNow(linkId, numericId).catch(err => {
    console.error('[Shopee Auto-Sync] Category sync error:', err);
  });
}

export async function syncCategoryNow(linkId: string, categoryId: number): Promise<void> {
  if (await quotaBlocked('product', 'category sync')) return;

  const { data: link } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('account_id, external_item_id, company_id, product_id')
    .eq('id', linkId)
    .eq('sync_enabled', true)
    .eq('platform', 'shopee')
    .single();

  if (!link) return;

  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', link.account_id)
    .eq('is_active', true)
    .single();

  if (!account) return;
  if (account.auto_sync_product_info === false) return;

  const startMs = Date.now();
  const result = await pushCategoryToShopee(
    account as ShopeeAccountRow,
    parseInt(link.external_item_id),
    categoryId,
    linkId,
    link.company_id
  );
  const durationMs = Date.now() - startMs;

  logIntegration({
    company_id: account.company_id,
    integration: 'shopee',
    account_id: account.id,
    account_name: account.shop_name,
    direction: 'outgoing',
    action: 'auto_push_category',
    method: 'POST',
    api_path: '/api/v2/product/update_item',
    request_body: { link_id: linkId, category_id: categoryId, trigger: 'auto_sync' },
    response_body: result,
    status: result.success ? 'success' : 'error',
    error_message: result.error || undefined,
    duration_ms: durationMs,
  });

  console.log(`[Shopee Auto-Sync] Category pushed for item ${link.external_item_id}: category=${categoryId} success=${result.success}`);
}

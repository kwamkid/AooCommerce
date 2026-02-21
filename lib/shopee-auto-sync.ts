import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee-api';
import { pushStockToShopee, pushPriceToShopee, pushInfoToShopee } from '@/lib/shopee-product-sync';
import { logIntegration } from '@/lib/integration-logger';

/**
 * Fire-and-forget: trigger stock sync to Shopee for variation(s).
 * Checks account-level auto_sync_stock flag before pushing.
 */
export function triggerShopeeStockSync(variationIds: string[]): void {
  if (!variationIds || variationIds.length === 0) return;
  _doStockSync(variationIds).catch(err => {
    console.error('[Shopee Auto-Sync] Stock sync error:', err);
  });
}

async function _doStockSync(variationIds: string[]): Promise<void> {
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

  for (const { product_id, account_id } of uniquePairs) {
    try {
      const { data: account } = await supabaseAdmin
        .from('shopee_accounts')
        .select('*')
        .eq('id', account_id)
        .eq('is_active', true)
        .single();

      if (!account) continue;
      // Check account-level toggle
      if (account.auto_sync_stock === false) continue;

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
  }
}

/**
 * Fire-and-forget: trigger price sync to Shopee for a product.
 * Checks account-level auto_sync_product_info flag before pushing.
 */
export function triggerShopeePriceSync(productId: string): void {
  if (!productId) return;
  _doPriceSync(productId).catch(err => {
    console.error('[Shopee Auto-Sync] Price sync error:', err);
  });
}

async function _doPriceSync(productId: string): Promise<void> {
  const { data: links } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('account_id')
    .eq('product_id', productId)
    .eq('sync_enabled', true)
    .eq('platform', 'shopee');

  if (!links || links.length === 0) return;

  const uniqueAccountIds = [...new Set(links.map(l => l.account_id))];

  for (const accountId of uniqueAccountIds) {
    try {
      const { data: account } = await supabaseAdmin
        .from('shopee_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('is_active', true)
        .single();

      if (!account) continue;
      // Check account-level toggle
      if (account.auto_sync_product_info === false) continue;

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
  }
}

/**
 * Fire-and-forget: trigger product info (name) sync to Shopee for a product.
 * Checks account-level auto_sync_product_info flag before pushing.
 */
export function triggerShopeeInfoSync(productId: string, productName: string): void {
  if (!productId || !productName) return;
  _doInfoSync(productId, productName).catch(err => {
    console.error('[Shopee Auto-Sync] Info sync error:', err);
  });
}

async function _doInfoSync(productId: string, productName: string): Promise<void> {
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

  for (const { account_id, external_item_id } of uniqueItems) {
    try {
      const { data: account } = await supabaseAdmin
        .from('shopee_accounts')
        .select('*')
        .eq('id', account_id)
        .eq('is_active', true)
        .single();

      if (!account) continue;
      if (account.auto_sync_product_info === false) continue;

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
  }
}

import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee-api';
import { pushStockToShopee, pushPriceToShopee } from '@/lib/shopee-product-sync';
import { logIntegration } from '@/lib/integration-logger';

/**
 * Fire-and-forget: trigger stock sync to Shopee for variation(s).
 * Looks up marketplace_product_links for these variation_ids where sync_enabled=true.
 * For each linked account, calls pushStockToShopee.
 * Does NOT block the caller — errors are logged silently.
 */
export function triggerShopeeStockSync(variationIds: string[]): void {
  if (!variationIds || variationIds.length === 0) return;
  _doStockSync(variationIds).catch(err => {
    console.error('[Shopee Auto-Sync] Stock sync error:', err);
  });
}

async function _doStockSync(variationIds: string[]): Promise<void> {
  // Find all marketplace links for these variations with sync enabled
  const { data: links } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id, account_id')
    .in('variation_id', variationIds)
    .eq('sync_enabled', true)
    .eq('platform', 'shopee');

  if (!links || links.length === 0) return;

  // Deduplicate by (product_id, account_id)
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
 * Called when platform_price or default_price changes.
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

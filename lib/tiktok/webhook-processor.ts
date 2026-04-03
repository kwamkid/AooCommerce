import { supabaseAdmin } from '@/lib/supabase-admin';
import { TikTokAccountRow, ensureValidToken } from '@/lib/tiktok/api';
import { syncOrdersByIds, SyncResult } from '@/lib/tiktok/sync';
import { logIntegration } from '@/lib/integration-logger';

/**
 * Sync a single TikTok order (used by webhook handler and retry worker).
 * Implements dedup: skips if already synced within 10s with same status.
 */
export async function syncSingleOrder(
  account: TikTokAccountRow,
  orderId: string,
  webhookStatus?: string
): Promise<SyncResult> {
  const companyId = account.company_id;

  // Dedup: check if we already synced this order recently
  const tenSecondsAgo = new Date(Date.now() - 10_000).toISOString();
  const { data: recentSync } = await supabaseAdmin
    .from('marketplace_sync_log')
    .select('id')
    .eq('marketplace_account_id', account.id)
    .eq('sync_type', 'webhook')
    .gte('created_at', tenSecondsAgo)
    .limit(1)
    .maybeSingle();

  // Check if order was synced with same status recently
  if (recentSync) {
    const { data: existingOrder } = await supabaseAdmin
      .from('orders')
      .select('external_status')
      .eq('company_id', companyId)
      .eq('source', 'tiktok')
      .eq('external_order_sn', orderId)
      .single();

    if (existingOrder?.external_status === webhookStatus) {
      console.log(`[TikTok Webhook] Skipping duplicate sync for ${orderId} (status=${webhookStatus})`);
      return { orders_created: 0, orders_updated: 0, orders_skipped: 1, products_created: 0, customers_created: 0, errors: [] };
    }
  }

  // Create sync log entry
  const { data: syncLog } = await supabaseAdmin
    .from('marketplace_sync_log')
    .insert({
      marketplace_account_id: account.id,
      company_id: companyId,
      platform: 'tiktok',
      sync_type: 'webhook',
    })
    .select('id')
    .single();

  // Build webhook status hint
  const webhookStatusHint = webhookStatus ? { [orderId]: webhookStatus } : undefined;

  // Sync the order
  const result = await syncOrdersByIds(account, [orderId], undefined, webhookStatusHint);

  // Update sync log
  if (syncLog) {
    await supabaseAdmin
      .from('marketplace_sync_log')
      .update({
        orders_fetched: 1,
        orders_created: result.orders_created,
        orders_updated: result.orders_updated,
        errors: result.errors.length > 0 ? result.errors : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLog.id);
  }

  // Log to integration_logs
  logIntegration({
    company_id: companyId,
    integration: 'tiktok',
    account_id: account.id,
    account_name: account.shop_name,
    direction: 'incoming',
    action: 'webhook_order_sync',
    status: result.errors.length > 0 ? 'error' : 'success',
    error_message: result.errors[0] || undefined,
    reference_type: 'order',
    reference_id: orderId,
    reference_label: `Order ${orderId}: ${webhookStatus || 'unknown'}`,
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0]);
  }

  return result;
}

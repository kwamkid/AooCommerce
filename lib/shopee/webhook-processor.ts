import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow, isShopeeQuotaBlocked } from '@/lib/shopee/api';
import { logIntegration } from '@/lib/integration-logger';

/**
 * Sync a single Shopee order by order_sn.
 * Shared by webhook handler and retry queue worker.
 */
export async function syncSingleOrder(account: ShopeeAccountRow, orderSn: string, webhookStatus?: string) {
  // Circuit breaker: โควตารายวันหมด — fail เร็วโดยไม่ยิง API (retry worker จะเก็บหลังเที่ยงคืน UTC+8)
  {
    const quota = await isShopeeQuotaBlocked('order');
    if (quota.blocked) {
      throw new Error(`Shopee daily quota exhausted — deferred until ${quota.until}`);
    }
  }
  const { syncOrdersByOrderSn } = await import('@/lib/shopee/sync');

  // Dedup: skip only if this exact order was updated within 10s AND already has the correct status
  if (webhookStatus) {
    const { data: existingOrder } = await supabaseAdmin
      .from('orders')
      .select('id, external_status, updated_at')
      .eq('company_id', account.company_id)
      .eq('external_order_sn', orderSn)
      .gte('updated_at', new Date(Date.now() - 10_000).toISOString())
      .maybeSingle();

    if (existingOrder && existingOrder.external_status === webhookStatus) {
      console.log(`[Shopee Webhook] Skipping duplicate sync for ${orderSn} — already ${webhookStatus}`);
      return;
    }
  }

  // Create sync log entry (before sync, so we can track failures)
  const { data: log } = await supabaseAdmin
    .from('marketplace_sync_log')
    .insert({
      marketplace_account_id: account.id,
      company_id: account.company_id,
      sync_type: 'webhook',
    })
    .select()
    .single();

  try {
    const webhookStatusHint = webhookStatus ? { [orderSn]: webhookStatus } : undefined;
    const result = await syncOrdersByOrderSn(account, [orderSn], undefined, webhookStatusHint);

    // Update sync log with results
    if (log) {
      await supabaseAdmin
        .from('marketplace_sync_log')
        .update({
          orders_fetched: 1,
          orders_created: result.orders_created,
          orders_updated: result.orders_updated,
          errors: result.errors.length > 0 ? result.errors : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', log.id);
    }

    // Log sync error to integration_logs for UI visibility
    if (result.errors.length > 0) {
      logIntegration({
        company_id: account.company_id,
        integration: 'shopee',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'incoming',
        action: 'webhook_sync_error',
        method: 'POST',
        api_path: '/api/shopee/webhook',
        status: 'error',
        error_message: result.errors.join('; '),
        reference_type: 'order',
        reference_id: orderSn,
        reference_label: `Sync failed: ${orderSn}`,
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown sync error';
    if (log) {
      await supabaseAdmin
        .from('marketplace_sync_log')
        .update({
          orders_fetched: 1,
          errors: [errorMsg],
          completed_at: new Date().toISOString(),
        })
        .eq('id', log.id);
    }

    logIntegration({
      company_id: account.company_id,
      integration: 'shopee',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'incoming',
      action: 'webhook_sync_error',
      method: 'POST',
      api_path: '/api/shopee/webhook',
      status: 'error',
      error_message: errorMsg,
      reference_type: 'order',
      reference_id: orderSn,
      reference_label: `Sync failed: ${orderSn}`,
    });

    throw err;
  }
}

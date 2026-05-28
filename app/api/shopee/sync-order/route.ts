import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee/api';
import { syncOrdersByOrderSn, syncOrdersByTimeRange } from '@/lib/shopee/sync';
import { logIntegration } from '@/lib/integration-logger';

/**
 * POST /api/shopee/sync-order
 * Re-sync a specific Shopee order by order_sn.
 * Falls back to time-range sync if direct order fetch fails.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.sync')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { order_sn, marketplace_account_id } = body;

  if (!order_sn) {
    return NextResponse.json({ error: 'Missing order_sn' }, { status: 400 });
  }

  // Find the Shopee account
  let accountQuery = supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (marketplace_account_id) {
    accountQuery = accountQuery.eq('id', marketplace_account_id);
  }

  const { data: account, error: accError } = await accountQuery.limit(1).single();

  if (accError || !account) {
    return NextResponse.json({ error: 'Shopee account not found' }, { status: 404 });
  }

  try {
    // Create sync log
    const { data: log } = await supabaseAdmin
      .from('marketplace_sync_log')
      .insert({
        marketplace_account_id: account.id,
        company_id: companyId,
        sync_type: 'webhook',
      })
      .select()
      .single();

    // Try 1: Direct order fetch by order_sn
    let result = await syncOrdersByOrderSn(account as ShopeeAccountRow, [order_sn]);

    // Try 2: If direct fetch failed (not_found), fallback to time-range sync
    // This catches cases where get_order_detail fails but get_order_list works
    if (result.orders_created === 0 && result.orders_updated === 0 && result.errors.length > 0) {
      console.log(`[Shopee Sync-Order] Direct fetch failed for ${order_sn}, trying time-range fallback...`);

      // Search last 7 days of orders
      const now = Math.floor(Date.now() / 1000);
      const sevenDaysAgo = now - 7 * 24 * 60 * 60;
      const fallbackResult = await syncOrdersByTimeRange(account as ShopeeAccountRow, sevenDaysAgo, now);

      // Check if the order was created by the fallback
      const { data: orderExists } = await supabaseAdmin
        .from('orders')
        .select('id')
        .eq('company_id', companyId)
        .eq('external_order_sn', order_sn)
        .maybeSingle();

      if (orderExists) {
        result = {
          orders_created: 1,
          orders_updated: 0,
          orders_skipped: 0,
          products_created: fallbackResult.products_created,
          customers_created: fallbackResult.customers_created,
          errors: [],
        };
      } else {
        // Append fallback info to errors
        result.errors.push(`Fallback sync: ${fallbackResult.orders_created} created, ${fallbackResult.orders_updated} updated, but order ${order_sn} still not found`);
      }
    }

    // Update sync log
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

    // Log to integration_logs for Shopee Log page visibility
    const hasErrors = result.errors.length > 0;
    logIntegration({
      company_id: companyId,
      integration: 'shopee',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'incoming',
      action: 'resync_order',
      method: 'POST',
      api_path: '/api/v2/order/get_order_detail',
      request_body: { order_sn },
      response_body: {
        orders_created: result.orders_created,
        orders_updated: result.orders_updated,
        orders_skipped: result.orders_skipped,
        errors: result.errors,
      },
      status: hasErrors ? 'error' : 'success',
      error_message: hasErrors ? result.errors.join('; ') : undefined,
      reference_type: 'order',
      reference_id: order_sn,
      reference_label: order_sn,
    });

    return NextResponse.json({
      success: true,
      orders_created: result.orders_created,
      orders_updated: result.orders_updated,
      orders_skipped: result.orders_skipped,
      errors: result.errors,
    });
  } catch (err) {
    // Log error to integration_logs
    logIntegration({
      company_id: companyId,
      integration: 'shopee',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'incoming',
      action: 'resync_order',
      method: 'POST',
      api_path: '/api/v2/order/get_order_detail',
      request_body: { order_sn },
      status: 'error',
      error_message: err instanceof Error ? err.message : 'Sync failed',
      reference_type: 'order',
      reference_id: order_sn,
      reference_label: order_sn,
    });
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'Sync failed',
    }, { status: 500 });
  }
}

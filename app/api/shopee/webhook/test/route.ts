import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee-api';
import { logIntegration } from '@/lib/integration-logger';

/**
 * PATCH /api/shopee/webhook/test?account_id=xxx&webhook_shop_id=123
 *
 * Save the real webhook shop_id to metadata for accounts where
 * Shopee uses a different shop_id in webhooks vs OAuth.
 */
export async function PATCH(request: NextRequest) {
  const testKey = request.headers.get('x-test-key');
  if (testKey !== process.env.SHOPEE_PARTNER_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('account_id');
  const webhookShopId = parseInt(searchParams.get('webhook_shop_id') || '0');

  if (!accountId || !webhookShopId) {
    return NextResponse.json({ error: 'Missing account_id or webhook_shop_id' }, { status: 400 });
  }

  // Get current account
  const { data: account } = await supabaseAdmin
    .from('shopee_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Update metadata with webhook_shop_id
  const metadata = { ...(account.metadata || {}), webhook_shop_id: webhookShopId };
  await supabaseAdmin
    .from('shopee_accounts')
    .update({ metadata })
    .eq('id', accountId);

  return NextResponse.json({
    success: true,
    message: `Updated ${account.shop_name}: webhook_shop_id = ${webhookShopId}`,
    account_id: accountId,
    shop_id: account.shop_id,
    webhook_shop_id: webhookShopId,
  });
}

/**
 * POST /api/shopee/webhook/test
 *
 * Debug endpoint: runs the same logic as the real webhook handler
 * but returns detailed debug info instead of empty 200.
 */
export async function POST(request: NextRequest) {
  // Auth check
  const testKey = request.headers.get('x-test-key');
  if (testKey !== process.env.SHOPEE_PARTNER_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const steps: string[] = [];

  try {
    const rawBody = await request.text();
    steps.push('1. Body received: ' + rawBody.substring(0, 100) + '...');

    let payload: { shop_id?: number; code?: number; data?: Record<string, unknown> };
    try {
      payload = JSON.parse(rawBody);
      steps.push('2. JSON parsed OK');
    } catch {
      steps.push('2. FAILED: JSON parse error');
      return NextResponse.json({ steps });
    }

    const shopId = payload.shop_id;
    if (!shopId) {
      steps.push('3. FAILED: no shop_id in payload');
      return NextResponse.json({ steps });
    }
    steps.push(`3. shop_id = ${shopId}`);

    // Look up account
    const { data: account, error: accountError } = await supabaseAdmin
      .from('shopee_accounts')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .single();

    if (!account) {
      steps.push(`4. FAILED: no account found for shop_id ${shopId}. Error: ${JSON.stringify(accountError)}`);

      // Also check without is_active filter
      const { data: anyAccount } = await supabaseAdmin
        .from('shopee_accounts')
        .select('id, shop_id, shop_name, is_active')
        .eq('shop_id', shopId)
        .single();

      if (anyAccount) {
        steps.push(`   Found inactive account: ${JSON.stringify(anyAccount)}`);
      } else {
        // List all accounts for debugging
        const { data: allAccounts } = await supabaseAdmin
          .from('shopee_accounts')
          .select('id, shop_id, shop_name, is_active')
          .limit(10);
        steps.push(`   All accounts: ${JSON.stringify(allAccounts)}`);
      }
      return NextResponse.json({ steps });
    }
    steps.push(`4. Account found: ${account.shop_name} (${account.id}), company_id: ${account.company_id}`);

    // Check code
    if (payload.code !== 3) {
      steps.push(`5. SKIPPED: code=${payload.code}, not order_status_push (3)`);
      return NextResponse.json({ steps });
    }
    steps.push('5. code=3 (order_status_push) OK');

    const orderSn = payload.data?.ordersn as string;
    if (!orderSn) {
      steps.push('6. FAILED: no ordersn in data');
      return NextResponse.json({ steps });
    }
    steps.push(`6. orderSn = ${orderSn}`);

    // Log integration
    steps.push('7. Calling logIntegration...');
    await logIntegration({
      company_id: account.company_id,
      integration: 'shopee',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'incoming',
      action: 'webhook_order_status',
      method: 'POST',
      api_path: '/api/shopee/webhook/test',
      request_body: payload,
      status: 'success',
      reference_type: 'order',
      reference_id: orderSn,
      reference_label: `Order ${orderSn} (TEST)`,
    });
    steps.push('7. logIntegration called OK');

    // Sync order
    steps.push('8. Starting syncSingleOrder...');
    try {
      const { syncOrdersByOrderSn } = await import('@/lib/shopee-sync');

      const { data: log } = await supabaseAdmin
        .from('shopee_sync_log')
        .insert({
          shopee_account_id: account.id,
          company_id: account.company_id,
          sync_type: 'webhook',
        })
        .select()
        .single();

      const result = await syncOrdersByOrderSn(account as ShopeeAccountRow, [orderSn]);

      if (log) {
        await supabaseAdmin
          .from('shopee_sync_log')
          .update({
            orders_fetched: 1,
            orders_created: result.orders_created,
            orders_updated: result.orders_updated,
            errors: result.errors.length > 0 ? result.errors : null,
            completed_at: new Date().toISOString(),
          })
          .eq('id', log.id);
      }

      steps.push(`8. Sync complete: created=${result.orders_created}, updated=${result.orders_updated}, errors=${JSON.stringify(result.errors)}`);
    } catch (syncErr) {
      steps.push(`8. SYNC ERROR: ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`);
    }

    return NextResponse.json({ success: true, steps });
  } catch (error) {
    steps.push(`FATAL ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return NextResponse.json({ steps }, { status: 500 });
  }
}

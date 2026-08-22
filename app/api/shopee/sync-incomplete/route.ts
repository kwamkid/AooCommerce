import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow, isShopeeQuotaBlocked } from '@/lib/shopee/api';
import { syncIncompleteOrders } from '@/lib/shopee/sync';
import { logIntegration } from '@/lib/integration-logger';

export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.sync')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { marketplace_account_id } = body;

  if (!marketplace_account_id) {
    return NextResponse.json({ error: 'Missing marketplace_account_id' }, { status: 400 });
  }

  // Circuit breaker: โควตารายวันของ Shopee หมดแล้ว — ยิงต่อมีแต่ fail
  const quota = await isShopeeQuotaBlocked();
  if (quota.blocked) {
    return NextResponse.json({ error: `Shopee จำกัดโควตา API วันนี้แล้ว ระบบพักการยิงถึงเที่ยงคืน (UTC+8) เพื่อกู้ success rate` }, { status: 429 });
  }

  const { data: account, error: accError } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', marketplace_account_id)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .single();

  if (accError || !account) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
  }

  // SSE streaming response
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Create sync log
        const { data: log } = await supabaseAdmin
          .from('marketplace_sync_log')
          .insert({
            marketplace_account_id: account.id,
            company_id: companyId,
            sync_type: 'manual',
          })
          .select()
          .single();

        send({ type: 'started' });

        const startMs = Date.now();
        const result = await syncIncompleteOrders(
          account as ShopeeAccountRow,
          (event) => send({ type: 'progress', ...event })
        );
        const durationMs = Date.now() - startMs;

        // Update sync log
        if (log) {
          await supabaseAdmin
            .from('marketplace_sync_log')
            .update({
              orders_fetched: result.orders_created + result.orders_updated + result.orders_skipped,
              orders_created: result.orders_created,
              orders_updated: result.orders_updated,
              errors: result.errors.length > 0 ? result.errors : null,
              completed_at: new Date().toISOString(),
            })
            .eq('id', log.id);
        }

        // Integration log
        logIntegration({
          company_id: companyId,
          integration: 'shopee',
          account_id: account.id,
          account_name: account.shop_name,
          direction: 'outgoing',
          action: 'sync_incomplete_orders',
          method: 'POST',
          api_path: '/api/v2/order/get_order_detail',
          response_body: {
            orders_fetched: result.orders_created + result.orders_updated + result.orders_skipped,
            orders_created: result.orders_created,
            orders_updated: result.orders_updated,
            errors: result.errors,
          },
          status: result.errors.length > 0 ? 'error' : 'success',
          error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
          duration_ms: durationMs,
        });

        send({ type: 'done', success: true, ...result });
      } catch (error) {
        console.error('Shopee sync-incomplete error:', error);
        send({ type: 'error', message: 'Sync failed' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

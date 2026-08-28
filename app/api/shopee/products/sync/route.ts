import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow, isShopeeQuotaBlocked } from '@/lib/shopee/api';
import { syncProductsFromShopee } from '@/lib/shopee/product-sync';
import { logIntegration } from '@/lib/integration-logger';

export async function POST(request: NextRequest) {
  // Auth + validation (must happen before streaming)
  // Dual-mode เหมือน cron routes อื่น: CRON_SECRET (งาน ops/backfill ภายใน)
  // หรือ user auth + marketplace.sync ตามปกติ
  const cronSecret = process.env.CRON_SECRET;
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const isCron = !!cronSecret
    && (bearer === cronSecret || request.headers.get('x-cron-secret') === cronSecret);

  let companyId: string | null = null;
  if (!isCron) {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !can(auth.companyRoles, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    companyId = auth.companyId;
  }

  const { marketplace_account_id } = await request.json();
  if (!marketplace_account_id) {
    return NextResponse.json({ error: 'Missing marketplace_account_id' }, { status: 400 });
  }

  let accountQuery = supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', marketplace_account_id)
    .eq('is_active', true);
  if (companyId) accountQuery = accountQuery.eq('company_id', companyId);
  // Circuit breaker: โควตารายวันของ Shopee หมดแล้ว — ยิงต่อมีแต่ fail
  const quota = await isShopeeQuotaBlocked('product');
  if (quota.blocked) {
    return NextResponse.json({ error: `Shopee จำกัดโควตา API วันนี้แล้ว ระบบพักการยิงถึงเที่ยงคืน (UTC+8) เพื่อกู้ success rate` }, { status: 429 });
  }

  const { data: account, error: accError } = await accountQuery.single();

  if (accError || !account) {
    return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
  }
  const resolvedCompanyId: string = companyId ?? account.company_id;

  // SSE streaming response
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: 'started' });

        const startMs = Date.now();
        const result = await syncProductsFromShopee(
          account as ShopeeAccountRow,
          (event) => send({ type: 'progress', ...event })
        );
        const durationMs = Date.now() - startMs;

        logIntegration({
          company_id: resolvedCompanyId,
          integration: 'shopee',
          account_id: account.id,
          account_name: account.shop_name,
          direction: 'outgoing',
          action: 'sync_products',
          method: 'GET',
          api_path: '/api/v2/product/get_item_list',
          response_body: {
            products_created: result.products_created,
            products_updated: result.products_updated,
            products_skipped: result.products_skipped,
            links_created: result.links_created,
            errors: result.errors,
          },
          status: result.errors.length > 0 ? 'error' : 'success',
          error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
          duration_ms: durationMs,
        });

        send({ type: 'done', success: true, ...result });
      } catch (error) {
        console.error('Shopee product sync error:', error);
        send({ type: 'error', message: 'Product sync failed' });
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

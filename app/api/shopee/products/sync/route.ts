import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee-api';
import { syncProductsFromShopee } from '@/lib/shopee-product-sync';
import { logIntegration } from '@/lib/integration-logger';

export async function POST(request: NextRequest) {
  // Auth + validation (must happen before streaming)
  const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !isAdminRole(companyRole)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { shopee_account_id } = await request.json();
  if (!shopee_account_id) {
    return NextResponse.json({ error: 'Missing shopee_account_id' }, { status: 400 });
  }

  const { data: account, error: accError } = await supabaseAdmin
    .from('shopee_accounts')
    .select('*')
    .eq('id', shopee_account_id)
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
        send({ type: 'started' });

        const startMs = Date.now();
        const result = await syncProductsFromShopee(
          account as ShopeeAccountRow,
          (event) => send({ type: 'progress', ...event })
        );
        const durationMs = Date.now() - startMs;

        logIntegration({
          company_id: companyId,
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

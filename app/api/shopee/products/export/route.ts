import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee-api';
import { exportProductToShopee, exportBulkToShopee, ExportOptions } from '@/lib/shopee-product-export';

/**
 * POST /api/shopee/products/export
 * Body: {
 *   product_ids: string[],
 *   shopee_account_id: string,
 *   shopee_category_id?: number,       // shared fallback (used for single export)
 *   weight?: number,                   // shared fallback
 *   per_product_options?: Record<string, { shopee_category_id: number, shopee_category_name?: string, weight?: number }>
 *   mode?: 'json' | 'stream'          // default: 'stream' (SSE) for bulk modal, 'json' for single modal
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { product_ids, shopee_account_id, shopee_category_id, shopee_category_name, weight, per_product_options, mode } = body;

    if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return NextResponse.json({ error: 'product_ids is required' }, { status: 400 });
    }
    if (!shopee_account_id) {
      return NextResponse.json({ error: 'shopee_account_id is required' }, { status: 400 });
    }

    // Validate: need either shared category or per-product options
    if (!shopee_category_id && !per_product_options) {
      return NextResponse.json({ error: 'shopee_category_id or per_product_options is required' }, { status: 400 });
    }

    // Fetch account
    const { data: account, error: accErr } = await supabaseAdmin
      .from('shopee_accounts')
      .select('*')
      .eq('id', shopee_account_id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    if (accErr || !account) {
      return NextResponse.json({ error: 'Shopee account not found' }, { status: 404 });
    }

    const sharedOptions: ExportOptions = {
      shopee_category_id: shopee_category_id || 0,
      shopee_category_name: shopee_category_name || '',
      weight,
    };
    const companyId = auth.companyId!;

    // JSON mode — used by ShopeeExportModal (single product page)
    if (mode === 'json' && product_ids.length === 1) {
      const productOptions: ExportOptions = per_product_options?.[product_ids[0]]
        ? {
            shopee_category_id: per_product_options[product_ids[0]].shopee_category_id,
            shopee_category_name: per_product_options[product_ids[0]].shopee_category_name || '',
            weight: per_product_options[product_ids[0]].weight,
          }
        : sharedOptions;

      const result = await exportProductToShopee(
        account as ShopeeAccountRow,
        product_ids[0],
        companyId,
        productOptions
      );

      return NextResponse.json(result);
    }

    // Build per-product options map
    const perProductOpts: Record<string, ExportOptions> | undefined = per_product_options
      ? Object.fromEntries(
          Object.entries(per_product_options as Record<string, { shopee_category_id: number; shopee_category_name?: string; weight?: number }>).map(
            ([pid, opts]) => [pid, {
              shopee_category_id: opts.shopee_category_id,
              shopee_category_name: opts.shopee_category_name || '',
              weight: opts.weight,
            }]
          )
        )
      : undefined;

    // SSE stream — used by ShopeeBulkExportModal (works for 1 or many products)
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'started', total: product_ids.length });

        try {
          const result = await exportBulkToShopee(
            account as ShopeeAccountRow,
            product_ids,
            companyId,
            sharedOptions,
            (event) => send({ type: 'progress', ...event }),
            perProductOpts
          );

          send({
            type: 'done',
            success: true,
            total: result.total,
            success_count: result.success_count,
            error_count: result.error_count,
            results: result.results,
          });
        } catch (e) {
          send({
            type: 'error',
            message: e instanceof Error ? e.message : 'Unknown error',
          });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('POST shopee product export error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    );
  }
}

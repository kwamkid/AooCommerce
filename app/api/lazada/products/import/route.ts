import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import {
  ensureValidToken,
  getLazadaProducts,
  parseLazadaImages,
  type LazadaAccountRow,
} from '@/lib/lazada/api';
import { syncProductsFromLazada } from '@/lib/lazada/product-sync';
import { logIntegration } from '@/lib/integration-logger';

export const maxDuration = 300;

/** โหลด account + เช็คว่าเป็นของบริษัทนี้จริง */
async function loadAccount(accountId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .eq('platform', 'lazada')
    .eq('is_active', true)
    .single();
  if (error || !data) return null;
  return data as LazadaAccountRow;
}

/**
 * GET — พรีวิวสินค้าในร้าน Lazada (หน้าละ page_size) พร้อมบอกว่าตัวไหนผูกกับ
 * สินค้าในระบบเราแล้ว
 *
 * Lazada แบ่งหน้าด้วย offset ตรงๆ (ต่างจาก TikTok ที่ใช้ page_token) แต่ตันที่
 * offset 10000 ตามข้อจำกัดของ API
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !can(auth.companyRoles, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);
    const pageSize = Math.min(parseInt(searchParams.get('page_size') || '20'), 50);

    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    }

    const account = await loadAccount(accountId, auth.companyId);
    if (!account) {
      return NextResponse.json({ error: 'ไม่พบร้าน Lazada นี้' }, { status: 404 });
    }

    const creds = await ensureValidToken(account);
    const page = await getLazadaProducts(creds, { offset, limit: pageSize, filter: 'all' });
    if (page.error) {
      return NextResponse.json({ error: page.error }, { status: 502 });
    }
    if (page.products.length === 0) {
      return NextResponse.json({ items: [], total: page.total, offset, has_more: false });
    }

    // สินค้าที่ผูกไว้แล้ว (นับเฉพาะที่ product ยัง active)
    const { data: existingLinks } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('external_item_id, product_id, products!inner(name, is_active)')
      .eq('account_id', accountId)
      .in('external_item_id', page.products.map((p) => String(p.item_id)));

    const linkedMap = new Map<string, { product_id: string; name: string }>();
    for (const link of existingLinks || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const product = link.products as any;
      if (product?.is_active) {
        linkedMap.set(link.external_item_id, { product_id: link.product_id, name: product.name });
      }
    }

    const items = page.products.map((p) => {
      const linked = linkedMap.get(String(p.item_id));
      const skus = p.skus || [];
      const attrs = p.attributes || {};
      return {
        item_id: String(p.item_id),
        title: (typeof attrs.name === 'string' && attrs.name)
          || (typeof attrs.name_en === 'string' && attrs.name_en)
          || `Lazada ${p.item_id}`,
        status: p.status || null,
        image: parseLazadaImages(p.images)[0] || null,
        sku_count: skus.length,
        price: Number(skus[0]?.price || 0),
        has_variation: skus.length > 1 || Object.keys(skus[0]?.saleProp || {}).length > 0,
        linked_product_id: linked?.product_id || null,
        linked_product_name: linked?.name || null,
      };
    });

    return NextResponse.json({
      items,
      total: page.total,
      offset,
      has_more: offset + page.products.length < page.total,
    });
  } catch (error) {
    console.error('GET lazada product import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load Lazada products' },
      { status: 500 }
    );
  }
}

/**
 * POST — ดูดสินค้าทั้งร้านเข้าระบบ (SSE stream บอกความคืบหน้า)
 *
 * เหมือน TikTok: import ทั้งร้านรอบเดียว ไม่เลือกทีละตัว — ตัวที่ SKU ตรงกับของ
 * เดิมจะผูกให้อัตโนมัติ (ไม่สร้างซ้ำ) และของที่ user แก้เองใน aoo จะไม่ถูกเขียนทับ
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !can(auth.companyRoles, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const quota = await isQuotaBlocked('lazada');
    if (quota.blocked) {
      return NextResponse.json(
        { error: 'Lazada จำกัดความถี่ API ชั่วคราว — ระบบพักการยิงอยู่ ลองใหม่ภายหลัง' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { marketplace_account_id, copy_sku_to_barcode, start_offset } = body as {
      marketplace_account_id?: string;
      copy_sku_to_barcode?: boolean;
      start_offset?: number;
    };

    if (!marketplace_account_id) {
      return NextResponse.json({ error: 'marketplace_account_id is required' }, { status: 400 });
    }

    const companyId = auth.companyId;
    const account = await loadAccount(marketplace_account_id, companyId);
    if (!account) {
      return NextResponse.json({ error: 'ไม่พบร้าน Lazada นี้' }, { status: 404 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (data: object) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'started' });

        try {
          const result = await syncProductsFromLazada(
            account,
            (p) => send({ type: 'progress', ...p }),
            {
              copySkuToBarcode: !!copy_sku_to_barcode,
              startOffset: Math.max(Number(start_offset) || 0, 0),
            }
          );

          logIntegration({
            company_id: companyId,
            integration: 'lazada',
            account_id: account.id,
            account_name: account.shop_name,
            direction: 'outgoing',
            action: 'product_import',
            status: result.errors.length === 0 ? 'success' : 'error',
            reference_type: 'account',
            reference_id: String(account.shop_id),
            reference_label: `Lazada import: created ${result.products_created}, updated ${result.products_updated}`
              + (result.next_offset !== null ? ` (ค้างที่ ${result.next_offset} — มีรอบต่อ)` : ''),
            error_message: result.errors[0] || undefined,
            response_body: {
              created: result.products_created,
              updated: result.products_updated,
              skipped: result.products_skipped,
              links: result.links_created,
              errors: result.errors.length,
            },
          });

          send({ type: 'done', ...result });
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'Import failed' });
        }

        closed = true;
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
    console.error('POST lazada product import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}

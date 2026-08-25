import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { ensureValidToken, searchProducts, getProductDetail, type TikTokAccountRow } from '@/lib/tiktok/api';
import { syncProductsFromTikTok } from '@/lib/tiktok/product-sync';
import { logIntegration } from '@/lib/integration-logger';

/** โหลด account + เช็คว่าเป็นของบริษัทนี้จริง */
async function loadAccount(accountId: string, companyId: string) {
  const { data, error } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .eq('platform', 'tiktok')
    .eq('is_active', true)
    .single();
  if (error || !data) return null;
  return data as TikTokAccountRow;
}

/**
 * GET — พรีวิวรายการสินค้าในร้าน TikTok (หน้าละ page_size) พร้อมบอกว่าตัวไหน
 * ผูกกับสินค้าในระบบเราแล้ว
 *
 * TikTok แบ่งหน้าด้วย `page_token` ไม่ใช่ offset → หน้าถัดไปต้องส่ง token ที่ได้
 * จากหน้าก่อนกลับมา (ข้ามไปหน้า N ตรงๆ ไม่ได้)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !can(auth.companyRoles, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');
    const pageToken = searchParams.get('page_token') || undefined;
    const pageSize = Math.min(parseInt(searchParams.get('page_size') || '20'), 100);

    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    }

    const account = await loadAccount(accountId, auth.companyId);
    if (!account) {
      return NextResponse.json({ error: 'ไม่พบร้าน TikTok นี้' }, { status: 404 });
    }

    const creds = await ensureValidToken(account);
    const page = await searchProducts(creds, { pageSize, pageToken });

    if (page.products.length === 0) {
      return NextResponse.json({ items: [], total: page.totalCount || 0, next_page_token: null });
    }

    // สินค้าที่ผูกไว้แล้ว (นับเฉพาะที่ product ยัง active)
    const { data: existingLinks } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('external_item_id, product_id, products!inner(name, is_active)')
      .eq('account_id', accountId)
      .in('external_item_id', page.products.map((p) => p.id));

    const linkedMap = new Map<string, { product_id: string; name: string }>();
    for (const link of existingLinks || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const product = link.products as any;
      if (product?.is_active) {
        linkedMap.set(link.external_item_id, { product_id: link.product_id, name: product.name });
      }
    }

    // รายละเอียด (ราคา/รูป/จำนวน sku) ดึงทีละตัว — TikTok ไม่มี batch detail
    const items = await Promise.all(
      page.products.map(async (p) => {
        const linked = linkedMap.get(p.id);
        try {
          const detail = await getProductDetail(creds, p.id);
          return {
            product_id: p.id,
            title: detail.title || p.title,
            status: detail.status || p.status,
            image: detail.images[0] || null,
            sku_count: detail.skus.length,
            price: detail.skus[0]?.price || 0,
            has_variation: detail.hasVariation,
            linked_product_id: linked?.product_id || null,
            linked_product_name: linked?.name || null,
          };
        } catch {
          // ตัวเดียวพังไม่ควรทำให้ทั้งหน้าพัง — แสดงเท่าที่รู้จาก search
          return {
            product_id: p.id,
            title: p.title,
            status: p.status,
            image: null,
            sku_count: 0,
            price: 0,
            has_variation: false,
            linked_product_id: linked?.product_id || null,
            linked_product_name: linked?.name || null,
            detail_error: true,
          };
        }
      })
    );

    return NextResponse.json({
      items,
      total: page.totalCount || items.length,
      next_page_token: page.nextPageToken || null,
    });
  } catch (error) {
    console.error('GET tiktok product import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load TikTok products' },
      { status: 500 }
    );
  }
}

/**
 * POST — ดูดสินค้าทั้งร้านเข้าระบบ (SSE stream บอกความคืบหน้า)
 *
 * ต่างจาก Shopee ที่เลือกทีละตัว + map variation เองได้ — ของ TikTok รอบนี้เป็น
 * **import ทั้งร้าน** ตัวที่ SKU ตรงกับของเดิมจะผูกให้อัตโนมัติ (ไม่สร้างซ้ำ)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !can(auth.companyRoles, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { marketplace_account_id, copy_sku_to_barcode } = body as {
      marketplace_account_id?: string;
      copy_sku_to_barcode?: boolean;
    };

    if (!marketplace_account_id) {
      return NextResponse.json({ error: 'marketplace_account_id is required' }, { status: 400 });
    }

    const companyId = auth.companyId;
    const account = await loadAccount(marketplace_account_id, companyId);
    if (!account) {
      return NextResponse.json({ error: 'ไม่พบร้าน TikTok นี้' }, { status: 404 });
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
          const result = await syncProductsFromTikTok(
            account,
            (p) => send({ type: 'progress', ...p }),
            { copySkuToBarcode: !!copy_sku_to_barcode }
          );

          logIntegration({
            company_id: companyId,
            integration: 'tiktok',
            direction: 'outgoing',
            action: 'product_import',
            status: result.errors.length === 0 ? 'success' : 'error',
            reference_type: 'account',
            reference_id: String(account.shop_id),
            reference_label: `TikTok import: created ${result.products_created}, updated ${result.products_updated}`,
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
    console.error('POST tiktok product import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}

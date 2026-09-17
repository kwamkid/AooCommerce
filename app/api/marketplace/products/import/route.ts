// นำเข้าสินค้าจากร้าน marketplace — **route เดียวทุกแพลตฟอร์ม**
//
//   GET  ?account_id=&cursor=&page_size=&q=   พรีวิวสินค้าในร้านทีละหน้า
//   POST { account_id, items[] | all, cursor?, copy_sku_to_barcode? }   นำเข้า (SSE)
//
// ⛔ ห้าม `switch (platform)` ที่นี่ — ตรรกะอยู่ `lib/marketplace/product-import.ts`
//    และ "ยิง API เจ้าไหนยังไง" อยู่ `lib/<platform>/product-import-adapter.ts`
//    (route เดิม `/api/{shopee,lazada,tiktok}/products/import` ลบแล้ว ห้ามสร้างใหม่)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import type { QuotaPlatform } from '@/lib/marketplace/platforms';
import { logIntegration } from '@/lib/integration-logger';
import {
  getProductImportAdapter,
  importPlatformLabel,
  importAllProducts,
  importItems,
  previewImport,
  type ImportRequestItem,
  type ProductImportAccount,
} from '@/lib/marketplace/product-import';
import { guardFeature } from '@/lib/package-gates-server';

export const maxDuration = 300;

/** งบเวลาจริง — หยุดเองก่อนโดน Vercel ตัดที่ 300 วิ แล้วคืน next_cursor */
const TIME_BUDGET_MS = 210_000;

/** โหลดร้าน + เช็คว่าเป็นของบริษัทนี้จริง + มี adapter ของ platform นั้น */
async function loadAccount(accountId: string, companyId: string) {
  const { data } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .maybeSingle();
  if (!data) return null;
  return data as unknown as ProductImportAccount & Record<string, unknown>;
}

async function quotaError(platform: string): Promise<string | null> {
  const quota = await isQuotaBlocked(platform as QuotaPlatform, 'product');
  if (!quota.blocked) return null;
  return `${importPlatformLabel(platform)} จำกัดความถี่ API ชั่วคราว — ระบบพักการยิงอยู่ ลองใหม่ภายหลัง`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !can(auth, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const featureBlocked = await guardFeature(auth.companyId, 'marketplace_sync');
    if (featureBlocked) return featureBlocked;

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');
    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    }

    const account = await loadAccount(accountId, auth.companyId);
    if (!account) return NextResponse.json({ error: 'ไม่พบร้านนี้' }, { status: 404 });
    if (!getProductImportAdapter(account.platform)) {
      return NextResponse.json(
        { error: `ยังไม่รองรับนำเข้าสินค้าจาก ${importPlatformLabel(account.platform)}` },
        { status: 400 },
      );
    }

    const blocked = await quotaError(account.platform as string);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });

    const result = await previewImport(account, {
      cursor: searchParams.get('cursor') || undefined,
      pageSize: Math.min(Math.max(parseInt(searchParams.get('page_size') || '20'), 1), 100),
      search: searchParams.get('q') || undefined,
    });

    return NextResponse.json({ platform: account.platform, shop_name: account.shop_name, ...result });
  } catch (error) {
    console.error('GET marketplace product import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'โหลดรายการสินค้าไม่สำเร็จ' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !can(auth, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const featureBlocked = await guardFeature(auth.companyId, 'marketplace_sync');
    if (featureBlocked) return featureBlocked;

    const body = await request.json();
    const {
      account_id: accountId,
      items,
      all,
      cursor,
      copy_sku_to_barcode: copySkuToBarcode,
    } = body as {
      account_id?: string;
      items?: ImportRequestItem[];
      all?: boolean;
      cursor?: string;
      copy_sku_to_barcode?: boolean;
    };

    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    }
    if (!all && (!items || items.length === 0)) {
      return NextResponse.json({ error: 'ต้องระบุ items หรือ all' }, { status: 400 });
    }

    const companyId = auth.companyId;
    const account = await loadAccount(accountId, companyId);
    if (!account) return NextResponse.json({ error: 'ไม่พบร้านนี้' }, { status: 404 });

    const adapter = getProductImportAdapter(account.platform);
    if (!adapter) {
      return NextResponse.json(
        { error: `ยังไม่รองรับนำเข้าสินค้าจาก ${importPlatformLabel(account.platform)}` },
        { status: 400 },
      );
    }

    const blocked = await quotaError(account.platform as string);
    if (blocked) return NextResponse.json({ error: blocked }, { status: 429 });

    const platform = account.platform as string;
    const startedAt = Date.now();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (data: object) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'started', total: all ? undefined : items?.length });

        try {
          const result = all
            ? await importAllProducts(
                account,
                { copySkuToBarcode, cursor, timeBudgetMs: TIME_BUDGET_MS },
                (p) => send({ type: 'progress', ...p }),
              )
            : await importItems(
                account,
                items || [],
                { copySkuToBarcode },
                (p) => send({ type: 'progress', ...p }),
              );

          logIntegration({
            company_id: companyId,
            integration: platform,
            account_id: account.id,
            account_name: account.shop_name,
            direction: 'incoming',
            action: 'import_products',
            api_path: adapter.listApiPath,
            status: result.errors.length === 0 ? 'success' : 'error',
            reference_type: 'account',
            reference_id: String(account.shop_id ?? account.id),
            reference_label: `นำเข้าสินค้า: สร้าง ${result.created} · อัปเดต ${result.updated} · ผูก ${result.linked}`
              + (result.next_cursor ? ' (ยังไม่ครบ — มีรอบต่อ)' : ''),
            request_body: { mode: all ? 'all' : 'selected', count: all ? undefined : items?.length, cursor },
            response_body: result,
            error_message: result.errors[0] || undefined,
            duration_ms: Date.now() - startedAt,
          });

          send({ type: 'done', ...result });
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'นำเข้าไม่สำเร็จ' });
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
    console.error('POST marketplace product import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'นำเข้าไม่สำเร็จ' },
      { status: 500 },
    );
  }
}

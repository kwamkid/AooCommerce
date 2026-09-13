import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { pushStockForAccount } from '@/lib/marketplace/stock-push';
import { getStockAdapter, stockPlatformLabel } from '@/lib/marketplace/stock-adapter';
import type { PushStockResult, StockSyncAccount } from '@/lib/marketplace/stock-adapter';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import type { QuotaPlatform } from '@/lib/marketplace/platforms';
import { logIntegration } from '@/lib/integration-logger';

// ย้ายคลังแล้วส่งยอดทั้งร้าน — ร้านใหญ่ ~300 สินค้า ใช้เวลานาน
export const maxDuration = 300;

/**
 * ส่งสต็อกขึ้นร้าน — ทุก platform ที่มี adapter (`lib/marketplace/stock-adapter.ts`)
 * `product_id` ว่าง = ส่งยอดของทั้งร้าน (ใช้ตอนย้ายคลังที่ผูกไว้ ยอดทั้งร้านต้องเปลี่ยนตาม)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth || !companyId || !can(auth, 'marketplace.push')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { product_id, marketplace_account_id, cursor } = await request.json();
    if (!marketplace_account_id) {
      return NextResponse.json({ error: 'Missing marketplace_account_id' }, { status: 400 });
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

    const platform = account.platform as string;
    const adapter = getStockAdapter(platform);
    if (!adapter) {
      return NextResponse.json(
        { error: `ยังไม่รองรับส่งสต็อกขึ้น ${stockPlatformLabel(platform)}` },
        { status: 400 }
      );
    }

    // โควตาของถัง inventory เต็ม = ยิงไปก็ fail ทุกใบ แถมเผาคะแนน success rate ทิ้ง
    const quota = await isQuotaBlocked(platform as QuotaPlatform, 'inventory');
    if (quota.blocked) {
      return NextResponse.json(
        { error: `โควตา ${stockPlatformLabel(platform)} เต็มชั่วคราว — ลองใหม่หลัง ${quota.until}` },
        { status: 429 }
      );
    }

    const startMs = Date.now();
    let result: PushStockResult;

    if (product_id) {
      result = await pushStockForAccount(account as StockSyncAccount, product_id);
    } else {
      // ทั้งร้าน — ยิงทีละสินค้า คุม concurrency ไว้ 3 กันชน rate limit ของแพลตฟอร์ม
      const { data: links } = await supabaseAdmin
        .from('marketplace_product_links')
        .select('product_id')
        .eq('account_id', account.id)
        .eq('sync_enabled', true);
      const allIds = [...new Set((links || []).map(l => l.product_id as string))].filter(Boolean);
      // เริ่มต่อจากตัวที่ค้างไว้ได้ — ร้านใหญ่ยิงไม่จบใน 1 request แน่
      const startIndex = Math.max(0, Number(cursor) || 0);
      const productIds = allIds.slice(startIndex);

      // หยุดก่อน maxDuration แล้วคืน cursor กลับไป ไม่ใช่ปล่อยให้ platform ตัดกลางคัน
      // แล้วไม่มีใครรู้ว่าทำถึงไหน (pattern เดียวกับ bulk-ship — ดู CLAUDE.md Scale & Queue)
      const TIME_BUDGET_MS = 240_000;
      const { parallelLimit } = await import('@/lib/parallel');
      let done = 0;
      let stoppedAt: number | null = null;
      const collected: PushStockResult[] = [];

      const CHUNK = 15;
      for (let i = 0; i < productIds.length; i += CHUNK) {
        if (Date.now() - startMs > TIME_BUDGET_MS) {
          stoppedAt = startIndex + done;
          break;
        }
        const chunk = productIds.slice(i, i + CHUNK);
        const rs = await parallelLimit(chunk, (pid) =>
          pushStockForAccount(account as StockSyncAccount, pid), 3);
        collected.push(...rs);
        done += chunk.length;
      }

      result = {
        success: stoppedAt === null && collected.every(r => r.success),
        updated_models: collected.reduce((n, r) => n + r.updated_models, 0),
        errors: collected.flatMap(r => r.errors).slice(0, 20),
      };
      if (stoppedAt !== null) {
        return NextResponse.json({
          ...result,
          partial: true,
          next_cursor: stoppedAt,
          total: allIds.length,
          done: stoppedAt,
          message: `ส่งไปแล้ว ${stoppedAt}/${allIds.length} สินค้า — เรียกซ้ำพร้อม cursor เพื่อทำต่อ`,
        });
      }
    }
    const durationMs = Date.now() - startMs;

    logIntegration({
      company_id: companyId,
      integration: platform,
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'push_stock',
      method: 'POST',
      api_path: adapter.pushApiPath,
      request_body: { product_id: product_id || 'ทั้งร้าน' },
      response_body: result,
      status: result.success ? 'success' : 'error',
      error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      duration_ms: durationMs,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Push stock error:', error);
    return NextResponse.json({ error: 'Push stock failed' }, { status: 500 });
  }
}

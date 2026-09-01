import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';

// ตอบเร็ว งานจริงต่อใน after() ได้จนถึงเพดานนี้ (เท่ากับ cron ของ Lazada/TikTok)
export const maxDuration = 120;
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow, isShopeeQuotaBlocked } from '@/lib/shopee/api';
import { syncOrdersByTimeRange } from '@/lib/shopee/sync';
import { logIntegrationNow } from '@/lib/integration-logger';

async function handleSyncAll(request: NextRequest) {
  // Verify cron secret (supports both Authorization: Bearer and x-cron-secret headers)
  // Fail closed: if CRON_SECRET isn't configured, reject — previously the
  // whole check was skipped when unset, leaving this org-wide sync public.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const xCronHeader = request.headers.get('x-cron-secret') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!cronSecret || (bearerToken !== cronSecret && xCronHeader !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Circuit breaker: โควตารายวันหมดแล้ว — ยิงต่อ = fail ทุก call ทำ success rate พัง
  const quota = await isShopeeQuotaBlocked('order');
  if (quota.blocked) {
    return NextResponse.json({ message: `Shopee daily quota exhausted — skipped until ${quota.until}`, skipped: true });
  }

  // Get all active accounts (shopee platform only)
  // เรียงร้านที่ค้าง sync นานสุดขึ้นก่อน — loop ด้านล่าง time-box 50s แล้ว break
  // ถ้าไม่เรียง ร้านกลุ่มแรกตามลำดับสุ่มของ DB จะกินเวลาทุกรอบ ร้านท้ายแถวอดถาวร
  // (เจอจริง: 3 ร้านค้าง last_sync_at 7 วัน — fix-bug.md 2026-08-28)
  const { data: accounts } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('is_active', true)
    .or('platform.eq.shopee,platform.is.null')
    .not('refresh_token', 'is', null)
    .order('last_sync_at', { ascending: true, nullsFirst: true });

  const results: { shop_id: number; orders_created: number; orders_updated: number; products_created: number; customers_created: number; errors: string[]; skipped?: boolean }[] = [];

  const now = Math.floor(Date.now() / 1000);
  const nowIso = new Date().toISOString();

  // Auto-deactivate accounts where refresh_token is expired — prevents wasteful
  // API calls that tank our Shopee partner success rate (Shopee warns <90%).
  const expiredAccountIds = (accounts || [])
    .filter(a => a.refresh_token_expires_at && new Date(a.refresh_token_expires_at).getTime() < Date.now())
    .map(a => a.id);

  if (expiredAccountIds.length > 0) {
    await supabaseAdmin
      .from('marketplace_accounts')
      .update({ is_active: false, updated_at: nowIso })
      .in('id', expiredAccountIds);

    for (const account of (accounts || []).filter(a => expiredAccountIds.includes(a.id))) {
      // await — response กำลังจะออก ปล่อยลอยแล้วหลักฐานว่าร้านถูกปิดจะหายไปด้วย
      await logIntegrationNow({
        company_id: account.company_id,
        integration: 'shopee',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'outgoing',
        action: 'account_auto_deactivated',
        status: 'error',
        error_message: `Refresh token expired at ${account.refresh_token_expires_at}. Shop auto-deactivated — please reconnect.`,
      });
      results.push({
        shop_id: account.shop_id,
        orders_created: 0,
        orders_updated: 0,
        products_created: 0,
        customers_created: 0,
        errors: ['Refresh token expired — shop auto-deactivated'],
        skipped: true,
      });
    }
  }

  const activeAccounts = (accounts || []).filter(a => !expiredAccountIds.includes(a.id));

  // ตอบ 200 ทันทีแล้ว sync ใน after() — 6 ร้าน + ช่วงเวลาค้างหลายวันใช้เวลาเกิน
  // ทั้ง timeout ของ Vercel และของ cron-job.org (30 วิ) → job โดนปิดอัตโนมัติ
  // last_sync_at stamp ต่อร้านเมื่อร้านนั้นเสร็จ ร้านที่ไม่ทันรอบนี้รอบหน้ามาต่อเอง
  const startedAt = Date.now();
  // งบเวลาจริงต้องต่ำกว่า maxDuration — โดนฆ่ากลางทางแล้ว log กับ last_sync_at
  // ไม่ถูกเขียนพร้อมกัน = พังเงียบ · ต่อร้านก็จำกัดด้วย เพื่อให้ร้านท้ายแถวได้คิวบ้าง
  const TOTAL_BUDGET_MS = 90_000;
  const PER_SHOP_BUDGET_MS = 25_000;
  after(async () => {
  for (const account of activeAccounts as ShopeeAccountRow[]) {
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) break; // กันโดนฆ่ากลางร้าน — รอบหน้าต่อ
    try {
      // Sync from last_sync_at or last 15 minutes
      const lastSync = account.last_sync_at
        ? Math.floor(new Date(account.last_sync_at).getTime() / 1000)
        : now - 15 * 60;

      // Create sync log
      const { data: log } = await supabaseAdmin
        .from('marketplace_sync_log')
        .insert({
          marketplace_account_id: account.id,
          company_id: account.company_id,
          sync_type: 'poll',
        })
        .select()
        .single();

      const startMs = Date.now();
      const result = await syncOrdersByTimeRange(account, lastSync, now, undefined, {
        deadlineAt: Math.min(startMs + PER_SHOP_BUDGET_MS, startedAt + TOTAL_BUDGET_MS),
      });
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

      // Integration log — **await** เพราะอยู่ใน after() ปล่อยลอยแล้วโดน freeze ทิ้ง
      // (งานตาย + หลักฐานตายพร้อมกัน = พังเงียบ ดู .claude/rules/code-simplicity.md)
      await logIntegrationNow({
        company_id: account.company_id,
        integration: 'shopee',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'outgoing',
        action: 'sync_orders_poll',
        method: 'POST',
        api_path: '/api/v2/order/get_order_list',
        request_body: { time_from: lastSync, time_to: now },
        response_body: {
          orders_fetched: result.orders_created + result.orders_updated + result.orders_skipped,
          orders_created: result.orders_created,
          orders_updated: result.orders_updated,
          // ไล่ถึงไหนแล้ว + ยังเหลือช่วงค้างไหม — ตัวเลขที่ทำให้ "ตามไม่ทัน" มองเห็นได้
          synced_until: new Date(result.synced_until * 1000).toISOString(),
          behind_seconds: Math.max(0, now - result.synced_until),
          has_more: result.has_more,
          errors: result.errors,
        },
        status: result.errors.length > 0 ? 'error' : 'success',
        error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
        duration_ms: durationMs,
      });

      results.push({
        shop_id: account.shop_id,
        orders_created: result.orders_created,
        orders_updated: result.orders_updated,
        products_created: result.products_created,
        customers_created: result.customers_created,
        errors: result.errors,
      });
    } catch (e) {
      results.push({
        shop_id: account.shop_id,
        orders_created: 0,
        orders_updated: 0,
        products_created: 0,
        customers_created: 0,
        errors: [e instanceof Error ? e.message : 'Unknown error'],
      });
    }
  }

  console.log(`[Shopee SyncAll] shops=${results.length}/${activeAccounts.length} in ${Date.now() - startedAt}ms`);
  });

  return NextResponse.json({
    started: true,
    total_shops: (accounts || []).length,
    active_shops: activeAccounts.length,
    deactivated_shops: expiredAccountIds.length,
  });
}

export async function GET(request: NextRequest) {
  return handleSyncAll(request);
}

export async function POST(request: NextRequest) {
  return handleSyncAll(request);
}

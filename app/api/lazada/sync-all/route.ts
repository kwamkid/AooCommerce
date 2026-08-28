import { NextRequest, NextResponse } from 'next/server';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LazadaAccountRow } from '@/lib/lazada/api';
import { syncOrdersByTimeRange } from '@/lib/lazada/sync';
import { logIntegration } from '@/lib/integration-logger';

export const maxDuration = 120;

/**
 * Cron: sync all active Lazada accounts (ทุก 15 นาที — safety net คู่กับ webhook)
 * GET/POST with CRON_SECRET (Authorization: Bearer หรือ x-cron-secret)
 */
async function handleSyncAll(request: NextRequest) {
  // Fail closed: ไม่มี CRON_SECRET = ปฏิเสธ
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const xCronHeader = request.headers.get('x-cron-secret') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!cronSecret || (bearerToken !== cronSecret && xCronHeader !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  // Circuit breaker: rate limit ค้าง — skip ทั้งรอบ รอบหน้าค่อยเก็บตก
  const quota = await isQuotaBlocked('lazada', 'order');
  if (quota.blocked) {
    return NextResponse.json({ message: `Lazada rate limited — sync deferred until ${quota.until}`, skipped: true });
  }

  const { data: accounts, error } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('platform', 'lazada')
    .eq('is_active', true);

  if (error || !accounts || accounts.length === 0) {
    return NextResponse.json({ message: 'No active Lazada accounts', duration_ms: Date.now() - startTime });
  }

  // Auto-deactivate refresh token ที่หมดอายุ — กัน cron ยิง fail ไปเรื่อยๆ
  const expiredIds = accounts
    .filter(a => a.refresh_token_expires_at && new Date(a.refresh_token_expires_at).getTime() < Date.now())
    .map(a => a.id);

  if (expiredIds.length > 0) {
    await supabaseAdmin
      .from('marketplace_accounts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', expiredIds);

    for (const account of accounts.filter(a => expiredIds.includes(a.id))) {
      logIntegration({
        company_id: account.company_id,
        integration: 'lazada',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'outgoing',
        action: 'account_auto_deactivated',
        status: 'error',
        error_message: `Refresh token expired at ${account.refresh_token_expires_at}. Shop auto-deactivated — please reconnect.`,
      });
    }
  }

  const activeAccounts = accounts.filter(a => !expiredIds.includes(a.id));
  if (activeAccounts.length === 0) {
    return NextResponse.json({
      message: `All ${accounts.length} Lazada accounts have expired — auto-deactivated`,
      deactivated_shops: expiredIds.length,
      duration_ms: Date.now() - startTime,
    });
  }

  // ตอบทันที ประมวลผลต่อใน background
  const response = NextResponse.json({
    message: `Syncing ${activeAccounts.length} Lazada account(s)`,
    deactivated_shops: expiredIds.length,
    accounts: activeAccounts.map(a => ({ id: a.id, shop_name: a.shop_name })),
  });

  after(async () => {
    for (const account of activeAccounts) {
      const typedAccount = account as LazadaAccountRow;
      const timeToMs = Date.now();
      // จาก last_sync_at (ถอย 60s กัน edge) หรือ 30 นาทีย้อนหลัง — เพดาน 24 ชม.
      const lastSyncMs = account.last_sync_at
        ? new Date(account.last_sync_at).getTime()
        : (timeToMs - 30 * 60 * 1000);
      const timeFromMs = Math.max(lastSyncMs - 60 * 1000, timeToMs - 24 * 60 * 60 * 1000);

      try {
        const result = await syncOrdersByTimeRange(typedAccount, timeFromMs, timeToMs);

        logIntegration({
          company_id: account.company_id,
          integration: 'lazada',
          account_id: account.id,
          account_name: account.shop_name,
          direction: 'outgoing',
          action: 'sync_orders_poll',
          status: result.errors.length > 0 ? 'error' : 'success',
          error_message: result.errors[0] || undefined,
          reference_label: `Poll: ${result.orders_created} new, ${result.orders_updated} updated`,
          duration_ms: Date.now() - startTime,
        });
      } catch (err) {
        console.error(`[Lazada Sync-All] Error syncing account ${account.id}:`, err);
        logIntegration({
          company_id: account.company_id,
          integration: 'lazada',
          account_id: account.id,
          account_name: account.shop_name,
          direction: 'outgoing',
          action: 'sync_orders_poll',
          status: 'error',
          error_message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  });

  return response;
}

export async function GET(request: NextRequest) {
  return handleSyncAll(request);
}

export async function POST(request: NextRequest) {
  return handleSyncAll(request);
}

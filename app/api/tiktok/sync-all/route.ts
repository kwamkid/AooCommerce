import { NextRequest, NextResponse } from 'next/server';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { TikTokAccountRow } from '@/lib/tiktok/api';
import { syncOrdersByTimeRange } from '@/lib/tiktok/sync';
import { logIntegration } from '@/lib/integration-logger';

export const maxDuration = 120;

/**
 * Cron: sync all active TikTok accounts.
 * Called every 15 minutes by cron job.
 * GET with CRON_SECRET header.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  // Fail closed: if CRON_SECRET isn't configured, reject — previously the
  // whole check was skipped when unset, leaving this org-wide sync public.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const xCronHeader = request.headers.get('x-cron-secret') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!cronSecret || (bearerToken !== cronSecret && xCronHeader !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  // Circuit breaker: rate limit ค้าง — skip ทั้งรอบ รอบหน้าค่อยเก็บตก
  const quota = await isQuotaBlocked('tiktok', 'order');
  if (quota.blocked) {
    return NextResponse.json({ message: `TikTok rate limited — sync deferred until ${quota.until}`, skipped: true });
  }

  // Load all active TikTok accounts
  const { data: accounts, error } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('platform', 'tiktok')
    .eq('is_active', true);

  if (error || !accounts || accounts.length === 0) {
    return NextResponse.json({ message: 'No active TikTok accounts', duration_ms: Date.now() - startTime });
  }

  // Auto-deactivate accounts with expired refresh token — prevents futile API calls
  // that get counted against our platform success rate.
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
        integration: 'tiktok',
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
      message: `All ${accounts.length} TikTok accounts have expired — auto-deactivated`,
      deactivated_shops: expiredIds.length,
      duration_ms: Date.now() - startTime,
    });
  }

  // Return immediately, process in background
  const response = NextResponse.json({
    message: `Syncing ${activeAccounts.length} TikTok account(s)`,
    deactivated_shops: expiredIds.length,
    accounts: activeAccounts.map(a => ({ id: a.id, shop_name: a.shop_name })),
  });

  after(async () => {
    for (const account of activeAccounts) {
      const typedAccount = account as TikTokAccountRow;
      const timeTo = Math.floor(Date.now() / 1000);
      // Sync from last_sync_at or 30 minutes back
      const lastSync = account.last_sync_at ? Math.floor(new Date(account.last_sync_at).getTime() / 1000) : (timeTo - 30 * 60);
      const timeFrom = Math.max(lastSync - 60, timeTo - 24 * 60 * 60); // At most 24h back, overlap 60s

      try {
        const result = await syncOrdersByTimeRange(typedAccount, timeFrom, timeTo);

        logIntegration({
          company_id: account.company_id,
          integration: 'tiktok',
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
        console.error(`[TikTok Sync-All] Error syncing account ${account.id}:`, err);
        logIntegration({
          company_id: account.company_id,
          integration: 'tiktok',
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

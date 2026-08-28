import { NextRequest, NextResponse } from 'next/server';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { LazadaAccountRow } from '@/lib/lazada/api';
import { syncOrdersByTimeRange } from '@/lib/lazada/sync';
import { logIntegration } from '@/lib/integration-logger';

export const maxDuration = 120;

/**
 * Manual Lazada order sync for a specific account.
 * POST { account_id: string, days_back?: number }
 */
export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.sync')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const quota = await isQuotaBlocked('lazada', 'order');
  if (quota.blocked) {
    return NextResponse.json({ error: `Lazada จำกัดความถี่ API ชั่วคราว — ระบบพักการยิงและจะ sync ต่อให้อัตโนมัติ ลองใหม่ภายหลัง` }, { status: 429 });
  }

  const body = await request.json();
  const accountId = body.account_id;
  const daysBack = body.days_back || 7;

  if (!accountId) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 });
  }

  const { data: account, error: accountError } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .eq('platform', 'lazada')
    .eq('is_active', true)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const startMs = Date.now();
  const timeToMs = Date.now();
  const timeFromMs = timeToMs - daysBack * 24 * 60 * 60 * 1000;

  try {
    const result = await syncOrdersByTimeRange(account as LazadaAccountRow, timeFromMs, timeToMs);

    logIntegration({
      company_id: companyId,
      integration: 'lazada',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'sync_orders_manual',
      status: result.errors.length > 0 ? 'error' : 'success',
      error_message: result.errors[0] || undefined,
      reference_label: `Manual sync: ${result.orders_created} created, ${result.orders_updated} updated`,
      duration_ms: Date.now() - startMs,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[Lazada Sync] Manual sync error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    );
  }
}

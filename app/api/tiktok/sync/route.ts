import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import { TikTokAccountRow } from '@/lib/tiktok/api';
import { syncOrdersByTimeRange } from '@/lib/tiktok/sync';
import { logIntegration } from '@/lib/integration-logger';

export const maxDuration = 120;

/**
 * Manual TikTok sync for a specific account.
 * POST { account_id: string, days_back?: number }
 */
export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const accountId = body.account_id;
  const daysBack = body.days_back || 7;

  if (!accountId) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 });
  }

  // Load account
  const { data: account, error: accountError } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .eq('platform', 'tiktok')
    .eq('is_active', true)
    .single();

  if (accountError || !account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const timeTo = Math.floor(Date.now() / 1000);
  const timeFrom = timeTo - daysBack * 24 * 60 * 60;

  try {
    const result = await syncOrdersByTimeRange(account as TikTokAccountRow, timeFrom, timeTo);

    logIntegration({
      company_id: companyId,
      integration: 'tiktok',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'sync_orders_manual',
      status: result.errors.length > 0 ? 'error' : 'success',
      error_message: result.errors[0] || undefined,
      reference_label: `Manual sync: ${result.orders_created} created, ${result.orders_updated} updated`,
      duration_ms: Date.now() - timeTo * 1000,
    });

    return NextResponse.json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import { TikTokAccountRow } from '@/lib/tiktok/api';
import { syncOrdersByIds } from '@/lib/tiktok/sync';
import { logIntegration } from '@/lib/integration-logger';

export const maxDuration = 60;

/**
 * Sync a single TikTok order by ID.
 * POST { account_id: string, order_id: string }
 */
export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const accountId = body.account_id;
  const orderId = body.order_id;

  if (!accountId || !orderId) {
    return NextResponse.json({ error: 'account_id and order_id required' }, { status: 400 });
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

  try {
    const result = await syncOrdersByIds(account as TikTokAccountRow, [orderId]);

    logIntegration({
      company_id: companyId,
      integration: 'tiktok',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'sync_single_order',
      status: result.errors.length > 0 ? 'error' : 'success',
      error_message: result.errors[0] || undefined,
      reference_type: 'order',
      reference_id: orderId,
      reference_label: `Order ${orderId}`,
    });

    return NextResponse.json(result);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

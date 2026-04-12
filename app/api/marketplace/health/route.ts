import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Returns health summary for marketplace integrations:
 * - expired_count: shops with expired refresh token (need re-auth)
 * - inactive_count: shops with is_active=false (recently auto-deactivated or manually disconnected)
 * - error_count: integration_logs errors in the last 24h (excludes known non-auth business errors)
 * - issues: list of { account_id, shop_name, platform, type, message }
 *
 * Used by Header to show a notification badge when marketplace shops need attention.
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { data: accounts } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('id, platform, shop_name, is_active, refresh_token_expires_at, refresh_token')
      .eq('company_id', companyId);

    type Issue = { account_id: string; shop_name: string | null; platform: string; type: 'expired' | 'disconnected'; message: string };
    const issues: Issue[] = [];
    let expiredCount = 0;
    let inactiveCount = 0;

    for (const a of accounts || []) {
      const hasRefresh = !!a.refresh_token;
      const refreshExpired = a.refresh_token_expires_at && new Date(a.refresh_token_expires_at).getTime() < now.getTime();

      if (!a.is_active && hasRefresh) {
        // Auto-deactivated or disconnected but still has token — usually means token expired and was auto-deactivated
        inactiveCount++;
        issues.push({
          account_id: a.id,
          shop_name: a.shop_name,
          platform: a.platform || 'shopee',
          type: 'disconnected',
          message: 'ร้านถูกปิดการเชื่อมต่อ กรุณาเชื่อมต่อใหม่',
        });
      } else if (a.is_active && refreshExpired) {
        expiredCount++;
        issues.push({
          account_id: a.id,
          shop_name: a.shop_name,
          platform: a.platform || 'shopee',
          type: 'expired',
          message: 'Token หมดอายุ กรุณาเชื่อมต่อใหม่',
        });
      }
    }

    // Count recent auth/token errors from integration logs (last 24h)
    const { count: errorCount } = await supabaseAdmin
      .from('integration_logs')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'error')
      .in('action', ['account_auto_deactivated', 'sync_orders_poll', 'webhook_sync_error'])
      .gte('created_at', since);

    return NextResponse.json({
      expired_count: expiredCount,
      inactive_count: inactiveCount,
      error_count: errorCount || 0,
      total_issues: issues.length,
      issues,
    });
  } catch (error) {
    console.error('Marketplace health GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch health' }, { status: 500 });
  }
}

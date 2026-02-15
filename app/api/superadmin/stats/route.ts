import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkSuperAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!auth.isSuperAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Count users
    const { count: totalUsers } = await supabaseAdmin
      .from('user_profiles')
      .select('id', { count: 'exact', head: true });

    // Count companies
    const { count: totalCompanies } = await supabaseAdmin
      .from('companies')
      .select('id', { count: 'exact', head: true });

    const { count: activeCompanies } = await supabaseAdmin
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);

    // Companies by package — count distinct companies per active subscription
    const { data: subscriptions } = await supabaseAdmin
      .from('user_subscriptions')
      .select('company_id, package:packages(name, slug)')
      .eq('status', 'active');

    const packageCounts: Record<string, number> = {};
    const seenCompanies = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (subscriptions || []).forEach((s: any) => {
      // Deduplicate by company_id — 1 company should only count once
      if (!s.company_id || seenCompanies.has(s.company_id)) return;
      seenCompanies.add(s.company_id);
      const name = s.package?.name || 'Unknown';
      packageCounts[name] = (packageCounts[name] || 0) + 1;
    });

    // Recent companies
    const { data: recentCompanies } = await supabaseAdmin
      .from('companies')
      .select('id, name, slug, logo_url, is_active, created_at')
      .order('created_at', { ascending: false })
      .limit(5);

    return NextResponse.json({
      totalUsers: totalUsers || 0,
      totalCompanies: totalCompanies || 0,
      activeCompanies: activeCompanies || 0,
      packageCounts,
      recentCompanies: recentCompanies || [],
    });
  } catch (error) {
    console.error('GET superadmin/stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

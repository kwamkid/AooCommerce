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

    const params = request.nextUrl.searchParams;
    const page = parseInt(params.get('page') || '1', 10);
    const limit = parseInt(params.get('limit') || '50', 10);
    const offset = (page - 1) * limit;
    const statusFilter = params.get('status');
    const directionFilter = params.get('direction');
    const actionFilter = params.get('action');
    const search = params.get('search')?.trim();
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');

    let query = supabaseAdmin
      .from('integration_logs')
      .select('*', { count: 'exact' })
      .eq('integration', 'shopee')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }
    if (directionFilter && directionFilter !== 'all') {
      query = query.eq('direction', directionFilter);
    }
    if (actionFilter && actionFilter !== 'all') {
      query = query.eq('action', actionFilter);
    }
    if (search) {
      query = query.or(
        `reference_id.ilike.%${search}%,` +
        `reference_label.ilike.%${search}%,` +
        `account_name.ilike.%${search}%,` +
        `error_message.ilike.%${search}%,` +
        `action.ilike.%${search}%`
      );
    }
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

    query = query.range(offset, offset + limit - 1);

    const { data: logs, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get status counts using separate count queries (no row limit)
    const buildCountQuery = (status?: string) => {
      let q = supabaseAdmin
        .from('integration_logs')
        .select('*', { count: 'exact', head: true })
        .eq('integration', 'shopee');
      if (status) q = q.eq('status', status);
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo) q = q.lte('created_at', `${dateTo}T23:59:59`);
      return q;
    };

    const [allRes, successRes, errorRes] = await Promise.all([
      buildCountQuery(),
      buildCountQuery('success'),
      buildCountQuery('error'),
    ]);

    const statusCounts: Record<string, number> = {
      all: allRes.count || 0,
      success: successRes.count || 0,
      error: errorRes.count || 0,
      pending: (allRes.count || 0) - (successRes.count || 0) - (errorRes.count || 0),
    };

    // Get company names for logs
    const companyIds = [...new Set((logs || []).map(l => l.company_id).filter(Boolean))];
    let companyMap: Record<string, string> = {};

    if (companyIds.length > 0) {
      const { data: companies } = await supabaseAdmin
        .from('companies')
        .select('id, name')
        .in('id', companyIds);

      for (const c of companies || []) {
        companyMap[c.id] = c.name;
      }
    }

    return NextResponse.json({
      logs: (logs || []).map(l => ({
        ...l,
        company_name: companyMap[l.company_id] || '-',
      })),
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      statusCounts,
    });
  } catch (error) {
    console.error('GET superadmin/integration-logs error:', error);
    return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
  }
}

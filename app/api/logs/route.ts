import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRole)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const integration = searchParams.get('integration') || 'shopee';
    const direction = searchParams.get('direction');
    const status = searchParams.get('status');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    // Build query
    let query = supabaseAdmin
      .from('integration_logs')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('integration', integration)
      .order('created_at', { ascending: false });

    if (direction && direction !== 'all') {
      query = query.eq('direction', direction);
    }
    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (search) {
      query = query.or(`reference_id.ilike.%${search}%,reference_label.ilike.%${search}%,error_message.ilike.%${search}%,api_path.ilike.%${search}%,action.ilike.%${search}%`);
    }
    if (dateFrom) {
      query = query.gte('created_at', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte('created_at', `${dateTo}T23:59:59`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: logs, count, error } = await query;

    if (error) {
      console.error('[Logs API] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 });
    }

    // Get status counts for the same filters (excluding status filter)
    let countQuery = supabaseAdmin
      .from('integration_logs')
      .select('status', { count: 'exact', head: false })
      .eq('company_id', companyId)
      .eq('integration', integration);

    if (direction && direction !== 'all') {
      countQuery = countQuery.eq('direction', direction);
    }
    if (search) {
      countQuery = countQuery.or(`reference_id.ilike.%${search}%,reference_label.ilike.%${search}%,error_message.ilike.%${search}%,api_path.ilike.%${search}%,action.ilike.%${search}%`);
    }
    if (dateFrom) {
      countQuery = countQuery.gte('created_at', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      countQuery = countQuery.lte('created_at', `${dateTo}T23:59:59`);
    }

    const { data: allRows } = await countQuery;

    const statusCounts = {
      all: allRows?.length || 0,
      success: allRows?.filter(r => r.status === 'success').length || 0,
      error: allRows?.filter(r => r.status === 'error').length || 0,
    };

    return NextResponse.json({
      logs: logs || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
      statusCounts,
    });
  } catch (error) {
    console.error('[Logs API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

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
    const codeFilter = params.get('code');
    const shopFilter = params.get('shop_id');
    const search = params.get('search');
    const dateFrom = params.get('date_from');
    const dateTo = params.get('date_to');

    let query = supabaseAdmin
      .from('shopee_webhook_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('processing_status', statusFilter);
    }
    if (codeFilter) {
      query = query.eq('push_code', parseInt(codeFilter, 10));
    }
    if (shopFilter) {
      query = query.eq('shop_id', parseInt(shopFilter, 10));
    }
    if (search) {
      query = query.ilike('raw_payload', `%${search}%`);
    }
    if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lte('created_at', `${dateTo}T23:59:59`);

    query = query.range(offset, offset + limit - 1);

    const { data: logs, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get status counts for filter badges
    const { data: countData } = await supabaseAdmin
      .from('shopee_webhook_log')
      .select('processing_status')
      .limit(10000);

    const statusCounts: Record<string, number> = { all: 0, pending: 0, processing: 0, processed: 0, failed: 0, skipped: 0 };
    for (const row of countData || []) {
      statusCounts.all++;
      statusCounts[row.processing_status] = (statusCounts[row.processing_status] || 0) + 1;
    }

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
    console.error('GET superadmin/webhooks error:', error);
    return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
  }
}

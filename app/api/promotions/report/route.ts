// Path: app/api/promotions/report/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const source = searchParams.get('source'); // all, manual, pos, shopee

    // Build query: aggregate order_items by promotion_id
    // JOIN promotions for name/type, JOIN orders for filters
    let query = supabaseAdmin
      .from('order_items')
      .select(`
        promotion_id,
        quantity,
        total,
        order:orders!inner(
          id,
          company_id,
          source,
          order_status,
          created_at
        ),
        promotion:promotions!inner(
          id,
          name,
          promotion_type,
          status,
          image
        )
      `)
      .eq('order.company_id', auth.companyId)
      .not('promotion_id', 'is', null)
      .neq('order.order_status', 'cancelled');

    // Exclude consignment sources
    query = query
      .neq('order.source', 'consignment')
      .neq('order.source', 'consignment_dealer')
      .neq('order.source', 'department_store');

    // Source filter
    if (source && source !== 'all') {
      query = query.eq('order.source', source);
    }

    // Date filter
    if (dateFrom) {
      query = query.gte('order.created_at', `${dateFrom}T00:00:00`);
    }
    if (dateTo) {
      query = query.lte('order.created_at', `${dateTo}T23:59:59.999`);
    }

    const { data: rows, error } = await query;

    if (error) {
      console.error('[Promotion Report] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Aggregate by promotion_id
    const promoMap = new Map<string, {
      id: string;
      name: string;
      promotion_type: string;
      status: string;
      image: string | null;
      order_count: number;
      total_qty: number;
      total_sales: number;
      order_ids: Set<string>;
    }>();

    for (const row of rows || []) {
      const pid = row.promotion_id!;
      const promo = row.promotion as any;
      const order = row.order as any;

      if (!promoMap.has(pid)) {
        promoMap.set(pid, {
          id: promo.id,
          name: promo.name,
          promotion_type: promo.promotion_type,
          status: promo.status,
          image: promo.image,
          order_count: 0,
          total_qty: 0,
          total_sales: 0,
          order_ids: new Set(),
        });
      }

      const agg = promoMap.get(pid)!;
      agg.total_qty += Number(row.quantity || 0);
      agg.total_sales += Number(row.total || 0);
      agg.order_ids.add(order.id);
    }

    // Convert to array, count unique orders
    const report = Array.from(promoMap.values())
      .map(({ order_ids, ...rest }) => ({
        ...rest,
        order_count: order_ids.size,
      }))
      .sort((a, b) => b.total_sales - a.total_sales);

    // Summary
    const summary = {
      total_promotions: report.length,
      total_orders: report.reduce((s, r) => s + r.order_count, 0),
      total_qty: report.reduce((s, r) => s + r.total_qty, 0),
      total_sales: report.reduce((s, r) => s + r.total_sales, 0),
    };

    return NextResponse.json({ report, summary });
  } catch (err) {
    console.error('[Promotion Report] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

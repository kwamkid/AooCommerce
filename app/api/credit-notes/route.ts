// Path: app/api/credit-notes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { createCreditNote } from '@/lib/credit-notes/auto-cn';

// POST — Create a Credit Note (void, refund, or exchange)
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { order_id, type, reason, items } = body as {
      order_id: string;
      type: 'void' | 'refund' | 'exchange';
      reason?: string;
      items?: { order_item_id: string; quantity: number }[];
    };

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }
    if (!type || !['void', 'refund', 'exchange'].includes(type)) {
      return NextResponse.json({ error: 'type must be void, refund, or exchange' }, { status: 400 });
    }
    if ((type === 'refund' || type === 'exchange') && (!items || items.length === 0)) {
      return NextResponse.json({ error: 'items are required for refund/exchange' }, { status: 400 });
    }

    const result = await createCreditNote({
      companyId: auth.companyId,
      orderId: order_id,
      type,
      reason,
      items,
      createdBy: auth.userId,
    });

    if (!result) {
      return NextResponse.json({ error: 'Order not found or no valid items' }, { status: 400 });
    }

    return NextResponse.json({ cn_id: result.cn_id, cn_number: result.cn_number });
  } catch (err) {
    console.error('[CN POST]', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — List credit notes
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id');
    const type = searchParams.get('type');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // If searching by order/replenishment number, resolve IDs first
    let searchOrderIds: string[] | null = null;
    let searchRepIds: string[] | null = null;
    if (search) {
      const [matchedOrders, matchedReps] = await Promise.all([
        supabaseAdmin.from('orders').select('id').eq('company_id', auth.companyId).ilike('order_number', `%${search}%`),
        supabaseAdmin.from('replenishments').select('id').eq('company_id', auth.companyId).ilike('replenishment_number', `%${search}%`),
      ]);
      searchOrderIds = (matchedOrders.data || []).map(o => o.id);
      searchRepIds = (matchedReps.data || []).map(r => r.id);
    }

    let query = supabaseAdmin
      .from('credit_notes')
      .select(`
        id, cn_number, order_id, source_type, source_id, type, status, reason,
        subtotal, discount_amount, vat_amount, total_amount,
        exchange_order_id, issued_at, created_at, created_by
      `, { count: 'exact' })
      .eq('company_id', auth.companyId)
      .order('issued_at', { ascending: false });

    if (orderId) {
      query = query.eq('order_id', orderId);
    }
    if (type && ['void', 'refund', 'exchange'].includes(type)) {
      query = query.eq('type', type);
    }
    if (search) {
      // Search by cn_number OR by matching order/replenishment numbers
      const orParts = [`cn_number.ilike.%${search}%`];
      if (searchOrderIds && searchOrderIds.length > 0) {
        orParts.push(`order_id.in.(${searchOrderIds.join(',')})`);
      }
      if (searchRepIds && searchRepIds.length > 0) {
        orParts.push(`source_id.in.(${searchRepIds.join(',')})`);
      }
      query = query.or(orParts.join(','));
    }

    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('[CN GET] query error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with order/replenishment details
    const enriched = data || [];
    if (enriched.length > 0) {
      // Collect order IDs (from order_id + exchange_order_id)
      const orderIds = enriched.map(cn => cn.order_id).filter(Boolean);
      const exchangeIds = enriched.map(cn => cn.exchange_order_id).filter(Boolean);
      const allOrderIds = [...new Set([...orderIds, ...exchangeIds])];

      // Collect replenishment IDs
      const repIds = enriched
        .filter(cn => cn.source_type === 'replenishment' && cn.source_id)
        .map(cn => cn.source_id);

      const [ordersRes, repsRes] = await Promise.all([
        allOrderIds.length > 0
          ? supabaseAdmin.from('orders').select('id, order_number, source').in('id', allOrderIds)
          : Promise.resolve({ data: [] }),
        repIds.length > 0
          ? supabaseAdmin.from('replenishments').select('id, replenishment_number, customer_id').in('id', repIds)
          : Promise.resolve({ data: [] }),
      ]);

      const orderMap = new Map(((ordersRes as any).data || []).map((o: any) => [o.id, o]));
      const repMap = new Map(((repsRes as any).data || []).map((r: any) => [r.id, r]));

      for (const cn of enriched) {
        (cn as any).order = cn.order_id ? orderMap.get(cn.order_id) || null : null;
        if (cn.exchange_order_id) {
          (cn as any).exchange_order = orderMap.get(cn.exchange_order_id) || null;
        }
        if (cn.source_type === 'replenishment' && cn.source_id) {
          (cn as any).replenishment = repMap.get(cn.source_id) || null;
        }
      }
    }

    return NextResponse.json({
      data: enriched,
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('[CN GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

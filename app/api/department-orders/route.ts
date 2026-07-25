import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { reserveStock } from '@/lib/stock-service';
import { fetchCostMap } from '@/lib/cost-utils';

// GET /api/department-orders
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('department_orders')
      .select(`
        id,
        department_order_number,
        status,
        notes,
        total_amount,
        confirmed_total,
        tax_invoice_number,
        tax_invoice_date,
        shipping_method,
        shipping_carrier,
        tracking_number,
        receive_token,
        receiver_name,
        receive_photo_url,
        shipped_at,
        received_at,
        printed_packing_at,
        printed_label_at,
        printed_dn_at,
        created_at,
        warehouse_id,
        customer:customers(id, name, customer_code, phone, customer_type),
        created_by_profile:user_profiles!department_orders_created_by_fkey(id, name),
        items:department_order_items(id)
      `, { count: 'exact' })
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      // Support combined statuses for tabs
      if (status === 'received') {
        query = query.in('status', ['received', 'partial_received']);
      } else {
        query = query.eq('status', status);
      }
    }

    if (search) {
      const s = search.replace(/[%_(),']/g, '');
      query = query.or(`department_order_number.ilike.%${s}%,customer.name.ilike.%${s}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data: orders, error, count } = await query;

    if (error) {
      console.error('Department orders GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Status counts
    const { data: statusRows } = await supabaseAdmin
      .from('department_orders')
      .select('status')
      .eq('company_id', auth.companyId);

    const statusCounts: Record<string, number> = {};
    for (const row of statusRows || []) {
      const s = (row as { status: string }).status;
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }

    return NextResponse.json({
      orders: orders || [],
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
      status_counts: statusCounts,
    });
  } catch (err) {
    console.error('Department orders GET unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/department-orders
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { customer_id, warehouse_id, counter_id, notes, internal_notes, items } = body;

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items is required' }, { status: 400 });
    }

    // Validate customer is department_store
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id, customer_type')
      .eq('id', customer_id)
      .eq('company_id', auth.companyId)
      .single();

    if (!customer || customer.customer_type !== 'department_store') {
      return NextResponse.json({ error: 'Customer must be department_store type' }, { status: 400 });
    }

    // Validate destination counter (branch) belongs to this customer
    if (counter_id) {
      const { data: counter } = await supabaseAdmin
        .from('consignment_counters')
        .select('id')
        .eq('id', counter_id)
        .eq('company_id', auth.companyId)
        .eq('customer_id', customer_id)
        .eq('is_active', true)
        .maybeSingle();
      if (!counter) {
        return NextResponse.json({ error: 'ไม่พบสาขาของลูกค้ารายนี้' }, { status: 400 });
      }
    }

    // Calculate total
    const totalAmount = items.reduce((sum: number, item: { quantity: number; unit_price: number }) =>
      sum + (item.quantity || 0) * (item.unit_price || 0), 0);

    // Generate running number
    const { data: numberData, error: numberError } = await supabaseAdmin
      .rpc('generate_department_order_number', { p_company_id: auth.companyId });

    if (numberError) {
      return NextResponse.json({ error: 'Failed to generate order number' }, { status: 500 });
    }

    // Insert department order (status=draft, receive_token auto-generated by DB default)
    const { data: order, error: insertError } = await supabaseAdmin
      .from('department_orders')
      .insert({
        company_id: auth.companyId,
        department_order_number: numberData,
        customer_id,
        warehouse_id: warehouse_id || null,
        counter_id: counter_id || null,
        status: 'draft',
        notes: notes || null,
        internal_notes: internal_notes || null,
        total_amount: totalAmount,
        created_by: auth.userId,
      })
      .select('id, department_order_number')
      .single();

    if (insertError || !order) {
      console.error('Department order insert error:', insertError);
      return NextResponse.json({ error: insertError?.message || 'Failed to create' }, { status: 500 });
    }

    // Fetch WAC cost map for cost snapshot
    const deptCostMap = await fetchCostMap(
      supabaseAdmin,
      items.map((i: { variation_id?: string }) => i.variation_id).filter(Boolean) as string[],
    );

    // Insert items
    const itemRows = items.map((item: {
      product_id?: string;
      variation_id?: string;
      product_name: string;
      variation_label?: string;
      quantity: number;
      unit_price: number;
    }, index: number) => ({
      department_order_id: order.id,
      product_id: item.product_id || null,
      variation_id: item.variation_id || null,
      product_name: item.product_name,
      variation_label: item.variation_label || null,
      quantity: item.quantity,
      unit_price: item.unit_price || 0,
      unit_cost: item.variation_id ? (deptCostMap[item.variation_id] || null) : null,
      sort_order: index,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('department_order_items')
      .insert(itemRows);

    if (itemsError) {
      await supabaseAdmin.from('department_orders').delete().eq('id', order.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Reserve stock on source warehouse (ship later = shipToTransit)
    if (warehouse_id) {
      try {
        for (const item of items) {
          const varId = item.variation_id || null;
          if (!varId || !item.quantity || item.quantity <= 0) continue;
          await reserveStock({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: warehouse_id,
            variationId: varId,
            qty: item.quantity,
            referenceType: 'department_order',
            referenceId: order.id,
            notes: `จองสต๊อกสำหรับใบส่งห้าง ${order.department_order_number}`,
            createdBy: auth.userId,
          });
        }
      } catch (stockErr) {
        console.error('Department order stock reserve error:', stockErr);
      }
    }

    // TAX + DN will be auto-issued when shipping (not on create)

    return NextResponse.json({
      success: true,
      id: order.id,
      department_order_number: order.department_order_number,
    });
  } catch (err) {
    console.error('Department orders POST unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET - List purchase orders
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const supplierId = searchParams.get('supplier_id');

    let query = supabaseAdmin
      .from('purchase_orders')
      .select(`
        id, po_number, status, order_date, expected_date, notes, total_amount, created_at, created_by,
        supplier:suppliers(id, name, supplier_type),
        warehouse:warehouses(id, name, code),
        items:purchase_order_items(id, quantity, received_quantity)
      `)
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }
    if (supplierId) {
      query = query.eq('supplier_id', supplierId);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Batch fetch created_by user names
    const userIds = [...new Set((data || []).map(r => r.created_by).filter(Boolean))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name')
        .in('id', userIds);
      if (profiles) {
        userMap = Object.fromEntries(profiles.map(p => [p.id, p.name]));
      }
    }

    const enriched = (data || []).map(po => ({
      ...po,
      created_by_name: userMap[po.created_by] || null,
    }));

    return NextResponse.json({ purchase_orders: enriched });
  } catch (error) {
    console.error('GET purchase-orders error:', error);
    return NextResponse.json({ error: 'Failed to fetch purchase orders' }, { status: 500 });
  }
}

// POST - Create purchase order
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { supplier_id, warehouse_id, items, notes, order_date, expected_date } = body;

    if (!supplier_id) {
      return NextResponse.json({ error: 'Supplier is required' }, { status: 400 });
    }
    if (!warehouse_id) {
      return NextResponse.json({ error: 'Warehouse is required' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 });
    }

    // Generate PO number
    const { data: poNumberData, error: poNumErr } = await supabaseAdmin
      .rpc('generate_po_number', { p_company_id: auth.companyId });

    if (poNumErr) throw poNumErr;
    const poNumber = poNumberData as string;

    // Calculate total amount
    const totalAmount = items.reduce((sum: number, item: { quantity: number; unit_cost: number }) => {
      return sum + (item.quantity * (item.unit_cost || 0));
    }, 0);

    // Insert PO header
    const { data: po, error: poErr } = await supabaseAdmin
      .from('purchase_orders')
      .insert({
        company_id: auth.companyId,
        po_number: poNumber,
        supplier_id,
        warehouse_id,
        status: 'draft',
        order_date: order_date || new Date().toISOString().split('T')[0],
        expected_date: expected_date || null,
        notes: notes || null,
        total_amount: totalAmount,
        created_by: auth.userId,
      })
      .select()
      .single();

    if (poErr) throw poErr;

    // Insert PO items
    const poItems = items.map((item: { variation_id: string; quantity: number; unit_cost: number; notes?: string }) => ({
      po_id: po.id,
      variation_id: item.variation_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost || 0,
      notes: item.notes || null,
    }));

    const { error: itemsErr } = await supabaseAdmin
      .from('purchase_order_items')
      .insert(poItems);

    if (itemsErr) throw itemsErr;

    return NextResponse.json({ success: true, po_id: po.id, po_number: poNumber });
  } catch (error) {
    console.error('POST purchase-orders error:', error);
    return NextResponse.json({ error: 'Failed to create purchase order' }, { status: 500 });
  }
}

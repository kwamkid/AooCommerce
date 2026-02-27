import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET - PO detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch PO header
    const { data: po, error: poErr } = await supabaseAdmin
      .from('purchase_orders')
      .select('*')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (poErr || !po) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch supplier
    const { data: supplier } = await supabaseAdmin
      .from('suppliers')
      .select('id, name, supplier_type, contact_name, phone, email')
      .eq('id', po.supplier_id)
      .single();

    // Fetch warehouse
    const { data: warehouse } = await supabaseAdmin
      .from('warehouses')
      .select('id, name, code')
      .eq('id', po.warehouse_id)
      .single();

    // Fetch PO items with variation + product
    const { data: items } = await supabaseAdmin
      .from('purchase_order_items')
      .select(`
        id, variation_id, quantity, received_quantity, unit_cost, notes,
        variation:product_variations(
          id, variation_label, sku, barcode,
          product:products(id, code, name, image)
        )
      `)
      .eq('po_id', id);

    // Fetch receives linked to this PO
    const { data: receives } = await supabaseAdmin
      .from('inventory_receives')
      .select('id, receive_number, status, created_at, notes')
      .eq('po_id', id)
      .order('created_at', { ascending: false });

    // Fetch created_by user
    let createdByUser = null;
    if (po.created_by) {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name, email')
        .eq('id', po.created_by)
        .single();
      createdByUser = profile;
    }

    return NextResponse.json({
      purchase_order: {
        ...po,
        supplier,
        warehouse,
        items: items || [],
        receives: receives || [],
        created_by_user: createdByUser,
      },
    });
  } catch (error) {
    console.error('GET purchase-order detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch purchase order' }, { status: 500 });
  }
}

// PUT - Update PO (draft only: items, notes, dates)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Fetch current PO
    const { data: po } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, status')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (!po) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (po.status !== 'draft') {
      return NextResponse.json({ error: 'สามารถแก้ไขได้เฉพาะ PO ที่เป็นร่างเท่านั้น' }, { status: 400 });
    }

    const { items, notes, expected_date, warehouse_id, supplier_id } = body;

    // Update header
    const updateData: Record<string, unknown> = {};
    if (notes !== undefined) updateData.notes = notes || null;
    if (expected_date !== undefined) updateData.expected_date = expected_date || null;
    if (warehouse_id) updateData.warehouse_id = warehouse_id;
    if (supplier_id) updateData.supplier_id = supplier_id;

    // Recalculate total if items provided
    if (items && Array.isArray(items) && items.length > 0) {
      updateData.total_amount = items.reduce((sum: number, item: { quantity: number; unit_cost: number }) => {
        return sum + (item.quantity * (item.unit_cost || 0));
      }, 0);

      // Delete old items and insert new
      await supabaseAdmin
        .from('purchase_order_items')
        .delete()
        .eq('po_id', id);

      const poItems = items.map((item: { variation_id: string; quantity: number; unit_cost: number; notes?: string }) => ({
        po_id: id,
        variation_id: item.variation_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost || 0,
        notes: item.notes || null,
      }));

      await supabaseAdmin
        .from('purchase_order_items')
        .insert(poItems);
    }

    if (Object.keys(updateData).length > 0) {
      const { error } = await supabaseAdmin
        .from('purchase_orders')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT purchase-order error:', error);
    return NextResponse.json({ error: 'Failed to update purchase order' }, { status: 500 });
  }
}

// PATCH - Update status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    // Fetch current PO
    const { data: po } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, status')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (!po) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      draft: ['sent', 'cancelled'],
      sent: ['partial_received', 'received', 'cancelled', 'closed'],
      partial_received: ['received', 'closed'],
      received: ['closed'],
    };

    const allowed = validTransitions[po.status] || [];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: `ไม่สามารถเปลี่ยนสถานะจาก ${po.status} เป็น ${status} ได้` }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('purchase_orders')
      .update({ status })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH purchase-order status error:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}

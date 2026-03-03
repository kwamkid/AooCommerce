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

    // Fetch receives linked to this PO (with items)
    const { data: receives } = await supabaseAdmin
      .from('inventory_receives')
      .select(`
        id, receive_number, status, created_at, notes,
        items:inventory_receive_items(
          id, variation_id, quantity,
          variation:product_variations(id, variation_label, sku, product:products(id, code, name, image))
        )
      `)
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

// PUT - Update PO (draft or sent: items, notes, dates)
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

    if (po.status !== 'draft' && po.status !== 'sent') {
      return NextResponse.json({ error: 'สามารถแก้ไขได้เฉพาะ PO ที่เป็นร่างหรือแจ้ง Sup แล้วเท่านั้น' }, { status: 400 });
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

      // For sent PO: preserve received_quantity from existing items
      let receivedMap: Record<string, number> = {};
      if (po.status === 'sent') {
        const { data: existingItems } = await supabaseAdmin
          .from('purchase_order_items')
          .select('variation_id, received_quantity')
          .eq('po_id', id);
        if (existingItems) {
          receivedMap = Object.fromEntries(existingItems.map(i => [i.variation_id, i.received_quantity || 0]));
        }
      }

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
        received_quantity: receivedMap[item.variation_id] || 0,
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
    const { status, generate_token, recalculate } = body;

    // Fetch current PO
    const { data: po, error: poErr } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, status')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (poErr || !po) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Helper: read share_token (column may not exist yet)
    const getShareToken = async (): Promise<string | null> => {
      try {
        const { data } = await supabaseAdmin
          .from('purchase_orders')
          .select('share_token')
          .eq('id', id)
          .single();
        return (data as { share_token?: string } | null)?.share_token || null;
      } catch { return null; }
    };

    // Helper: set share_token (generates new one if needed)
    const ensureShareToken = async (): Promise<string | null> => {
      const existing = await getShareToken();
      if (existing) return existing;
      const newToken = 'po_' + crypto.randomUUID().replace(/-/g, '').slice(0, 24);
      try {
        await supabaseAdmin
          .from('purchase_orders')
          .update({ share_token: newToken })
          .eq('id', id);
        return newToken;
      } catch { return null; }
    };

    // Handle recalculate: re-evaluate PO status from actual receive data
    if (recalculate) {
      const { data: poItems } = await supabaseAdmin
        .from('purchase_order_items')
        .select('variation_id, quantity, received_quantity')
        .eq('po_id', id);

      // Also check if any receives have extra items not in PO
      const { data: receives } = await supabaseAdmin
        .from('inventory_receives')
        .select('id, items:inventory_receive_items(variation_id)')
        .eq('po_id', id);

      const poVariationIds = new Set((poItems || []).map(i => i.variation_id));
      const hasExtraItems = (receives || []).some(r =>
        (r.items as { variation_id: string }[]).some(ri => !poVariationIds.has(ri.variation_id))
      );

      if (poItems && poItems.length > 0) {
        const allAtLeast = poItems.every(i => (i.received_quantity || 0) >= i.quantity);
        const allExact = poItems.every(i => (i.received_quantity || 0) === i.quantity);
        const someReceived = poItems.some(i => (i.received_quantity || 0) > 0);

        let newStatus: string | null = null;
        if (allAtLeast) {
          newStatus = (allExact && !hasExtraItems) ? 'received' : 'received_mismatch';
        } else if (someReceived) {
          newStatus = 'partial_received';
        }

        if (newStatus && newStatus !== po.status) {
          await supabaseAdmin
            .from('purchase_orders')
            .update({ status: newStatus })
            .eq('id', id)
            .in('status', ['sent', 'partial_received', 'received', 'received_mismatch']);
          return NextResponse.json({ success: true, new_status: newStatus });
        }
      }
      return NextResponse.json({ success: true, new_status: po.status });
    }

    // Handle generate_token only (no status change)
    if (generate_token && !status) {
      const token = await ensureShareToken();
      return NextResponse.json({ success: true, share_token: token });
    }

    if (!status) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    // Validate status transitions
    const validTransitions: Record<string, string[]> = {
      draft: ['sent', 'cancelled'],
      sent: ['partial_received', 'received', 'received_mismatch', 'cancelled'],
      partial_received: ['received', 'received_mismatch', 'closed'],
      received: ['closed'],
      received_mismatch: ['closed'],
    };

    const allowed = validTransitions[po.status] || [];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: `ไม่สามารถเปลี่ยนสถานะจาก ${po.status} เป็น ${status} ได้` }, { status: 400 });
    }

    // Update status
    const { error } = await supabaseAdmin
      .from('purchase_orders')
      .update({ status })
      .eq('id', id);

    if (error) throw error;

    // Generate share_token when sending PO
    let shareToken: string | null = null;
    if (status === 'sent') {
      shareToken = await ensureShareToken();
    }

    return NextResponse.json({ success: true, share_token: shareToken });
  } catch (error) {
    console.error('PATCH purchase-order status error:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}

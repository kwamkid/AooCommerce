// Path: app/api/reports/supplier/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, hasAnyRole } from '@/lib/supabase-admin';

// GET - Snapshot detail
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

    // Fetch snapshot header
    const { data: snapshot, error: snapErr } = await supabaseAdmin
      .from('supplier_snapshots')
      .select('*')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (snapErr || !snapshot) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch supplier
    const { data: supplier } = await supabaseAdmin
      .from('suppliers')
      .select('id, name, supplier_type, contact_name, phone, email, payment_terms')
      .eq('id', snapshot.supplier_id)
      .single();

    // Fetch stock items with variation + product info
    const { data: stockItems } = await supabaseAdmin
      .from('supplier_snapshot_stock')
      .select('id, warehouse_id, variation_id, quantity')
      .eq('snapshot_id', id);

    // Fetch warehouse names
    const warehouseIds = [...new Set((stockItems || []).map(s => s.warehouse_id))];
    let warehouseMap: Record<string, { id: string; name: string; code: string | null }> = {};
    if (warehouseIds.length > 0) {
      const { data: warehouses } = await supabaseAdmin
        .from('warehouses')
        .select('id, name, code')
        .in('id', warehouseIds);
      if (warehouses) {
        warehouseMap = Object.fromEntries(warehouses.map(w => [w.id, w]));
      }
    }

    // Fetch variation + product info for all items
    const allVariationIds = [...new Set([
      ...(stockItems || []).map(s => s.variation_id),
    ])];

    // Sales items (consignment)
    let salesItems: unknown[] = [];
    if (snapshot.supplier_type === 'consignment') {
      const { data } = await supabaseAdmin
        .from('supplier_snapshot_sales')
        .select('id, variation_id, source, pos_terminal_id, quantity_sold, revenue')
        .eq('snapshot_id', id);
      salesItems = data || [];
      const salesVarIds = (data || []).map((s: { variation_id: string }) => s.variation_id);
      salesVarIds.forEach((vid: string) => { if (!allVariationIds.includes(vid)) allVariationIds.push(vid); });
    }

    // Receive items (credit)
    let receiveItems: unknown[] = [];
    if (snapshot.supplier_type === 'credit') {
      const { data } = await supabaseAdmin
        .from('supplier_snapshot_receives')
        .select('id, receive_id, po_id, variation_id, quantity, amount')
        .eq('snapshot_id', id);
      receiveItems = data || [];
      const recVarIds = (data || []).map((s: { variation_id: string }) => s.variation_id);
      recVarIds.forEach((vid: string) => { if (!allVariationIds.includes(vid)) allVariationIds.push(vid); });
    }

    // Fetch variation details
    let variationMap: Record<string, unknown> = {};
    if (allVariationIds.length > 0) {
      const { data: variations } = await supabaseAdmin
        .from('product_variations')
        .select(`
          id, variation_label, sku, barcode, cost_price,
          product:products(id, code, name, image)
        `)
        .in('id', allVariationIds);

      if (variations) {
        variationMap = Object.fromEntries(variations.map(v => [v.id, v]));
      }
    }

    // Fetch POS terminal names for consignment
    let posTerminalMap: Record<string, string> = {};
    if (snapshot.supplier_type === 'consignment') {
      const posIds = [...new Set(
        (salesItems as { pos_terminal_id: string | null }[])
          .map(s => s.pos_terminal_id)
          .filter(Boolean)
      )] as string[];
      if (posIds.length > 0) {
        const { data: terminals } = await supabaseAdmin
          .from('pos_terminals')
          .select('id, name')
          .in('id', posIds);
        if (terminals) {
          posTerminalMap = Object.fromEntries(terminals.map(t => [t.id, t.name]));
        }
      }
    }

    // Fetch receive/PO references for credit
    let receiveMap: Record<string, { receive_number: string }> = {};
    let poMap: Record<string, { po_number: string }> = {};
    if (snapshot.supplier_type === 'credit') {
      const recIds = [...new Set((receiveItems as { receive_id: string }[]).map(r => r.receive_id).filter(Boolean))];
      const poIds = [...new Set((receiveItems as { po_id: string | null }[]).map(r => r.po_id).filter(Boolean))] as string[];

      if (recIds.length > 0) {
        const { data } = await supabaseAdmin
          .from('inventory_receives')
          .select('id, receive_number')
          .in('id', recIds);
        if (data) receiveMap = Object.fromEntries(data.map(r => [r.id, r]));
      }
      if (poIds.length > 0) {
        const { data } = await supabaseAdmin
          .from('purchase_orders')
          .select('id, po_number')
          .in('id', poIds);
        if (data) poMap = Object.fromEntries(data.map(p => [p.id, p]));
      }
    }

    // Fetch created_by user
    let createdByUser = null;
    if (snapshot.created_by) {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name, email')
        .eq('id', snapshot.created_by)
        .single();
      createdByUser = profile;
    }

    // Enrich items
    const enrichedStock = (stockItems || []).map(s => ({
      ...s,
      warehouse: warehouseMap[s.warehouse_id] || null,
      variation: variationMap[s.variation_id] || null,
    }));

    const enrichedSales = (salesItems as { variation_id: string; pos_terminal_id: string | null }[]).map(s => ({
      ...s,
      variation: variationMap[s.variation_id] || null,
      pos_terminal_name: s.pos_terminal_id ? posTerminalMap[s.pos_terminal_id] || null : null,
    }));

    const enrichedReceives = (receiveItems as { variation_id: string; receive_id: string; po_id: string | null }[]).map(r => ({
      ...r,
      variation: variationMap[r.variation_id] || null,
      receive: r.receive_id ? receiveMap[r.receive_id] || null : null,
      po: r.po_id ? poMap[r.po_id] || null : null,
    }));

    return NextResponse.json({
      snapshot: {
        ...snapshot,
        supplier,
        created_by_user: createdByUser,
        stock_items: enrichedStock,
        sales_items: enrichedSales,
        receive_items: enrichedReceives,
      },
    });
  } catch (error) {
    console.error('GET supplier report detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    if (!hasAnyRole(auth.companyRoles, ['owner', 'admin', 'account'])) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const { data: snapshot } = await supabaseAdmin
      .from('supplier_snapshots')
      .select('id, status')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (!snapshot) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const validTransitions: Record<string, string[]> = {
      draft: ['confirmed'],
      confirmed: ['sent'],
    };

    const allowed = validTransitions[snapshot.status] || [];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: `ไม่สามารถเปลี่ยนสถานะจาก ${snapshot.status} เป็น ${status} ได้` }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('supplier_snapshots')
      .update({ status })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH supplier report status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete draft snapshot
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasAnyRole(auth.companyRoles, ['owner', 'admin'])) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
    }

    const { id } = await params;

    const { data: snapshot } = await supabaseAdmin
      .from('supplier_snapshots')
      .select('id, status')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (!snapshot) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (snapshot.status !== 'draft') {
      return NextResponse.json({ error: 'ลบได้เฉพาะรายงานที่เป็นร่างเท่านั้น' }, { status: 400 });
    }

    // CASCADE will delete stock/sales/receives items
    const { error } = await supabaseAdmin
      .from('supplier_snapshots')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE supplier report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

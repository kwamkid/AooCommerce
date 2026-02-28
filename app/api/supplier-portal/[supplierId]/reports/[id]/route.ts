// Path: app/api/supplier-portal/[supplierId]/reports/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validatePortalAccess } from '@/lib/supplier-portal/validate';

// GET - Snapshot detail (read-only, no customer data)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ supplierId: string; id: string }> }
) {
  try {
    const { supplierId, id } = await params;
    const result = await validatePortalAccess(supplierId);

    if (!result.valid || !result.context) {
      return NextResponse.json({ error: 'Portal unavailable' }, { status: 403 });
    }

    const { companyId } = result.context;

    // Fetch snapshot (only confirmed/sent, verify supplier_id)
    const { data: snapshot } = await supabaseAdmin
      .from('supplier_snapshots')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .in('status', ['confirmed', 'sent'])
      .single();

    if (!snapshot) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch stock items
    const { data: stockItems } = await supabaseAdmin
      .from('supplier_snapshot_stock')
      .select('id, warehouse_id, variation_id, quantity')
      .eq('snapshot_id', id);

    // Warehouse names
    const whIds = [...new Set((stockItems || []).map(s => s.warehouse_id))];
    let whMap: Record<string, { name: string }> = {};
    if (whIds.length > 0) {
      const { data: whs } = await supabaseAdmin.from('warehouses').select('id, name').in('id', whIds);
      if (whs) whMap = Object.fromEntries(whs.map(w => [w.id, w]));
    }

    // Variation info
    const allVarIds = [...new Set([
      ...(stockItems || []).map(s => s.variation_id),
    ])];

    // Sales (consignment)
    let salesItems: unknown[] = [];
    if (snapshot.supplier_type === 'consignment') {
      const { data } = await supabaseAdmin
        .from('supplier_snapshot_sales')
        .select('id, variation_id, source, quantity_sold, revenue')
        .eq('snapshot_id', id);
      salesItems = data || [];
      (data || []).forEach((s: { variation_id: string }) => {
        if (!allVarIds.includes(s.variation_id)) allVarIds.push(s.variation_id);
      });
    }

    // Receives (credit)
    let receiveItems: unknown[] = [];
    if (snapshot.supplier_type === 'credit') {
      const { data } = await supabaseAdmin
        .from('supplier_snapshot_receives')
        .select('id, variation_id, quantity, amount')
        .eq('snapshot_id', id);
      receiveItems = data || [];
      (data || []).forEach((r: { variation_id: string }) => {
        if (!allVarIds.includes(r.variation_id)) allVarIds.push(r.variation_id);
      });
    }

    // Variation details
    let varMap: Record<string, unknown> = {};
    if (allVarIds.length > 0) {
      const { data: variations } = await supabaseAdmin
        .from('product_variations')
        .select(`id, variation_label, sku, barcode, product:products(id, code, name, image)`)
        .in('id', allVarIds);
      if (variations) varMap = Object.fromEntries(variations.map(v => [v.id, v]));
    }

    // Enrich
    const enrichedStock = (stockItems || []).map(s => ({
      ...s,
      warehouse: whMap[s.warehouse_id] || null,
      variation: varMap[s.variation_id] || null,
    }));

    const enrichedSales = (salesItems as { variation_id: string }[]).map(s => ({
      ...s,
      variation: varMap[s.variation_id] || null,
    }));

    const enrichedReceives = (receiveItems as { variation_id: string }[]).map(r => ({
      ...r,
      variation: varMap[r.variation_id] || null,
    }));

    return NextResponse.json({
      snapshot: {
        ...snapshot,
        stock_items: enrichedStock,
        sales_items: enrichedSales,
        receive_items: enrichedReceives,
      },
    });
  } catch (error) {
    console.error('Portal report detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

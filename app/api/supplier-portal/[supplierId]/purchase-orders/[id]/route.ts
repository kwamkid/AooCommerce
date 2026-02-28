// Path: app/api/supplier-portal/[supplierId]/purchase-orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validatePortalAccess } from '@/lib/supplier-portal/validate';

// GET - PO detail (read-only)
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

    // Fetch PO header (verify supplier_id matches)
    const { data: po } = await supabaseAdmin
      .from('purchase_orders')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .neq('status', 'draft')
      .single();

    if (!po) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

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

    // Fetch receives
    const { data: receives } = await supabaseAdmin
      .from('inventory_receives')
      .select('id, receive_number, status, created_at')
      .eq('po_id', id)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      purchase_order: {
        ...po,
        warehouse,
        items: items || [],
        receives: receives || [],
      },
    });
  } catch (error) {
    console.error('Portal PO detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

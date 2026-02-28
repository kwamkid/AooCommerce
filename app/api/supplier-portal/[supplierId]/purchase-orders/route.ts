// Path: app/api/supplier-portal/[supplierId]/purchase-orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validatePortalAccess } from '@/lib/supplier-portal/validate';

// GET - PO list for this supplier
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ supplierId: string }> }
) {
  try {
    const { supplierId } = await params;
    const result = await validatePortalAccess(supplierId);

    if (!result.valid || !result.context) {
      return NextResponse.json({ error: 'Portal unavailable' }, { status: 403 });
    }

    const { companyId } = result.context;

    const { data, error } = await supabaseAdmin
      .from('purchase_orders')
      .select(`
        id, po_number, status, order_date, expected_date, total_amount, notes, created_at,
        warehouse:warehouses(id, name),
        items:purchase_order_items(id, quantity, received_quantity)
      `)
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Portal PO list error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ purchase_orders: data || [] });
  } catch (error) {
    console.error('Portal PO list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

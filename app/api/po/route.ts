// Path: app/api/po/route.ts
// Public API for PO online - no authentication required
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SECRET_KEY!),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Fetch PO by share_token
    const { data: po, error: poErr } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, po_number, status, order_date, expected_date, notes, total_amount, company_id, supplier_id, warehouse_id, created_at')
      .eq('share_token', token)
      .single();

    if (poErr || !po) {
      return NextResponse.json({ error: 'PO not found' }, { status: 404 });
    }

    // Fetch company, supplier, warehouse, items in parallel
    const [companyResult, supplierResult, warehouseResult, itemsResult] = await Promise.all([
      supabaseAdmin
        .from('companies')
        .select('name, logo_url, address, phone, tax_id, tax_company_name')
        .eq('id', po.company_id)
        .single(),
      supabaseAdmin
        .from('suppliers')
        .select('name, contact_name, phone, email')
        .eq('id', po.supplier_id)
        .single(),
      supabaseAdmin
        .from('warehouses')
        .select('name')
        .eq('id', po.warehouse_id)
        .single(),
      supabaseAdmin
        .from('purchase_order_items')
        .select(`
          id, quantity, unit_cost, notes,
          variation:product_variations(
            variation_label, sku, barcode,
            product:products(name, code, image)
          )
        `)
        .eq('po_id', po.id),
    ]);

    const company = companyResult.data;
    const supplier = supplierResult.data;
    const warehouse = warehouseResult.data;
    const items = (itemsResult.data || []).map((item: any) => ({
      product_name: item.variation?.product?.name || '-',
      variation_label: item.variation?.variation_label || null,
      sku: item.variation?.sku || null,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total: item.quantity * item.unit_cost,
      image: item.variation?.product?.image || null,
      notes: item.notes,
    }));

    // Simplify status for public view
    const publicStatus = ['cancelled', 'closed'].includes(po.status) ? po.status : 'sent';

    return NextResponse.json({
      po: {
        po_number: po.po_number,
        status: publicStatus,
        order_date: po.order_date,
        expected_date: po.expected_date,
        notes: po.notes,
        total_amount: po.total_amount,
        created_at: po.created_at,
      },
      company: company
        ? {
            name: company.tax_company_name || company.name,
            logo: company.logo_url,
            address: company.address,
            phone: company.phone,
            tax_id: company.tax_id,
          }
        : null,
      supplier: supplier
        ? {
            name: supplier.name,
            contact_name: supplier.contact_name,
            phone: supplier.phone,
            email: supplier.email,
          }
        : null,
      warehouse: warehouse?.name || null,
      items,
    });
  } catch (error) {
    console.error('GET public PO error:', error);
    return NextResponse.json({ error: 'Failed to fetch PO' }, { status: 500 });
  }
}

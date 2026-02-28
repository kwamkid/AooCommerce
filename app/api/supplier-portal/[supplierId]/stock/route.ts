// Path: app/api/supplier-portal/[supplierId]/stock/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validatePortalAccess, getSupplierVariationIds } from '@/lib/supplier-portal/validate';

// GET - Stock for supplier's products
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
    const variationIds = await getSupplierVariationIds(supplierId, companyId);

    if (variationIds.length === 0) {
      return NextResponse.json({ stock: [] });
    }

    // Fetch inventory
    const { data: inventory } = await supabaseAdmin
      .from('inventory')
      .select('warehouse_id, variation_id, quantity')
      .eq('company_id', companyId)
      .in('variation_id', variationIds)
      .gt('quantity', 0);

    if (!inventory || inventory.length === 0) {
      return NextResponse.json({ stock: [] });
    }

    // Fetch warehouse names
    const warehouseIds = [...new Set(inventory.map(i => i.warehouse_id))];
    const { data: warehouses } = await supabaseAdmin
      .from('warehouses')
      .select('id, name, code')
      .in('id', warehouseIds);
    const whMap = Object.fromEntries((warehouses || []).map(w => [w.id, w]));

    // Fetch variation + product info
    const varIds = [...new Set(inventory.map(i => i.variation_id))];
    const { data: variations } = await supabaseAdmin
      .from('product_variations')
      .select(`
        id, variation_label, sku, barcode,
        product:products(id, code, name, image)
      `)
      .in('id', varIds);
    const varMap = Object.fromEntries((variations || []).map(v => [v.id, v]));

    const stock = inventory.map(i => ({
      ...i,
      warehouse: whMap[i.warehouse_id] || null,
      variation: varMap[i.variation_id] || null,
    }));

    return NextResponse.json({ stock });
  } catch (error) {
    console.error('Portal stock error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

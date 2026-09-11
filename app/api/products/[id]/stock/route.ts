// Path: app/api/products/[id]/stock/route.ts
//
// GET → ready-to-sell stock of one product split by warehouse (popover on /products)
//   { warehouses: [{ warehouse_id, name, type: 'internal'|'consignment', customer_name,
//                    is_default, quantity, available,
//                    variations: [{ variation_id, quantity, available }] }] }
// Source = table `inventory` via RPC get_variation_stock_by_warehouse (composite combos =
// scarcest component per warehouse). Warehouses with nothing on hand/reserved are omitted.
// Order: default internal → other internal (by name) → consignment (by name).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

type StockRow = {
  variation_id: string;
  warehouse_id: string;
  quantity: number | string | null;
  available: number | string | null;
};

type WarehouseRow = {
  id: string;
  name: string;
  is_default: boolean | null;
  warehouse_type: string | null;
  customer: { name: string | null } | { name: string | null }[] | null;
};

interface WarehouseStock {
  warehouse_id: string;
  name: string;
  type: 'internal' | 'consignment';
  customer_name: string | null;
  is_default: boolean;
  quantity: number;
  available: number;
  variations: { variation_id: string; quantity: number; available: number }[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const companyId = auth.companyId;
    const { id } = await params;

    // Both filtered by company — safe to fire together
    const [productRes, varsRes] = await Promise.all([
      supabaseAdmin
        .from('products')
        .select('id')
        .eq('id', id)
        .eq('company_id', companyId)
        .maybeSingle(),
      supabaseAdmin
        .from('product_variations')
        .select('id')
        .eq('product_id', id)
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ]);

    if (productRes.error || !productRes.data) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }
    if (varsRes.error) {
      return NextResponse.json({ error: varsRes.error.message }, { status: 500 });
    }

    const variationIds = ((varsRes.data || []) as { id: string }[]).map(v => v.id);
    if (variationIds.length === 0) return NextResponse.json({ warehouses: [] });

    const { data: stockData, error: stockError } = await supabaseAdmin.rpc(
      'get_variation_stock_by_warehouse',
      { p_company_id: companyId, p_variation_ids: variationIds },
    );
    if (stockError) {
      console.error('[products/[id]/stock] get_variation_stock_by_warehouse failed:', stockError.message);
      return NextResponse.json({ error: stockError.message }, { status: 500 });
    }

    const rows = (stockData || []) as StockRow[];
    const warehouseIds = [...new Set(rows.map(r => r.warehouse_id))];
    if (warehouseIds.length === 0) return NextResponse.json({ warehouses: [] });

    const { data: whData, error: whError } = await supabaseAdmin
      .from('warehouses')
      .select('id, name, is_default, warehouse_type, customer:customers(name)')
      .eq('company_id', companyId)
      .in('id', warehouseIds);
    if (whError) {
      return NextResponse.json({ error: whError.message }, { status: 500 });
    }

    const byWarehouse = new Map<string, WarehouseStock>();
    for (const w of (whData || []) as unknown as WarehouseRow[]) {
      const customer = Array.isArray(w.customer) ? w.customer[0] : w.customer;
      byWarehouse.set(w.id, {
        warehouse_id: w.id,
        name: w.name,
        type: w.warehouse_type === 'consignment' ? 'consignment' : 'internal',
        customer_name: customer?.name ?? null,
        is_default: !!w.is_default,
        quantity: 0,
        available: 0,
        variations: [],
      });
    }

    for (const r of rows) {
      const w = byWarehouse.get(r.warehouse_id);
      if (!w) continue;
      const quantity = Number(r.quantity) || 0;
      const available = Number(r.available) || 0;
      w.quantity += quantity;
      w.available += available;
      w.variations.push({ variation_id: r.variation_id, quantity, available });
    }

    const rank = (w: WarehouseStock) => (w.type === 'internal' ? (w.is_default ? 0 : 1) : 2);
    const warehouses = [...byWarehouse.values()].sort(
      (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'th'),
    );

    return NextResponse.json({ warehouses });
  } catch (error) {
    console.error('[products/[id]/stock] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

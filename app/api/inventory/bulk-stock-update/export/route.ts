import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const warehouseIdsParam = searchParams.get('warehouse_ids') || '';
    const brandIdsParam = searchParams.get('brand_ids') || '';
    const warehouseIds = warehouseIdsParam.split(',').map(s => s.trim()).filter(Boolean);
    const brandIds = brandIdsParam.split(',').map(s => s.trim()).filter(Boolean);

    if (warehouseIds.length === 0) {
      return NextResponse.json({ error: 'กรุณาเลือกอย่างน้อย 1 คลัง' }, { status: 400 });
    }

    // Verify warehouses belong to this company
    const { data: warehouses } = await supabaseAdmin
      .from('warehouses')
      .select('id, name, code')
      .eq('company_id', auth.companyId)
      .in('id', warehouseIds)
      .eq('is_active', true);

    if (!warehouses || warehouses.length !== warehouseIds.length) {
      return NextResponse.json({ error: 'พบคลังที่ไม่ถูกต้อง' }, { status: 400 });
    }

    // Order warehouses by the order they were requested
    const warehouseMap = new Map(warehouses.map(w => [w.id, w]));
    const orderedWarehouses = warehouseIds.map(id => warehouseMap.get(id)!).filter(Boolean);

    // Pull variations + product join (filtered by brand if specified)
    let productQuery = supabaseAdmin
      .from('product_variations')
      .select('id, product_id, variation_label, sku, barcode, is_active, product:products!inner(id, code, name, is_active, brand_id, brand:product_brands(id, name))')
      .eq('company_id', auth.companyId)
      .eq('is_active', true);

    if (brandIds.length > 0) {
      productQuery = productQuery.in('product.brand_id', brandIds);
    }

    productQuery = productQuery.order('product_id');

    const { data: variations, error } = await productQuery;

    if (error) {
      console.error('Template fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Stock per (variation_id, warehouse_id)
    const { data: inv } = await supabaseAdmin
      .from('inventory')
      .select('variation_id, warehouse_id, quantity')
      .eq('company_id', auth.companyId)
      .in('warehouse_id', warehouseIds);

    const stockMap = new Map<string, number>();
    for (const r of inv || []) {
      stockMap.set(`${r.variation_id}|${r.warehouse_id}`, r.quantity || 0);
    }

    type VariationRow = {
      id: string;
      product_id: string;
      variation_label: string | null;
      sku: string | null;
      barcode: string | null;
      product: {
        id: string;
        code: string | null;
        name: string;
        is_active: boolean;
        brand_id: string | null;
        brand: { id: string; name: string } | null;
      } | null;
    };

    const rows = (variations || []) as unknown as VariationRow[];

    const items = rows
      .filter(v => v.product?.is_active)
      .map(v => ({
        product_id: v.product_id,
        variation_id: v.id,
        product_code: v.product?.code || '',
        product_name: v.product?.name || '',
        brand_name: v.product?.brand?.name || '',
        variation_label: v.variation_label || '-',
        sku: v.sku || '',
        barcode: v.barcode || '',
        stocks: Object.fromEntries(
          orderedWarehouses.map(w => [w.id, stockMap.get(`${v.id}|${w.id}`) ?? 0])
        ),
      }));

    return NextResponse.json({
      items,
      warehouses: orderedWarehouses,
    });
  } catch (error) {
    console.error('Template API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

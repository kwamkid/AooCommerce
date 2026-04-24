import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouse_id') || null;

    const { data: variations, error } = await supabaseAdmin
      .from('product_variations')
      .select('id, product_id, variation_label, sku, barcode, is_active, product:products(id, code, name, is_active)')
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .order('product_id');

    if (error) {
      console.error('Template fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let stockMap: Record<string, number> = {};
    if (warehouseId) {
      const { data: inv } = await supabaseAdmin
        .from('inventory')
        .select('variation_id, quantity')
        .eq('company_id', auth.companyId)
        .eq('warehouse_id', warehouseId);
      stockMap = Object.fromEntries((inv || []).map(r => [r.variation_id, r.quantity || 0]));
    }

    type VariationRow = {
      id: string;
      product_id: string;
      variation_label: string | null;
      sku: string | null;
      barcode: string | null;
      product: { id: string; code: string | null; name: string; is_active: boolean } | null;
    };

    const rows = (variations || []) as unknown as VariationRow[];

    const items = rows
      .filter(v => v.product?.is_active)
      .map(v => ({
        product_id: v.product_id,
        variation_id: v.id,
        product_code: v.product?.code || '',
        product_name: v.product?.name || '',
        variation_label: v.variation_label || '-',
        sku: v.sku || '',
        barcode: v.barcode || '',
        current_quantity: stockMap[v.id] ?? 0,
      }));

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Template API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

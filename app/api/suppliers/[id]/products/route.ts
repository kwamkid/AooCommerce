import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET - Products belonging to a supplier (through brand linkage)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: supplierId } = await params;

    // 1. Find brands linked to this supplier
    const { data: brands } = await supabaseAdmin
      .from('product_brands')
      .select('id')
      .eq('supplier_id', supplierId)
      .eq('company_id', auth.companyId)
      .eq('is_active', true);

    if (!brands || brands.length === 0) {
      return NextResponse.json({ variations: [] });
    }

    const brandIds = brands.map(b => b.id);

    // 2. Find products with those brands
    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id, code, name, image, brand_id')
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .in('brand_id', brandIds);

    if (!products || products.length === 0) {
      return NextResponse.json({ variations: [] });
    }

    const productIds = products.map(p => p.id);
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    // 3. Fetch variations for these products
    const { data: variations } = await supabaseAdmin
      .from('product_variations')
      .select('id, product_id, variation_label, sku, barcode, default_price, cost_price, is_active')
      .in('product_id', productIds)
      .eq('is_active', true);

    // 4. Flatten: each variation with its product info
    const result = (variations || []).map(v => {
      const prod = productMap[v.product_id];
      return {
        variation_id: v.id,
        product_id: v.product_id,
        product_code: prod?.code || '',
        product_name: prod?.name || '',
        product_image: prod?.image || null,
        variation_label: v.variation_label,
        sku: v.sku,
        barcode: v.barcode,
        default_price: v.default_price,
        cost_price: v.cost_price,
      };
    });

    return NextResponse.json({ variations: result });
  } catch (error) {
    console.error('GET supplier products error:', error);
    return NextResponse.json({ error: 'Failed to fetch supplier products' }, { status: 500 });
  }
}

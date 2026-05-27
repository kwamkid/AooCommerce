import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

/**
 * GET /api/products/bulk/price/export
 *   ?brand_ids=uuid,uuid&category_ids=uuid,uuid
 *
 * Returns one row per VARIATION (price lives on product_variations).
 * cost_price only included when caller has can_view_cost.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canViewCost = auth.canViewCost === true;

    const { searchParams } = new URL(request.url);
    const brandIds = (searchParams.get('brand_ids') || '').split(',').map(s => s.trim()).filter(Boolean);
    const categoryIds = (searchParams.get('category_ids') || '').split(',').map(s => s.trim()).filter(Boolean);

    let q = supabaseAdmin
      .from('product_variations')
      .select('id, product_id, variation_label, sku, default_price, discount_price, cost_price, product:products!inner(id, code, name, is_active, brand_id, category_id)')
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .eq('product.is_active', true);

    if (brandIds.length > 0) q = q.in('product.brand_id', brandIds);
    if (categoryIds.length > 0) q = q.in('product.category_id', categoryIds);

    q = q.order('product_id');

    const { data, error } = await q;
    if (error) {
      console.error('price export error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type Row = {
      id: string;
      product_id: string;
      variation_label: string | null;
      sku: string | null;
      default_price: number | null;
      discount_price: number | null;
      cost_price: number | null;
      product: { id: string; code: string | null; name: string; is_active: boolean } | null;
    };

    const items = (data || [])
      .map(v => v as unknown as Row)
      .filter(v => v.product?.is_active)
      .map(v => {
        // Clean variation_label: if equals SKU/code → display as "-"
        const rawLabel = v.variation_label || '';
        const code = v.product?.code || '';
        const sku = v.sku || '';
        const variationLabel =
          rawLabel === '' || rawLabel === sku || rawLabel === code || rawLabel === '-' ? '-' : rawLabel;

        return {
          product_id: v.product_id,
          variation_id: v.id,
          product_code: code,
          product_name: v.product?.name || '',
          variation_label: variationLabel,
          sku,
          default_price: v.default_price ?? 0,
          discount_price: v.discount_price ?? 0,
          cost_price: canViewCost ? (v.cost_price ?? 0) : null,
        };
      });

    return NextResponse.json({ items, can_view_cost: canViewCost });
  } catch (error) {
    console.error('price export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

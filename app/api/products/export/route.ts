import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';
import { loadCompositeExportInfo } from '@/lib/bulk/composite-import';

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canViewCost = auth.canViewCost === true;

    const body = await request.json();

    const { data, error } = await supabaseAdmin.rpc('export_products', {
      p_company_id: auth.companyId,
      p_search: body.search || null,
      p_category_id: body.category_id || null,
      p_brand_id: body.brand_id || null,
      p_shop_account_id: body.shop_account_id || null,
      p_include_cost: canViewCost,
    });

    if (error) {
      console.error('export_products RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const payload = (data || { products: [], shops: [], links: [] }) as {
      products: { product_id: string; variations: { variation_id: string }[] }[];
    };

    // Composite products (สินค้าชุด): the RPC labels them 'variation' (variation_label NULL) —
    // flag them here and attach each combo's component cell + manual-price flag
    const { compositeProductIds, combos } = await loadCompositeExportInfo(
      supabaseAdmin,
      auth.companyId,
      (payload.products || []).map(p => p.product_id),
    );
    if (compositeProductIds.size > 0) {
      payload.products = payload.products.map(p =>
        compositeProductIds.has(p.product_id)
          ? {
              ...p,
              is_composite: true,
              variations: (p.variations || []).map(v => ({
                ...v,
                components: combos.get(v.variation_id)?.components || '',
                price_locked: combos.get(v.variation_id)?.price_locked === true,
              })),
            }
          : p,
      );
    }

    return NextResponse.json({
      ...payload,
      can_view_cost: canViewCost,
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

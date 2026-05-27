import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

/**
 * GET /api/products/bulk/basic-info/export
 *   ?brand_ids=uuid,uuid&category_ids=uuid,uuid&status=active|inactive|all
 *
 * Returns one row per product (NOT per variation) — basic info lives on products table.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const brandIds = (searchParams.get('brand_ids') || '').split(',').map(s => s.trim()).filter(Boolean);
    const categoryIds = (searchParams.get('category_ids') || '').split(',').map(s => s.trim()).filter(Boolean);
    const status = searchParams.get('status') || 'active'; // active | inactive | all

    let q = supabaseAdmin
      .from('products')
      .select('id, code, name, description, is_active, brand_id, category_id, brand:product_brands(id, name), category:product_categories(id, name)')
      .eq('company_id', auth.companyId);

    if (status === 'active') q = q.eq('is_active', true);
    else if (status === 'inactive') q = q.eq('is_active', false);

    if (brandIds.length > 0) q = q.in('brand_id', brandIds);
    if (categoryIds.length > 0) q = q.in('category_id', categoryIds);

    q = q.order('name');

    const { data, error } = await q;
    if (error) {
      console.error('basic-info export error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    type Row = {
      id: string;
      code: string | null;
      name: string;
      description: string | null;
      is_active: boolean;
      brand: { id: string; name: string } | null;
      category: { id: string; name: string } | null;
    };

    const items = (data || []).map(p => {
      const r = p as unknown as Row;
      return {
        product_id: r.id,
        code: r.code || '',
        name: r.name,
        description: r.description || '',
        is_active: r.is_active,
        brand_name: r.brand?.name || '',
        category_name: r.category?.name || '',
      };
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('basic-info export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

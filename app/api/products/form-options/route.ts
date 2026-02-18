import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

/**
 * GET /api/products/form-options
 * Returns categories, brands, and variation_types in a single request
 * (replaces 3 separate API calls from ProductForm)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Run all 3 queries in parallel
    const [categoriesResult, brandsResult, variationTypesResult] = await Promise.all([
      supabaseAdmin
        .from('product_categories')
        .select('*')
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabaseAdmin
        .from('product_brands')
        .select('*')
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabaseAdmin
        .from('variation_types')
        .select('*')
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ]);

    if (categoriesResult.error) throw categoriesResult.error;
    if (brandsResult.error) throw brandsResult.error;
    if (variationTypesResult.error) throw variationTypesResult.error;

    // Nest categories (same logic as /api/categories GET)
    const rows = categoriesResult.data || [];
    const parents = rows.filter((r: { parent_id: string | null }) => !r.parent_id);
    const nested = parents.map((p: { id: string; parent_id: string | null }) => ({
      ...p,
      children: rows.filter((c: { parent_id: string | null }) => c.parent_id === p.id),
    }));
    const parentIds = new Set(parents.map((p: { id: string }) => p.id));
    const orphans = rows.filter((r: { parent_id: string | null }) => r.parent_id && !parentIds.has(r.parent_id));
    for (const o of orphans) {
      nested.push({ ...o, parent_id: null, children: [] });
    }

    return NextResponse.json({
      categories: nested,
      brands: brandsResult.data || [],
      variation_types: variationTypesResult.data || [],
    });
  } catch (error) {
    console.error('GET form-options error:', error);
    return NextResponse.json({ error: 'Failed to fetch form options' }, { status: 500 });
  }
}

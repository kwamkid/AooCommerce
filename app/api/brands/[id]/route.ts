import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET - Fetch brand detail with products
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Fetch brand
    const { data: brand, error: brandError } = await supabaseAdmin
      .from('product_brands')
      .select('*, supplier:suppliers(id, name, supplier_type)')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    if (brandError || !brand) {
      return NextResponse.json({ error: 'ไม่พบ Brand นี้' }, { status: 404 });
    }

    // Fetch products in this brand
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, code, name, image, product_type, created_at')
      .eq('brand_id', id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (productsError) throw productsError;

    return NextResponse.json({ brand, products: products || [] });
  } catch (error) {
    console.error('GET brand detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch brand' }, { status: 500 });
  }
}

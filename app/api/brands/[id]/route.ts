import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { guardFeature } from '@/lib/package-gates-server';

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
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'product_brand');
    if (blocked) return blocked;

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
    // ⚠️ แบรนด์ใหญ่มีสินค้าเกิน 1,000 ตัวได้ — ตัดเงียบแล้วหน้าแบรนด์โชว์ไม่ครบ
    const { rows: products, error: productsError } = await fetchAllRows((from, to) => supabaseAdmin
      .from('products')
      .select('id, code, name, image, created_at')
      .eq('brand_id', id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .order('id')
      .range(from, to));

    if (productsError) throw productsError;

    return NextResponse.json({ brand, products: products || [] });
  } catch (error) {
    console.error('GET brand detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch brand' }, { status: 500 });
  }
}

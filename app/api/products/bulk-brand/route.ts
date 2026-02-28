import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { product_ids, brand_id } = body as { product_ids: string[]; brand_id: string };

    if (!product_ids || product_ids.length === 0) {
      return NextResponse.json({ error: 'ต้องเลือกสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
    }
    if (!brand_id) {
      return NextResponse.json({ error: 'ต้องเลือก Brand' }, { status: 400 });
    }

    // Verify brand belongs to this company
    const { data: brand } = await supabaseAdmin
      .from('product_brands')
      .select('id')
      .eq('id', brand_id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    if (!brand) {
      return NextResponse.json({ error: 'ไม่พบ Brand นี้' }, { status: 404 });
    }

    // Bulk update
    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ brand_id, updated_at: new Date().toISOString() })
      .in('id', product_ids)
      .eq('company_id', auth.companyId)
      .select('id');

    if (error) throw error;

    return NextResponse.json({ success: true, updated: data?.length || 0 });
  } catch (error) {
    console.error('Bulk brand update error:', error);
    return NextResponse.json({ error: 'ไม่สามารถกำหนด Brand ได้' }, { status: 500 });
  }
}

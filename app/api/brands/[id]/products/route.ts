import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

// POST - Add products to this brand
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'masterdata.brands')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { product_ids } = body as { product_ids: string[] };

    if (!product_ids || product_ids.length === 0) {
      return NextResponse.json({ error: 'ต้องเลือกสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
    }

    // Verify brand belongs to this company
    const { data: brand } = await supabaseAdmin
      .from('product_brands')
      .select('id')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    if (!brand) {
      return NextResponse.json({ error: 'ไม่พบ Brand นี้' }, { status: 404 });
    }

    // Update products
    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ brand_id: id, updated_at: new Date().toISOString() })
      .in('id', product_ids)
      .eq('company_id', auth.companyId)
      .select('id');

    if (error) throw error;

    return NextResponse.json({ success: true, updated: data?.length || 0 });
  } catch (error) {
    console.error('Add products to brand error:', error);
    return NextResponse.json({ error: 'ไม่สามารถเพิ่มสินค้าได้' }, { status: 500 });
  }
}

// DELETE - Remove products from this brand
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'masterdata.brands')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const productIds = searchParams.get('product_ids')?.split(',').filter(Boolean);

    if (!productIds || productIds.length === 0) {
      return NextResponse.json({ error: 'ต้องเลือกสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
    }

    // Remove brand from products (set brand_id = null)
    const { data, error } = await supabaseAdmin
      .from('products')
      .update({ brand_id: null, updated_at: new Date().toISOString() })
      .in('id', productIds)
      .eq('brand_id', id)
      .eq('company_id', auth.companyId)
      .select('id');

    if (error) throw error;

    return NextResponse.json({ success: true, removed: data?.length || 0 });
  } catch (error) {
    console.error('Remove products from brand error:', error);
    return NextResponse.json({ error: 'ไม่สามารถนำสินค้าออกได้' }, { status: 500 });
  }
}

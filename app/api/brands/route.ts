import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

// GET - Fetch all brands (flat list)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('product_brands')
      .select('*, supplier:suppliers(id, name, supplier_type)')
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('GET brands error:', error);
    return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 });
  }
}

// POST - Create brand
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'masterdata.brands')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Get max sort_order
    const { data: maxData } = await supabaseAdmin
      .from('product_brands')
      .select('sort_order')
      .eq('company_id', auth.companyId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxData?.sort_order || 0) + 1;

    const { data, error } = await supabaseAdmin
      .from('product_brands')
      .insert({
        company_id: auth.companyId,
        name: name.trim(),
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'แบรนด์นี้มีอยู่แล้ว' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('POST brands error:', error);
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 });
  }
}

// PUT - Update brand
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'masterdata.brands')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, sort_order, supplier_id, default_gp_rate, gp_base_price } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (supplier_id !== undefined) updateData.supplier_id = supplier_id || null;
    if (default_gp_rate !== undefined) updateData.default_gp_rate = default_gp_rate === '' || default_gp_rate === null ? null : Number(default_gp_rate);
    if (gp_base_price !== undefined) updateData.gp_base_price = gp_base_price || 'retail';

    const { data, error } = await supabaseAdmin
      .from('product_brands')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'แบรนด์นี้มีอยู่แล้ว' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('PUT brands error:', error);
    return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 });
  }
}

// DELETE - Soft delete brand
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'masterdata.brands')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('product_brands')
      .update({ is_active: false })
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE brands error:', error);
    return NextResponse.json({ error: 'Failed to delete brand' }, { status: 500 });
  }
}

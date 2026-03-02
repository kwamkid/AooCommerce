import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — list all tags for company
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { data, error } = await supabaseAdmin
      .from('customer_tags')
      .select('*, customer_tag_links(count)')
      .eq('company_id', companyId)
      .order('name');

    if (error) throw error;
    const tags = (data || []).map(t => ({
      id: t.id,
      name: t.name,
      color: t.color,
      count: t.customer_tag_links?.[0]?.count ?? 0,
    }));
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Customer tags GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — create new tag
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { name, color } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('customer_tags')
      .insert({ company_id: companyId, name: name.trim(), color: color || '#6B7280' })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'แท็กชื่อนี้มีอยู่แล้ว' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ tag: data });
  } catch (error) {
    console.error('Customer tags POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — update tag
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id, name, color } = await request.json();
    if (!id) return NextResponse.json({ error: 'Tag id is required' }, { status: 400 });

    const updates: Record<string, string> = {};
    if (name?.trim()) updates.name = name.trim();
    if (color) updates.color = color;

    const { data, error } = await supabaseAdmin
      .from('customer_tags')
      .update(updates)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'แท็กชื่อนี้มีอยู่แล้ว' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ tag: data });
  } catch (error) {
    console.error('Customer tags PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — delete tag (cascade removes links)
export async function DELETE(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Tag id is required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('customer_tags')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Customer tags DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

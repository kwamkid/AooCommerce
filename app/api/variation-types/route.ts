// Path: app/api/variation-types/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function checkAuth(request: NextRequest): Promise<{ isAuth: boolean; userId?: string }> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return { isAuth: false };
    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return { isAuth: false };
    return { isAuth: true, userId: user.id };
  } catch {
    return { isAuth: false };
  }
}

// GET - Fetch all variation types
export async function GET(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('variation_types')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('GET variation-types error:', error);
    return NextResponse.json({ error: 'Failed to fetch variation types' }, { status: 500 });
  }
}

// POST - Create new variation type
export async function POST(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Get max sort_order
    const { data: maxData } = await supabaseAdmin
      .from('variation_types')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxData?.sort_order || 0) + 1;

    const { data, error } = await supabaseAdmin
      .from('variation_types')
      .insert({ name: name.trim(), sort_order: nextOrder })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'ชื่อประเภทนี้มีอยู่แล้ว' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('POST variation-types error:', error);
    return NextResponse.json({ error: 'Failed to create variation type' }, { status: 500 });
  }
}

// PUT - Update variation type
export async function PUT(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name, sort_order } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (sort_order !== undefined) updateData.sort_order = sort_order;

    const { data, error } = await supabaseAdmin
      .from('variation_types')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'ชื่อประเภทนี้มีอยู่แล้ว' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('PUT variation-types error:', error);
    return NextResponse.json({ error: 'Failed to update variation type' }, { status: 500 });
  }
}

// DELETE - Soft delete variation type
export async function DELETE(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('variation_types')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE variation-types error:', error);
    return NextResponse.json({ error: 'Failed to delete variation type' }, { status: 500 });
  }
}

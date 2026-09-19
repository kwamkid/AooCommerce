import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { masterSlugErrorMessage, validateMasterSlug } from '@/lib/master-slug';

interface CategoryRow {
  id: string;
  company_id: string;
  parent_id: string | null;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// GET - Fetch all categories (nested parent → children)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ⚠️ Supabase ตัดผลลัพธ์ที่ 1,000 แถว **เงียบ ๆ ไม่มี error** — หน้าที่เอาไปค้นฝั่ง
    //    เบราว์เซอร์จะ "หาหมวดหมู่ไม่เจอ" ทั้งที่มีอยู่จริง · `fetchAllRows` ไล่ทุกหน้าให้
    const { rows: data, error } = await fetchAllRows((from, to) => supabaseAdmin
      .from('product_categories')
      .select('*')
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('id')
      .range(from, to));

    if (error) throw error;

    // Nest children under parents
    const rows = (data || []) as CategoryRow[];
    const parents = rows.filter(r => !r.parent_id);
    const nested = parents.map(p => ({
      ...p,
      children: rows.filter(c => c.parent_id === p.id),
    }));
    // Also include orphan children (parent was deleted)
    const parentIds = new Set(parents.map(p => p.id));
    const orphans = rows.filter(r => r.parent_id && !parentIds.has(r.parent_id));
    for (const o of orphans) {
      nested.push({ ...o, parent_id: null, children: [] });
    }

    return NextResponse.json({ data: nested });
  } catch (error) {
    console.error('GET categories error:', error);
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
  }
}

// POST - Create category
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'masterdata.categories')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { name, parent_id } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Get max sort_order
    const { data: maxData } = await supabaseAdmin
      .from('product_categories')
      .select('sort_order')
      .eq('company_id', auth.companyId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxData?.sort_order || 0) + 1;

    const { data, error } = await supabaseAdmin
      .from('product_categories')
      .insert({
        company_id: auth.companyId,
        name: name.trim(),
        parent_id: parent_id || null,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'หมวดหมู่นี้มีอยู่แล้ว' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('POST categories error:', error);
    return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
  }
}

// PUT - Update category
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'masterdata.categories')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, sort_order, parent_id, slug } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name.trim();
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (parent_id !== undefined) updateData.parent_id = parent_id || null;
    // ลิงก์หน้าร้าน (`?cat=<slug>`) — แก้ได้จากหน้าหมวดหมู่ ผ่านกติกาชุดเดียวกับหน้าจอ
    // ⛔ ตอน **สร้าง** ไม่รับค่านี้ ปล่อยให้ trigger `slugify_th` ที่ DB เติมให้เหมือนเดิม
    if (slug !== undefined) {
      const slugError = validateMasterSlug(String(slug || ''));
      if (slugError) {
        return NextResponse.json({ error: masterSlugErrorMessage(slugError) }, { status: 400 });
      }
      updateData.slug = String(slug).trim();
    }

    const { data, error } = await supabaseAdmin
      .from('product_categories')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .select()
      .single();

    if (error) {
      // ตารางมี unique ทั้งชื่อและ slug — บอกให้ตรงว่าอันไหนซ้ำ ไม่งั้นผู้ใช้แก้ผิดช่อง
      if (error.code === '23505') {
        const clash = /slug/i.test(error.message) ? 'ลิงก์นี้ถูกใช้ไปแล้วในร้านนี้' : 'หมวดหมู่นี้มีอยู่แล้ว';
        return NextResponse.json({ error: clash }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('PUT categories error:', error);
    return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
  }
}

// DELETE - Soft delete category
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'masterdata.categories')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('product_categories')
      .update({ is_active: false })
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE categories error:', error);
    return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
  }
}

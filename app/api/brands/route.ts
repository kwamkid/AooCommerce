import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { guardFeature } from '@/lib/package-gates-server';
import { masterSlugErrorMessage, validateMasterSlug } from '@/lib/master-slug';

// GET - Fetch all brands (flat list)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'product_brand');
    if (blocked) return blocked;

    // ⚠️ Supabase ตัดผลลัพธ์ที่ 1,000 แถว **เงียบ ๆ ไม่มี error** — หน้าที่เอาไปค้นฝั่ง
    //    เบราว์เซอร์จะ "หาแบรนด์ไม่เจอ" ทั้งที่มีอยู่จริง · `fetchAllRows` ไล่ทุกหน้าให้
    const { rows: data, error } = await fetchAllRows((from, to) => supabaseAdmin
      .from('product_brands')
      .select('*, supplier:suppliers(id, name, supplier_type)')
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .range(from, to));

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
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'product_brand');
    if (blocked) return blocked;
    if (!can(auth, 'masterdata.brands')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    // ฟอร์มเพิ่ม/แก้ไขเป็นใบเดียวกัน (หน้า /settings/brands) — ตอนสร้างจึงส่งครบทุกช่อง
    // เหมือนตอนแก้ ⛔ ห้ามตัดเหลือแค่ชื่อ ไม่งั้นค่าที่ผู้ใช้กรอกตอนสร้างหายเงียบ
    //
    // ⛔ **ห้ามรับ/เขียน `default_gp_rate` · `gp_base_price` ที่นี่** — `product_brands` ไม่มี
    //    สองคอลัมน์นี้ ส่งไปเมื่อไหร่ PostgREST ตีกลับทั้งใบ (สร้างแบรนด์ไม่ได้เลย)
    //    GP ระดับแบรนด์ของจริงอยู่ที่ `companies.settings.brand_gp_overrides`
    //    (ตั้งค่า › ลูกค้าธุรกิจ) ซึ่ง `lib/gp-resolver.ts` อ่านตัวนั้น
    const { name, logo_url, supplier_id } = body;

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
        logo_url: (logo_url || '').trim() || null,
        supplier_id: supplier_id || null,
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
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'product_brand');
    if (blocked) return blocked;
    if (!can(auth, 'masterdata.brands')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    // ⛔ ไม่รับ `default_gp_rate`/`gp_base_price` — เหตุผลเดียวกับ POST ข้างบน
    const { id, name, sort_order, supplier_id, logo_url, slug } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (supplier_id !== undefined) updateData.supplier_id = supplier_id || null;
    // ลิงก์หน้าร้าน (`?brand=<slug>`) — แก้ได้จากหน้าแบรนด์ แต่ต้องผ่านกติกาชุดเดียวกับหน้าจอ
    // ⛔ ตอน **สร้าง** ไม่รับค่านี้ ปล่อยให้ trigger `slugify_th` ที่ DB เติมให้เหมือนเดิม
    if (slug !== undefined) {
      const slugError = validateMasterSlug(String(slug || ''));
      if (slugError) {
        return NextResponse.json({ error: masterSlugErrorMessage(slugError) }, { status: 400 });
      }
      updateData.slug = String(slug).trim();
    }
    // โลโก้แบรนด์ — หน้าร้านดึงไปแสดงบนหัวหน้ากรองแบรนด์ · ลบรูปแล้วส่งค่าว่างมาได้ (เก็บเป็น null)
    if (logo_url !== undefined) updateData.logo_url = (logo_url || '').trim() || null;

    const { data, error } = await supabaseAdmin
      .from('product_brands')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .select()
      .single();

    if (error) {
      // ตารางมี unique ทั้งชื่อและ slug — บอกให้ตรงว่าอันไหนซ้ำ ไม่งั้นผู้ใช้แก้ผิดช่อง
      if (error.code === '23505') {
        const clash = /slug/i.test(error.message) ? 'ลิงก์นี้ถูกใช้ไปแล้วในร้านนี้' : 'แบรนด์นี้มีอยู่แล้ว';
        return NextResponse.json({ error: clash }, { status: 400 });
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
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'product_brand');
    if (blocked) return blocked;
    if (!can(auth, 'masterdata.brands')) {
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

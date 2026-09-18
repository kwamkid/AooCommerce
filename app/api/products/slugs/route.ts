// Path: app/api/products/slugs/route.ts
//
// ลิงก์หน้าร้านของสินค้า (`/p/<slug>`) — อ่านทั้งร้านทีเดียว + บันทึกทีละหลายตัว
// ใช้โดยหน้า /settings/storefront/links (ตารางแก้สดบนเว็บ)
//
// ⛔ กติกาตัวอักษรอยู่ที่ lib/master-slug.ts ที่เดียว (หน้าจอ import ตัวเดียวกัน)
// ⛔ ผิดแถวเดียว = ตีกลับทั้งชุด ไม่บันทึกบางส่วน — ไม่งั้นผู้ใช้กดบันทึกทีเดียวแล้ว
//    ได้ผลครึ่ง ๆ โดยไม่รู้ว่าแถวไหนเข้าแถวไหนไม่เข้า

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { masterSlugErrorMessage, validateMasterSlug } from '@/lib/master-slug';

interface SlugItem {
  id: string;
  slug: string;
}

/** GET — สินค้าที่ขึ้นหน้าร้านทั้งหมดพร้อมลิงก์ปัจจุบัน */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'product.view')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ดำเนินการนี้' }, { status: 403 });
    }

    // ร้านมีสินค้าหลักพัน — `fetchAllRows` กันเพดาน 1,000 แถวของ Supabase ที่ตัดเงียบ
    // ⚠️ คืน `{ rows, count, error }` ไม่ใช่ array ตรง ๆ — ส่งทั้งก้อนออกไปคือหน้าจอพัง
    const { rows, error } = await fetchAllRows<{
      id: string; name: string; slug: string | null; image: string | null; code: string | null;
    }>((from, to) => supabaseAdmin
      .from('products')
      .select('id, name, slug, image, code')
      .eq('company_id', auth.companyId!)
      .eq('is_active', true)
      .eq('storefront_visible', true)
      .order('name', { ascending: true })
      .range(from, to));

    if (error) throw new Error(error.message);

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error('GET product slugs error:', error);
    return NextResponse.json({ error: 'โหลดข้อมูลไม่สำเร็จ' }, { status: 500 });
  }
}

/** PATCH — บันทึกลิงก์ที่แก้ไว้ทั้งชุด */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'product.manage')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ดำเนินการนี้' }, { status: 403 });
    }

    const body = await request.json();
    const items: SlugItem[] = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ error: 'ไม่มีรายการให้บันทึก' }, { status: 400 });
    }

    // ── ตรวจให้ครบก่อนเขียนแถวแรก ──
    const seen = new Map<string, string>(); // slug → product id (กันซ้ำกันเองในชุดที่ส่งมา)
    const cleaned: SlugItem[] = [];
    for (const item of items) {
      const id = String(item?.id || '');
      const slug = String(item?.slug || '').trim();
      if (!id) return NextResponse.json({ error: 'รายการไม่ครบ (ไม่มีรหัสสินค้า)' }, { status: 400 });

      const slugError = validateMasterSlug(slug);
      if (slugError) {
        return NextResponse.json({ error: `${masterSlugErrorMessage(slugError)} (${slug || 'ค่าว่าง'})` }, { status: 400 });
      }
      if (seen.has(slug)) {
        return NextResponse.json({ error: `ลิงก์ซ้ำกันเองในรายการที่แก้: ${slug}` }, { status: 400 });
      }
      seen.set(slug, id);
      cleaned.push({ id, slug });
    }

    // ซ้ำกับสินค้าตัวอื่นในร้านที่ไม่ได้อยู่ในชุดนี้ (unique index จับให้อีกชั้น แต่ตอบ
    // ข้อความไทยพร้อมชื่อสินค้าได้เฉพาะตรงนี้)
    const editedIds = new Set(cleaned.map(item => item.id));
    const { data: clashes } = await supabaseAdmin
      .from('products')
      .select('id, name, slug')
      .eq('company_id', auth.companyId)
      .in('slug', cleaned.map(item => item.slug));
    const clash = (clashes || []).find(row => !editedIds.has(row.id));
    if (clash) {
      return NextResponse.json(
        { error: `ลิงก์ "${clash.slug}" ถูกใช้กับสินค้า "${clash.name}" อยู่แล้ว` },
        { status: 400 },
      );
    }

    // ── เขียน ──
    let updated = 0;
    for (const item of cleaned) {
      const { error } = await supabaseAdmin
        .from('products')
        .update({ slug: item.slug })
        .eq('id', item.id)
        .eq('company_id', auth.companyId);
      if (error) {
        if (error.code === '23505') {
          return NextResponse.json(
            { error: `ลิงก์ "${item.slug}" ถูกใช้ไปแล้ว (บันทึกไปก่อนหน้านี้ ${updated} รายการ)` },
            { status: 400 },
          );
        }
        throw error;
      }
      updated += 1;
    }

    return NextResponse.json({ updated });
  } catch (error) {
    console.error('PATCH product slugs error:', error);
    return NextResponse.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 });
  }
}

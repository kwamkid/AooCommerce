// Path: app/api/storefront/link-targets/route.ts
//
// "มีอะไรให้ลิงก์ไปได้บ้างในหน้าร้าน" — ป้อนโมดัลแทรกลิงก์ (แชท · ข้อความสำเร็จรูป · ข้อความคูปอง)
//
// ⛔ **ห้ามใช้ `/api/products/search` แทน** — ตัวนั้นไม่คืน `slug` และไม่รู้ว่าสินค้าขึ้นหน้าร้าน
// จริงไหม ⇒ จะแทรกลิงก์ที่เปิดแล้วเจอ 404 ไปหาลูกค้า · เงื่อนไขที่นี่ต้องตรงกับ
// `fillStorefrontProductLinks()` และ `getStorefrontProduct()` เป๊ะ (active + storefront_visible + มี slug)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

const PRODUCT_LIMIT = 40;

export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const type = request.nextUrl.searchParams.get('type') || 'product';
  const q = (request.nextUrl.searchParams.get('q') || '').trim();

  if (type === 'category') {
    // หมวดมีหลักสิบ — ส่งครบแล้วให้หน้าจอกรองเอง ไม่ต้องยิงตามทุกตัวอักษร
    const { data, error } = await supabaseAdmin
      .from('product_categories')
      .select('id, name, slug')
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .not('slug', 'is', null)
      .order('sort_order', { ascending: true });
    if (error) return NextResponse.json({ error: 'Failed to load categories' }, { status: 500 });
    return NextResponse.json({ items: data || [], complete: true });
  }

  let query = supabaseAdmin
    .from('products')
    .select('id, name, slug, image')
    .eq('company_id', auth.companyId)
    .eq('is_active', true)
    .eq('storefront_visible', true)
    .not('slug', 'is', null)
    .order('name', { ascending: true })
    .limit(PRODUCT_LIMIT);
  if (q) query = query.ilike('name', `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Failed to load products' }, { status: 500 });
  return NextResponse.json({
    items: data || [],
    // ชนเพดานพอดี = อาจมีมากกว่านี้ บอกหน้าจอให้เตือนว่าพิมพ์ค้นเพิ่มได้
    complete: (data || []).length < PRODUCT_LIMIT,
  });
}

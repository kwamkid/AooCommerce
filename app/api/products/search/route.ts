// Path: app/api/products/search/route.ts
//
// ช่องค้นหาสินค้าของฟอร์มเปิดบิล — ค้นรอบเดียวผ่าน RPC `search_order_products`
//
// ทำไมไม่ใช้ `/api/products?search=`: route นั้นยิง DB **3 รอบต่อกัน**
// (sku/barcode → products → view + รูป) แล้วส่งกลับ ~220KB ต่อการค้นหนึ่งครั้ง
// เพราะมันคืนสินค้าทั้งก้อนพร้อม variation/รูป/ราคาทุกช่องสำหรับหน้า /products
// ช่อง dropdown ใช้แค่ 11 คอลัมน์ → RPC คืนแถวแบน ~30KB ใน 1 รอบ
// (ดัชนี trigram idx_products_name_trgm ฯลฯ ทำให้ ilike '%q%' ใช้ index)
//
// ดู supabase/migrations/20260907_search_order_products.sql + fix-bug.md 2026-09-07
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const q = (sp.get('q') || '').trim();
    const limit = Math.max(1, Math.min(200, Number(sp.get('limit') ?? 80) || 80));
    // ฟอร์มจัดการสต็อก (รับเข้า/เบิกออก/โอนย้าย/PO) ตัดสินค้าชุดออก — ชุดย่อยไม่มีสต็อกของตัวเอง
    const excludeComposite = sp.get('exclude_composite') === '1';

    // คำค้นว่าง = ไม่มีอะไรให้ค้น — ไม่ต้องรบกวน DB
    if (!q) return NextResponse.json({ items: [], complete: true });

    const { data, error } = await supabaseAdmin.rpc('search_order_products', {
      p_company_id: auth.companyId,
      p_query: q,
      p_limit: limit,
    });

    if (error) {
      console.error('search_order_products failed:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as { product_id: string }[];
    // `complete` = ผลชุดนี้ครบทุกตัวที่ตรง (ไม่โดน limit ตัด) — client ใช้ตัดสินใจว่า
    // พิมพ์ต่อจากคำเดิมแล้วกรองต่อในเครื่องได้เลย ไม่ต้องยิงใหม่ (ดู lib/useServerSearch.ts)
    // ⚠️ คิดจากจำนวนที่ RPC คืน **ก่อน** ตัดสินค้าชุด ไม่งั้นชุดที่ถูกตัดจะทำให้ดูเหมือนผลครบ
    const complete = rows.length < limit;

    // RPC ไม่ได้คืนธงสินค้าชุด — ถามทีเดียวจาก products ของ product_id ที่ติดมา
    let items: unknown[] = rows;
    if (excludeComposite && rows.length > 0) {
      const productIds = [...new Set(rows.map(r => r.product_id))];
      const { data: composites, error: compError } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('company_id', auth.companyId)
        .eq('is_composite', true)
        .in('id', productIds);
      if (compError) {
        console.error('exclude_composite lookup failed:', compError);
        return NextResponse.json({ error: compError.message }, { status: 500 });
      }
      const compositeIds = new Set((composites ?? []).map(p => p.id));
      if (compositeIds.size > 0) items = rows.filter(r => !compositeIds.has(r.product_id));
    }

    return NextResponse.json({ items, complete });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

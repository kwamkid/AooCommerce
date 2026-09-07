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

    const items = data ?? [];
    // `complete` = ผลชุดนี้ครบทุกตัวที่ตรง (ไม่โดน limit ตัด) — client ใช้ตัดสินใจว่า
    // พิมพ์ต่อจากคำเดิมแล้วกรองต่อในเครื่องได้เลย ไม่ต้องยิงใหม่ (ดู lib/useServerSearch.ts)
    return NextResponse.json({ items, complete: items.length < limit });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

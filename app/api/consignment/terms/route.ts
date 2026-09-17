// เงื่อนไขฝากขายของตัวเลือกสินค้า — ให้หน้าจอรู้ว่า "ขายต่ำกว่าเท่าไหร่แล้วขาดทุน"
//
// ใช้กับฟอร์มขายทุกใบ (OrderForm · POS) เพื่อเตือนตอนลดราคา/แถมของฝากขาย
// ⛔ เป็นข้อมูลอ่านอย่างเดียว — ต้นทุนที่บันทึกลงบิลคิดฝั่ง server ตอนสร้างออเดอร์
//    (lib/cost-utils.ts) ห้ามให้หน้าจอส่งต้นทุนมาเอง

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { consignmentUnitCost, fetchConsignmentTerms } from '@/lib/consignment-cost';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ids = (new URL(request.url).searchParams.get('variation_ids') || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ terms: {} });

    // กันข้าม tenant — ตัวเลือกที่ไม่ใช่ของบริษัทนี้ตัดออกก่อนถามเงื่อนไข
    const { data: owned } = await supabaseAdmin
      .from('product_variations')
      .select('id, product:products!inner(company_id)')
      .in('id', ids.slice(0, 200));
    const ownedIds = ((owned || []) as unknown as { id: string; product: { company_id: string } | null }[])
      .filter(row => row.product?.company_id === auth.companyId)
      .map(row => row.id);
    if (ownedIds.length === 0) return NextResponse.json({ terms: {} });

    const terms = await fetchConsignmentTerms(supabaseAdmin, ownedIds);
    const payload: Record<string, {
      supplier_name: string;
      gp_rate: number | null;
      gp_base: string;
      payable_unit_cost: number | null;
    }> = {};
    for (const [variationId, term] of terms) {
      payload[variationId] = {
        supplier_name: term.supplierName,
        gp_rate: term.gpRate,
        gp_base: term.gpBase,
        // ฐาน 'discounted' ขึ้นกับราคาที่ขายจริง ซึ่งหน้าจอยังไม่รู้ตอนถาม
        // → คืนตัวเลขจากราคาตั้งขายไว้ให้ก่อน (ค่านี้ใช้เตือนเท่านั้น)
        payable_unit_cost: consignmentUnitCost(term),
      };
    }
    return NextResponse.json({ terms: payload });
  } catch (error) {
    console.error('GET consignment terms error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

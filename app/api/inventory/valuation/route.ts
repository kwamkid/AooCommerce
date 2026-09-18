// Path: app/api/inventory/valuation/route.ts
//
// มูลค่าสต็อก แยก "ของเรา" กับ "ของ supplier ฝากขาย"
//
// ⛔ ของฝากขายอยู่ในคลังเราและขายได้ แต่ไม่ใช่สินทรัพย์ของเรา (ยังไม่ได้จ่ายเงิน)
//    รวมเป็นก้อนเดียวกันเมื่อไหร่ มูลค่าสต็อกจะสูงเกินจริงทุกเดือน
// เงินของสองก้อนคนละความหมาย: ของเรา = ต้นทุนที่จ่ายไปแล้ว · ของ supplier = เงินที่ต้องจ่ายถ้าขายได้หมด
//
// ตัวเลขต้นทุนเห็นได้เฉพาะคนที่มีสิทธิ์ดูต้นทุน (can_view_cost) — คนอื่นได้แค่จำนวนชิ้น

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

interface Bucket {
  quantity: number;
  value: number;
  unpriced_quantity?: number;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'inventory.view')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const warehouseId = new URL(request.url).searchParams.get('warehouse_id') || '';

    const { data, error } = await supabaseAdmin.rpc('get_stock_valuation', {
      p_company_id: auth.companyId,
      p_warehouse_ids: warehouseId ? [warehouseId] : null,
    });
    if (error) {
      console.error('get_stock_valuation error:', error.message);
      return NextResponse.json({ error: 'คำนวณมูลค่าสต็อกไม่สำเร็จ' }, { status: 500 });
    }

    const result = (data || {}) as { own?: Bucket; consignment?: Bucket };
    const canViewCost = auth.canViewCost === true;

    // ไม่มีสิทธิ์ดูต้นทุน = ส่งแต่จำนวนชิ้น (ยังบอกได้ว่าของใครเป็นของใคร)
    const strip = (bucket?: Bucket) => ({
      quantity: Number(bucket?.quantity) || 0,
      value: canViewCost ? Number(bucket?.value) || 0 : null,
      unpriced_quantity: Number(bucket?.unpriced_quantity) || 0,
    });

    return NextResponse.json({
      own: strip(result.own),
      consignment: strip(result.consignment),
      can_view_cost: canViewCost,
    });
  } catch (error) {
    console.error('GET inventory valuation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

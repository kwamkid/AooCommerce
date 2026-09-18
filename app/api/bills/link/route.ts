// ลิงก์บิลออนไลน์ของออเดอร์หนึ่งใบ — `GET ?order_id=`
//
// ลิงก์ใช้ `orders.share_token` (รหัสลับต่อใบ) ไม่ใช่ `orders.id` เพราะ id เดา/ไล่ได้
// แล้วจะเห็นชื่อ ที่อยู่ ยอดเงินของลูกค้าคนอื่น
//
// ⛔ **ห้ามประกอบลิงก์บิลเองในหน้าใด ๆ** (`/bills/${order.id}`) — เรียกที่นี่ที่เดียว
//    ไม่งั้นพอเปลี่ยนรูปแบบลิงก์ทีต้องไล่แก้ทุกหน้าอีก
//
// ต้องล็อกอิน + เป็นออเดอร์ของบริษัทตัวเอง (คนนอกเปิดบิลด้วยลิงก์ที่ได้รับ ไม่ใช่ที่นี่)

import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orderId = new URL(request.url).searchParams.get('order_id');
    if (!orderId) {
      return NextResponse.json({ error: 'ต้องระบุ order_id' }, { status: 400 });
    }

    const { data } = await supabaseAdmin
      .from('orders')
      .select('id, share_token')
      .eq('id', orderId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ error: 'ไม่พบออเดอร์นี้' }, { status: 404 });
    }

    // ออเดอร์เก่าที่ยังไม่มี token (ไม่ควรมีแล้ว — คอลัมน์มี default) ใช้ id ไปก่อน
    return NextResponse.json({ path: `/bills/${data.share_token || data.id}` });
  } catch (error) {
    console.error('Bill link error:', error);
    return NextResponse.json({ error: 'สร้างลิงก์บิลไม่สำเร็จ' }, { status: 500 });
  }
}

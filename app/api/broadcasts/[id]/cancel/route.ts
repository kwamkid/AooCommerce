import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

// POST — ยกเลิกใบที่ตั้งเวลาไว้ (ยังไม่เริ่มส่ง)
//
// ยกเลิกได้เฉพาะสถานะ 'scheduled' เท่านั้น — ใบที่เริ่มส่งแล้วมีข้อความออกไปหาลูกค้าจริง
// การ "ยกเลิก" จึงไม่มีความหมาย (เรียกคืนไม่ได้) และจะทำให้ตัวเลขบนหน้ารายงานโกหก
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.broadcast')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;

    const { data: row } = await supabaseAdmin
      .from('broadcasts')
      .select('id, status')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .maybeSingle();

    if (!row) return NextResponse.json({ error: 'ไม่พบบรอดแคสต์นี้' }, { status: 404 });
    if (row.status !== 'scheduled') {
      return NextResponse.json(
        { error: 'ยกเลิกได้เฉพาะใบที่ตั้งเวลาไว้และยังไม่เริ่มส่ง' },
        { status: 400 },
      );
    }

    // เงื่อนไข status ซ้ำใน UPDATE — cron อาจจองใบนี้ไปพอดีระหว่างที่เราเช็ค
    const { data: updated, error } = await supabaseAdmin
      .from('broadcasts')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .eq('status', 'scheduled')
      .select('id');
    if (error) throw error;
    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: 'ยกเลิกไม่ทัน — บรอดแคสต์นี้เริ่มส่งไปแล้ว' },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('POST broadcast cancel error:', e);
    return NextResponse.json({ error: 'ยกเลิกไม่สำเร็จ' }, { status: 500 });
  }
}

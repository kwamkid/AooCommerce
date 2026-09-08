// Path: app/api/chat/saved-replies/[id]/use/route.ts
//
// นับว่าใบนี้ถูกหยิบไปใช้ — หน้าแชทยิงแบบไม่รอผล (fire-and-forget)
// **นับตอนแทรกลงช่องพิมพ์ ไม่ใช่ตอนกดส่ง** เพราะแทรกแล้วพนักงานแก้ข้อความต่อได้
// ถ้ารอตอนส่งจะแยกไม่ออกว่าข้อความที่ส่งออกไปมาจากใบไหน
//
// นับพลาดไปบ้างไม่เป็นไร (ปิดแท็บก่อนคำขอถึง) — ตัวเลขนี้ใช้แค่จัดลำดับ "ใช้บ่อย"
// ไม่ใช่ตัวเลขทางบัญชี จึงไม่ต้องแลกความเร็วของหน้าแชทมาเพื่อความแม่น
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(auth, 'chat.reply')) return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });

  const { id } = await params;
  // RPC บวกแบบ atomic — หลายคนกดใบเดียวกันพร้อมกันต้องไม่ทับกัน
  // (อ่านมาบวกแล้วเขียนกลับจะหายไปหนึ่งครั้งทุกครั้งที่ชนกัน)
  const { error } = await supabaseAdmin.rpc('bump_saved_reply_usage', {
    p_id: id,
    p_company_id: auth.companyId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

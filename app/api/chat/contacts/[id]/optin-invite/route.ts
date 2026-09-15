// Path: app/api/chat/contacts/[id]/optin-invite/route.ts
//
// ชวนลูกค้า "รับข่าวสาร" บน Messenger — แอดมินกดเองจากห้องแชท
//
// ตรรกะทั้งหมด (กรอบ 24 ชม. · กันชวนซ้ำ · payload ของ Meta · สำเนาลงห้องแชท) อยู่ที่
// `lib/facebook/optin-invite.ts` ซึ่ง cron และ hook หลังปิดการขายใช้ร่วมกัน —
// route นี้มีหน้าที่แค่ตรวจสิทธิ์แล้วแปลผลเป็น HTTP
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { sendOptinInvite } from '@/lib/facebook/optin-invite';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
  if (!can(auth, 'chat.reply')) return NextResponse.json({ error: 'ไม่มีสิทธิ์ตอบแชท' }, { status: 403 });

  const { id: contactId } = await params;

  const result = await sendOptinInvite({
    companyId: auth.companyId,
    contactId,
    trigger: 'manual',
    requestedBy: auth.userId || null,
  });

  // เหตุผลที่ส่งไม่ได้เป็นภาษาไทยพร้อมบอกว่าทำอะไรต่อได้ — ผู้ใช้ไม่ควรเห็นรหัสดิบของ Meta
  if (result.status !== 'sent') {
    return NextResponse.json(
      { error: result.reason || 'ส่งคำชวนไม่สำเร็จ', code: result.code },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true, title: result.title });
}

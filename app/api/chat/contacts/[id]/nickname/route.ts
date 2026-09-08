// Path: app/api/chat/contacts/[id]/nickname/route.ts
//
// ชื่อเล่นที่ร้านตั้งให้ห้องแชท — ใช้ทักลูกค้าก่อนชื่ออื่นทุกชื่อ (ดู lib/chat/contact-name.ts)
// เก็บที่ห้องแชท ไม่ใช่ที่ตาราง customers เพราะห้องส่วนใหญ่ยังไม่ได้ผูกลูกค้า
// และห้องพวกนั้นแหละคือห้องที่ต้องทักด้วยชื่อพอดี
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

const MAX_NICKNAME = 40;

/** ตารางผู้ติดต่อของแต่ละแพลตฟอร์ม — ชื่อไม่รู้จัก = ไม่เดา ให้ 400 ไปเลย */
const TABLES: Record<string, string> = {
  line: 'line_contacts',
  facebook: 'fb_contacts',
  shopee: 'shopee_contacts',
  lazada: 'lazada_contacts',
  tiktok: 'tiktok_contacts',
};

// PUT { platform, nickname } — ส่งค่าว่างหรือ null = ล้างชื่อเล่นทิ้ง
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(auth, 'chat.reply')) return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ข้อมูลผู้ติดต่อ' }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => null) as { platform?: string; nickname?: string | null } | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const table = TABLES[body.platform || ''];
  if (!table) return NextResponse.json({ error: 'ไม่รู้จักช่องทางนี้' }, { status: 400 });

  const nickname = (body.nickname || '').trim().replace(/\s+/g, ' ') || null;
  if (nickname && nickname.length > MAX_NICKNAME) {
    return NextResponse.json({ error: `ชื่อเล่นยาวเกิน ${MAX_NICKNAME} ตัวอักษร` }, { status: 400 });
  }

  // .eq('company_id') เสมอ — service role ข้าม RLS อยู่แล้ว id เดาได้ ห้ามให้แก้ข้ามบริษัท
  const { data, error } = await supabaseAdmin
    .from(table)
    .update({ nickname })
    .eq('id', id)
    .eq('company_id', auth.companyId)
    .select('id, nickname')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'ไม่พบผู้ติดต่อนี้' }, { status: 404 });
  return NextResponse.json({ nickname: data.nickname ?? null });
}

// LINE Login channel ของร้าน (สำหรับหน้าร้านออนไลน์)
//
// เก็บที่ `companies.settings.line_login` ไม่ใช่ `settings.storefront` เพราะก้อน
// storefront ถูกส่งไปฝั่ง client ทั้งชุด — secret ต้องไม่มีทางไหลออกไปหน้าร้าน
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { parseLineLogin } from '@/lib/line-login';

/** โชว์แค่ 4 ตัวท้าย — พอให้ผู้ใช้ยืนยันว่าใส่ตัวไหนไว้ โดยไม่ส่งของจริงกลับไป */
function maskSecret(secret: string): string {
  if (!secret || secret.length <= 4) return secret;
  return '•'.repeat(secret.length - 4) + secret.slice(-4);
}
const isMasked = (v: string) => !!v && v.includes('•');

export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'settings.access')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูการตั้งค่านี้' }, { status: 403 });
  }

  const { data } = await supabaseAdmin
    .from('companies')
    .select('settings')
    .eq('id', auth.companyId)
    .single();

  const cred = parseLineLogin(data?.settings as Record<string, unknown> | null);
  return NextResponse.json({
    channel_id: cred.channel_id,
    channel_secret: maskSecret(cred.channel_secret),
    configured: !!(cred.channel_id && cred.channel_secret),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'settings.access')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขการตั้งค่านี้' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as
    { channel_id?: string; channel_secret?: string } | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('settings')
    .eq('id', auth.companyId)
    .single();

  const currentSettings = (company?.settings as Record<string, unknown>) || {};
  const current = parseLineLogin(currentSettings);

  const channelId = (body.channel_id ?? current.channel_id).trim();
  // ฟอร์มส่งค่าที่ถูกปิดบังกลับมาเมื่อผู้ใช้ไม่ได้แก้ช่องนั้น — เก็บของเดิมไว้
  const rawSecret = (body.channel_secret ?? '').trim();
  const channelSecret = isMasked(rawSecret) || rawSecret === ''
    ? current.channel_secret
    : rawSecret;

  if (channelId && !/^\d{6,}$/.test(channelId)) {
    return NextResponse.json(
      { error: 'Channel ID ต้องเป็นตัวเลขอย่างเดียว (ดูได้ที่ LINE Developers)' },
      { status: 400 },
    );
  }

  const next = { channel_id: channelId, channel_secret: channelSecret };
  const { error } = await supabaseAdmin
    .from('companies')
    .update({ settings: { ...currentSettings, line_login: next } })
    .eq('id', auth.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    channel_id: next.channel_id,
    channel_secret: maskSecret(next.channel_secret),
    configured: !!(next.channel_id && next.channel_secret),
  });
}

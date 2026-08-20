// บริการการ์ดอวยพรของร้าน — ใช้ร่วมทุกช่องทางที่สร้างออเดอร์
// (หน้าร้านออนไลน์ · เปิดบิลเองจากแชท · POS ในอนาคต)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { parseGiftCard } from '@/lib/gift-card';

export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabaseAdmin
    .from('companies')
    .select('settings')
    .eq('id', auth.companyId)
    .single();

  return NextResponse.json(parseGiftCard(data?.settings as Record<string, unknown> | null));
}

export async function PUT(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'settings.access')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขการตั้งค่านี้' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { enabled?: boolean; fee?: number } | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('settings')
    .eq('id', auth.companyId)
    .single();

  const currentSettings = (company?.settings as Record<string, unknown>) || {};
  const current = parseGiftCard(currentSettings);

  const next = {
    enabled: body.enabled ?? current.enabled,
    // ค่าการ์ดติดลบไม่ได้ และปัดเป็นสตางค์
    fee: body.fee !== undefined
      ? Math.max(0, Math.round(Number(body.fee) * 100) / 100) || 0
      : current.fee,
  };

  const { error } = await supabaseAdmin
    .from('companies')
    .update({ settings: { ...currentSettings, gift_card: next } })
    .eq('id', auth.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, ...next });
}

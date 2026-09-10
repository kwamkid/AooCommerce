// Path: app/api/ads/accounts/[id]/test/route.ts
//
// "ทดสอบการเชื่อมต่อ" — ถาม Meta ใหม่ทั้ง 3 ข้อ (token · dataset · สิทธิ์กลุ่มเป้าหมาย)
// แล้วจดผลลงแถว ⇒ การ์ดในหน้าตั้งค่ากับตัวเฝ้าจึงเห็นค่าเดียวกันเสมอ
//
// ใส่รหัสทดสอบ (Test Events) มาด้วย = ยิง event จริงเข้า dataset เพื่อพิสูจน์ว่า
// **เข้าได้** ไม่ใช่แค่ "มี dataset อยู่" · ไม่ส่งมาก็ใช้รหัสที่เจ้าของตั้งไว้ในบัญชีนั้น
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getAdAccountRow, probeAdAccount, refreshTokenExpiry, toAdAccountView } from '@/lib/ads/accounts';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'masterdata.ad_accounts')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;
    const { data: owned } = await supabaseAdmin
      .from('ad_accounts')
      .select('id, metadata')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .maybeSingle<{ id: string; metadata: Record<string, unknown> | null }>();
    if (!owned) return NextResponse.json({ error: 'ไม่พบบัญชีโฆษณานี้' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const stored = owned.metadata?.test_event_code;
    const testEventCode =
      String(body.test_event_code ?? '').trim() || (typeof stored === 'string' ? stored.trim() : '');

    const probe = await probeAdAccount(id, testEventCode ? { testEventCode } : {});
    // token ยังดี = ถามวันหมดอายุใหม่ไปเลย (ผู้ใช้เพิ่งกดตรวจ ควรได้ค่าล่าสุดในรอบเดียว)
    if (probe.token_ok) await refreshTokenExpiry(id);

    const fresh = await getAdAccountRow(id);
    return NextResponse.json({ probe, account: fresh ? toAdAccountView(fresh) : null });
  } catch (err) {
    console.error('[api/ads/accounts/:id/test] failed:', err);
    return NextResponse.json({ error: 'ทดสอบไม่สำเร็จ' }, { status: 500 });
  }
}

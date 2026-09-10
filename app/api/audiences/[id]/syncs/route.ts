// Path: app/api/audiences/[id]/syncs/route.ts
//
// ผูกกลุ่มเป้าหมายเข้ากับบัญชีโฆษณาหนึ่งใบ แล้วเริ่มซิงก์ทันที
//
// ⚠️ **token ที่ยิง Purchase ได้ ไม่ได้แปลว่าจัดการกลุ่มเป้าหมายได้** — Custom Audience
// ต้องการ `ads_management` และต้องกดยอมรับ ToS ของบัญชีโฆษณาก่อน · เราจดผลตรวจนั้นไว้ที่
// `ad_accounts.audiences_ok_at` ⇒ ปฏิเสธตั้งแต่ตอนผูก ดีกว่าปล่อยให้ไปล้มตอนซิงก์แล้วผู้ใช้
// ต้องมานั่งอ่าน error ของ Meta เอง
import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { AD_ACCOUNT_FIX, getAdAccountRow } from '@/lib/ads/accounts';
import { runAudienceSync } from '@/lib/audiences/sync';
import { loadAudienceViews } from '@/lib/audiences/resolve';

// ซิงก์จริงเกิดใน after() — ต้องให้ฟังก์ชันอยู่ได้นานพอที่จะอัปรายชื่อจนจบ
export const maxDuration = 300;

/** งบเวลาของการซิงก์ที่เริ่มจากปุ่ม — ต่ำกว่า maxDuration เผื่อเวลาปิดงาน */
const MANUAL_BUDGET_MS = 240_000;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'marketing.audiences')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;
    const [audience] = await loadAudienceViews(auth.companyId, { id, activeOnly: false });
    if (!audience) return NextResponse.json({ error: 'ไม่พบกลุ่มเป้าหมายนี้' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const adAccountId = String(body.ad_account_id ?? '').trim();
    if (!adAccountId) return NextResponse.json({ error: 'กรุณาเลือกบัญชีโฆษณาปลายทาง' }, { status: 400 });

    const account = await getAdAccountRow(adAccountId);
    if (!account || account.company_id !== auth.companyId || !account.is_active) {
      return NextResponse.json({ error: 'ไม่พบบัญชีโฆษณานี้ หรือถูกปิดอยู่' }, { status: 400 });
    }
    if (!account.access_token || account.status === 'token_expired') {
      return NextResponse.json({ error: AD_ACCOUNT_FIX.token_expired, code: 'token_expired' }, { status: 400 });
    }
    if (!account.audiences_ok_at) {
      return NextResponse.json({
        error: 'token นี้ยิงได้แค่ Purchase — ต้องใช้ token ที่มี ads_management',
        code: 'audiences_not_ready',
      }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('audience_syncs')
      .insert({
        audience_id: id,
        company_id: auth.companyId,
        ad_account_id: adAccountId,
        auto_sync: body.auto_sync === undefined ? true : body.auto_sync !== false,
      })
      .select('id')
      .single();

    if (error) {
      // unique(audience_id, ad_account_id) — ผูกซ้ำไม่ใช่ระบบพัง
      if (error.code === '23505') {
        return NextResponse.json({ error: 'กลุ่มนี้ผูกกับบัญชีโฆษณานี้อยู่แล้ว', code: 'duplicate' }, { status: 409 });
      }
      throw error;
    }

    // ซิงก์ครั้งแรกทันทีหลังตอบ — ต้องผ่าน after() ไม่งั้น Vercel freeze ฟังก์ชันทิ้งกลางทาง
    after(() => runAudienceSync(data.id, { deadlineAt: Date.now() + MANUAL_BUDGET_MS, trigger: 'manual' }));

    const [updated] = await loadAudienceViews(auth.companyId, { id, activeOnly: false });
    const sync = (updated?.syncs || []).find(s => s.id === data.id) ?? null;
    return NextResponse.json({ sync }, { status: 202 });
  } catch (e) {
    console.error('POST audience sync error:', e);
    return NextResponse.json({ error: 'ผูกกลุ่มกับบัญชีโฆษณาไม่สำเร็จ' }, { status: 500 });
  }
}

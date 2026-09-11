// Path: app/api/meta/marketing-messages/connect/route.ts
//
// เชื่อม business สำหรับข้อความการตลาด (Marketing Messages on Messenger) — **ทดลอง**
// หน้าบัญชีโฆษณาเปิด Facebook Login for Business ด้วย config แบบ token System-business
// (`response_type: 'code'`) แล้วส่ง code มาที่นี่ → แลกเป็น token ที่ผูกกับ business ของร้าน (ไม่ใช่คน)
//
// ทำไมต้องทางนี้: Meta ยืนยัน (support case 11 ก.ย. 2026) ว่า business ยอมรับข้อตกลงข้อความการตลาด
// ได้ทางเดียวคือหน้าต่าง Facebook Login for Business — ไม่ผ่านขั้นนี้สร้างแคมเปญแล้วติด error 2300013
//
// ⚠️ ช่วงทดลองเก็บ token ใน `app_flags` คีย์ `meta_mm_business:{company}` (อ่านได้เฉพาะ service role ·
// token ไม่กลับไปที่เบราว์เซอร์) — ถ้าตัดสินใจทำจริงค่อยย้ายไปตารางของตัวเอง
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { actPath, debugToken, exchangeLoginCode } from '@/lib/meta/ads';
import { graphErrorText, graphGet } from '@/lib/meta/graph';
import { hasMarketingMessagesScope } from '@/lib/ads/meta-ui';
import { logIntegrationNow } from '@/lib/integration-logger';

const INTEGRATION = 'meta_ads';
const ACTION = 'marketing_messages_connect';

export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
  if (!can(auth, 'masterdata.ad_accounts')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  const companyId = auth.companyId;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(body.code ?? '').trim();
  if (!code) return NextResponse.json({ error: 'ไม่ได้รับ code จาก Facebook' }, { status: 400 });

  const startedAt = Date.now();
  const log = (status: 'success' | 'error', extra: { error_message?: string; response_body?: unknown }) =>
    logIntegrationNow({
      company_id: companyId,
      integration: INTEGRATION,
      direction: 'outgoing',
      action: ACTION,
      method: 'GET',
      api_path: '/oauth/access_token',
      status,
      duration_ms: Date.now() - startedAt,
      ...extra,
    });

  try {
    const exchanged = await exchangeLoginCode(code);
    const token = exchanged.body?.access_token;
    if (!exchanged.ok || !token) {
      const message = `แลก code กับ Facebook ไม่สำเร็จ: ${graphErrorText(exchanged)}`;
      await log('error', { error_message: message });
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // สินทรัพย์ที่ร้านเลือกในหน้าต่างของ Meta — ไม่มี target_ids = สิทธิ์ครอบทุกอันที่เข้าถึง (เก็บเป็นลิสต์ว่าง)
    const info = await debugToken(token);
    const grantedIds = (scope: string) => info.granularScopes.find((g) => g.scope === scope)?.target_ids ?? [];
    const pageIds = grantedIds('pages_messaging');
    const adAccountIds = grantedIds('ads_management');

    // business ของร้าน — ถามจากบัญชีโฆษณาใบแรก (config บังคับเลือกบัญชีโฆษณา)
    let business: { id: string; name: string } | null = null;
    if (adAccountIds[0]) {
      const r = await graphGet<{ business?: { id?: string; name?: string } }>(`/${actPath(adAccountIds[0])}`, token, {
        fields: 'business{id,name}',
      });
      if (r.ok && r.body?.business?.id) {
        business = { id: String(r.body.business.id), name: String(r.body.business.name ?? '') };
      }
    }

    const summary = {
      token_type: info.type,
      marketing_scope: hasMarketingMessagesScope(info.scopes),
      scopes: info.scopes,
      page_ids: pageIds,
      ad_account_ids: adAccountIds,
      business,
      expires_at: info.expiresAt,
    };

    const now = new Date().toISOString();
    const { error: saveError } = await supabaseAdmin.from('app_flags').upsert(
      {
        key: `meta_mm_business:${companyId}`,
        value: { access_token: token, ...summary, connected_by: auth.userId, connected_at: now },
        updated_at: now,
      },
      { onConflict: 'key' },
    );
    if (saveError) {
      const message = `บันทึก token ไม่สำเร็จ: ${saveError.message}`;
      await log('error', { error_message: message, response_body: summary });
      return NextResponse.json({ error: message }, { status: 500 });
    }

    await log('success', { response_body: summary });
    return NextResponse.json(summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log('error', { error_message: message });
    return NextResponse.json({ error: 'เชื่อม business ไม่สำเร็จ' }, { status: 500 });
  }
}

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

    // ⚠️ `debug_token` ของ token system-user **ไม่คืน `granular_scopes`** (ลองจริง 13 ก.ย. 2026 ได้ 0/0)
    // ⇒ ถามรายการสินทรัพย์จาก Graph ตรง ๆ · `/me/accounts` กับ `/me/assigned_pages` ก็ตอบว่างสำหรับ token ชนิดนี้
    // เพจจึงต้องถามจาก business (`/{business}/owned_pages`)
    const info = await debugToken(token);
    const me = await graphGet<{ id?: string; name?: string }>('/me', token, { fields: 'id,name' });

    const adRes = await graphGet<{
      data?: { id?: string; account_id?: string; name?: string; business?: { id?: string; name?: string } }[];
    }>('/me/adaccounts', token, { fields: 'account_id,name,business{id,name}', limit: '50' });
    const adRows = adRes.body?.data ?? [];
    const adAccounts = adRows.map((a) => ({
      id: actPath(String(a.account_id ?? a.id ?? '')),
      name: String(a.name ?? ''),
    }));
    const businessRaw = adRows.find((a) => a.business?.id)?.business ?? null;
    const business = businessRaw?.id
      ? { id: String(businessRaw.id), name: String(businessRaw.name ?? '') }
      : null;

    // เพจที่ business นี้ถือ — ไว้บอกผู้ใช้ว่าเชื่อมให้ร้านไหน (Meta ไม่บอกว่ารอบนี้ให้สิทธิ์เพจไหนบ้าง)
    let pages: { id: string; name: string }[] = [];
    if (business) {
      const p = await graphGet<{ data?: { id?: string; name?: string }[] }>(`/${business.id}/owned_pages`, token, {
        fields: 'id,name',
        limit: '50',
      });
      pages = (p.body?.data ?? []).map((x) => ({ id: String(x.id ?? ''), name: String(x.name ?? '') }));
    }

    const summary = {
      token_type: info.type,
      system_user: me.body?.id ? { id: String(me.body.id), name: String(me.body.name ?? '') } : null,
      marketing_scope: hasMarketingMessagesScope(info.scopes),
      scopes: info.scopes,
      business,
      ad_accounts: adAccounts,
      pages,
      ad_account_ids: adAccounts.map((a) => a.id),
      page_ids: pages.map((p) => p.id),
      expires_at: info.expiresAt,
    };

    // ไม่มีบัญชีโฆษณา = ส่งข้อความการตลาดไม่ได้เลย — บอกตั้งแต่ตอนนี้ ดีกว่าปล่อยให้ไปเจอ error ตอนกดส่ง
    // (ถาม Meta ไม่สำเร็จไม่นับว่าไม่มี — เก็บ token ไว้ก่อน ค่อยตรวจใหม่รอบหน้า)
    if (adRes.ok && adAccounts.length === 0) {
      const message = 'ยังไม่ได้เลือกบัญชีโฆษณาในหน้าต่างของ Facebook — ข้อความการตลาดต้องมีบัญชีโฆษณาที่ผูกบัตรอย่างน้อย 1 บัญชี';
      await log('error', { error_message: message, response_body: summary });
      return NextResponse.json({ error: message, ...summary }, { status: 400 });
    }

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

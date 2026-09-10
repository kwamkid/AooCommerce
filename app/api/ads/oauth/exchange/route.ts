// Path: app/api/ads/oauth/exchange/route.ts
//
// ขั้นที่ 1 ของการเชื่อมด้วย Facebook — เอา short-lived token จากหน้าล็อกอินมาแลกเป็นใบอายุ ~60 วัน
// แล้วคืน **รายชื่อบัญชีโฆษณา + dataset ให้เลือก** (ยังไม่บันทึกอะไรลงระบบ)
//
// ⚠️ **token ตัวจริงไม่เคยกลับไปที่เบราว์เซอร์** — เก็บไว้ที่เซิร์ฟเวอร์ใน `app_flags`
// (คีย์ผูกทั้งบริษัทและคน อายุสั้น) แล้วขั้นที่ 2 (`/api/ads/oauth/connect`) หยิบไปใช้
// ถ้าคืนไปให้หน้าจอถือไว้ระหว่างเลือกบัญชี token อายุ 60 วันที่ยิงโฆษณาได้จะไปโผล่ใน
// devtools · log ของ proxy · ประวัติ network ของเครื่องผู้ใช้ — ทั้งที่หน้าจอไม่ได้ต้องใช้มันเลย
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { debugToken, exchangeLongLivedUserToken, listAdAccounts, listDatasets } from '@/lib/meta/ads';
import { graphErrorText, isPermissionError } from '@/lib/meta/graph';
import { parallelLimit } from '@/lib/parallel';
import type { MetaOauthAccount } from '@/lib/ads/meta-ui';

/**
 * "สิทธิ์ขั้นสูงยังไม่ผ่านรีวิว" ≠ "ผู้ใช้ไม่ได้กดอนุญาต" — คนละวิธีแก้กันคนละเรื่อง
 * (อันแรกเจ้าของแอปต้องไปยื่น App Review · อันหลังผู้ใช้กดอนุญาตใหม่ก็จบ)
 */
const APP_REVIEW_RE = /advanced access|app review|not approved/i;

function bad(error: string, code: string) {
  return NextResponse.json({ error, code }, { status: 400 });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'masterdata.ad_accounts')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const shortToken = String(body.shortLivedToken ?? '').trim();
    if (!shortToken) return bad('ไม่ได้รับ token จาก Facebook', 'exchange_failed');

    const exchanged = await exchangeLongLivedUserToken(shortToken);
    const longToken = exchanged.body?.access_token;
    if (!exchanged.ok || !longToken) {
      return bad(`แลก token กับ Facebook ไม่สำเร็จ: ${graphErrorText(exchanged)}`, 'exchange_failed');
    }

    const list = await listAdAccounts(longToken);
    if (!list.ok || !list.body) {
      const text = graphErrorText(list);
      if (APP_REVIEW_RE.test(text)) {
        return bad(`แอปยังไม่ได้รับสิทธิ์ขั้นสูงสำหรับ API โฆษณา: ${text}`, 'app_review_required');
      }
      if (isPermissionError(list.error)) {
        return bad(`Facebook ไม่ได้ให้สิทธิ์อ่านบัญชีโฆษณา: ${text}`, 'permissions_missing');
      }
      return bad(`อ่านรายการบัญชีโฆษณาไม่สำเร็จ: ${text}`, 'exchange_failed');
    }

    const accounts = list.body;
    // ไม่มีบัญชีโฆษณาสักใบ = **ไม่ใช่ error** (บัญชี Facebook ที่ไม่เคยยิงโฆษณามาก่อน)
    // หน้าจอมีคำอธิบายของตัวเองว่าให้ไปสร้างบัญชีโฆษณาก่อน
    if (accounts.length === 0) return NextResponse.json({ accounts: [] });

    // dataset ของแต่ละบัญชี — ถามไม่ได้ก็ปล่อยว่าง (บัญชีนั้นเลือก dataset ไม่ได้ แต่ใบอื่นยังใช้ได้)
    const datasetsPerAccount = await parallelLimit(
      accounts,
      async (a) => {
        const r = await listDatasets(a.account_id, longToken);
        return r.ok && r.body ? r.body : [];
      },
      4,
    );

    const { data: connectedRows } = await supabaseAdmin
      .from('ad_accounts')
      .select('external_id')
      .eq('company_id', auth.companyId)
      .eq('platform', 'meta')
      .eq('is_active', true);
    const connected = new Set((connectedRows || []).map((r) => String(r.external_id)));

    const info = await debugToken(longToken);
    const expiresAt =
      (info.debuggable ? info.expiresAt : null) ??
      (exchanged.body?.expires_in ? new Date(Date.now() + exchanged.body.expires_in * 1000).toISOString() : null);

    const stashAccounts = accounts.map((a, i) => ({
      account_id: a.account_id,
      name: a.name,
      currency: a.currency,
      account_status: a.account_status,
      business: a.business,
      datasets: datasetsPerAccount[i] ?? [],
    }));

    await supabaseAdmin.from('app_flags').upsert(
      {
        key: `ad_connect:${auth.companyId}:${auth.userId}`,
        value: {
          access_token: longToken,
          expires_at: expiresAt,
          scopes: info.debuggable ? info.scopes : [],
          accounts: stashAccounts,
          created_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' },
    );

    const payload: MetaOauthAccount[] = stashAccounts.map((a) => ({
      ...a,
      already_connected: connected.has(a.account_id),
    }));

    return NextResponse.json({ accounts: payload });
  } catch (err) {
    console.error('[api/ads/oauth/exchange] failed:', err);
    return NextResponse.json({ error: 'เชื่อมต่อ Facebook ไม่สำเร็จ' }, { status: 500 });
  }
}

// Path: app/api/ads/oauth/connect/route.ts
//
// ขั้นที่ 2 ของการเชื่อมด้วย Facebook — ผู้ใช้เลือกบัญชีโฆษณา + dataset แล้ว
// หยิบ token ที่ขั้นที่ 1 พักไว้ฝั่งเซิร์ฟเวอร์มาบันทึกเป็นการเชื่อมต่อจริง
//
// กติกา 2 ข้อที่ห้ามหย่อน:
// 1) **บัญชี/dataset ต้องอยู่ในของที่พักไว้เท่านั้น** — id ที่ส่งมาจากหน้าจอเป็นของปลอมได้เสมอ
//    เชื่อตรง ๆ = ใครก็ผูก dataset ของคนอื่นเข้ากับ token ของเราได้
// 2) **เชื่อมซ้ำบัญชีเดิม = แถวเดิม token ใบใหม่** (ไม่ใช่แถวใหม่) เพราะ unique
//    (company_id, platform, external_id) กันไว้อยู่แล้ว และ metadata ที่เจ้าของตั้งไว้
//    (ประเภทบิลที่ส่ง · รหัสทดสอบ) ต้องรอดข้ามการเชื่อมใหม่
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getAdAccountRow, probeAdAccount, toAdAccountView } from '@/lib/ads/accounts';

/** ของที่พักไว้หมดอายุเร็ว — token อายุ 60 วันไม่ควรค้างอยู่ในตารางธงนานกว่าที่จำเป็น */
const STASH_MAX_AGE_MS = 15 * 60_000;
const EVENTS_WINDOW_DAYS = 7;

interface StashAccount {
  account_id: string;
  name: string;
  currency: string | null;
  account_status: number | null;
  business: { id: string; name: string } | null;
  datasets: { id: string; name: string }[];
}

interface Stash {
  access_token: string;
  expires_at: string | null;
  scopes?: string[];
  accounts: StashAccount[];
  created_at: string;
}

/** ยิงไป/ล้มไปกี่ใบใน 7 วัน — เชื่อมซ้ำบัญชีเดิมจะได้เห็นตัวเลขเดิมต่อทันที */
async function loadEvents7d(accountId: string): Promise<{ sent: number; failed: number }> {
  const since = new Date(Date.now() - EVENTS_WINDOW_DAYS * 86_400_000).toISOString();
  const { data } = await supabaseAdmin
    .from('ad_events')
    .select('status')
    .eq('ad_account_id', accountId)
    .gte('created_at', since);
  const rows = (data || []) as { status: string }[];
  return {
    sent: rows.filter((r) => r.status === 'sent').length,
    failed: rows.filter((r) => r.status === 'failed').length,
  };
}

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
    const accountId = String(body.account_id ?? '').trim();
    const datasetId = String(body.dataset_id ?? '').trim();
    if (!accountId || !datasetId) return bad('ยังไม่ได้เลือกบัญชีโฆษณาหรือ Dataset', 'invalid_input');

    const stashKey = `ad_connect:${auth.companyId}:${auth.userId}`;
    const { data: flag } = await supabaseAdmin
      .from('app_flags')
      .select('value')
      .eq('key', stashKey)
      .maybeSingle<{ value: Stash | null }>();

    const stash = flag?.value ?? null;
    const stashedAt = stash?.created_at ? Date.parse(stash.created_at) : NaN;
    if (!stash?.access_token || !Number.isFinite(stashedAt) || Date.now() - stashedAt > STASH_MAX_AGE_MS) {
      return bad('หมดเวลาเลือกบัญชี — กดเชื่อมด้วย Facebook อีกครั้ง', 'stash_expired');
    }

    const picked = (stash.accounts || []).find((a) => a.account_id === accountId);
    if (!picked) return bad('ไม่พบบัญชีโฆษณาที่เลือกในรอบการเชื่อมต่อนี้', 'invalid_input');

    const dataset = (picked.datasets || []).find((d) => d.id === datasetId);
    if (!dataset) return bad('Dataset นี้ไม่ได้อยู่ในบัญชีโฆษณานี้', 'dataset_not_in_account');

    // เชื่อมซ้ำ = แถวเดิม ⇒ ต้องอ่าน metadata เดิมมา merge ก่อน (ห้ามเขียนทับทั้งก้อน)
    const { data: existing } = await supabaseAdmin
      .from('ad_accounts')
      .select('id, metadata')
      .eq('company_id', auth.companyId)
      .eq('platform', 'meta')
      .eq('external_id', accountId)
      .maybeSingle<{ id: string; metadata: Record<string, unknown> | null }>();

    const { data: saved, error } = await supabaseAdmin
      .from('ad_accounts')
      .upsert(
        {
          company_id: auth.companyId,
          platform: 'meta',
          external_id: accountId,
          name: picked.name || null,
          business_id: picked.business?.id ?? null,
          business_name: picked.business?.name ?? null,
          currency: picked.currency ?? null,
          dataset_id: dataset.id,
          dataset_name: dataset.name || null,
          access_token: stash.access_token,
          token_source: 'oauth',
          token_expires_at: stash.expires_at ?? null,
          connected_by: auth.userId ?? null,
          status: 'active',
          last_error: null,
          is_active: true,
          metadata: { ...(existing?.metadata || {}), scopes: stash.scopes || [] },
        },
        { onConflict: 'company_id,platform,external_id' },
      )
      .select('id')
      .single();

    if (error || !saved) {
      console.error('[api/ads/oauth/connect] upsert failed:', error?.message);
      return NextResponse.json({ error: 'บันทึกบัญชีโฆษณาไม่สำเร็จ' }, { status: 500 });
    }

    const probe = await probeAdAccount(saved.id);

    // ใช้ไปแล้วทิ้งทันที — token ที่ไม่มีใครต้องใช้แล้วไม่ควรนอนอยู่ในตารางธงต่อ
    await supabaseAdmin.from('app_flags').delete().eq('key', stashKey);

    const fresh = await getAdAccountRow(saved.id);
    const events7d = await loadEvents7d(saved.id);

    return NextResponse.json({
      account: fresh ? toAdAccountView(fresh, { events_7d: events7d }) : null,
      probe,
    });
  } catch (err) {
    console.error('[api/ads/oauth/connect] failed:', err);
    return NextResponse.json({ error: 'เชื่อมบัญชีโฆษณาไม่สำเร็จ' }, { status: 500 });
  }
}

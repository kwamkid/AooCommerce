// Path: app/api/ads/accounts/route.ts
//
// บัญชีโฆษณาของบริษัท — รายการ (GET) + เชื่อมด้วย token ที่กรอกเอง (POST)
//
// ⚠️ **ห้ามส่ง `access_token` ออกทาง response** — ทุกแถวต้องผ่าน `toAdAccountView()`
// ซึ่งปิดบังให้เหลือ 4 ตัวท้าย (ไว้ให้ผู้ใช้เทียบว่าใบไหน)
//
// ขา POST ตรวจ 3 ชั้นก่อนบันทึก เพราะสามอย่างนี้ **แก้คนละทาง**: token ใช้ไม่ได้ ·
// สิทธิ์ไม่ถึง · dataset ไม่ได้อยู่ในบัญชีนี้ — บันทึกไปก่อนแล้วค่อยรู้ว่าพัง
// เท่ากับให้เจ้าของนั่งรอ event ที่ไม่มีวันไปถึง
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getAdAccountRow, listActiveAdAccounts, probeAdAccount, toAdAccountView } from '@/lib/ads/accounts';
import { stripActPrefix } from '@/lib/ads/meta-ui';
import { debugToken, getAdAccount, getDataset, listDatasets } from '@/lib/meta/ads';
import { graphErrorText, isPermissionError, isTokenError } from '@/lib/meta/graph';

const EVENTS_WINDOW_DAYS = 7;

/** ยิงไป/ล้มไปกี่ใบใน 7 วัน — query เดียวแล้วนับใน JS (ไม่ยิงต่อบัญชี) */
async function loadEvents7d(accountIds: string[]): Promise<Record<string, { sent: number; failed: number }>> {
  const counts: Record<string, { sent: number; failed: number }> = {};
  if (accountIds.length === 0) return counts;
  const since = new Date(Date.now() - EVENTS_WINDOW_DAYS * 86_400_000).toISOString();
  const { data } = await supabaseAdmin
    .from('ad_events')
    .select('ad_account_id, status')
    .in('ad_account_id', accountIds)
    .gte('created_at', since);
  for (const row of (data || []) as { ad_account_id: string | null; status: string }[]) {
    if (!row.ad_account_id) continue;
    const bucket = (counts[row.ad_account_id] ||= { sent: 0, failed: 0 });
    if (row.status === 'sent') bucket.sent += 1;
    else if (row.status === 'failed') bucket.failed += 1;
  }
  return counts;
}

function bad(error: string, code: string, status = 400) {
  return NextResponse.json({ error, code }, { status });
}

// GET — บัญชีโฆษณาทั้งหมดของบริษัทนี้ (ใหม่สุดขึ้นก่อน)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'masterdata.ad_accounts')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    // เรียงใหม่สุดขึ้นก่อน — ทำใน JS เพราะตัวโหลดกลางไม่รับลำดับ (บัญชีต่อบริษัทมีไม่กี่ใบ)
    const rows = [...(await listActiveAdAccounts(auth.companyId))].sort((a, b) =>
      String(b.created_at).localeCompare(String(a.created_at)),
    );
    const counts = await loadEvents7d(rows.map((r) => r.id));

    return NextResponse.json({
      accounts: rows.map((r) => toAdAccountView(r, { events_7d: counts[r.id] })),
    });
  } catch (err) {
    console.error('[api/ads/accounts] GET failed:', err);
    return NextResponse.json({ error: 'โหลดบัญชีโฆษณาไม่สำเร็จ' }, { status: 500 });
  }
}

// POST — เชื่อมบัญชีโฆษณาด้วย token ที่ผู้ใช้กรอกเอง (System User token ฯลฯ)
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'masterdata.ad_accounts')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const externalId = stripActPrefix(String(body.external_id ?? '')).replace(/\s/g, '');
    const datasetId = String(body.dataset_id ?? '').trim();
    const token = String(body.access_token ?? '').trim();
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;

    if (!/^\d+$/.test(externalId)) return bad('รหัสบัญชีโฆษณาต้องเป็นตัวเลข (เช่น 1234567890 หรือ act_1234567890)', 'invalid_input');
    if (!/^\d+$/.test(datasetId)) return bad('รหัส Dataset ต้องเป็นตัวเลข', 'invalid_input');
    if (!token) return bad('กรุณากรอก Access token', 'invalid_input');

    // ซ้ำ = unique (company_id, platform, external_id) จะตีตกอยู่แล้ว — ตอบให้ตรงเหตุก่อนเสีย call ไป Meta
    const { data: existing } = await supabaseAdmin
      .from('ad_accounts')
      .select('id')
      .eq('company_id', auth.companyId)
      .eq('platform', 'meta')
      .eq('external_id', externalId)
      .maybeSingle();
    if (existing) return bad('บัญชีโฆษณานี้เชื่อมอยู่แล้ว', 'duplicate', 409);

    // 1) token อ่านบัญชีโฆษณาใบนี้ได้จริงไหม
    const acc = await getAdAccount(externalId, token);
    if (!acc.ok) {
      if (isTokenError(acc.error, acc.status)) return bad(`token ใช้ไม่ได้: ${graphErrorText(acc)}`, 'token_invalid');
      if (isPermissionError(acc.error)) return bad(`token ไม่มีสิทธิ์เข้าถึงบัญชีโฆษณานี้: ${graphErrorText(acc)}`, 'permissions_missing');
      return bad(`อ่านข้อมูลบัญชีโฆษณาไม่ได้: ${graphErrorText(acc)}`, 'token_invalid');
    }

    // 2) dataset เป็นของบัญชีนี้ไหม
    //    token บางใบ (จาก Events Manager) ไม่มี ads_read จึงถาม /adspixels ไม่ได้ —
    //    ตกไปถาม dataset ตรง ๆ แทน ห้ามฟันว่า "ไม่ใช่ของบัญชีนี้" เพราะแค่ถามรายการไม่ได้
    let datasetName: string | null = null;
    const datasets = await listDatasets(externalId, token);
    if (datasets.ok && datasets.body) {
      const found = datasets.body.find((d) => d.id === datasetId);
      if (!found) return bad('Dataset นี้ไม่ได้อยู่ในบัญชีโฆษณานี้', 'dataset_not_in_account');
      datasetName = found.name || null;
    } else {
      const ds = await getDataset(datasetId, token);
      if (!ds.ok || !ds.body) return bad(`ใช้ Dataset นี้ไม่ได้: ${graphErrorText(ds)}`, 'dataset_not_in_account');
      datasetName = ds.body.name || null;
    }

    // 3) token ใบนี้หมดอายุเมื่อไหร่ — ตอบไม่ได้ก็ไม่เป็นไร (System User token ไม่มีวันหมดอายุ)
    const info = await debugToken(token);

    const { data: inserted, error } = await supabaseAdmin
      .from('ad_accounts')
      .insert({
        company_id: auth.companyId,
        platform: 'meta',
        external_id: externalId,
        name: name || acc.body?.name || null,
        business_id: acc.body?.business?.id ?? null,
        business_name: acc.body?.business?.name ?? null,
        currency: acc.body?.currency ?? null,
        dataset_id: datasetId,
        dataset_name: datasetName,
        access_token: token,
        token_source: 'manual',
        token_expires_at: info.debuggable ? info.expiresAt : null,
        connected_by: auth.userId ?? null,
        status: 'active',
        last_error: null,
        is_active: true,
        metadata: info.debuggable ? { scopes: info.scopes } : { token_debug: 'unavailable' },
      })
      .select('id')
      .single();

    if (error || !inserted) {
      console.error('[api/ads/accounts] insert failed:', error?.message);
      return NextResponse.json({ error: 'บันทึกบัญชีโฆษณาไม่สำเร็จ' }, { status: 500 });
    }

    const probe = await probeAdAccount(inserted.id);
    const fresh = await getAdAccountRow(inserted.id);

    return NextResponse.json(
      { account: fresh ? toAdAccountView(fresh) : null, probe },
      { status: 201 },
    );
  } catch (err) {
    console.error('[api/ads/accounts] POST failed:', err);
    return NextResponse.json({ error: 'เชื่อมบัญชีโฆษณาไม่สำเร็จ' }, { status: 500 });
  }
}

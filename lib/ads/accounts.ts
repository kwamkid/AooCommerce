// Path: lib/ads/accounts.ts
//
// บัญชีโฆษณาของบริษัท (`ad_accounts`) — โหลด · จดสถานะ · ตรวจว่าใช้ได้จริงไหม (server-only)
//
// กติกา:
// - **ห้าม throw** ทุกฟังก์ชัน (ผู้เรียกคือ cron และสายหลังบันทึกเงิน)
// - `metadata` เป็น jsonb ที่หลายเรื่องใช้ร่วมกัน ⇒ **อ่านก่อน merge เสมอ ห้ามเขียนทับทั้งก้อน**
//   (เขียนทับ = ตัวเลือก include_flow_types ที่เจ้าของตั้งไว้หายตอนตัวเฝ้าจดผลตรวจ)
// - "ตรวจแล้วไม่ผ่าน" ต้องแยกให้ออกว่า **token ตาย · สิทธิ์ไม่ถึง · ยังไม่ยอมรับ ToS**
//   เพราะสามอย่างนี้แก้คนละทางกันคนละเรื่อง

import { supabaseAdmin } from '@/lib/supabase-admin';
import { maskSecret } from '@/lib/shopee/app-credentials';
import { graphErrorText, isTokenError, isPermissionError, isTosRequiredError } from '@/lib/meta/graph';
import { debugToken, getAdAccount, getDataset, listCustomAudiences, sendCapiEvents } from '@/lib/meta/ads';
import { buildCapiEvent, buildCapiRequest } from '@/lib/meta/capi';
import { buildHashedUserData } from '@/lib/meta/hashing';
import type { AdAccountProbe, AdAccountView } from '@/lib/ads/meta-ui';
import type { AdAccountRow } from './types';

const ACCOUNT_COLUMNS =
  'id, company_id, platform, external_id, name, business_id, business_name, currency, ' +
  'dataset_id, dataset_name, access_token, token_source, token_expires_at, status, last_error, ' +
  'last_checked_at, capi_ok_at, audiences_ok_at, metadata, is_active, created_at';

/**
 * วิธีแก้ของแต่ละอาการ — **ข้อความเดียวที่ทุกที่ใช้ร่วมกัน** (ตัวเฝ้า · หน้าตั้งค่า · log)
 * บอกว่าพังเฉย ๆ แล้วให้ผู้ใช้ไปหาทางเอง ไม่นับว่าแจ้งเตือน
 */
export const AD_ACCOUNT_FIX = {
  token_expired:
    'token ของบัญชีโฆษณาหมดอายุ — เปิด ตั้งค่า › บัญชีโฆษณา แล้วกดเมนู › "เชื่อมต่อใหม่ (ขอสิทธิ์ใหม่)" (token จาก Login Facebook อายุ ~60 วัน)',
  permission:
    'token ไม่มีสิทธิ์ ads_management/ads_read — เชื่อมต่อใหม่แล้วอนุญาตทุกสิทธิ์ หรือใช้ System User token ที่มีสิทธิ์ครบ',
  dataset: 'Dataset ใช้ไม่ได้ — เปิด ตั้งค่า › บัญชีโฆษณา แล้วเลือก Dataset ใหม่',
  tos: (externalId: string) =>
    `ยังไม่ได้ยอมรับข้อกำหนด Custom Audience — เปิด https://business.facebook.com/ads/manage/customaudiences/tos/?act=${externalId} กดยอมรับ แล้วกดทดสอบอีกครั้ง`,
} as const;

/** อีเมลปลอมสำหรับ event ทดสอบ — ต้องมีตัวจับคู่อย่างน้อยหนึ่งอย่าง Meta ถึงจะรับ */
const PROBE_EMAIL = 'probe@aoocommerce.test';

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** บัญชีที่เปิดใช้อยู่ของบริษัทนี้ — **ไม่กรอง status** (adapter เป็นคนตัดสินว่าใบไหนยิงได้) */
export async function listActiveAdAccounts(companyId: string, platform = 'meta'): Promise<AdAccountRow[]> {
  try {
    const { data } = await supabaseAdmin
      .from('ad_accounts')
      .select(ACCOUNT_COLUMNS)
      .eq('company_id', companyId)
      .eq('platform', platform)
      .eq('is_active', true);
    return (data || []) as unknown as AdAccountRow[];
  } catch (err) {
    console.error('[ads/accounts] list failed:', errText(err));
    return [];
  }
}

export async function getAdAccountRow(id: string): Promise<AdAccountRow | null> {
  try {
    const { data } = await supabaseAdmin.from('ad_accounts').select(ACCOUNT_COLUMNS).eq('id', id).maybeSingle();
    return (data as unknown as AdAccountRow) ?? null;
  } catch {
    return null;
  }
}

type AccountPatch = Partial<
  Pick<
    AdAccountRow,
    | 'status'
    | 'last_error'
    | 'last_checked_at'
    | 'capi_ok_at'
    | 'audiences_ok_at'
    | 'token_expires_at'
    | 'dataset_name'
    | 'name'
  >
> & { metadata?: Record<string, unknown> };

/**
 * เขียนสถานะลงบัญชี — `metadata` **อ่านค่าล่าสุดจาก DB ก่อน merge** (ส่งค่าเป็น `undefined` = ลบคีย์)
 */
export async function markAdAccount(id: string, patch: AccountPatch): Promise<void> {
  try {
    const { metadata, ...rest } = patch;
    const update: Record<string, unknown> = { ...rest };

    if (metadata) {
      const { data } = await supabaseAdmin
        .from('ad_accounts')
        .select('metadata')
        .eq('id', id)
        .maybeSingle<{ metadata: Record<string, unknown> | null }>();
      const next: Record<string, unknown> = { ...(data?.metadata || {}) };
      for (const [key, value] of Object.entries(metadata)) {
        if (value === undefined) delete next[key];
        else next[key] = value;
      }
      update.metadata = next;
    }

    if (Object.keys(update).length === 0) return;
    await supabaseAdmin.from('ad_accounts').update(update).eq('id', id);
  } catch (err) {
    console.error('[ads/accounts] mark failed:', errText(err));
  }
}

/** dataset ของบัญชีนี้เป็นใบเดียวกับที่เพจ Messenger ใช้อยู่ไหม (Meta ตัด event ซ้ำด้วย event_id ให้เอง) */
async function isSameAsPageDataset(companyId: string, datasetId: string | null): Promise<boolean> {
  if (!datasetId) return false;
  try {
    const { data } = await supabaseAdmin
      .from('chat_accounts')
      .select('credentials')
      .eq('company_id', companyId)
      .eq('platform', 'facebook');
    return (data || []).some(
      (a) => String(((a.credentials || {}) as Record<string, unknown>).meta_dataset_id || '') === datasetId,
    );
  } catch {
    return false;
  }
}

/**
 * ตรวจว่าบัญชีนี้ใช้ได้จริงไหม **ตอนนี้** แล้วจดผลลงแถว — ถาม Meta ใหม่เสมอ
 *
 * แยกเป็น 3 ข้อเพราะ token บางใบ **ส่ง event ได้แต่ sync กลุ่มเป้าหมายไม่ได้**
 * (ads_management ขาด หรือยังไม่กดยอมรับ ToS ของ Custom Audience)
 *
 * @param opts.testEventCode ใส่แล้วจะยิง event ทดสอบเข้า dataset จริง (ไม่นับเป็นข้อมูลจริง)
 *   — ต่างจากการแค่ถามว่ามี dataset อยู่ไหม ตรงที่พิสูจน์ว่า **ยิงเข้าได้** จริง
 */
export async function probeAdAccount(
  id: string,
  opts: { testEventCode?: string } = {},
): Promise<AdAccountProbe> {
  const checkedAt = new Date().toISOString();
  const probe: AdAccountProbe = {
    token_ok: false,
    capi_ok: false,
    audiences_ok: false,
    tos_required: false,
    dataset: null,
    errors: [],
    checked_at: checkedAt,
  };

  try {
    const account = await getAdAccountRow(id);
    if (!account) {
      probe.errors.push('ไม่พบบัญชีโฆษณานี้ในระบบ');
      return probe;
    }
    const token = account.access_token || '';
    if (!token) {
      probe.errors.push(AD_ACCOUNT_FIX.token_expired);
      await markAdAccount(id, { status: 'token_expired', last_error: AD_ACCOUNT_FIX.token_expired, last_checked_at: checkedAt });
      return probe;
    }

    // 1) token ใช้ได้ไหม + ชื่อบัญชีล่าสุด
    const acc = await getAdAccount(account.external_id, token);
    probe.token_ok = acc.ok;
    let tokenDead = false;
    if (!acc.ok) {
      tokenDead = isTokenError(acc.error, acc.status);
      probe.errors.push(
        tokenDead
          ? AD_ACCOUNT_FIX.token_expired
          : isPermissionError(acc.error)
            ? AD_ACCOUNT_FIX.permission
            : `อ่านข้อมูลบัญชีโฆษณาไม่ได้: ${graphErrorText(acc)}`,
      );
    }

    // 2) dataset ยิง event เข้าได้ไหม
    if (probe.token_ok && account.dataset_id) {
      const ds = await getDataset(account.dataset_id, token);
      if (ds.ok && ds.body) {
        probe.dataset = { id: ds.body.id, name: ds.body.name || null };
        probe.capi_ok = true;
      } else {
        probe.errors.push(`${AD_ACCOUNT_FIX.dataset} (${graphErrorText(ds)})`);
      }

      // ยิงจริงด้วยรหัสทดสอบ — พิสูจน์ว่า "เข้าได้" ไม่ใช่แค่ "มีอยู่"
      if (probe.capi_ok && opts.testEventCode) {
        const body = buildCapiRequest([
          buildCapiEvent({
            eventName: 'Purchase',
            eventId: `probe:${Date.now()}`,
            eventTime: Math.floor(Date.now() / 1000),
            actionSource: 'other',
            userData: { ...buildHashedUserData({ email: PROBE_EMAIL }) },
            customData: { currency: 'THB', value: 0 },
            // ห้าม Meta เอา event ทดสอบไปปรับจูนโฆษณาจริง
            optOut: true,
          }),
        ]);
        const sent = await sendCapiEvents(account.dataset_id, token, body, { testEventCode: opts.testEventCode });
        const received = sent.body?.events_received ?? 0;
        if (!sent.ok || received < 1) {
          probe.capi_ok = false;
          probe.errors.push(`ยิง event ทดสอบไม่ผ่าน: ${graphErrorText(sent)}`);
        }
      }
    } else if (probe.token_ok && !account.dataset_id) {
      probe.errors.push(AD_ACCOUNT_FIX.dataset);
    }

    // 3) สิทธิ์จัดการกลุ่มเป้าหมาย (Phase 2) — ล้มไม่กระทบการยิง event
    let audiencesError: string | undefined;
    if (probe.token_ok) {
      const aud = await listCustomAudiences(account.external_id, token, 1);
      if (aud.ok) {
        probe.audiences_ok = true;
      } else if (isTosRequiredError(aud.error)) {
        probe.tos_required = true;
        audiencesError = AD_ACCOUNT_FIX.tos(account.external_id);
        probe.errors.push(audiencesError);
      } else {
        audiencesError = isPermissionError(aud.error)
          ? AD_ACCOUNT_FIX.permission
          : `อ่านรายการกลุ่มเป้าหมายไม่ได้: ${graphErrorText(aud)}`;
        probe.errors.push(audiencesError);
      }
    }

    const sameAsPage = await isSameAsPageDataset(account.company_id, account.dataset_id);

    const status: AdAccountRow['status'] = tokenDead
      ? 'token_expired'
      : probe.token_ok && probe.capi_ok
        ? 'active'
        : 'error';

    await markAdAccount(id, {
      status,
      last_error: probe.errors[0] ?? null,
      last_checked_at: checkedAt,
      ...(probe.capi_ok ? { capi_ok_at: checkedAt } : {}),
      ...(probe.audiences_ok ? { audiences_ok_at: checkedAt } : {}),
      ...(probe.dataset?.name ? { dataset_name: probe.dataset.name } : {}),
      ...(acc.ok && acc.body?.name ? { name: acc.body.name } : {}),
      metadata: {
        same_as_page_dataset: sameAsPage,
        // ผ่านแล้วต้องลบเหตุผลเก่าทิ้ง ไม่งั้นป้ายบนการ์ดค้างสีเหลืองตลอด
        tos_required: probe.tos_required ? true : undefined,
        audiences_error: probe.audiences_ok ? undefined : audiencesError,
      },
    });

    return probe;
  } catch (err) {
    probe.errors.push(`ตรวจบัญชีโฆษณาไม่สำเร็จ: ${errText(err)}`);
    return probe;
  }
}

/**
 * ถาม Meta ว่า token ใบนี้หมดอายุเมื่อไหร่ + มี scope อะไร
 *
 * ⚠️ `debuggable: false` = **ตอบไม่ได้** ไม่ใช่ "token พัง" — จดไว้เฉย ๆ ห้ามเอาไปปิดการเชื่อมต่อ
 */
export async function refreshTokenExpiry(id: string): Promise<void> {
  try {
    const account = await getAdAccountRow(id);
    if (!account?.access_token) return;
    const info = await debugToken(account.access_token);
    if (info.debuggable) {
      await markAdAccount(id, {
        token_expires_at: info.expiresAt,
        metadata: { scopes: info.scopes, token_debug: undefined },
      });
    } else {
      await markAdAccount(id, { metadata: { token_debug: 'unavailable' } });
    }
  } catch (err) {
    console.error('[ads/accounts] refreshTokenExpiry failed:', errText(err));
  }
}

/**
 * ตรวจบัญชีที่ไม่ได้ตรวจมานาน — งานของ cron (`/api/ads/run-jobs`)
 *
 * ทำทีละใบ ไม่ขนาน: บัญชีหนึ่งใบยิง Graph 3 ครั้ง ยิงพร้อมกันหลายใบเสี่ยงโดนจำกัดอัตรา
 * แล้วจะได้ผลว่า "พัง" ทั้งที่แค่ยิงถี่เกิน
 */
export async function probeStaleAdAccounts(
  opts: { maxAgeHours?: number; limit?: number } = {},
): Promise<{ probed: number; expired: number }> {
  const maxAgeHours = opts.maxAgeHours ?? 6;
  const limit = Math.max(1, Math.min(50, opts.limit ?? 10));
  const cutoff = new Date(Date.now() - maxAgeHours * 3_600_000).toISOString();
  let probed = 0;
  let expired = 0;

  try {
    const { data } = await supabaseAdmin
      .from('ad_accounts')
      .select('id')
      .eq('is_active', true)
      .or(`last_checked_at.is.null,last_checked_at.lt.${cutoff}`)
      .order('last_checked_at', { ascending: true, nullsFirst: true })
      .limit(limit);

    for (const row of (data || []) as { id: string }[]) {
      const result = await probeAdAccount(row.id);
      probed += 1;
      if (!result.token_ok) expired += 1;
      // token หมดอายุ = จดวันหมดอายุใหม่ไม่ได้อยู่แล้ว · ใบที่ยังดีค่อยอัปเดตวันหมดอายุ
      if (result.token_ok) await refreshTokenExpiry(row.id);
    }
  } catch (err) {
    console.error('[ads/accounts] probeStale failed:', errText(err));
  }

  return { probed, expired };
}

/** รูปที่ API ส่งให้หน้าจอ — **token ถูกปิดบังเสมอ** (เหลือ 4 ตัวท้ายไว้ให้ผู้ใช้เทียบว่าใบไหน) */
export function toAdAccountView(
  row: AdAccountRow,
  extra: { events_7d?: { sent: number; failed: number } } = {},
): AdAccountView {
  const meta = (row.metadata || {}) as Record<string, unknown>;
  return {
    id: row.id,
    platform: 'meta',
    external_id: row.external_id,
    name: row.name,
    business_id: row.business_id,
    business_name: row.business_name,
    currency: row.currency,
    dataset_id: row.dataset_id,
    dataset_name: row.dataset_name,
    token_source: row.token_source,
    token_expires_at: row.token_expires_at,
    status: row.status,
    last_error: row.last_error,
    last_checked_at: row.last_checked_at,
    capi_ok_at: row.capi_ok_at,
    audiences_ok_at: row.audiences_ok_at,
    metadata: {
      include_flow_types: Array.isArray(meta.include_flow_types)
        ? (meta.include_flow_types as unknown[]).map((v) => String(v))
        : undefined,
      test_event_code: (meta.test_event_code as string | null) ?? null,
      same_as_page_dataset: meta.same_as_page_dataset === true,
      audiences_error: (meta.audiences_error as string | null) ?? null,
      tos_required: meta.tos_required === true,
      token_debug: meta.token_debug === 'unavailable' ? 'unavailable' : null,
      scopes: Array.isArray(meta.scopes) ? (meta.scopes as unknown[]).map((v) => String(v)) : undefined,
    },
    is_active: row.is_active,
    created_at: row.created_at,
    access_token_masked: maskSecret(row.access_token),
    events_7d: extra.events_7d ?? { sent: 0, failed: 0 },
  };
}

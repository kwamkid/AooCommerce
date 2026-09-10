// Path: lib/audiences/sync.ts
//
// ส่งกลุ่มเป้าหมายขึ้น Custom Audience ของ Meta — **ส่งเฉพาะส่วนต่าง ไม่ใช่ส่งใหม่ทั้งกลุ่ม**
//
// ทำไมต้องเก็บสมาชิกไว้ที่ `audience_sync_members`: Meta **ไม่มี API ให้ถามว่าตอนนี้ในกลุ่ม
// มีใครบ้าง** (บอกได้แค่ขนาดโดยประมาณเป็นช่วง) ⇒ ถ้าไม่จดเองว่าเคยส่งใครขึ้นไปแล้ว
// จะไม่มีทางรู้ว่าใครต้อง "ถอดออก" เมื่อเขาหลุดจากเงื่อนไข (เช่นซื้อของแล้วจึงไม่ควรอยู่ใน
// กลุ่ม "ยังไม่เคยซื้อ" อีก) — เก็บเป็น **hash เท่านั้น** ไม่เก็บเบอร์/อีเมลดิบ
//
// กติกา:
// - **ห้าม throw** ผู้เรียกคือ cron และ after() ของ route
// - **ทำงานต่อจากที่ค้างได้เสมอ** — บันทึกสมาชิกลง DB ทันทีที่ล็อตนั้นอัปสำเร็จ ⇒ ตายกลางทาง
//   แล้วรอบหน้าจะไม่ส่งซ้ำ (Meta รับซ้ำได้ไม่พัง แต่เปลืองคำขอและทำให้เลขที่รายงานเพี้ยน)
// - "พัง" ต้องแยกให้ออกว่า **token ตาย · สิทธิ์ไม่ถึง · ยังไม่ยอมรับ ToS · แค่โดนจำกัดอัตรา**
//   สามอันแรกต้องให้เจ้าของไปทำอะไรสักอย่าง อันสุดท้ายแค่รอ

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { logIntegrationNow } from '@/lib/integration-logger';
import { AD_ACCOUNT_FIX, getAdAccountRow, markAdAccount } from '@/lib/ads/accounts';
import {
  AUDIENCE_CHUNK,
  addAudienceUsers,
  createCustomAudience,
  getCustomAudience,
  removeAudienceUsers,
  updateCustomAudience,
  type AudienceSchemaKey,
} from '@/lib/meta/ads';
import {
  graphErrorText,
  isPermissionError,
  isRateLimitError,
  isTokenError,
  isTosRequiredError,
  type GraphResult,
} from '@/lib/meta/graph';
import {
  projectIdentities,
  resolveAudienceMembers,
  validateAudienceDefinition,
  type AudienceMember,
  type Identity,
} from './resolve';

const INTEGRATION = 'meta_ads';
const ACTION = 'audience_sync';

/** งาน sync ที่ค้างสถานะ 'syncing' นานกว่านี้ถือว่าตัวที่จองไว้ตายไปแล้ว */
const STALE_CLAIM_MS = 15 * 60_000;
/** รอบปกติ — กลุ่มเป้าหมายไม่ต้องสด ๆ ทุกชั่วโมง (Meta เองก็ใช้เวลาประมวลผลเป็นชั่วโมง) */
const NORMAL_INTERVAL_MS = 24 * 3_600_000;
/** โดนจำกัดอัตรา — รอสั้น ๆ แล้วมาต่อ */
const RATE_LIMIT_RETRY_MS = 3_600_000;

export type AudienceSyncStatus = 'pending' | 'syncing' | 'synced' | 'error' | 'tos_required';

interface SyncRow {
  id: string;
  audience_id: string;
  company_id: string;
  ad_account_id: string;
  external_audience_id: string | null;
  external_name: string | null;
  status: AudienceSyncStatus;
  auto_sync: boolean;
  next_sync_at: string | null;
  started_at: string | null;
}

interface AudienceRow {
  id: string;
  company_id: string;
  name: string;
  definition: unknown;
  is_active: boolean;
}

export interface AudienceSyncCounts {
  total: number;
  with_phone: number;
  with_email: number;
  with_psid: number;
  not_syncable: number;
  uploaded: number;
  removed: number;
  /** PSID ที่ Meta ไม่ยอมรับ (เพจไม่ได้ผูกกับ business เดียวกัน / ไม่มีสิทธิ์) */
  psid_failed: number;
}

export interface AudienceSyncResult {
  ok: boolean;
  status: AudienceSyncStatus;
  counts?: AudienceSyncCounts;
  error?: string;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function iso(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString();
}

async function patchSync(id: string, values: Record<string, unknown>): Promise<void> {
  await supabaseAdmin
    .from('audience_syncs')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id)
    .then(null, (e: unknown) => console.error('[audiences/sync] patch failed:', errText(e)));
}

/**
 * จองงานหนึ่งใบ — **UPDATE แบบมีเงื่อนไข** กัน cron สองรอบซ้อน/สอง instance หยิบใบเดียวกัน
 * แล้วอัปรายชื่อชุดเดียวกันขึ้น Meta พร้อมกัน
 *
 * ใบที่ค้าง 'syncing' เกิน 15 นาที ถือว่าตัวที่จองไว้ตายไปแล้ว — จองต่อได้
 */
export async function claimAudienceSync(id: string): Promise<boolean> {
  try {
    const stale = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
    const { data } = await supabaseAdmin
      .from('audience_syncs')
      .update({ status: 'syncing', started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .or(`status.neq.syncing,started_at.is.null,started_at.lt.${stale}`)
      .select('id');
    return !!data && data.length > 0;
  } catch (e) {
    console.error('[audiences/sync] claim failed:', errText(e));
    return false;
  }
}

// ─── ตัวจับคู่ ↔ กุญแจสมาชิก ───────────────────────────────────────────

/** แปลง member_key ที่เก็บไว้กลับเป็นตัวจับคู่ (ใช้ตอนถอดคนออกจากกลุ่ม) */
function parseMemberKey(key: string): Identity | null {
  if (key.startsWith('ph:')) return { key, kind: 'PHONE', value: key.slice(3) };
  if (key.startsWith('em:')) return { key, kind: 'EMAIL', value: key.slice(3) };
  if (key.startsWith('psid:')) {
    const rest = key.slice(5);
    const sep = rest.indexOf(':');
    if (sep <= 0) return null;
    return { key, kind: 'PAGEUID', value: rest.slice(sep + 1), pageId: rest.slice(0, sep) };
  }
  return null;
}

interface UploadGroup {
  schema: AudienceSchemaKey;
  pageId?: string;
  items: Identity[];
}

/** จัดกลุ่มตามชนิด — PAGEUID ต้องแยกตามเพจ (Meta รับได้เพจเดียวต่อคำขอ) */
function groupIdentities(items: Identity[]): UploadGroup[] {
  const phone: Identity[] = [];
  const email: Identity[] = [];
  const byPage = new Map<string, Identity[]>();

  for (const i of items) {
    if (i.kind === 'PHONE') phone.push(i);
    else if (i.kind === 'EMAIL') email.push(i);
    else if (i.pageId) {
      const list = byPage.get(i.pageId) || [];
      list.push(i);
      byPage.set(i.pageId, list);
    }
  }

  const groups: UploadGroup[] = [];
  if (phone.length) groups.push({ schema: 'PHONE', items: phone });
  if (email.length) groups.push({ schema: 'EMAIL', items: email });
  for (const [pageId, list] of byPage) groups.push({ schema: 'PAGEUID', pageId, items: list });
  return groups;
}

/** ปัญหาเฉพาะของ PSID (เพจไม่ได้อยู่ business เดียวกัน / พารามิเตอร์ไม่ถูก) — ข้ามเพจนั้นไป ไม่ล้มทั้งใบ */
function isPageUidRejection(r: GraphResult<unknown>): boolean {
  return r.error?.code === 100 || r.error?.code === 200;
}

// ─── ตัวรันจริง ────────────────────────────────────────────────────────

/**
 * ส่งกลุ่มหนึ่งใบขึ้นบัญชีโฆษณาหนึ่งใบ — **เรียกซ้ำได้เสมอ**
 *
 * หมดงบเวลาระหว่างล็อต = คงความคืบหน้าไว้แล้วตั้งสถานะ 'pending' + `next_sync_at = now`
 * รอบหน้าเริ่มจากส่วนต่างที่เหลือ (สมาชิกที่อัปแล้วถูกจดลง DB ทันทีทุกล็อต)
 */
export async function runAudienceSync(
  syncId: string,
  opts: { deadlineAt: number; trigger: 'manual' | 'cron' },
): Promise<AudienceSyncResult> {
  let companyId = '';
  let audienceName = '';

  /** ปิดงานหนึ่งรอบ — จดสถานะลงแถว + log หนึ่งใบต่อหนึ่งรอบเสมอ */
  const finish = async (
    status: AudienceSyncStatus,
    extra: {
      error?: string | null;
      nextInMs?: number | null;
      counts?: AudienceSyncCounts;
      values?: Record<string, unknown>;
      fix?: string;
    },
  ): Promise<AudienceSyncResult> => {
    await patchSync(syncId, {
      status,
      error: extra.error ?? null,
      ...(extra.nextInMs === undefined ? {} : { next_sync_at: extra.nextInMs === null ? null : iso(extra.nextInMs) }),
      ...(extra.counts ? { last_counts: extra.counts } : {}),
      ...(extra.values || {}),
    });

    if (companyId) {
      await logIntegrationNow({
        company_id: companyId,
        integration: INTEGRATION,
        direction: 'outgoing',
        action: ACTION,
        method: 'JOB',
        status: status === 'synced' ? 'success' : 'error',
        response_body: extra.counts ?? { trigger: opts.trigger },
        error_message: extra.error || undefined,
        reference_type: 'audience',
        reference_id: syncId,
        reference_label: audienceName || undefined,
      }).catch(() => null);
    }

    return {
      ok: status === 'synced',
      status,
      counts: extra.counts,
      error: extra.error || undefined,
    };
  };

  try {
    const { data: syncData } = await supabaseAdmin
      .from('audience_syncs')
      .select('id, audience_id, company_id, ad_account_id, external_audience_id, external_name, status, auto_sync, next_sync_at, started_at')
      .eq('id', syncId)
      .maybeSingle();
    const sync = (syncData as SyncRow | null) ?? null;
    if (!sync) return { ok: false, status: 'error', error: 'ไม่พบงานซิงก์นี้' };
    companyId = sync.company_id;

    const { data: audData } = await supabaseAdmin
      .from('audiences')
      .select('id, company_id, name, definition, is_active')
      .eq('id', sync.audience_id)
      .maybeSingle();
    const audience = (audData as AudienceRow | null) ?? null;
    if (!audience || !audience.is_active) {
      return finish('error', { error: 'กลุ่มเป้าหมายนี้ถูกลบหรือปิดใช้งานแล้ว', nextInMs: NORMAL_INTERVAL_MS });
    }
    audienceName = audience.name;

    const parsed = validateAudienceDefinition(audience.definition);
    if (!parsed.ok) {
      return finish('error', { error: `เงื่อนไขของกลุ่มไม่ถูกต้อง: ${parsed.error}`, nextInMs: NORMAL_INTERVAL_MS });
    }

    // ── บัญชีโฆษณาใช้ได้จริงไหม ──────────────────────────────────────
    const account = await getAdAccountRow(sync.ad_account_id);
    if (!account || !account.is_active || account.company_id !== sync.company_id) {
      return finish('error', {
        error: 'ไม่พบบัญชีโฆษณาปลายทาง หรือถูกปิดอยู่ — เปิด ตั้งค่า › บัญชีโฆษณา แล้วเชื่อมต่อใหม่',
        nextInMs: NORMAL_INTERVAL_MS,
      });
    }
    if (!account.access_token || account.status === 'token_expired') {
      return finish('error', { error: AD_ACCOUNT_FIX.token_expired, nextInMs: NORMAL_INTERVAL_MS });
    }
    if (!account.audiences_ok_at) {
      const tosRequired = (account.metadata || {}).tos_required === true;
      return finish(tosRequired ? 'tos_required' : 'error', {
        error: tosRequired ? AD_ACCOUNT_FIX.tos(account.external_id) : AD_ACCOUNT_FIX.permission,
        nextInMs: NORMAL_INTERVAL_MS,
      });
    }
    const token = account.access_token;

    // ── กลุ่มฝั่ง Meta (สร้างครั้งแรก / เปลี่ยนชื่อตาม) ─────────────────
    let externalId = sync.external_audience_id;
    if (!externalId) {
      const created = await createCustomAudience(account.external_id, token, {
        name: audience.name,
        description: `AooCommerce กลุ่มเป้าหมาย ${audience.id}`,
      });
      if (!created.ok || !created.body?.id) {
        if (isTosRequiredError(created.error)) {
          await markAdAccount(account.id, { metadata: { tos_required: true } });
          return finish('tos_required', {
            error: AD_ACCOUNT_FIX.tos(account.external_id),
            nextInMs: NORMAL_INTERVAL_MS,
          });
        }
        if (isTokenError(created.error, created.status)) {
          await markAdAccount(account.id, {
            status: 'token_expired',
            last_error: AD_ACCOUNT_FIX.token_expired,
            last_checked_at: new Date().toISOString(),
          });
          return finish('error', { error: AD_ACCOUNT_FIX.token_expired, nextInMs: NORMAL_INTERVAL_MS });
        }
        const why = isPermissionError(created.error) ? AD_ACCOUNT_FIX.permission : graphErrorText(created);
        return finish('error', { error: `สร้างกลุ่มบน Meta ไม่สำเร็จ: ${why}`, nextInMs: NORMAL_INTERVAL_MS });
      }
      externalId = created.body.id;
      await patchSync(syncId, { external_audience_id: externalId, external_name: audience.name });
    } else if (sync.external_name !== audience.name) {
      // เปลี่ยนชื่อกลุ่มในระบบเรา = เปลี่ยนชื่อบน Meta ด้วย ไม่งั้นคนดูโฆษณาหากลุ่มไม่เจอ
      const renamed = await updateCustomAudience(externalId, token, { name: audience.name });
      if (renamed.ok) await patchSync(syncId, { external_name: audience.name });
    }

    // ── ใครควรอยู่ในกลุ่ม (ตอนนี้) vs ใครอยู่แล้ว ─────────────────────
    const { members, stats } = await resolveAudienceMembers(sync.company_id, parsed.def);

    const desired = new Map<string, { identity: Identity; member: AudienceMember }>();
    for (const m of members) {
      for (const identity of projectIdentities(m)) desired.set(identity.key, { identity, member: m });
    }

    const { rows: existingRows } = await fetchAllRows<{ member_key: string }>((from, to) =>
      supabaseAdmin
        .from('audience_sync_members')
        .select('member_key', { count: 'exact' })
        .eq('audience_sync_id', syncId)
        .range(from, to),
    );
    const existing = new Set(existingRows.map(r => r.member_key));

    const toAdd = [...desired.values()].filter(d => !existing.has(d.identity.key)).map(d => d.identity);
    const toRemove = [...existing].filter(k => !desired.has(k))
      .map(parseMemberKey)
      .filter((v): v is Identity => !!v);

    const counts: AudienceSyncCounts = {
      total: stats.total,
      with_phone: stats.with_phone,
      with_email: stats.with_email,
      with_psid: stats.with_psid,
      not_syncable: stats.not_syncable,
      uploaded: 0,
      removed: 0,
      psid_failed: 0,
    };

    /** เพจที่ Meta ปฏิเสธ — ล็อตที่เหลือของเพจนั้นข้ามไปเลย ไม่เสียคำขอซ้ำ */
    const rejectedPages = new Set<string>();

    // ── เพิ่มคนเข้ากลุ่ม ─────────────────────────────────────────────
    for (const group of groupIdentities(toAdd)) {
      if (group.schema === 'PAGEUID' && group.pageId && rejectedPages.has(group.pageId)) {
        counts.psid_failed += group.items.length;
        continue;
      }
      for (let i = 0; i < group.items.length; i += AUDIENCE_CHUNK) {
        if (Date.now() > opts.deadlineAt) {
          return finish('pending', {
            error: null,
            nextInMs: 0,
            counts,
            values: { last_sync_at: new Date().toISOString() },
          });
        }

        const chunk = group.items.slice(i, i + AUDIENCE_CHUNK);
        const res = await addAudienceUsers(externalId, token, {
          schema: group.schema,
          data: chunk.map(c => c.value),
          ...(group.pageId ? { pageId: group.pageId } : {}),
        });

        if (!res.ok) {
          if (isRateLimitError(res.error)) {
            // ความคืบหน้าที่อัปไปแล้วถูกจดไว้ครบ — รอบหน้าไม่ส่งซ้ำ
            return finish('pending', {
              error: `Meta จำกัดอัตราการเรียกชั่วคราว (${graphErrorText(res)}) — ระบบจะลองต่อในอีก 1 ชั่วโมง`,
              nextInMs: RATE_LIMIT_RETRY_MS,
              counts,
            });
          }
          if (isTokenError(res.error, res.status)) {
            await markAdAccount(account.id, {
              status: 'token_expired',
              last_error: AD_ACCOUNT_FIX.token_expired,
              last_checked_at: new Date().toISOString(),
            });
            return finish('error', { error: AD_ACCOUNT_FIX.token_expired, nextInMs: NORMAL_INTERVAL_MS, counts });
          }
          if (isTosRequiredError(res.error)) {
            await markAdAccount(account.id, { metadata: { tos_required: true } });
            return finish('tos_required', {
              error: AD_ACCOUNT_FIX.tos(account.external_id),
              nextInMs: NORMAL_INTERVAL_MS,
              counts,
            });
          }
          if (group.schema === 'PAGEUID' && group.pageId && isPageUidRejection(res)) {
            // เพจนี้ส่ง PSID ขึ้นไม่ได้ (ไม่ได้อยู่ business เดียวกับบัญชีโฆษณา ฯลฯ)
            // — เบอร์/อีเมลของคนกลุ่มเดียวกันยังขึ้นได้ จึงไม่ล้มทั้งใบ
            rejectedPages.add(group.pageId);
            counts.psid_failed += group.items.length - i;
            break;
          }
          return finish('error', {
            error: `เพิ่มรายชื่อเข้ากลุ่มไม่สำเร็จ: ${graphErrorText(res)}`,
            nextInMs: NORMAL_INTERVAL_MS,
            counts,
          });
        }

        // จดทันทีที่ล็อตนั้นสำเร็จ — ตายหลังบรรทัดนี้ก็ไม่ส่งซ้ำ
        const rows = chunk.map(c => {
          const m = desired.get(c.key)!.member;
          return {
            audience_sync_id: syncId,
            member_key: c.key,
            company_id: sync.company_id,
            customer_id: m.customer_id,
            contact_id: m.contact_id,
            contact_platform: m.contact_platform,
          };
        });
        const { error: insertError } = await supabaseAdmin
          .from('audience_sync_members')
          .upsert(rows, { onConflict: 'audience_sync_id,member_key', ignoreDuplicates: true });
        if (insertError) console.error('[audiences/sync] save members failed:', insertError.message);

        counts.uploaded += chunk.length;
      }
    }

    // ── ถอดคนที่หลุดเงื่อนไขออก ───────────────────────────────────────
    for (const group of groupIdentities(toRemove)) {
      if (group.schema === 'PAGEUID' && group.pageId && rejectedPages.has(group.pageId)) continue;
      for (let i = 0; i < group.items.length; i += AUDIENCE_CHUNK) {
        if (Date.now() > opts.deadlineAt) {
          return finish('pending', {
            error: null,
            nextInMs: 0,
            counts,
            values: { last_sync_at: new Date().toISOString() },
          });
        }

        const chunk = group.items.slice(i, i + AUDIENCE_CHUNK);
        const res = await removeAudienceUsers(externalId, token, {
          schema: group.schema,
          data: chunk.map(c => c.value),
          ...(group.pageId ? { pageId: group.pageId } : {}),
        });

        if (!res.ok) {
          if (isRateLimitError(res.error)) {
            return finish('pending', {
              error: `Meta จำกัดอัตราการเรียกชั่วคราว (${graphErrorText(res)}) — ระบบจะลองต่อในอีก 1 ชั่วโมง`,
              nextInMs: RATE_LIMIT_RETRY_MS,
              counts,
            });
          }
          if (isTokenError(res.error, res.status)) {
            await markAdAccount(account.id, {
              status: 'token_expired',
              last_error: AD_ACCOUNT_FIX.token_expired,
              last_checked_at: new Date().toISOString(),
            });
            return finish('error', { error: AD_ACCOUNT_FIX.token_expired, nextInMs: NORMAL_INTERVAL_MS, counts });
          }
          if (group.schema === 'PAGEUID' && group.pageId && isPageUidRejection(res)) {
            rejectedPages.add(group.pageId);
            break;
          }
          return finish('error', {
            error: `ถอดรายชื่อออกจากกลุ่มไม่สำเร็จ: ${graphErrorText(res)}`,
            nextInMs: NORMAL_INTERVAL_MS,
            counts,
          });
        }

        const { error: deleteError } = await supabaseAdmin
          .from('audience_sync_members')
          .delete()
          .eq('audience_sync_id', syncId)
          .in('member_key', chunk.map(c => c.key));
        if (deleteError) console.error('[audiences/sync] delete members failed:', deleteError.message);

        counts.removed += chunk.length;
      }
    }

    // ── ขนาดที่ Meta รายงาน (เป็น "ช่วง" เสมอ ห้ามอ่านเป็นตัวเลขเป๊ะ) ──
    let lower: number | null = null;
    let upper: number | null = null;
    const info = await getCustomAudience(externalId, token);
    if (info.ok && info.body) {
      const l = info.body.approximate_count_lower_bound;
      const u = info.body.approximate_count_upper_bound;
      // -1 = Meta ยังประมวลผลไม่เสร็จ — เก็บเป็น null ดีกว่าโชว์เลขติดลบ
      lower = typeof l === 'number' && l >= 0 ? l : null;
      upper = typeof u === 'number' && u >= 0 ? u : null;
    }

    await supabaseAdmin
      .from('audiences')
      .update({ member_count: stats.total, member_count_at: new Date().toISOString() })
      .eq('id', audience.id)
      .then(null, (e: unknown) => console.error('[audiences/sync] member_count failed:', errText(e)));

    return finish('synced', {
      error: null,
      nextInMs: sync.auto_sync ? NORMAL_INTERVAL_MS : null,
      counts,
      values: {
        last_sync_at: new Date().toISOString(),
        approx_size_lower: lower,
        approx_size_upper: upper,
      },
    });
  } catch (e) {
    const message = errText(e);
    console.error('[audiences/sync] unexpected error:', message);
    return finish('error', { error: `ซิงก์กลุ่มเป้าหมายไม่สำเร็จ: ${message}`, nextInMs: NORMAL_INTERVAL_MS });
  }
}

// ─── คิวงานของ cron ────────────────────────────────────────────────────

/**
 * งานที่ถึงรอบแล้วและปลายทางยังใช้ได้ — เช็คบัญชีโฆษณาแยกอีกคำถาม (ไม่พึ่งการ join ของ
 * PostgREST เพื่อให้ไม่พังเงียบ ๆ ถ้าชื่อความสัมพันธ์เปลี่ยน)
 */
async function fetchDueSyncIds(limit: number): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('audience_syncs')
    .select('id, ad_account_id')
    .eq('auto_sync', true)
    .neq('status', 'syncing')
    .lte('next_sync_at', new Date().toISOString())
    .order('next_sync_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('[audiences/sync] fetch due failed:', error.message);
    return [];
  }

  const rows = (data || []) as { id: string; ad_account_id: string }[];
  if (rows.length === 0) return [];

  const accountIds = [...new Set(rows.map(r => r.ad_account_id))];
  const { data: accounts } = await supabaseAdmin
    .from('ad_accounts')
    .select('id')
    .in('id', accountIds)
    .eq('is_active', true);
  const active = new Set((accounts || []).map(a => a.id as string));
  return rows.filter(r => active.has(r.ad_account_id)).map(r => r.id);
}

/** จำนวนงานที่ถึงรอบแล้วแต่ยังไม่มีใครหยิบ — cron ใช้รายงานว่าเหลือค้างเท่าไหร่ */
export async function countDueAudienceSyncs(): Promise<number> {
  try {
    return (await fetchDueSyncIds(200)).length;
  } catch (e) {
    console.error('[audiences/sync] countDue failed:', errText(e));
    return 0;
  }
}

export interface DueSyncRunResult {
  ran: number;
  remaining: number;
  ids: string[];
}

/**
 * ไล่ทำงานที่ถึงรอบ — จองทีละใบแล้วรันจนหมดงบเวลา
 *
 * ใบที่หยิบไปแล้วในรอบนี้จะไม่ถูกหยิบซ้ำ แม้มันจะตั้ง `next_sync_at = now` ไว้เพื่อทำต่อ
 * (ไม่งั้นวนอยู่ที่ใบเดียวจนงบเวลาหมด ใบที่เหลือไม่ได้คิว)
 */
export async function runDueAudienceSyncs(
  opts: { timeBudgetMs: number },
): Promise<DueSyncRunResult> {
  const startedAtMs = Date.now();
  const deadlineAt = startedAtMs + opts.timeBudgetMs;
  const ran: string[] = [];
  const attempted = new Set<string>();

  try {
    for (;;) {
      if (Date.now() > deadlineAt) break;

      const due = (await fetchDueSyncIds(20)).filter(id => !attempted.has(id));
      if (due.length === 0) break;

      for (const id of due) {
        if (Date.now() > deadlineAt) break;
        attempted.add(id);
        if (!await claimAudienceSync(id)) continue;
        ran.push(id);
        // ใบหนึ่งพังต้องไม่ทำให้ใบที่เหลือไม่ได้คิว (runAudienceSync จดความล้มลงแถวเองแล้ว)
        try {
          await runAudienceSync(id, { deadlineAt, trigger: 'cron' });
        } catch (e) {
          console.error('[audiences/sync] run failed', id, errText(e));
        }
      }
    }
  } catch (e) {
    console.error('[audiences/sync] runDue failed:', errText(e));
  }

  return { ran: ran.length, remaining: await countDueAudienceSyncs(), ids: ran };
}

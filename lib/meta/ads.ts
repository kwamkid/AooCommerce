// Path: lib/meta/ads.ts
//
// ตัวห่อ Marketing API ของ Meta (บัญชีโฆษณา · dataset · Custom Audience · CAPI)
// — ทุกตัวยิงผ่าน `lib/meta/graph.ts` และ **ไม่ throw** คืน `GraphResult` เสมอ
//
// ขอบเขต: ที่นี่รู้แค่ "ยิง endpoint ไหน ด้วยพารามิเตอร์อะไร" — ไม่รู้จัก DB ไม่รู้จักบริษัท
// การตัดสินใจว่าใครควรอยู่ในกลุ่มไหน/จดผลยังไง เป็นงานของชั้นบน
//
// ⚠️ Custom Audience อัปโหลดได้ **10,000 แถวต่อคำขอ** และ PAGEUID ต้องระบุเพจ
// (หนึ่งคำขอ = หนึ่งเพจ) — ผิดกติกาแล้ว Meta ปฏิเสธทั้งก้อน จึงกันไว้ตั้งแต่ก่อนยิง

import {
  graphGet,
  graphGetAll,
  graphPost,
  graphDelete,
  type GraphResult,
} from './graph';
import type { CapiRequestBody } from './capi';

export interface AdAccountSummary {
  /** รูป 'act_123456' */
  id: string;
  /** ตัวเลขล้วน '123456' */
  account_id: string;
  name: string;
  currency: string | null;
  /** 1 = ใช้งานได้ · ค่าอื่นคือถูกปิด/ค้างชำระ (ดูตารางของ Meta) */
  account_status: number | null;
  business: { id: string; name: string } | null;
}

export interface DatasetSummary {
  id: string;
  name: string;
}

/** คำตอบของ POST/DELETE /{audience}/users */
export interface AudienceUsersResponse {
  audience_id?: string;
  session_id?: string;
  num_received?: number;
  num_invalid_entries?: number;
  invalid_entry_samples?: unknown;
}

/**
 * แถวต่อหนึ่งคำขอ — เพดานจริงของ Meta คือ 10,000 แต่ตั้งไว้ 5,000
 * เพื่อให้แต่ละคำขอจบเร็วพอสำหรับงบเวลาของ route (ล้มแล้วยิงล็อตซ้ำก็ไม่แพง)
 */
export const AUDIENCE_CHUNK = 5000;
/** เพดานแข็งของ Meta — เกินนี้ปฏิเสธตั้งแต่ฝั่งเรา ไม่ต้องเสียคำขอไปให้โดนตีตก */
const MAX_AUDIENCE_ROWS = 10_000;

export type AudienceSchemaKey = 'EMAIL' | 'PHONE' | 'PAGEUID';

export interface AudienceUsersPayload {
  schema: AudienceSchemaKey;
  /** EMAIL/PHONE = ค่าที่ hash แล้ว · PAGEUID = page-scoped user id ดิบ (ห้าม hash) */
  data: string[];
  /** บังคับเมื่อ schema เป็น PAGEUID — หนึ่งคำขอต่อหนึ่งเพจเท่านั้น */
  pageId?: string;
}

const AD_ACCOUNT_FIELDS = 'id,account_id,name,currency,account_status,business{id,name}';

/** 'act_' + ตัวเลข — เรียกซ้ำได้ ('act_123' → 'act_123') */
export function actPath(adAccountId: string): string {
  const digits = String(adAccountId || '')
    .trim()
    .replace(/^act_/i, '')
    .replace(/\D/g, '');
  return `act_${digits}`;
}

/** token ระดับแอป — ไม่มี env ครบ = null (ผู้เรียกต้องบอกผู้ใช้ว่ายังตั้งค่าไม่ครบ) */
export function appAccessToken(): string | null {
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !secret) return null;
  return `${appId}|${secret}`;
}

function syntheticError<T>(message: string): GraphResult<T> {
  return { ok: false, status: 0, body: null, error: { message }, durationMs: 0 };
}

function withBody<T>(r: GraphResult<unknown>, body: T | null): GraphResult<T> {
  return { ok: r.ok, status: r.status, body, error: r.error, durationMs: r.durationMs };
}

interface RawAdAccount {
  id?: string;
  account_id?: string;
  name?: string;
  currency?: string;
  account_status?: number;
  business?: { id?: string; name?: string };
}

function normalizeAdAccount(raw: RawAdAccount): AdAccountSummary {
  return {
    id: String(raw.id ?? ''),
    account_id: String(raw.account_id ?? String(raw.id ?? '').replace(/^act_/i, '')),
    name: String(raw.name ?? ''),
    currency: raw.currency ?? null,
    account_status: typeof raw.account_status === 'number' ? raw.account_status : null,
    business: raw.business?.id ? { id: String(raw.business.id), name: String(raw.business.name ?? '') } : null,
  };
}

// ─────────────────────────── token ───────────────────────────

/**
 * แลก short-lived user token (ที่ได้จากหน้า login) เป็นใบอายุ ~60 วัน
 * — endpoint นี้ยืนยันตัวด้วย client_id+client_secret จึงส่ง token ว่างเข้า graphGet
 *   (graph.ts จะไม่ใส่ `access_token` ให้เมื่อ token ว่าง)
 */
export async function exchangeLongLivedUserToken(
  shortToken: string,
): Promise<GraphResult<{ access_token: string; expires_in?: number }>> {
  const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !secret) {
    return syntheticError('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_FACEBOOK_APP_ID / FACEBOOK_APP_SECRET');
  }
  return graphGet<{ access_token: string; expires_in?: number }>('/oauth/access_token', '', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: secret,
    fb_exchange_token: shortToken,
  });
}

/**
 * token ใบนี้ยังใช้ได้ไหม หมดอายุเมื่อไหร่ มี scope อะไรบ้าง
 *
 * `debuggable: false` = **ตอบไม่ได้** (ไม่มี app token / token เป็นของแอปอื่น / Graph ปฏิเสธ)
 * ⇒ ห้ามอ่านว่า "token พัง" ห้ามเอาไปตัดสินใจปิดการเชื่อมต่อ
 */
export async function debugToken(token: string): Promise<{
  isValid: boolean;
  expiresAt: string | null;
  scopes: string[];
  appId: string | null;
  error: string | null;
  debuggable: boolean;
}> {
  const empty = { isValid: false, expiresAt: null, scopes: [] as string[], appId: null };
  const appToken = appAccessToken();
  if (!appToken) {
    return { ...empty, error: 'ยังไม่ได้ตั้งค่า NEXT_PUBLIC_FACEBOOK_APP_ID / FACEBOOK_APP_SECRET', debuggable: false };
  }

  const r = await graphGet<{
    data?: {
      is_valid?: boolean;
      expires_at?: number;
      scopes?: string[];
      app_id?: string;
      error?: { message?: string };
    };
  }>('/debug_token', appToken, { input_token: token });

  if (!r.ok || !r.body?.data) {
    const why = r.error?.error_user_msg || r.error?.message || `HTTP ${r.status}`;
    return { ...empty, error: why, debuggable: false };
  }

  const d = r.body.data;
  // expires_at = 0 หรือไม่มี → ไม่มีวันหมดอายุ (page token แบบถาวร)
  const expiresAt = d.expires_at && d.expires_at > 0 ? new Date(d.expires_at * 1000).toISOString() : null;
  return {
    isValid: !!d.is_valid,
    expiresAt,
    scopes: Array.isArray(d.scopes) ? d.scopes : [],
    appId: d.app_id ? String(d.app_id) : null,
    error: d.error?.message ?? null,
    debuggable: true,
  };
}

// ─────────────────────────── บัญชีโฆษณา / dataset ───────────────────────────

export async function listAdAccounts(userToken: string): Promise<GraphResult<AdAccountSummary[]>> {
  const r = await graphGetAll<RawAdAccount>('/me/adaccounts', userToken, {
    fields: AD_ACCOUNT_FIELDS,
    limit: '100',
  });
  return withBody(r, r.body ? r.body.map(normalizeAdAccount) : null);
}

export async function getAdAccount(adAccountId: string, token: string): Promise<GraphResult<AdAccountSummary>> {
  const r = await graphGet<RawAdAccount>(`/${actPath(adAccountId)}`, token, { fields: AD_ACCOUNT_FIELDS });
  return withBody(r, r.ok && r.body ? normalizeAdAccount(r.body) : null);
}

/** dataset (เดิมเรียก pixel) ที่ผูกกับบัญชีโฆษณานี้ */
export async function listDatasets(adAccountId: string, token: string): Promise<GraphResult<DatasetSummary[]>> {
  const r = await graphGetAll<{ id?: string; name?: string }>(`/${actPath(adAccountId)}/adspixels`, token, {
    fields: 'id,name',
  });
  return withBody(
    r,
    r.body ? r.body.map((d) => ({ id: String(d.id ?? ''), name: String(d.name ?? '') })) : null,
  );
}

export async function getDataset(datasetId: string, token: string): Promise<GraphResult<DatasetSummary>> {
  const r = await graphGet<{ id?: string; name?: string }>(`/${datasetId}`, token, { fields: 'id,name' });
  return withBody(
    r,
    r.ok && r.body ? { id: String(r.body.id ?? datasetId), name: String(r.body.name ?? '') } : null,
  );
}

// ─────────────────────────── Conversions API ───────────────────────────

/**
 * ยิง event เข้า dataset
 * @param opts.testEventCode รหัสจากหน้า Test Events — ใส่แล้ว event จะไม่นับเป็นข้อมูลจริง
 */
export async function sendCapiEvents(
  datasetId: string,
  token: string,
  body: CapiRequestBody,
  opts: { testEventCode?: string } = {},
): Promise<GraphResult<{ events_received?: number; fbtrace_id?: string; messages?: string[] }>> {
  const payload = opts.testEventCode ? { ...body, test_event_code: opts.testEventCode } : body;
  return graphPost<{ events_received?: number; fbtrace_id?: string; messages?: string[] }>(
    `/${datasetId}/events`,
    token,
    payload as unknown as Record<string, unknown>,
    { timeoutMs: 15_000 },
  );
}

// ─────────────────────────── Custom Audience ───────────────────────────

/**
 * สร้างกลุ่มลูกค้า (ประเภท "รายชื่อที่ผู้ขายอัปโหลดเอง")
 * — `customer_file_source: 'USER_PROVIDED_ONLY'` = ข้อมูลที่ลูกค้าให้เราเองโดยตรง
 *   (ประกาศผิดประเภทถือเป็นการฝ่าฝืนข้อตกลงของ Meta ไม่ใช่แค่ metadata)
 */
export async function createCustomAudience(
  adAccountId: string,
  token: string,
  input: { name: string; description?: string },
): Promise<GraphResult<{ id: string }>> {
  return graphPost<{ id: string }>(`/${actPath(adAccountId)}/customaudiences`, token, {
    name: input.name,
    subtype: 'CUSTOM',
    customer_file_source: 'USER_PROVIDED_ONLY',
    ...(input.description ? { description: input.description } : {}),
  });
}

export async function updateCustomAudience(
  audienceId: string,
  token: string,
  input: { name?: string; description?: string },
): Promise<GraphResult<{ success?: boolean }>> {
  return graphPost<{ success?: boolean }>(`/${audienceId}`, token, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  });
}

/**
 * ขนาด/สถานะของกลุ่ม — Meta คืนเป็น **ช่วง** ไม่ใช่ตัวเลขเป๊ะ (และเป็น -1 ตอนยังประมวลผลไม่เสร็จ)
 * ⇒ ห้ามเอาไปโชว์เป็น "จำนวนสมาชิก" ตรง ๆ
 */
export async function getCustomAudience(
  audienceId: string,
  token: string,
): Promise<
  GraphResult<{
    id: string;
    name?: string;
    approximate_count_lower_bound?: number;
    approximate_count_upper_bound?: number;
    operation_status?: { code: number; description: string };
    delivery_status?: { code: number; description: string };
  }>
> {
  return graphGet(`/${audienceId}`, token, {
    fields:
      'id,name,approximate_count_lower_bound,approximate_count_upper_bound,operation_status,delivery_status',
  });
}

export async function deleteCustomAudience(
  audienceId: string,
  token: string,
): Promise<GraphResult<{ success?: boolean }>> {
  return graphDelete<{ success?: boolean }>(`/${audienceId}`, token);
}

/**
 * รายชื่อกลุ่มในบัญชีโฆษณา — ใช้เป็น **ตัวทดสอบสิทธิ์ `ads_management`** ด้วย
 * (limit 1 ก็พอ: ตอบ 200 = มีสิทธิ์ · ตอบ error = ยังไม่มี/ยังไม่ยอมรับ ToS)
 */
export async function listCustomAudiences(
  adAccountId: string,
  token: string,
  limit = 1,
): Promise<GraphResult<{ id: string }[]>> {
  const r = await graphGet<{ data?: { id?: string }[] }>(`/${actPath(adAccountId)}/customaudiences`, token, {
    fields: 'id',
    limit: String(limit),
  });
  return withBody(
    r,
    r.ok ? (r.body?.data || []).map((d) => ({ id: String(d.id ?? '') })) : null,
  );
}

/** ตรวจกติกาของ Meta ก่อนยิง — ผิดแล้วโดนตีตกทั้งก้อน เสียคำขอเปล่า */
function buildUsersBody(p: AudienceUsersPayload): { body: Record<string, unknown> } | { error: string } {
  if (!Array.isArray(p.data) || p.data.length === 0) return { error: 'ไม่มีรายชื่อให้ส่ง' };
  if (p.data.length > MAX_AUDIENCE_ROWS) {
    return { error: `ส่งได้ไม่เกิน ${MAX_AUDIENCE_ROWS} แถวต่อครั้ง (ส่งมา ${p.data.length})` };
  }
  if (p.schema === 'PAGEUID' && !p.pageId) {
    return { error: 'schema PAGEUID ต้องระบุ pageId (หนึ่งคำขอต่อหนึ่งเพจ)' };
  }
  return {
    body: {
      payload: {
        schema: [p.schema],
        data: p.data.map((v) => [v]),
        ...(p.schema === 'PAGEUID' && p.pageId ? { page_ids: [p.pageId] } : {}),
      },
    },
  };
}

export async function addAudienceUsers(
  audienceId: string,
  token: string,
  p: AudienceUsersPayload,
): Promise<GraphResult<AudienceUsersResponse>> {
  const built = buildUsersBody(p);
  if ('error' in built) return syntheticError<AudienceUsersResponse>(built.error);
  return graphPost<AudienceUsersResponse>(`/${audienceId}/users`, token, built.body, { timeoutMs: 30_000 });
}

export async function removeAudienceUsers(
  audienceId: string,
  token: string,
  p: AudienceUsersPayload,
): Promise<GraphResult<AudienceUsersResponse>> {
  const built = buildUsersBody(p);
  if ('error' in built) return syntheticError<AudienceUsersResponse>(built.error);
  return graphDelete<AudienceUsersResponse>(`/${audienceId}/users`, token, built.body, { timeoutMs: 30_000 });
}

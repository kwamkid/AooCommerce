// Path: lib/meta/graph.ts
//
// **ตัวเดียวที่คุยกับ Meta Graph API** — ทุกไฟล์ใน lib/meta/ ยิงผ่านที่นี่เท่านั้น
//
// ทำไมต้องมี: ของเดิมแต่ละที่ประกอบ URL + parse JSON + แกะ error เอง (conversions.ts,
// chat/channel-health.ts) แล้วตีความ error code ไม่ตรงกัน — "token หมดอายุ" กับ
// "สิทธิ์ไม่ถึง" คนละวิธีแก้กันคนละเรื่อง แต่ถ้าอ่าน error คนละแบบก็บอกผู้ใช้ผิดทาง
//
// กติกา:
// - **ห้าม throw** ทุกฟังก์ชันคืน `GraphResult` เสมอ (เน็ตหลุด/หมดเวลา = `status: 0`)
// - token ถูกส่งเป็นคีย์ชื่อ `access_token` เสมอ — `logIntegrationNow()` ปิดบังคีย์ชื่อนี้ให้
//   ⇒ body ที่จดลง integration_logs จะไม่มี token โผล่
// - token ว่าง = **ไม่ใส่ `access_token` เลย** (endpoint อย่าง /oauth/access_token
//   ที่ใช้ client_id+client_secret แทน ถ้าใส่ access_token เปล่า ๆ ไปด้วยจะถูกปฏิเสธ)

export const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

/** ยิงแต่ละ call รอไม่เกินเท่านี้ — ค้างนานกว่านี้ดีกว่าปล่อยให้แขวน request ผู้ใช้ */
const DEFAULT_TIMEOUT_MS = 10_000;

/** ก้อน `error` ที่ Graph API ส่งกลับมา (รูปเดียวกันทุก endpoint) */
export interface GraphError {
  code?: number;
  error_subcode?: number;
  message?: string;
  type?: string;
  fbtrace_id?: string;
  /** ข้อความที่ Meta เขียนมาให้โชว์ผู้ใช้ตรง ๆ — ถ้ามี ให้ใช้ตัวนี้ก่อน message */
  error_user_msg?: string;
  error_user_title?: string;
}

export interface GraphResult<T> {
  /** HTTP 2xx **และ** ไม่มีก้อน error ในคำตอบ (Graph ตอบ 200 พร้อม error ได้) */
  ok: boolean;
  /** 0 = ไปไม่ถึง Meta (เน็ตหลุด/หมดเวลา) */
  status: number;
  body: T | null;
  error: GraphError | null;
  durationMs: number;
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function buildQuery(params: Record<string, string> | undefined, token: string): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  if (token) qs.set('access_token', token);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

function extractError(body: unknown, status: number): GraphError | null {
  const err = (body as { error?: GraphError } | null)?.error;
  if (err && typeof err === 'object') return err;
  if (status >= 400) return { message: `HTTP ${status}` };
  return null;
}

/** ยิงจริง — รับ URL เต็ม (graphGetAll ต้องเดินตาม `paging.next` ซึ่งเป็น URL เต็มอยู่แล้ว) */
async function requestUrl<T>(
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  body?: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<GraphResult<T>> {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method,
      ...(body
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
        : {}),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    const parsed = (await res.json().catch(() => null)) as unknown;
    const error = extractError(parsed, res.status);
    return {
      ok: res.ok && !error,
      status: res.status,
      body: (parsed as T) ?? null,
      error,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    // เน็ตหลุด / หมดเวลา / DNS พัง — ไปไม่ถึง Meta เลย
    return {
      ok: false,
      status: 0,
      body: null,
      error: { message: errText(err) },
      durationMs: Date.now() - startedAt,
    };
  }
}

export async function graphGet<T>(
  path: string,
  token: string,
  params?: Record<string, string>,
  opts?: { timeoutMs?: number },
): Promise<GraphResult<T>> {
  return requestUrl<T>('GET', `${GRAPH_BASE}${normalizePath(path)}${buildQuery(params, token)}`, undefined, opts);
}

export async function graphPost<T>(
  path: string,
  token: string,
  body?: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<GraphResult<T>> {
  return requestUrl<T>(
    'POST',
    `${GRAPH_BASE}${normalizePath(path)}`,
    { ...(body || {}), ...(token ? { access_token: token } : {}) },
    opts,
  );
}

export async function graphDelete<T>(
  path: string,
  token: string,
  body?: Record<string, unknown>,
  opts?: { timeoutMs?: number },
): Promise<GraphResult<T>> {
  return requestUrl<T>(
    'DELETE',
    `${GRAPH_BASE}${normalizePath(path)}`,
    { ...(body || {}), ...(token ? { access_token: token } : {}) },
    opts,
  );
}

/**
 * ไล่เก็บทุกหน้าของ endpoint ที่แบ่งหน้าแบบ cursor (`paging.next` เป็น URL เต็ม)
 *
 * หยุดที่ `maxPages` เสมอ — บัญชีโฆษณาที่มี audience เป็นพัน ๆ ใบไม่ควรลากมาทั้งหมด
 * ในสายที่ผู้ใช้รออยู่ · ล้มกลางทาง = คืน `ok:false` พร้อมของที่เก็บมาได้แล้ว
 * (ผู้เรียกต้องเช็ค `ok` ก่อนใช้ `body` เสมอ)
 */
export async function graphGetAll<T>(
  path: string,
  token: string,
  params?: Record<string, string>,
  maxPages = 20,
): Promise<GraphResult<T[]>> {
  const startedAt = Date.now();
  const items: T[] = [];
  let url = `${GRAPH_BASE}${normalizePath(path)}${buildQuery(params, token)}`;
  let lastStatus = 0;

  for (let page = 0; page < maxPages; page++) {
    const r = await requestUrl<{ data?: T[]; paging?: { next?: string } }>('GET', url);
    lastStatus = r.status;
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        body: items.length ? items : null,
        error: r.error,
        durationMs: Date.now() - startedAt,
      };
    }
    if (Array.isArray(r.body?.data)) items.push(...r.body.data);
    const next = r.body?.paging?.next;
    if (!next) break;
    url = next;
  }

  return { ok: true, status: lastStatus, body: items, error: null, durationMs: Date.now() - startedAt };
}

/**
 * token ใช้ไม่ได้แล้ว (หมดอายุ/ถูกถอน/เปลี่ยนรหัสผ่าน) — **ต้องให้เจ้าของเชื่อมใหม่**
 * 190 = OAuthException ทั่วไป · 102 = session ถูก invalidate
 */
export function isTokenError(err: GraphError | null, status?: number): boolean {
  if (err?.code === 190 || err?.code === 102) return true;
  if (status === 401 && err?.code == null) return true;
  return false;
}

/** สิทธิ์ไม่ถึง — token ใช้ได้แต่ scope/บทบาทไม่พอ (ขอสิทธิ์ใหม่ ไม่ใช่ต่ออายุ) */
export function isPermissionError(err: GraphError | null): boolean {
  return err?.code === 200 || err?.code === 10 || err?.code === 3;
}

/** โดนจำกัดอัตรา — รอแล้วลองใหม่ได้ ไม่ต้องให้ผู้ใช้ทำอะไร */
export function isRateLimitError(err: GraphError | null): boolean {
  return err?.code === 4 || err?.code === 17 || err?.code === 32 || err?.code === 613 || err?.code === 80004;
}

/**
 * ยังไม่ได้กดยอมรับ "Custom Audience Terms of Service" ในบัญชีโฆษณา
 * — วิธีแก้อยู่นอกระบบเรา (business.facebook.com › ตั้งค่าบัญชีโฆษณา) ต้องบอกผู้ใช้ตรง ๆ
 */
export function isTosRequiredError(err: GraphError | null): boolean {
  return err?.code === 200 && err?.error_subcode === 1870090;
}

/** บรรทัดเดียวที่เอาไปโชว์/จด log ได้เลย */
export function graphErrorText(r: GraphResult<unknown>): string {
  const e = r.error;
  if (e) {
    const msg = e.error_user_msg || e.message || '';
    if (e.code != null) return msg ? `(#${e.code}) ${msg}` : `(#${e.code})`;
    if (msg) return msg;
  }
  return `HTTP ${r.status}`;
}

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

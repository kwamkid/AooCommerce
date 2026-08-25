import crypto from 'crypto';
import { markQuotaExhausted, isQuotaErrorMessage } from '@/lib/marketplace/quota';
import { supabaseAdmin } from '@/lib/supabase-admin';

// --- Configuration ---
// Lazada Open Platform REST API. Region host = seller's country (we operate TH).
const LAZADA_AUTH_HOST = 'https://auth.lazada.com/rest';

const REGION_HOSTS: Record<string, string> = {
  th: 'https://api.lazada.co.th/rest',
  sg: 'https://api.lazada.sg/rest',
  my: 'https://api.lazada.com.my/rest',
  vn: 'https://api.lazada.vn/rest',
  ph: 'https://api.lazada.com.ph/rest',
  id: 'https://api.lazada.co.id/rest',
};

export interface LazadaCredentials {
  app_key: string;
  app_secret: string;
  access_token: string;
  region: string; // 'th' etc.
}

export interface LazadaAccountRow {
  id: string;
  company_id: string;
  platform: string | null;
  shop_id: number;           // Lazada seller_id
  shop_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  // token ของ app แชท (ว่าง = ใช้ app เดียวกับออเดอร์) — คอลัมน์ร่วมกับ TikTok
  chat_access_token?: string | null;
  chat_refresh_token?: string | null;
  chat_access_token_expires_at?: string | null;
  chat_refresh_token_expires_at?: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Lazada แยกสิทธิ์เป็น "category" ต่อความสามารถ (Seller In-house APP =
 * ออเดอร์/สินค้า · In-house IM Chat = แชท) และ console ให้สร้าง app ต่อ
 * category → อาจได้ app key คนละชุด
 *
 * แต่ถ้า Lazada ให้ app เดียวถือได้ทั้งสอง category ก็ไม่ต้องแก้อะไร —
 * แค่ไม่ตั้ง `LAZADA_CHAT_APP_*` ทุกอย่าง fallback มาใช้คู่หลักเอง
 * (ต่างจาก TikTok ที่แชทต้องเป็นคนละ app เสมอ จึงไม่มี fallback)
 */
export type LazadaApp = 'main' | 'chat';

function getAppKey(app: LazadaApp = 'main'): string {
  if (app === 'chat') return process.env.LAZADA_CHAT_APP_KEY || process.env.LAZADA_APP_KEY || '';
  return process.env.LAZADA_APP_KEY || '';
}

function getAppSecret(app: LazadaApp = 'main'): string {
  if (app === 'chat') return process.env.LAZADA_CHAT_APP_SECRET || process.env.LAZADA_APP_SECRET || '';
  return process.env.LAZADA_APP_SECRET || '';
}

/** มี app แชทแยกจริงไหม — ไม่มี = app เดียวถือทั้งออเดอร์และแชท */
export function isChatAppConfigured(): boolean {
  return !!(process.env.LAZADA_CHAT_APP_KEY && process.env.LAZADA_CHAT_APP_SECRET);
}

/** app_key/app_secret ของ app ที่ระบุ — route ภายนอกใช้ตัวนี้แทนอ่าน env เอง */
export function getLazadaAppCredentials(app: LazadaApp = 'main'): { app_key: string; app_secret: string } {
  return { app_key: getAppKey(app), app_secret: getAppSecret(app) };
}

function getRegionHost(region?: string): string {
  return REGION_HOSTS[(region || process.env.LAZADA_REGION || 'th').toLowerCase()] || REGION_HOSTS.th;
}

/**
 * Lazada TOP-style signature:
 * 1. Sort all non-sign params by key (ASCII ascending)
 * 2. Concat apiPath + k1v1 + k2v2 ... (+ raw body if present)
 * 3. HMAC-SHA256 with app_secret → UPPERCASE hex
 */
export function generateLazadaSign(
  apiPath: string,
  params: Record<string, string>,
  body?: string,
  secret?: string
): string {
  const entries = Object.entries(params)
    .filter(([k, v]) => k !== 'sign' && v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  let payload = apiPath;
  for (const [k, v] of entries) payload += k + v;
  if (body) payload += body;

  return crypto.createHmac('sha256', secret || getAppSecret()).update(payload).digest('hex').toUpperCase();
}

/**
 * Verify Lazada push (webhook) signature.
 * Authorization header = HEX(HMAC-SHA256(app_key + rawBody, app_secret))
 */
export function verifyLazadaPushSignature(rawBody: string, authorization: string): boolean {
  if (!authorization) return false;
  // order push มาจาก app หลัก · IM push มาจาก app แชท — แต่ยิงมาที่ webhook
  // ปลายทางเดียวกัน จึงต้องยอมรับลายเซ็นของทั้งสอง app
  const apps: LazadaApp[] = isChatAppConfigured() ? ['main', 'chat'] : ['main'];
  return apps.some((app) => {
    const secret = getAppSecret(app);
    if (!secret) return false;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(getAppKey(app) + rawBody)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(authorization.toLowerCase()),
        Buffer.from(expected.toLowerCase())
      );
    } catch {
      return false;
    }
  });
}

/**
 * Make an authenticated Lazada API request.
 * All params are sent in the query string (signature covers them either way);
 * no request body is used, matching common Lazada SDK behavior.
 */
export async function lazadaApiRequest(
  creds: LazadaCredentials,
  method: 'GET' | 'POST',
  apiPath: string,
  params: Record<string, unknown> = {}
): Promise<{ data: unknown; error?: string; raw?: Record<string, unknown> }> {
  const common: Record<string, string> = {
    app_key: creds.app_key,
    timestamp: String(Date.now()), // milliseconds
    sign_method: 'sha256',
    access_token: creds.access_token,
  };
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) common[k] = String(v);
  }
  common.sign = generateLazadaSign(apiPath, common, undefined, creds.app_secret);

  const url = `${getRegionHost(creds.region)}${apiPath}?${new URLSearchParams(common).toString()}`;

  console.log(`[Lazada API] ${method} ${apiPath}`, Object.fromEntries(Object.entries(params)));
  const res = await fetch(url, { method });

  let data: Record<string, unknown>;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`[Lazada API] ${apiPath} non-JSON (${res.status}):`, text.substring(0, 300));
    return { data: null, error: `Lazada API returned non-JSON (HTTP ${res.status})` };
  }
  console.log(`[Lazada API] ${apiPath} response:`, JSON.stringify(data).substring(0, 800));

  // Lazada errors: { code: '...', message } (top-level, '0' = success) or IM style { success, err_code, err_message }
  const code = data.code as string | undefined;
  if (code && code !== '0') {
    const errMsg = (data.message as string) || `Lazada error ${code}`;
    // ApiCallLimit = rate limit ของ Lazada → เปิด circuit breaker (พัก 30 นาที)
    if (code === 'ApiCallLimit' || isQuotaErrorMessage(errMsg)) {
      markQuotaExhausted('lazada').catch(() => {});
    }
    return { data: null, error: errMsg, raw: data };
  }
  if (data.success === false) {
    return { data: null, error: (data.err_message as string) || `Lazada error ${data.err_code}`, raw: data };
  }
  return { data: data.data ?? data, raw: data };
}

/**
 * Lazada OAuth authorization URL (user logs in with the SELLER account).
 */
export function generateLazadaAuthUrl(redirectUri: string, state: string, app: LazadaApp = 'main'): string {
  const qs = new URLSearchParams({
    response_type: 'code',
    force_auth: 'true',
    redirect_uri: redirectUri,
    client_id: getAppKey(app),
    state,
  });
  return `https://auth.lazada.com/oauth/authorize?${qs.toString()}`;
}

export interface LazadaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;         // seconds
  refresh_expires_in: number; // seconds
  account?: string;
  country?: string;
  country_user_info?: Array<{ country: string; user_id: string; seller_id: string; short_code: string }>;
}

async function authRequest(
  apiPath: string,
  params: Record<string, string>,
  app: LazadaApp = 'main'
): Promise<LazadaTokenResponse> {
  const common: Record<string, string> = {
    app_key: getAppKey(app),
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    ...params,
  };
  common.sign = generateLazadaSign(apiPath, common, undefined, getAppSecret(app));

  const url = `${LAZADA_AUTH_HOST}${apiPath}?${new URLSearchParams(common).toString()}`;
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json();

  if (data.code && data.code !== '0') {
    throw new Error(data.message || `Lazada auth error ${data.code}`);
  }
  if (!data.access_token) {
    throw new Error(`Lazada auth: no access_token in response (${JSON.stringify(data).substring(0, 200)})`);
  }
  return data as LazadaTokenResponse;
}

export async function exchangeCodeForToken(code: string, app: LazadaApp = 'main'): Promise<LazadaTokenResponse> {
  return authRequest('/auth/token/create', { code }, app);
}

export async function refreshAccessToken(refreshToken: string, app: LazadaApp = 'main'): Promise<LazadaTokenResponse> {
  return authRequest('/auth/token/refresh', { refresh_token: refreshToken }, app);
}

/**
 * Ensure the account has a valid access token (5-min expiry buffer).
 * Auto-refreshes and persists; deactivates the account if the refresh token is dead.
 */
export async function ensureValidToken(
  account: LazadaAccountRow,
  app: LazadaApp = 'main'
): Promise<LazadaCredentials> {
  const region = ((account.metadata?.country as string) || 'th').toLowerCase();
  // ไม่มี app แชทแยก → แชทใช้ token ชุดเดียวกับออเดอร์ (คอลัมน์ chat_* ว่างไว้)
  const useChat = app === 'chat' && isChatAppConfigured();

  const accessToken = (useChat ? account.chat_access_token : account.access_token) || '';
  const refreshToken = useChat ? account.chat_refresh_token : account.refresh_token;
  const expiresAtRaw = useChat ? account.chat_access_token_expires_at : account.access_token_expires_at;
  const refreshExpiresAtRaw = useChat
    ? account.chat_refresh_token_expires_at
    : account.refresh_token_expires_at;

  const creds: LazadaCredentials = {
    app_key: getAppKey(useChat ? 'chat' : 'main'),
    app_secret: getAppSecret(useChat ? 'chat' : 'main'),
    access_token: accessToken,
    region,
  };

  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw).getTime() : 0;
  const needsRefresh = !accessToken || expiresAt - Date.now() < 5 * 60 * 1000;
  if (!needsRefresh) return creds;

  if (!refreshToken) {
    throw new Error(useChat
      ? 'Lazada chat refresh token missing — reconnect the shop to enable chat'
      : 'Lazada refresh token missing — reconnect the shop');
  }

  try {
    const tokens = await refreshAccessToken(refreshToken, useChat ? 'chat' : 'main');
    const now = Date.now();
    const nextRefreshExpiry = tokens.refresh_expires_in
      ? new Date(now + tokens.refresh_expires_in * 1000).toISOString()
      : refreshExpiresAtRaw;
    const patch = useChat
      ? {
          chat_access_token: tokens.access_token,
          chat_refresh_token: tokens.refresh_token || refreshToken,
          chat_access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
          chat_refresh_token_expires_at: nextRefreshExpiry,
        }
      : {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || refreshToken,
          access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
          refresh_token_expires_at: nextRefreshExpiry,
        };

    await supabaseAdmin
      .from('marketplace_accounts')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', account.id);

    return { ...creds, access_token: tokens.access_token };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Dead refresh token → deactivate so crons stop hammering (same as Shopee)
    // แต่ **เฉพาะขาออเดอร์** — แชทพังไม่ควรทำให้ทั้งร้านหยุดดูดออเดอร์
    if (!useChat && /invalid|expired|illegal/i.test(msg)) {
      await supabaseAdmin
        .from('marketplace_accounts')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', account.id);
    }
    throw new Error(`Lazada ${useChat ? 'chat ' : ''}token refresh failed: ${msg}`);
  }
}

/**
 * Seller profile — used to name the account on connect.
 */
export async function getSellerInfo(creds: LazadaCredentials): Promise<{ name?: string; seller_id?: number; short_code?: string } | null> {
  const { data, error } = await lazadaApiRequest(creds, 'GET', '/seller/get');
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    name: (d.name as string) || (d.short_code as string) || undefined,
    seller_id: d.seller_id ? Number(d.seller_id) : undefined,
    short_code: d.short_code as string | undefined,
  };
}

// ─── Orders API ──────────────────────────────────────────────────────────────

export interface LazadaAddress {
  first_name?: string;
  last_name?: string;
  phone?: string;
  phone2?: string;
  address1?: string;
  address2?: string;
  address3?: string;
  address4?: string;
  address5?: string;
  post_code?: string;
  city?: string;
  country?: string;
}

export interface LazadaOrder {
  order_id: number;
  order_number: number;
  statuses: string[];
  created_at: string;   // "2026-08-22 10:15:33 +0700"
  updated_at: string;
  price: string;        // items total (string)
  payment_method: string;
  shipping_fee: number;
  voucher: number;
  items_count: number;
  customer_first_name?: string;
  customer_last_name?: string;
  address_shipping?: LazadaAddress;
  remarks?: string;
}

export interface LazadaOrderItem {
  order_item_id: number;
  order_id: number;
  name: string;
  sku: string;          // seller SKU
  shop_sku: string;     // Lazada SKU
  sku_id?: string | number;
  product_id?: string | number;
  variation?: string;
  status: string;       // per-item status — order state = aggregate of these
  item_price: number;
  paid_price: number;
  voucher_amount?: number;
  shipping_amount?: number;
  product_main_image?: string;
  tracking_code?: string;
  shipment_provider?: string;
  reason?: string;
}

/** Lazada expects ISO8601 with explicit offset, no milliseconds */
function toLazadaTime(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '+00:00');
}

/**
 * List orders updated within a window — /orders/get (paginated, limit ≤ 100).
 */
export async function getLazadaOrders(
  creds: LazadaCredentials,
  opts: { updateAfterMs: number; updateBeforeMs: number; offset: number; limit?: number }
): Promise<{ orders: LazadaOrder[]; count: number; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'GET', '/orders/get', {
    update_after: toLazadaTime(opts.updateAfterMs),
    update_before: toLazadaTime(opts.updateBeforeMs),
    offset: opts.offset,
    limit: opts.limit ?? 100,
    sort_by: 'updated_at',
    sort_direction: 'ASC',
  });
  if (error) return { orders: [], count: 0, error };
  const d = (data || {}) as { orders?: LazadaOrder[]; count?: number | string };
  return { orders: d.orders || [], count: Number(d.count || 0) };
}

/** Single order header — /order/get */
export async function getLazadaOrder(
  creds: LazadaCredentials,
  orderId: string | number
): Promise<{ order: LazadaOrder | null; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'GET', '/order/get', { order_id: orderId });
  if (error) return { order: null, error };
  return { order: (data as LazadaOrder) || null };
}

/** Items of one order — /order/items/get */
export async function getLazadaOrderItems(
  creds: LazadaCredentials,
  orderId: string | number
): Promise<{ items: LazadaOrderItem[]; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'GET', '/order/items/get', { order_id: orderId });
  if (error) return { items: [], error };
  return { items: (data as LazadaOrderItem[]) || [] };
}

/**
 * Items for a batch of orders — /orders/items/get (order_ids = JSON array, ≤ 50 ids/call)
 */
export async function getLazadaOrdersItems(
  creds: LazadaCredentials,
  orderIds: (string | number)[]
): Promise<{ byOrder: Record<string, LazadaOrderItem[]>; error?: string }> {
  const { data, error } = await lazadaApiRequest(creds, 'GET', '/orders/items/get', {
    order_ids: JSON.stringify(orderIds.map(id => Number(id))),
  });
  if (error) return { byOrder: {}, error };
  const rows = (data as { order_id: number; order_number?: number; order_items: LazadaOrderItem[] }[]) || [];
  const byOrder: Record<string, LazadaOrderItem[]> = {};
  for (const row of rows) {
    byOrder[String(row.order_id)] = row.order_items || [];
  }
  return { byOrder };
}

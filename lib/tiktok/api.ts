import crypto from 'crypto';
import { markQuotaExhausted, isQuotaErrorMessage } from '@/lib/marketplace/quota';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logIntegration } from '@/lib/integration-logger';

// --- Configuration ---
const TIKTOK_API_HOST = 'https://open-api.tiktokglobalshop.com';
const TIKTOK_AUTH_HOST = 'https://auth.tiktok-shops.com';

export interface TikTokCredentials {
  app_key: string;
  app_secret: string;
  access_token: string;
  shop_cipher: string;
}

export interface TikTokAccountRow {
  id: string;
  company_id: string;
  platform: 'tiktok';
  shop_id: number;
  shop_name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  // token ของ app แชท (คนละ app กับด้านบน) — null = ร้านยังไม่ได้อนุญาต app แชท
  chat_access_token?: string | null;
  chat_refresh_token?: string | null;
  chat_access_token_expires_at?: string | null;
  chat_refresh_token_expires_at?: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  metadata: Record<string, unknown>;
}

// --- Two apps: order + chat ---
//
// scope `seller.customer_service` มีเฉพาะ app หมวด Customer Support และหมวด
// แก้ทีหลังไม่ได้ — app หลัก (Order Management) จึงขอแชทไม่ได้ตลอดกาล
// ทางออกคือ 2 app: 'order' (ของเดิม ใช้อยู่จริง ห้ามแตะ) + 'chat'
// token ของ TikTok ออกเป็นรายคู่ (app, shop) ร้านเดียวจึงมี token 2 ชุด
// เก็บแยกคอลัมน์ใน marketplace_accounts แถวเดิม (chat_* )
export type TikTokApp = 'order' | 'chat';

// --- ENV helpers ---
function getAppKey(app: TikTokApp = 'order'): string {
  return (app === 'chat' ? process.env.TIKTOK_CHAT_APP_KEY : process.env.TIKTOK_APP_KEY) || '';
}

function getAppSecret(app: TikTokApp = 'order'): string {
  return (app === 'chat' ? process.env.TIKTOK_CHAT_APP_SECRET : process.env.TIKTOK_APP_SECRET) || '';
}

/** app แชทถูกตั้งค่าไว้ไหม — ไม่มีก็ใช้ได้แค่ออเดอร์ (ไม่พัง) */
export function isChatAppConfigured(): boolean {
  return !!(getAppKey('chat') && getAppSecret('chat'));
}

// --- Signature Generation ---
/**
 * TikTok Shop API v2 signature algorithm.
 *
 * 1. Extract all query params EXCEPT 'sign' and 'access_token'
 * 2. Sort params alphabetically by key
 * 3. Concat as {key}{value} pairs (no separator)
 * 4. Prepend the request path
 * 5. If not GET and not multipart, append request body
 * 6. Wrap with app_secret: APP_SECRET + string + APP_SECRET
 * 7. HMAC-SHA256(app_secret, wrapped_string) → hex lowercase
 *
 * @see https://partner.tiktokshop.com/docv2/page/sign-your-api-request
 */
export function generateSign(
  apiPath: string,
  params: Record<string, string>,
  body?: string,
  /** secret ของ app ที่ยิง — ไม่ส่งมา = app ออเดอร์ (ของเดิม) */
  signingSecret?: string
): string {
  const appSecret = signingSecret || getAppSecret();

  // 1. Exclude 'sign' and 'access_token'
  const paramsToBeSigned = { ...params };
  delete paramsToBeSigned['sign'];
  delete paramsToBeSigned['access_token'];

  // 2. Sort alphabetically
  const sortedKeys = Object.keys(paramsToBeSigned).sort();

  // 3. Concat key+value pairs
  let stringToBeSigned = '';
  for (const k of sortedKeys) {
    stringToBeSigned += `${k}${paramsToBeSigned[k]}`;
  }

  // 4. Prepend path
  stringToBeSigned = apiPath + stringToBeSigned;

  // 5. Append body if present
  if (body) {
    stringToBeSigned += body;
  }

  // 6. Wrap with app_secret
  stringToBeSigned = appSecret + stringToBeSigned + appSecret;

  // 7. HMAC-SHA256
  return crypto.createHmac('sha256', appSecret).update(stringToBeSigned).digest('hex');
}

/**
 * Verify TikTok webhook signature.
 * sign = HMAC-SHA256(app_secret, app_key + rawBody)
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  // push มาจากได้ทั้ง 2 app (ออเดอร์/แชท) และเซ็นด้วย secret ของ app ตัวเอง
  // — ลองทีละตัว ตัวไหนตรงก็ถือว่าของจริง
  for (const app of ['order', 'chat'] as TikTokApp[]) {
    const appKey = getAppKey(app);
    const appSecret = getAppSecret(app);
    if (!appKey || !appSecret) continue;
    const expected = crypto.createHmac('sha256', appSecret).update(appKey + rawBody).digest('hex');
    // ความยาวไม่เท่ากัน timingSafeEqual จะ throw — เทียบความยาวก่อน
    if (expected.length !== signature.length) continue;
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return true;
  }
  return false;
}

// --- OAuth ---

/**
 * Generate TikTok Shop OAuth authorization URL.
 */
export function generateAuthUrl(state?: string, app: TikTokApp = 'order'): string {
  const appKey = getAppKey(app);
  const params = new URLSearchParams({ app_key: appKey });
  if (state) params.set('state', state);
  return `${TIKTOK_AUTH_HOST}/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForToken(authCode: string, app: TikTokApp = 'order'): Promise<{
  access_token: string;
  refresh_token: string;
  access_token_expire_in: number;
  refresh_token_expire_in: number;
  open_id: string;
  seller_name: string;
  seller_base_region: string;
}> {
  const appKey = getAppKey(app);
  const appSecret = getAppSecret(app);

  const url = `${TIKTOK_AUTH_HOST}/api/v2/token/get?${new URLSearchParams({
    app_key: appKey,
    app_secret: appSecret,
    auth_code: authCode,
    grant_type: 'authorized_code',
  }).toString()}`;

  const res = await fetch(url);
  const json = await res.json();
  console.log('[TikTok] Token exchange response:', JSON.stringify(json).substring(0, 500));

  if (json.code !== 0) {
    throw new Error(json.message || `Token exchange failed: code ${json.code}`);
  }
  return json.data;
}

/**
 * Refresh access token using refresh_token.
 */
export async function refreshAccessToken(refreshToken: string, app: TikTokApp = 'order'): Promise<{
  access_token: string;
  refresh_token: string;
  access_token_expire_in: number;
  refresh_token_expire_in: number;
}> {
  const appKey = getAppKey(app);
  const appSecret = getAppSecret(app);

  const url = `${TIKTOK_AUTH_HOST}/api/v2/token/refresh?${new URLSearchParams({
    app_key: appKey,
    app_secret: appSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString()}`;

  const res = await fetch(url);
  const json = await res.json();
  console.log('[TikTok] Token refresh response:', JSON.stringify(json).substring(0, 500));

  if (json.code !== 0) {
    throw new Error(json.message || `Token refresh failed: code ${json.code}`);
  }
  return json.data;
}

/**
 * Ensure the account has a valid access token, refreshing if needed.
 * Returns credentials ready for API calls.
 */
export async function ensureValidToken(
  account: TikTokAccountRow,
  app: TikTokApp = 'order',
): Promise<TikTokCredentials> {
  const appKey = getAppKey(app);
  const appSecret = getAppSecret(app);
  const shopCipher = (account.metadata?.shop_cipher as string) || '';
  const now = new Date();
  const isChat = app === 'chat';

  // token ของ 2 app อยู่คนละคอลัมน์ แต่ logic refresh เหมือนกันทุกอย่าง
  const accessToken = isChat ? account.chat_access_token : account.access_token;
  const refreshToken = isChat ? account.chat_refresh_token : account.refresh_token;
  const accessExpiresAt = isChat ? account.chat_access_token_expires_at : account.access_token_expires_at;
  const refreshExpiresAt = isChat ? account.chat_refresh_token_expires_at : account.refresh_token_expires_at;

  if (isChat && !appKey) {
    throw new Error('ยังไม่ได้ตั้งค่า TikTok chat app (TIKTOK_CHAT_APP_KEY/SECRET)');
  }

  const expiresAt = accessExpiresAt ? new Date(accessExpiresAt) : null;
  const BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer

  // Token is still valid
  if (accessToken && expiresAt && expiresAt.getTime() - now.getTime() > BUFFER_MS) {
    return { app_key: appKey, app_secret: appSecret, access_token: accessToken, shop_cipher: shopCipher };
  }

  // Need to refresh
  if (!refreshToken) {
    throw new Error(isChat
      ? 'ร้านนี้ยังไม่ได้อนุญาตแอปแชท — เชื่อมต่อร้านใหม่อีกครั้งเพื่อเปิดใช้แชท'
      : 'No refresh token available. Shop needs to re-authorize.');
  }

  const refreshExp = refreshExpiresAt ? new Date(refreshExpiresAt) : null;
  if (refreshExp && refreshExp.getTime() < now.getTime()) {
    throw new Error('Refresh token expired. Shop needs to re-authorize.');
  }

  const tokens = await refreshAccessToken(refreshToken, app);

  // Update tokens in DB
  const accessExpiry = new Date(now.getTime() + tokens.access_token_expire_in * 1000);
  const refreshExpiry = new Date(now.getTime() + tokens.refresh_token_expire_in * 1000);

  await supabaseAdmin
    .from('marketplace_accounts')
    .update(isChat ? {
      chat_access_token: tokens.access_token,
      chat_refresh_token: tokens.refresh_token,
      chat_access_token_expires_at: accessExpiry.toISOString(),
      chat_refresh_token_expires_at: refreshExpiry.toISOString(),
      updated_at: new Date().toISOString(),
    } : {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: accessExpiry.toISOString(),
      refresh_token_expires_at: refreshExpiry.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', account.id);

  return { app_key: appKey, app_secret: appSecret, access_token: tokens.access_token, shop_cipher: shopCipher };
}

// --- API Request ---

/**
 * Make an authenticated TikTok Shop API request.
 */
export async function tiktokApiRequest(
  creds: TikTokCredentials,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  apiPath: string,
  queryParams: Record<string, string> = {},
  body?: Record<string, unknown>
): Promise<{ data: unknown; error?: string; request_id?: string }> {
  const timestamp = Math.floor(Date.now() / 1000);

  // Build query params
  const params: Record<string, string> = {
    app_key: creds.app_key,
    timestamp: String(timestamp),
    ...queryParams,
  };

  if (creds.shop_cipher) {
    params.shop_cipher = creds.shop_cipher;
  }

  // Generate body string for signing (POST/PUT/DELETE with JSON body)
  const bodyString = body && method !== 'GET' ? JSON.stringify(body) : undefined;

  // Generate signature
  params.sign = generateSign(apiPath, params, bodyString, creds.app_secret);

  // Build URL
  const url = `${TIKTOK_API_HOST}${apiPath}?${new URLSearchParams(params).toString()}`;

  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-tts-access-token': creds.access_token,
    },
  };
  if (bodyString) {
    options.body = bodyString;
  }

  console.log(`[TikTok API] ${method} ${apiPath}`, {
    params: Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'sign')),
    ...(body ? { body } : {}),
  });

  const res = await fetch(url, options);

  let data: any;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`[TikTok API] ${apiPath} returned non-JSON (${res.status}):`, text.substring(0, 500));
    return { data: null, error: `TikTok API returned non-JSON response (HTTP ${res.status})` };
  }

  console.log(`[TikTok API] ${apiPath} response:`, JSON.stringify(data).substring(0, 1000));

  if (data.code !== 0) {
    const errMsg = data.message || `API error code ${data.code}`;
    // rate limit → เปิด circuit breaker (พัก 30 นาที) — cron/manual sync จะ skip เอง
    if (res.status === 429 || isQuotaErrorMessage(errMsg)) {
      markQuotaExhausted('tiktok').catch(() => {});
    }
    return { data: null, error: errMsg, request_id: data.request_id };
  }

  return { data: data.data, request_id: data.request_id };
}

// --- Convenience API functions ---

/**
 * Get authorized shops for the current access token.
 * Returns shop list with id, name, region, cipher.
 */
export async function getAuthorizedShops(accessToken: string, app: TikTokApp = 'order'): Promise<{
  id: string;
  name: string;
  region: string;
  cipher: string;
  code: string;
  seller_type: string;
}[]> {
  const appKey = getAppKey(app);
  const timestamp = Math.floor(Date.now() / 1000);

  const params: Record<string, string> = {
    app_key: appKey,
    timestamp: String(timestamp),
  };
  params.sign = generateSign('/authorization/202309/shops', params, undefined, getAppSecret(app));

  const url = `${TIKTOK_API_HOST}/authorization/202309/shops?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'x-tts-access-token': accessToken,
    },
  });
  const json = await res.json();

  if (json.code !== 0) {
    throw new Error(json.message || `Failed to get shops: code ${json.code}`);
  }

  return (json.data?.shops || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    region: s.region,
    cipher: s.cipher,
    code: s.code,
    seller_type: s.seller_type,
  }));
}

/**
 * Search orders by time range.
 */
export async function searchOrders(
  creds: TikTokCredentials,
  opts: {
    updateTimeGe?: number;
    updateTimeLt?: number;
    createTimeGe?: number;
    createTimeLt?: number;
    orderStatus?: string;
    pageSize?: number;
    pageToken?: string;
    sortField?: string;
    sortOrder?: string;
  }
): Promise<{ orders: { id: string }[]; next_page_token?: string; total_count?: number }> {
  const queryParams: Record<string, string> = {
    page_size: String(opts.pageSize || 50),
    sort_field: opts.sortField || 'update_time',
    sort_order: opts.sortOrder || 'ASC',
  };
  if (opts.pageToken) queryParams.page_token = opts.pageToken;

  const body: Record<string, unknown> = {};
  if (opts.updateTimeGe) body.update_time_ge = opts.updateTimeGe;
  if (opts.updateTimeLt) body.update_time_lt = opts.updateTimeLt;
  if (opts.createTimeGe) body.create_time_ge = opts.createTimeGe;
  if (opts.createTimeLt) body.create_time_lt = opts.createTimeLt;
  if (opts.orderStatus) body.order_status = opts.orderStatus;

  const result = await tiktokApiRequest(creds, 'POST', '/order/202309/orders/search', queryParams, body);
  if (result.error) {
    throw new Error(result.error);
  }

  const data = result.data as any;
  return {
    orders: data?.orders || [],
    next_page_token: data?.next_page_token,
    total_count: data?.total_count,
  };
}

/**
 * Get order details by IDs (max 50).
 */
export async function getOrderDetail(
  creds: TikTokCredentials,
  orderIds: string[]
): Promise<{ orders: any[] }> {
  const queryParams: Record<string, string> = {
    ids: orderIds.join(','),
  };

  const result = await tiktokApiRequest(creds, 'GET', '/order/202507/orders', queryParams);
  if (result.error) {
    throw new Error(result.error);
  }

  const data = result.data as any;
  return { orders: data?.orders || [] };
}

/**
 * Get shipping services for an order (to get available shipping providers).
 */
export async function getShippingServices(
  creds: TikTokCredentials,
  orderId: string
): Promise<any> {
  const result = await tiktokApiRequest(creds, 'GET', '/fulfillment/202309/orders/shipping_services', {
    order_id: orderId,
  });
  if (result.error) {
    throw new Error(result.error);
  }
  return result.data;
}

/**
 * Ship a package (arrange shipment).
 */
export async function shipPackage(
  creds: TikTokCredentials,
  body: {
    order_id: string;
    package_id?: string;
    shipping_provider_id: string;
    pick_up?: { address_id: string };
    self_shipment?: { tracking_number: string; shipping_provider_id: string };
  }
): Promise<any> {
  const result = await tiktokApiRequest(creds, 'POST', '/fulfillment/202309/packages/ship', {}, body);
  if (result.error) {
    throw new Error(result.error);
  }
  return result.data;
}

/**
 * Get shipping document (label) for a package.
 */
export async function getShippingDocument(
  creds: TikTokCredentials,
  packageId: string,
  documentType: string = 'SHIPPING_LABEL'
): Promise<{ doc_url?: string }> {
  const result = await tiktokApiRequest(creds, 'GET', '/fulfillment/202309/packages/shipping_document', {
    package_id: packageId,
    document_type: documentType,
  });
  if (result.error) {
    throw new Error(result.error);
  }
  return result.data as any;
}

/**
 * Get seller shop info.
 */
export async function getSellerInfo(creds: TikTokCredentials): Promise<any> {
  const result = await tiktokApiRequest(creds, 'GET', '/seller/202309/shops');
  if (result.error) {
    throw new Error(result.error);
  }
  return result.data;
}

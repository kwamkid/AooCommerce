import crypto from 'crypto';
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
  is_active: boolean;
  last_sync_at: string | null;
  metadata: Record<string, unknown>;
}

// --- ENV helpers ---
function getAppKey(): string {
  return process.env.TIKTOK_APP_KEY || '';
}

function getAppSecret(): string {
  return process.env.TIKTOK_APP_SECRET || '';
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
  body?: string
): string {
  const appSecret = getAppSecret();

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
  const appKey = getAppKey();
  const appSecret = getAppSecret();
  const stringToBeSigned = appKey + rawBody;
  const expected = crypto.createHmac('sha256', appSecret).update(stringToBeSigned).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// --- OAuth ---

/**
 * Generate TikTok Shop OAuth authorization URL.
 */
export function generateAuthUrl(state?: string): string {
  const appKey = getAppKey();
  const params = new URLSearchParams({ app_key: appKey });
  if (state) params.set('state', state);
  return `${TIKTOK_AUTH_HOST}/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForToken(authCode: string): Promise<{
  access_token: string;
  refresh_token: string;
  access_token_expire_in: number;
  refresh_token_expire_in: number;
  open_id: string;
  seller_name: string;
  seller_base_region: string;
}> {
  const appKey = getAppKey();
  const appSecret = getAppSecret();

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
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  access_token_expire_in: number;
  refresh_token_expire_in: number;
}> {
  const appKey = getAppKey();
  const appSecret = getAppSecret();

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
export async function ensureValidToken(account: TikTokAccountRow): Promise<TikTokCredentials> {
  const appKey = getAppKey();
  const appSecret = getAppSecret();
  const shopCipher = (account.metadata?.shop_cipher as string) || '';
  const now = new Date();
  const expiresAt = account.access_token_expires_at ? new Date(account.access_token_expires_at) : null;
  const BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer

  // Token is still valid
  if (account.access_token && expiresAt && expiresAt.getTime() - now.getTime() > BUFFER_MS) {
    return { app_key: appKey, app_secret: appSecret, access_token: account.access_token, shop_cipher: shopCipher };
  }

  // Need to refresh
  if (!account.refresh_token) {
    throw new Error('No refresh token available. Shop needs to re-authorize.');
  }

  const refreshExpiresAt = account.refresh_token_expires_at ? new Date(account.refresh_token_expires_at) : null;
  if (refreshExpiresAt && refreshExpiresAt.getTime() < now.getTime()) {
    throw new Error('Refresh token expired. Shop needs to re-authorize.');
  }

  const tokens = await refreshAccessToken(account.refresh_token);

  // Update tokens in DB
  const accessExpiry = new Date(now.getTime() + tokens.access_token_expire_in * 1000);
  const refreshExpiry = new Date(now.getTime() + tokens.refresh_token_expire_in * 1000);

  await supabaseAdmin
    .from('marketplace_accounts')
    .update({
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
  params.sign = generateSign(apiPath, params, bodyString);

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
    return { data: null, error: data.message || `API error code ${data.code}`, request_id: data.request_id };
  }

  return { data: data.data, request_id: data.request_id };
}

// --- Convenience API functions ---

/**
 * Get authorized shops for the current access token.
 * Returns shop list with id, name, region, cipher.
 */
export async function getAuthorizedShops(accessToken: string): Promise<{
  id: string;
  name: string;
  region: string;
  cipher: string;
  code: string;
  seller_type: string;
}[]> {
  const appKey = getAppKey();
  const timestamp = Math.floor(Date.now() / 1000);

  const params: Record<string, string> = {
    app_key: appKey,
    timestamp: String(timestamp),
  };
  params.sign = generateSign('/authorization/202309/shops', params);

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

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';

// --- Configuration ---
const SHOPEE_SANDBOX_HOST = 'https://partner.test-stable.shopeemobile.com';
const SHOPEE_PROD_HOST = 'https://partner.shopeemobile.com';

export interface ShopeeCredentials {
  partner_id: number;
  partner_key: string;
  shop_id: number;
  access_token: string;
}

export interface ShopeeAccountRow {
  id: string;
  company_id: string;
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

function getPartnerId(): number {
  return parseInt(process.env.SHOPEE_PARTNER_ID || '0');
}

function getPartnerKey(): string {
  return process.env.SHOPEE_PARTNER_KEY || '';
}

function getBaseUrl(): string {
  const env = process.env.SHOPEE_ENV || 'production';
  return env === 'sandbox' ? SHOPEE_SANDBOX_HOST : SHOPEE_PROD_HOST;
}

function getTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Generate HMAC-SHA256 signature for Shopee API.
 * base_string = partner_id + api_path + timestamp [+ access_token + shop_id]
 */
export function generateSign(
  apiPath: string,
  timestamp: number,
  accessToken?: string,
  shopId?: number
): string {
  const partnerId = getPartnerId();
  const partnerKey = getPartnerKey();
  let baseString = `${partnerId}${apiPath}${timestamp}`;
  if (accessToken) baseString += accessToken;
  if (shopId) baseString += shopId;
  return crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');
}

/**
 * Generate Shopee OAuth authorization URL.
 */
export function generateAuthUrl(redirectUrl: string): string {
  const partnerId = getPartnerId();
  const apiPath = '/api/v2/shop/auth_partner';
  const timestamp = getTimestamp();
  const sign = generateSign(apiPath, timestamp);
  const baseUrl = getBaseUrl();
  return `${baseUrl}${apiPath}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectUrl)}`;
}

/**
 * Make an authenticated Shopee API request.
 */
export async function shopeeApiRequest(
  creds: ShopeeCredentials,
  method: 'GET' | 'POST',
  apiPath: string,
  params: Record<string, unknown> = {},
  body?: Record<string, unknown>
): Promise<{ data: unknown; error?: string }> {
  const timestamp = getTimestamp();
  const sign = generateSign(apiPath, timestamp, creds.access_token, creds.shop_id);

  const queryParams = new URLSearchParams({
    partner_id: String(creds.partner_id),
    timestamp: String(timestamp),
    sign,
    access_token: creds.access_token,
    shop_id: String(creds.shop_id),
  });

  // Add extra params
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      queryParams.set(k, String(v));
    }
  }

  const url = `${getBaseUrl()}${apiPath}?${queryParams.toString()}`;

  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const data = await res.json();

  if (data.error) {
    return { data: null, error: data.message || data.error };
  }
  return { data: data.response || data };
}

/**
 * Exchange authorization code for tokens.
 */
export async function exchangeCodeForToken(
  code: string,
  shopId: number
): Promise<{
  access_token: string;
  refresh_token: string;
  expire_in: number;
}> {
  const partnerId = getPartnerId();
  const apiPath = '/api/v2/auth/token/get';
  const timestamp = getTimestamp();
  const sign = generateSign(apiPath, timestamp);
  const baseUrl = getBaseUrl();

  const url = `${baseUrl}${apiPath}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      shop_id: shopId,
      partner_id: partnerId,
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(data.message || `Token exchange failed: ${data.error}`);
  }
  return data;
}

/**
 * Refresh access token using refresh_token.
 */
export async function refreshAccessToken(
  refreshToken: string,
  shopId: number
): Promise<{
  access_token: string;
  refresh_token: string;
  expire_in: number;
}> {
  const partnerId = getPartnerId();
  const apiPath = '/api/v2/auth/access_token/get';
  const timestamp = getTimestamp();
  const sign = generateSign(apiPath, timestamp);
  const baseUrl = getBaseUrl();

  const url = `${baseUrl}${apiPath}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refresh_token: refreshToken,
      shop_id: shopId,
      partner_id: partnerId,
    }),
  });
  const data = await res.json();
  if (data.error) {
    throw new Error(data.message || `Token refresh failed: ${data.error}`);
  }
  return data;
}

/**
 * Ensure the account has a valid access_token.
 * Auto-refreshes if expired or about to expire (within 5 minutes).
 */
export async function ensureValidToken(account: ShopeeAccountRow): Promise<ShopeeCredentials> {
  const partnerId = getPartnerId();
  const partnerKey = getPartnerKey();
  const now = new Date();
  const expiresAt = account.access_token_expires_at ? new Date(account.access_token_expires_at) : null;
  const BUFFER_MS = 5 * 60 * 1000; // 5 minutes buffer

  // Token is still valid
  if (account.access_token && expiresAt && expiresAt.getTime() - now.getTime() > BUFFER_MS) {
    return {
      partner_id: partnerId,
      partner_key: partnerKey,
      shop_id: account.shop_id,
      access_token: account.access_token,
    };
  }

  // Need to refresh
  if (!account.refresh_token) {
    throw new Error('No refresh token available. Shop needs to re-authorize.');
  }

  const refreshExpiresAt = account.refresh_token_expires_at ? new Date(account.refresh_token_expires_at) : null;
  if (refreshExpiresAt && refreshExpiresAt.getTime() < now.getTime()) {
    throw new Error('Refresh token expired. Shop needs to re-authorize.');
  }

  const tokens = await refreshAccessToken(account.refresh_token, account.shop_id);

  // Update tokens in DB
  const accessExpiry = new Date(now.getTime() + tokens.expire_in * 1000);
  const refreshExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await supabaseAdmin
    .from('shopee_accounts')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: accessExpiry.toISOString(),
      refresh_token_expires_at: refreshExpiry.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', account.id);

  return {
    partner_id: partnerId,
    partner_key: partnerKey,
    shop_id: account.shop_id,
    access_token: tokens.access_token,
  };
}

/**
 * Fetch shop info from Shopee API.
 */
export async function getShopInfo(creds: ShopeeCredentials): Promise<{ shop_name: string } | null> {
  const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/shop/get_shop_info');
  if (error || !data) return null;
  const shopData = data as { shop_name?: string };
  return { shop_name: shopData.shop_name || '' };
}

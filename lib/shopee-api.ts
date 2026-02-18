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
 * state parameter is forwarded back by Shopee in the callback.
 */
export function generateAuthUrl(redirectUrl: string, state?: string): string {
  const partnerId = getPartnerId();
  const apiPath = '/api/v2/shop/auth_partner';
  const timestamp = getTimestamp();
  const sign = generateSign(apiPath, timestamp);
  const baseUrl = getBaseUrl();
  let url = `${baseUrl}${apiPath}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(redirectUrl)}`;
  if (state) {
    url += `&state=${encodeURIComponent(state)}`;
  }
  return url;
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

  console.log(`[Shopee API] ${method} ${apiPath}`, { params: Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'access_token')) });
  const res = await fetch(url, options);

  // Handle non-JSON responses gracefully
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    console.error(`[Shopee API] ${apiPath} returned non-JSON (${res.status}):`, text.substring(0, 500));
    return { data: null, error: `Shopee API returned non-JSON response (HTTP ${res.status})` };
  }

  let data: any;
  try {
    data = await res.json();
  } catch (e) {
    const text = await res.text().catch(() => '');
    console.error(`[Shopee API] ${apiPath} JSON parse failed:`, text.substring(0, 500));
    return { data: null, error: `Failed to parse Shopee API response (HTTP ${res.status})` };
  }
  console.log(`[Shopee API] ${apiPath} response:`, JSON.stringify(data).substring(0, 1000));

  if (data.error) {
    return { data: null, error: data.message || data.error };
  }
  return { data: data.response || data };
}

/**
 * Exchange authorization code for tokens.
 * Supports both shop-level (shop_id) and merchant-level (main_account_id) auth.
 */
export async function exchangeCodeForToken(
  code: string,
  opts: { shopId?: number; mainAccountId?: number }
): Promise<{
  access_token: string;
  refresh_token: string;
  expire_in: number;
  shop_id_list?: number[];
  merchant_id_list?: number[];
}> {
  const partnerId = getPartnerId();
  const apiPath = '/api/v2/auth/token/get';
  const timestamp = getTimestamp();
  const sign = generateSign(apiPath, timestamp);
  const baseUrl = getBaseUrl();

  // Build body: use shop_id if available, otherwise main_account_id
  const body: Record<string, unknown> = {
    code,
    partner_id: partnerId,
  };
  if (opts.shopId) {
    body.shop_id = opts.shopId;
  } else if (opts.mainAccountId) {
    body.main_account_id = opts.mainAccountId;
  }

  const url = `${baseUrl}${apiPath}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  console.log('[Shopee] Token exchange response:', JSON.stringify(data));
  if (data.error) {
    throw new Error(data.message || `Token exchange failed: ${data.error}`);
  }
  return data;
}

/**
 * Get shop list for a merchant (main account).
 * Uses merchant-level sign: partner_id + apiPath + timestamp + access_token + merchant_id
 */
export async function getShopListByMerchant(
  merchantId: number,
  accessToken: string
): Promise<{ shop_id: number; shop_name?: string }[]> {
  const partnerId = getPartnerId();
  const partnerKey = getPartnerKey();
  const apiPath = '/api/v2/merchant/get_shop_list_by_merchant';
  const timestamp = getTimestamp();

  // Merchant-level sign: partner_id + apiPath + timestamp + access_token + merchant_id
  const baseString = `${partnerId}${apiPath}${timestamp}${accessToken}${merchantId}`;
  const sign = crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');
  const baseUrl = getBaseUrl();

  const queryParams = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
    access_token: accessToken,
    merchant_id: String(merchantId),
    page_no: '1',
    page_size: '100',
  });

  const url = `${baseUrl}${apiPath}?${queryParams.toString()}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log('[Shopee] get_shop_list_by_merchant response:', JSON.stringify(data));

  if (data.error) {
    throw new Error(data.message || `Failed to get shop list: ${data.error}`);
  }

  const response = data.response || data;
  return (response.shop_list || []).map((s: { shop_id: number; shop_name?: string }) => ({
    shop_id: s.shop_id,
    shop_name: s.shop_name,
  }));
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
 * Item enrichment data from Shopee Product APIs.
 * Combines data from get_item_base_info (images) and get_model_list (tier_variation).
 */
export interface ShopeeItemEnrichment {
  images: string[];  // Product images from get_item_base_info
  tierVariations: string[];  // e.g. ["สี", "ขนาด"] from get_model_list
  modelImageMap: Map<string, string>;  // model_sku → image_url from tier_variation option_list
}

/**
 * Fetch enrichment data for Shopee items.
 * 1. get_item_base_info (batch) → product images + has_model flag
 * 2. get_model_list (per item with models) → tier_variation names + per-option images
 */
export async function getItemEnrichment(
  creds: ShopeeCredentials,
  itemIds: number[]
): Promise<Map<number, ShopeeItemEnrichment>> {
  const result = new Map<number, ShopeeItemEnrichment>();
  if (itemIds.length === 0) return result;

  // Step 1: get_item_base_info (batch) for images + has_model
  const itemsWithModels: number[] = [];

  for (let i = 0; i < itemIds.length; i += 50) {
    const batch = itemIds.slice(i, i + 50);
    try {
      const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/product/get_item_base_info', {
        item_id_list: batch.join(','),
      });

      if (error) {
        console.error(`[Shopee API] get_item_base_info error:`, error);
        continue;
      }

      const items = (data as { item_list?: Array<{
        item_id: number;
        has_model?: boolean;
        image?: { image_url_list?: string[] };
      }> })?.item_list || [];

      for (const item of items) {
        const images = item.image?.image_url_list || [];
        result.set(item.item_id, {
          images,
          tierVariations: [],
          modelImageMap: new Map(),
        });
        if (item.has_model) {
          itemsWithModels.push(item.item_id);
        }
      }
    } catch (e) {
      console.error(`[Shopee API] get_item_base_info batch error:`, e);
    }
  }

  // Step 2: get_model_list (per item) for tier_variation names + option images
  for (const itemId of itemsWithModels) {
    try {
      const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/product/get_model_list', {
        item_id: itemId,
      });

      if (error) {
        console.error(`[Shopee API] get_model_list error for item ${itemId}:`, error);
        continue;
      }

      const response = data as {
        tier_variation?: Array<{
          name: string;
          option_list?: Array<{ option: string; image?: { image_url?: string } }>;
        }>;
        model?: Array<{
          model_id: number;
          model_sku: string;
          tier_index?: number[];
        }>;
      };

      const enrichment = result.get(itemId);
      if (!enrichment) continue;

      // Extract tier_variation names
      const tierVars = response.tier_variation || [];
      enrichment.tierVariations = tierVars.map(tv => tv.name);

      // Build model_sku → image_url map
      // tier_variation[0].option_list has images (first tier usually has images)
      // model.tier_index[0] tells which option of the first tier this model uses
      const models = response.model || [];
      const firstTierOptions = tierVars[0]?.option_list || [];

      for (const model of models) {
        const tierIdx = model.tier_index?.[0];
        if (tierIdx !== undefined && firstTierOptions[tierIdx]?.image?.image_url) {
          enrichment.modelImageMap.set(model.model_sku, firstTierOptions[tierIdx].image!.image_url!);
        }
      }

      console.log(`[Shopee API] get_model_list item ${itemId}: tiers=[${enrichment.tierVariations.join(',')}], models with images=${enrichment.modelImageMap.size}`);
    } catch (e) {
      console.error(`[Shopee API] get_model_list error for item ${itemId}:`, e);
    }
  }

  return result;
}

/**
 * Fetch shop info from Shopee API.
 * Uses get_shop_info for name + get_profile for logo.
 */
export async function getShopInfo(creds: ShopeeCredentials): Promise<{ shop_name: string; shop_logo: string } | null> {
  // Fetch both in parallel: get_shop_info (name/status) + get_profile (logo)
  const [infoResult, profileResult] = await Promise.all([
    shopeeApiRequest(creds, 'GET', '/api/v2/shop/get_shop_info'),
    shopeeApiRequest(creds, 'GET', '/api/v2/shop/get_profile'),
  ]);

  console.log('[Shopee] getShopInfo result:', { infoError: infoResult.error, profileError: profileResult.error });
  console.log('[Shopee] get_profile data:', JSON.stringify(profileResult.data).substring(0, 500));

  const infoData = (infoResult.data || {}) as Record<string, unknown>;
  const profileData = (profileResult.data || {}) as Record<string, unknown>;

  const shopName = (infoData.shop_name as string) || (profileData.shop_name as string) || '';
  const shopLogo = (profileData.shop_logo as string) || '';

  if (!shopName && !shopLogo) return null;

  return { shop_name: shopName, shop_logo: shopLogo };
}

// ============================================
// Payment / Escrow API Functions
// ============================================

/**
 * Get escrow detail for a completed order.
 * Returns financial breakdown: buyer_total_amount, escrow_amount,
 * voucher_from_seller, voucher_from_shopee, coins, seller_discount,
 * shopee_discount, commission_fee, service_fee, actual_shipping_fee, etc.
 * Only available for COMPLETED orders.
 */
export async function getEscrowDetail(
  creds: ShopeeCredentials,
  orderSn: string
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'GET', '/api/v2/payment/get_escrow_detail', {
    order_sn: orderSn,
  });
}

// ============================================
// Logistics API Functions
// ============================================

/**
 * Make an authenticated Shopee API request that returns the raw Response.
 * Used for endpoints that return binary data (e.g. PDF shipping documents).
 */
export async function shopeeApiRequestRaw(
  creds: ShopeeCredentials,
  method: 'GET' | 'POST',
  apiPath: string,
  params: Record<string, unknown> = {},
  body?: Record<string, unknown>
): Promise<Response> {
  const timestamp = getTimestamp();
  const sign = generateSign(apiPath, timestamp, creds.access_token, creds.shop_id);

  const queryParams = new URLSearchParams({
    partner_id: String(creds.partner_id),
    timestamp: String(timestamp),
    sign,
    access_token: creds.access_token,
    shop_id: String(creds.shop_id),
  });

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

  console.log(`[Shopee API Raw] ${method} ${apiPath}`);
  return fetch(url, options);
}

/**
 * Get shipping parameters required before calling ship_order.
 * Returns pickup addresses, timeslots, dropoff info, etc.
 */
export async function getShippingParameter(
  creds: ShopeeCredentials,
  orderSn: string
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'POST', '/api/v2/logistics/get_shipping_parameter', {}, {
    order_sn: orderSn,
  });
}

/**
 * Ship/accept a Shopee order.
 * Automatically fetches shipping parameters and uses the first available pickup/dropoff option.
 */
export async function shipOrder(
  creds: ShopeeCredentials,
  orderSn: string,
  pickup?: { address_id: number; pickup_time_id: string },
  dropoff?: Record<string, unknown>
): Promise<{ data: unknown; error?: string }> {
  const body: Record<string, unknown> = { order_sn: orderSn };

  if (pickup) {
    body.pickup = pickup;
  } else if (dropoff) {
    body.dropoff = dropoff;
  }

  return shopeeApiRequest(creds, 'POST', '/api/v2/logistics/ship_order', {}, body);
}

/**
 * Create a shipping document task (async).
 * Must poll getShippingDocumentResult() until status is READY.
 */
export async function createShippingDocument(
  creds: ShopeeCredentials,
  orderSns: string[],
  documentType: string = 'NORMAL_AIR_WAYBILL'
): Promise<{ data: unknown; error?: string; resultList?: Array<{ order_sn: string; fail_error?: string; fail_message?: string }> }> {
  const timestamp = getTimestamp();
  const sign = generateSign('/api/v2/logistics/create_shipping_document', timestamp, creds.access_token, creds.shop_id);
  const queryParams = new URLSearchParams({
    partner_id: String(creds.partner_id),
    timestamp: String(timestamp),
    sign,
    access_token: creds.access_token,
    shop_id: String(creds.shop_id),
  });
  const url = `${getBaseUrl()}/api/v2/logistics/create_shipping_document?${queryParams.toString()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_list: orderSns.map(sn => ({ order_sn: sn })),
      document_type: documentType,
    }),
  });
  const data = await res.json();
  console.log(`[Shopee API] create_shipping_document response:`, JSON.stringify(data).substring(0, 1000));

  if (data.error) {
    const resultList = data.response?.result_list || [];
    return { data: null, error: data.message || data.error, resultList };
  }
  return { data: data.response || data };
}

/**
 * Get the status of a shipping document creation task.
 * Returns status per order: READY, PROCESSING, or FAILED.
 */
export async function getShippingDocumentResult(
  creds: ShopeeCredentials,
  orderSns: string[]
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'POST', '/api/v2/logistics/get_shipping_document_result', {}, {
    order_list: orderSns.map(sn => ({ order_sn: sn })),
  });
}

/**
 * Download a shipping document (PDF) after it is READY.
 * Returns the raw PDF buffer.
 */
export async function downloadShippingDocument(
  creds: ShopeeCredentials,
  orderSns: string[],
  documentType: string = 'NORMAL_AIR_WAYBILL'
): Promise<{ pdfBuffer: Buffer | null; error?: string }> {
  try {
    const res = await shopeeApiRequestRaw(creds, 'POST', '/api/v2/logistics/download_shipping_document', {}, {
      order_list: orderSns.map(sn => ({ order_sn: sn })),
      document_type: documentType,
    });

    const contentType = res.headers.get('content-type') || '';

    // If Shopee returns JSON, it's an error
    if (contentType.includes('application/json')) {
      const data = await res.json();
      return { pdfBuffer: null, error: data.message || data.error || 'Failed to download document' };
    }

    // Binary PDF response
    const arrayBuffer = await res.arrayBuffer();
    return { pdfBuffer: Buffer.from(arrayBuffer) };
  } catch (e) {
    console.error('[Shopee API] downloadShippingDocument error:', e);
    return { pdfBuffer: null, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

// ============================================
// Product API Functions
// ============================================

/**
 * Get paginated list of items from a Shopee shop.
 * Returns only item_id + item_status — call getItemFullDetails() for full info.
 */
export async function getItemList(
  creds: ShopeeCredentials,
  options: {
    offset?: number;
    pageSize?: number;
    itemStatus?: 'NORMAL' | 'BANNED' | 'DELETED' | 'UNLIST';
  } = {}
): Promise<{
  items: { item_id: number; item_status: string; update_time: number }[];
  totalCount: number;
  hasMore: boolean;
  nextOffset: number;
}> {
  const offset = options.offset ?? 0;
  const pageSize = options.pageSize ?? 100;

  const params: Record<string, unknown> = {
    offset,
    page_size: pageSize,
    item_status: options.itemStatus ?? 'NORMAL',
  };

  const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/product/get_item_list', params);

  if (error) {
    console.error('[Shopee API] get_item_list error:', error);
    return { items: [], totalCount: 0, hasMore: false, nextOffset: offset };
  }

  const response = data as {
    item?: { item_id: number; item_status: string; update_time: number }[];
    total_count?: number;
    has_next_page?: boolean;
    next_offset?: number;
  };

  return {
    items: response.item || [],
    totalCount: response.total_count || 0,
    hasMore: response.has_next_page || false,
    nextOffset: response.next_offset || offset + pageSize,
  };
}

/**
 * Full item details: name, SKU, images, price, stock, variations.
 * Combines get_item_base_info (batch) + get_model_list (per item).
 */
export interface ShopeeItemFullDetail {
  item_id: number;
  item_name: string;
  item_sku: string;
  item_status: string;
  images: string[];
  has_model: boolean;
  models: ShopeeModelDetail[];
  tierVariations: string[];  // e.g. ["สี", "ขนาด"]
  category_id?: number;
  weight?: number; // in kg
}

export interface ShopeeModelDetail {
  model_id: number;
  model_sku: string;
  model_name: string;
  tier_index: number[];
  current_price: number;
  original_price: number;
  stock: number;
  image_url?: string;
}

export async function getItemFullDetails(
  creds: ShopeeCredentials,
  itemIds: number[]
): Promise<Map<number, ShopeeItemFullDetail>> {
  const result = new Map<number, ShopeeItemFullDetail>();
  if (itemIds.length === 0) return result;

  // Step 1: get_item_base_info (batch of 50)
  const itemsWithModels: number[] = [];

  for (let i = 0; i < itemIds.length; i += 50) {
    const batch = itemIds.slice(i, i + 50);
    try {
      const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/product/get_item_base_info', {
        item_id_list: batch.join(','),
      });

      if (error) {
        console.error('[Shopee API] get_item_base_info error:', error);
        continue;
      }

      const items = (data as { item_list?: Array<{
        item_id: number;
        item_name: string;
        item_sku: string;
        item_status: string;
        has_model?: boolean;
        category_id?: number;
        weight?: number;
        image?: { image_url_list?: string[] };
        price_info?: Array<{ current_price?: number; original_price?: number }>;
        stock_info_v2?: { summary_info?: { total_available_stock?: number } };
      }> })?.item_list || [];

      for (const item of items) {
        const images = item.image?.image_url_list || [];
        const detail: ShopeeItemFullDetail = {
          item_id: item.item_id,
          item_name: item.item_name || '',
          item_sku: item.item_sku || '',
          item_status: item.item_status || 'NORMAL',
          images,
          has_model: item.has_model || false,
          models: [],
          tierVariations: [],
          category_id: item.category_id,
          weight: item.weight,
        };

        // For simple items (no model), extract price/stock from base info
        if (!item.has_model) {
          const priceInfo = item.price_info?.[0];
          const stock = item.stock_info_v2?.summary_info?.total_available_stock ?? 0;
          detail.models = [{
            model_id: 0,
            model_sku: item.item_sku || '',
            model_name: '',
            tier_index: [],
            current_price: priceInfo?.current_price ?? 0,
            original_price: priceInfo?.original_price ?? 0,
            stock,
          }];
        } else {
          itemsWithModels.push(item.item_id);
        }

        result.set(item.item_id, detail);
      }
    } catch (e) {
      console.error('[Shopee API] get_item_base_info batch error:', e);
    }
  }

  // Step 2: get_model_list for variation items
  for (const itemId of itemsWithModels) {
    try {
      const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/product/get_model_list', {
        item_id: itemId,
      });

      if (error) {
        console.error(`[Shopee API] get_model_list error for item ${itemId}:`, error);
        continue;
      }

      const response = data as {
        tier_variation?: Array<{
          name: string;
          option_list?: Array<{ option: string; image?: { image_url?: string } }>;
        }>;
        model?: Array<{
          model_id: number;
          model_sku: string;
          tier_index?: number[];
          price_info?: Array<{ current_price?: number; original_price?: number }>;
          stock_info_v2?: { summary_info?: { total_available_stock?: number } };
        }>;
      };

      const detail = result.get(itemId);
      if (!detail) continue;

      const tierVars = response.tier_variation || [];
      detail.tierVariations = tierVars.map(tv => tv.name);

      const models = response.model || [];
      const firstTierOptions = tierVars[0]?.option_list || [];

      detail.models = models.map(model => {
        const priceInfo = model.price_info?.[0];
        const tierIdx = model.tier_index?.[0];

        // Build model name from tier options
        const nameParts: string[] = [];
        for (const tv of tierVars) {
          const optIdx = model.tier_index?.[tierVars.indexOf(tv)];
          if (optIdx !== undefined && tv.option_list?.[optIdx]) {
            nameParts.push(tv.option_list[optIdx].option);
          }
        }

        return {
          model_id: model.model_id,
          model_sku: model.model_sku || '',
          model_name: nameParts.join(' / '),
          tier_index: model.tier_index || [],
          current_price: priceInfo?.current_price ?? 0,
          original_price: priceInfo?.original_price ?? 0,
          stock: model.stock_info_v2?.summary_info?.total_available_stock ?? 0,
          image_url: tierIdx !== undefined ? firstTierOptions[tierIdx]?.image?.image_url : undefined,
        };
      });

      console.log(`[Shopee API] getItemFullDetails item ${itemId}: tiers=[${detail.tierVariations.join(',')}], models=${detail.models.length}`);
    } catch (e) {
      console.error(`[Shopee API] get_model_list error for item ${itemId}:`, e);
    }
  }

  return result;
}

/**
 * Update item/model prices on Shopee.
 * For simple items (no model): use model_id = 0.
 */
export async function updatePrice(
  creds: ShopeeCredentials,
  itemId: number,
  priceList: { model_id: number; original_price: number }[]
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'POST', '/api/v2/product/update_price', {}, {
    item_id: itemId,
    price_list: priceList,
  });
}

/**
 * Update item/model stock on Shopee.
 * seller_stock array supports multi-warehouse; we use single entry.
 */
export async function updateStock(
  creds: ShopeeCredentials,
  itemId: number,
  stockList: { model_id: number; seller_stock: { stock: number }[] }[]
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'POST', '/api/v2/product/update_stock', {}, {
    item_id: itemId,
    stock_list: stockList,
  });
}

// ============================================
// Product Export API Functions (Phase 3)
// ============================================

export interface ShopeeCategory {
  category_id: number;
  parent_category_id: number;
  original_category_name: string;
  display_category_name: string;
  has_children: boolean;
}

export interface ShopeeCategoryAttribute {
  attribute_id: number;
  original_attribute_name: string;
  display_attribute_name: string;
  is_mandatory: boolean;
  input_validation_type: string;
  format_type: string;
  date_format_type?: string;
  input_type: string;
  attribute_value_list?: { value_id: number; original_value_name: string; display_value_name: string }[];
}

/**
 * Get Shopee category tree.
 * Returns all categories (flat list — use parent_category_id to build tree).
 */
export async function getShopeeCategories(
  creds: ShopeeCredentials,
  language: string = 'TH'
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'GET', '/api/v2/product/get_category', {
    language,
  });
}

/**
 * Get attributes required for a Shopee category.
 * Only leaf categories can be used when creating items.
 */
export async function getShopeeCategoryAttributes(
  creds: ShopeeCredentials,
  categoryId: number,
  language: string = 'TH'
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'GET', '/api/v2/product/get_attributes', {
    category_id: categoryId,
    language,
  });
}

/**
 * Get available logistics channels for a shop.
 * Needed when creating items to set logistics.
 */
export async function getShopeeLogistics(
  creds: ShopeeCredentials
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'GET', '/api/v2/logistics/get_channel_list');
}

/**
 * Upload an image to Shopee media space by URL.
 * Returns image_info with image_id for use in add_item.
 */
export async function uploadImageByUrl(
  creds: ShopeeCredentials,
  imageUrl: string
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'POST', '/api/v2/media_space/upload_image', {}, {
    image_url: imageUrl,
  });
}

/**
 * Create a new item on Shopee.
 * itemData should follow Shopee's add_item request body format.
 */
export async function addItem(
  creds: ShopeeCredentials,
  itemData: Record<string, unknown>
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'POST', '/api/v2/product/add_item', {}, itemData);
}

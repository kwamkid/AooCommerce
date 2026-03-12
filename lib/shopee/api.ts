import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parallelLimit } from '@/lib/parallel';

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
): Promise<{ data: unknown; error?: string; debug_message?: string }> {
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

  console.log(`[Shopee API] ${method} ${apiPath}`, { params: Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'access_token')), ...(body ? { body } : {}) });
  const res = await fetch(url, options);

  // Try to parse response as JSON regardless of content-type
  // Shopee sometimes returns JSON with non-JSON content-type headers
  let data: any;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    console.error(`[Shopee API] ${apiPath} returned non-JSON (${res.status}):`, text.substring(0, 500));
    return { data: null, error: `Shopee API returned non-JSON response (HTTP ${res.status})` };
  }
  console.log(`[Shopee API] ${apiPath} response:`, JSON.stringify(data).substring(0, 1000));

  if (data.error) {
    return { data: null, error: data.message || data.error, debug_message: data.debug_message || undefined };
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
    .from('marketplace_accounts')
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
export interface ShopeeItemAttribute {
  attribute_id: number;
  original_attribute_name: string;
  is_mandatory: boolean;
  attribute_value_list: Array<{
    value_id: number;
    original_value_name: string;
    value_unit?: string;
  }>;
}

export interface ShopeeModelInfo {
  model_id: number;
  model_sku: string;
  model_name: string;        // e.g. "Coral Pink" — built from tier_index + option_list
  tier_index: number[];
  price: number;             // current_price or original_price
  image_url?: string;        // from tier_variation option_list
}

export interface ShopeeItemEnrichment {
  images: string[];  // Product images from get_item_base_info
  tierVariations: string[];  // e.g. ["สี", "ขนาด"] from get_model_list
  modelImageMap: Map<string, string>;  // model_sku → image_url from tier_variation option_list
  allModels: ShopeeModelInfo[];  // ALL models (variations) for this item
  item_name?: string;       // Product name from get_item_base_info
  item_status?: string;     // e.g. "NORMAL", "BANNED" from get_item_base_info
  category_id?: number;     // Shopee category ID from get_item_base_info
  weight?: number;          // Weight in kg from get_item_base_info
  brand?: { brand_id: number; original_brand_name: string; display_brand_name?: string };  // Brand from get_item_base_info
  attribute_list?: ShopeeItemAttribute[];  // Attributes with filled values from get_item_base_info
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
        item_name?: string;
        item_status?: string;
        category_id?: number;
        weight?: number;
        has_model?: boolean;
        image?: { image_url_list?: string[] };
        brand?: { brand_id: number; original_brand_name: string; display_brand_name?: string };
        attribute_list?: ShopeeItemAttribute[];
      }> })?.item_list || [];

      for (const item of items) {
        const images = item.image?.image_url_list || [];
        result.set(item.item_id, {
          images,
          tierVariations: [],
          modelImageMap: new Map(),
          allModels: [],
          item_name: item.item_name,
          item_status: item.item_status,
          category_id: item.category_id,
          weight: item.weight,
          brand: item.brand,
          attribute_list: item.attribute_list,
        });
        if (item.has_model) {
          itemsWithModels.push(item.item_id);
        }
      }
    } catch (e) {
      console.error(`[Shopee API] get_item_base_info batch error:`, e);
    }
  }

  // Step 2: get_model_list (per item, PARALLEL) for tier_variation names + option images
  await parallelLimit(itemsWithModels, async (itemId) => {
    try {
      const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/product/get_model_list', {
        item_id: itemId,
      });

      if (error) {
        console.error(`[Shopee API] get_model_list error for item ${itemId}:`, error);
        return;
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
        }>;
      };

      const enrichment = result.get(itemId);
      if (!enrichment) return;

      // Extract tier_variation names
      const tierVars = response.tier_variation || [];
      enrichment.tierVariations = tierVars.map(tv => tv.name);

      // Build model_sku → image_url map + allModels list
      const models = response.model || [];
      const firstTierOptions = tierVars[0]?.option_list || [];

      for (const model of models) {
        const tierIdx = model.tier_index?.[0];
        let imageUrl: string | undefined;
        if (tierIdx !== undefined && firstTierOptions[tierIdx]?.image?.image_url) {
          imageUrl = firstTierOptions[tierIdx].image!.image_url!;
          enrichment.modelImageMap.set(model.model_sku, imageUrl);
        }

        // Build model display name from tier_index + option_list
        const modelNameParts: string[] = [];
        for (let t = 0; t < (model.tier_index?.length || 0); t++) {
          const optIdx = model.tier_index![t];
          const optName = tierVars[t]?.option_list?.[optIdx]?.option;
          if (optName) modelNameParts.push(optName);
        }

        const priceInfo = model.price_info?.[0];
        enrichment.allModels.push({
          model_id: model.model_id,
          model_sku: model.model_sku,
          model_name: modelNameParts.join(', ') || model.model_sku,
          tier_index: model.tier_index || [],
          price: priceInfo?.current_price || priceInfo?.original_price || 0,
          image_url: imageUrl,
        });
      }

      console.log(`[Shopee API] get_model_list item ${itemId}: tiers=[${enrichment.tierVariations.join(',')}], models=${enrichment.allModels.length}, models with images=${enrichment.modelImageMap.size}`);
    } catch (e) {
      console.error(`[Shopee API] get_model_list error for item ${itemId}:`, e);
    }
  }, 8);

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
  console.log('[Shopee] get_shop_info data:', JSON.stringify(infoResult.data).substring(0, 500));
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
  return shopeeApiRequest(creds, 'GET', '/api/v2/logistics/get_shipping_parameter', {
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
  dropoff?: Record<string, unknown>,
  packageNumber?: string,
  nonIntegrated?: Record<string, unknown>,
): Promise<{ data: unknown; error?: string }> {
  const body: Record<string, unknown> = { order_sn: orderSn };

  if (packageNumber) {
    body.package_number = packageNumber;
  }
  if (nonIntegrated) {
    body.non_integrated = nonIntegrated;
  } else if (pickup) {
    body.pickup = pickup;
  } else if (dropoff) {
    body.dropoff = dropoff;
  }

  return shopeeApiRequest(creds, 'POST', '/api/v2/logistics/ship_order', {}, body);
}

/**
 * Batch ship up to 50 packages in one API call.
 * Uses /api/v2/logistics/mass_ship_order.
 * CONSTRAINT: All packages must have the SAME logistics_channel_id and product_location_id.
 * pickup/dropoff are top-level params (apply to all packages), NOT per-package.
 */
export interface MassShipPackage {
  package_number?: string; // omit for unsplit orders
}

export async function massShipOrder(
  creds: ShopeeCredentials,
  packages: MassShipPackage[],
  options?: {
    logisticsChannelId?: number;
    productLocationId?: string;
    pickup?: { address_id: number; pickup_time_id: string };
    dropoff?: { branch_id?: number; sender_real_name?: string; tracking_number?: string };
    nonIntegrated?: Record<string, unknown>;
  },
): Promise<{
  successList: { package_number: string }[];
  failList: { package_number: string; fail_reason: string }[];
  error?: string;
}> {
  if (packages.length === 0) return { successList: [], failList: [] };

  const body: Record<string, unknown> = {
    package_list: packages,
  };
  if (options?.logisticsChannelId) body.logistics_channel_id = options.logisticsChannelId;
  if (options?.productLocationId) body.product_location_id = options.productLocationId;
  if (options?.nonIntegrated) body.non_integrated = options.nonIntegrated;
  if (options?.pickup) body.pickup = options.pickup;
  if (options?.dropoff) body.dropoff = options.dropoff;

  const { data, error } = await shopeeApiRequest(creds, 'POST', '/api/v2/logistics/mass_ship_order', {}, body);

  if (error) return { successList: [], failList: [], error };

  const response = data as {
    success_list?: { package_number: string }[];
    fail_list?: { package_number: string; fail_reason: string }[];
  };

  return {
    successList: response?.success_list || [],
    failList: response?.fail_list || [],
  };
}

export interface ShippingDocumentParameterItem {
  order_sn: string;
  package_number?: string;
  suggest_shipping_document_type?: string;
  selectable_shipping_document_type?: string[];
  fail_error?: string;
  fail_message?: string;
}

/**
 * Get selectable and suggested shipping document types for orders.
 * Must call BEFORE createShippingDocument to know which document_type to use.
 * Field name is "suggest_shipping_document_type" (no 'd' at end) per Shopee docs.
 *
 * For split orders, pass orderItems with package_number to get per-package results.
 */
export async function getShippingDocumentParameter(
  creds: ShopeeCredentials,
  orderSns: string[],
  /** Optional: specific order items with package_number for split orders */
  orderItems?: { order_sn: string; package_number?: string }[]
): Promise<{
  data: unknown;
  error?: string;
  resultList?: ShippingDocumentParameterItem[];
}> {
  const orderList = orderItems || orderSns.map(sn => ({ order_sn: sn }));
  const { data, error } = await shopeeApiRequest(creds, 'POST', '/api/v2/logistics/get_shipping_document_parameter', {}, {
    order_list: orderList,
  });

  if (error) return { data: null, error };

  const response = data as { result_list?: ShippingDocumentParameterItem[] };

  console.log(`[Shopee API] get_shipping_document_parameter:`, JSON.stringify(response).substring(0, 500));

  return { data: response, resultList: response?.result_list };
}

export interface CreateShippingDocumentOrderItem {
  order_sn: string;
  package_number?: string;
  tracking_number?: string;
  shipping_document_type?: string;
}

/**
 * Create a shipping document task (async).
 * Each order item should include tracking_number and shipping_document_type
 * from get_tracking_number and get_shipping_document_parameter APIs.
 * Must poll getShippingDocumentResult() until status is READY.
 */
export async function createShippingDocument(
  creds: ShopeeCredentials,
  orderList: CreateShippingDocumentOrderItem[]
): Promise<{ data: unknown; error?: string; resultList?: Array<{ order_sn: string; fail_error?: string; fail_message?: string }> }> {
  const { data, error } = await shopeeApiRequest(creds, 'POST', '/api/v2/logistics/create_shipping_document', {}, {
    order_list: orderList,
  });

  console.log(`[Shopee API] create_shipping_document response:`, JSON.stringify(data || error).substring(0, 1000));

  if (error) {
    const response = data as { result_list?: Array<{ order_sn: string; fail_error?: string; fail_message?: string }> } | null;
    return { data: null, error, resultList: response?.result_list };
  }

  const response = data as { result_list?: Array<{ order_sn: string; fail_error?: string; fail_message?: string }> };
  return { data: response, resultList: response?.result_list };
}

export interface GetShippingDocResultOrderItem {
  order_sn: string;
  package_number?: string;
  shipping_document_type?: string;
}

/**
 * Get the status of a shipping document creation task.
 * Returns status per order: READY, PROCESSING, or FAILED.
 */
export async function getShippingDocumentResult(
  creds: ShopeeCredentials,
  orderList: GetShippingDocResultOrderItem[]
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'POST', '/api/v2/logistics/get_shipping_document_result', {}, {
    order_list: orderList,
  });
}

/**
 * Download a shipping document (PDF) after it is READY.
 * shipping_document_type is a TOP-LEVEL parameter (not per-order).
 * Returns the raw PDF buffer.
 *
 * For split orders, pass orderItems with package_number per entry.
 */
export async function downloadShippingDocument(
  creds: ShopeeCredentials,
  orderSns: string[],
  shippingDocumentType: string = 'NORMAL_AIR_WAYBILL',
  /** Optional: specific order items with package_number for split orders */
  orderItems?: { order_sn: string; package_number?: string }[]
): Promise<{ pdfBuffer: Buffer | null; error?: string }> {
  try {
    const orderList = orderItems || orderSns.map(sn => ({ order_sn: sn }));
    const res = await shopeeApiRequestRaw(creds, 'POST', '/api/v2/logistics/download_shipping_document', {}, {
      order_list: orderList,
      shipping_document_type: shippingDocumentType,
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

/**
 * Batch get tracking numbers for up to 50 packages in one API call.
 * Uses /api/v2/logistics/get_mass_tracking_number (new API, 2025-02-24).
 * Every order (split or non-split) has at least one package_number.
 */
export async function massGetTrackingNumber(
  creds: ShopeeCredentials,
  packageNumbers: string[]
): Promise<{
  successList: { package_number: string; tracking_number: string }[];
  failList: { package_number: string; fail_reason: string }[];
  error?: string;
}> {
  if (packageNumbers.length === 0) return { successList: [], failList: [] };

  const packageList = packageNumbers.map(pn => ({ package_number: pn }));

  const { data, error } = await shopeeApiRequest(creds, 'POST', '/api/v2/logistics/get_mass_tracking_number', {}, {
    package_list: packageList,
  });

  if (error) return { successList: [], failList: [], error };

  const response = data as {
    success_list?: { package_number: string; tracking_number: string; plp_number?: string }[];
    fail_list?: { package_number: string; fail_reason: string }[];
  };

  const successList = (response?.success_list || []).map(item => ({
    package_number: item.package_number,
    tracking_number: item.tracking_number || item.plp_number || '',
  }));

  return {
    successList,
    failList: response?.fail_list || [],
  };
}

/**
 * Get tracking number for an order (optionally for a specific package of a split order).
 * Uses /api/v2/logistics/get_tracking_number
 */
export async function getTrackingNumber(
  creds: ShopeeCredentials,
  orderSn: string,
  packageNumber?: string
): Promise<{ tracking_number?: string; error?: string }> {
  const params: Record<string, string> = { order_sn: orderSn };
  if (packageNumber) params.package_number = packageNumber;

  const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/logistics/get_tracking_number', params);

  if (error) return { error };

  const response = data as { tracking_number?: string; plp_number?: string; first_mile_tracking_number?: string };
  return { tracking_number: response?.tracking_number || response?.plp_number || '' };
}

/**
 * Get package numbers for a split order.
 * Uses /api/v2/order/get_order_detail with package_list optional field.
 * Returns empty array if order is not split.
 */
export async function getPackageNumberList(
  creds: ShopeeCredentials,
  orderSn: string
): Promise<{ packageNumbers: string[]; error?: string }> {
  const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_order_detail', {
    order_sn_list: orderSn,
    response_optional_fields: 'package_list',
  });

  if (error) return { packageNumbers: [], error };

  const response = data as { order_list?: { order_sn: string; package_list?: { package_number: string }[] }[] };
  const order = response?.order_list?.[0];
  if (!order?.package_list || order.package_list.length <= 1) {
    return { packageNumbers: [] }; // not split
  }

  return { packageNumbers: order.package_list.map(p => p.package_number) };
}

/**
 * Batch get package numbers for multiple orders in ONE API call.
 * get_order_detail supports up to 50 order_sn in a single request.
 * Returns a map of order_sn -> package_numbers[] (only includes split orders with >1 package).
 */
export async function getPackageNumberListBatch(
  creds: ShopeeCredentials,
  orderSns: string[]
): Promise<{ packageMap: Map<string, string[]>; error?: string }> {
  if (orderSns.length === 0) return { packageMap: new Map() };

  const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_order_detail', {
    order_sn_list: orderSns.join(','),
    response_optional_fields: 'package_list',
  });

  if (error) return { packageMap: new Map(), error };

  const response = data as {
    order_list?: { order_sn: string; package_list?: { package_number: string }[] }[];
  };

  const packageMap = new Map<string, string[]>();
  for (const order of response?.order_list || []) {
    if (order.package_list && order.package_list.length > 1) {
      packageMap.set(order.order_sn, order.package_list.map(p => p.package_number));
    }
  }

  return { packageMap };
}

export interface PackageInfo {
  package_number: string;
  logistics_channel_id?: number;
  shipping_carrier?: string;
  advance_package?: boolean;
}

/**
 * Batch get ALL package info for multiple orders (including non-split single-package orders).
 * Returns a map of order_sn -> PackageInfo[] for EVERY order that has a package_list.
 * Used by mass APIs (get_mass_tracking_number, mass_ship_order) which require package_number.
 */
export async function getAllPackageNumbersBatch(
  creds: ShopeeCredentials,
  orderSns: string[]
): Promise<{ packageMap: Map<string, PackageInfo[]>; error?: string }> {
  if (orderSns.length === 0) return { packageMap: new Map() };

  const packageMap = new Map<string, PackageInfo[]>();

  // get_order_detail supports up to 50 order_sn per call
  for (let i = 0; i < orderSns.length; i += 50) {
    const batch = orderSns.slice(i, i + 50);
    const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_order_detail', {
      order_sn_list: batch.join(','),
      response_optional_fields: 'package_list',
    });

    if (error) {
      console.error(`[Shopee API] getAllPackageNumbersBatch error:`, error);
      continue;
    }

    const response = data as {
      order_list?: {
        order_sn: string;
        advance_package?: boolean;
        package_list?: {
          package_number: string;
          logistics_channel_id?: number;
          shipping_carrier?: string;
        }[];
      }[];
    };

    for (const order of response?.order_list || []) {
      if (order.package_list && order.package_list.length > 0) {
        packageMap.set(order.order_sn, order.package_list.map(p => ({
          package_number: p.package_number,
          logistics_channel_id: p.logistics_channel_id,
          shipping_carrier: p.shipping_carrier,
          advance_package: order.advance_package || false,
        })));
      }
    }
  }

  return { packageMap };
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
  brand?: { brand_id: number; original_brand_name: string; display_brand_name?: string };
  attribute_list?: ShopeeItemAttribute[];  // Attributes with filled values
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
        brand?: { brand_id: number; original_brand_name: string; display_brand_name?: string };
        attribute_list?: ShopeeItemAttribute[];
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
          brand: item.brand,
          attribute_list: item.attribute_list,
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

  // Step 2: get_model_list for variation items (PARALLEL)
  await parallelLimit(itemsWithModels, async (itemId) => {
    try {
      const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/product/get_model_list', {
        item_id: itemId,
      });

      if (error) {
        console.error(`[Shopee API] get_model_list error for item ${itemId}:`, error);
        return;
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
      if (!detail) return;

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
  }, 8);

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

/**
 * Update item base info on Shopee (name, description, etc.).
 * Only sends fields that are provided.
 */
export async function updateItemInfo(
  creds: ShopeeCredentials,
  itemId: number,
  updates: { item_name?: string; description?: string; category_id?: number; attribute_list?: Array<{ attribute_id: number; attribute_value_list: Array<{ value_id: number; original_value_name: string }> }> }
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'POST', '/api/v2/product/update_item', {}, {
    item_id: itemId,
    ...updates,
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
 * Tries get_attribute_tree first (newer API), falls back to get_attributes.
 */
export async function getShopeeCategoryAttributes(
  creds: ShopeeCredentials,
  categoryId: number,
  language: string = 'TH'
): Promise<{ data: unknown; error?: string }> {
  // Try get_attribute_tree first (may still be active when get_attributes is suspended)
  const treeResult = await shopeeApiRequest(creds, 'GET', '/api/v2/product/get_attribute_tree', {
    category_id: categoryId,
    language,
  });

  if (!treeResult.error) {
    console.log(`[Shopee API] get_attribute_tree succeeded for category ${categoryId}`);
    return treeResult;
  }

  console.log(`[Shopee API] get_attribute_tree failed: ${treeResult.error}, trying get_attributes...`);

  // Fallback to original get_attributes
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
 * Shopee requires multipart/form-data for this endpoint.
 * Returns image_info with image_id for use in add_item.
 */
export async function uploadImageByUrl(
  creds: ShopeeCredentials,
  imageUrl: string
): Promise<{ data: unknown; error?: string }> {
  const timestamp = getTimestamp();
  const sign = generateSign('/api/v2/media_space/upload_image', timestamp, creds.access_token, creds.shop_id);

  const queryParams = new URLSearchParams({
    partner_id: String(creds.partner_id),
    timestamp: String(timestamp),
    sign,
    access_token: creds.access_token,
    shop_id: String(creds.shop_id),
  });

  const url = `${getBaseUrl()}/api/v2/media_space/upload_image?${queryParams.toString()}`;

  // Download the image first, then upload as multipart form data
  try {
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      return { data: null, error: `Failed to download image: HTTP ${imageRes.status}` };
    }
    const imageBuffer = await imageRes.arrayBuffer();
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';

    const formData = new FormData();
    formData.append('image', new Blob([imageBuffer], { type: contentType }), `image.${ext}`);

    console.log(`[Shopee API] POST /api/v2/media_space/upload_image (multipart, ${imageBuffer.byteLength} bytes)`);
    const res = await fetch(url, { method: 'POST', body: formData });

    let data: Record<string, unknown>;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      return { data: null, error: `Shopee API returned non-JSON (HTTP ${res.status})` };
    }

    console.log(`[Shopee API] upload_image response:`, JSON.stringify(data).substring(0, 500));

    if (data.error) {
      return { data: null, error: (data.message as string) || (data.error as string) };
    }
    return { data: data.response || data };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Upload failed' };
  }
}

/**
 * Create a new item on Shopee.
 * itemData should follow Shopee's add_item request body format.
 */
export async function addItem(
  creds: ShopeeCredentials,
  itemData: Record<string, unknown>
): Promise<{ data: unknown; error?: string; debug_message?: string }> {
  return shopeeApiRequest(creds, 'POST', '/api/v2/product/add_item', {}, itemData);
}

/**
 * Initialize tier variation for a product on Shopee.
 * Must be called after add_item for variation products.
 * tier_variation: [{ name: "สี", option_list: [{ option: "แดง" }, ...] }, ...]
 * model: [{ tier_index: [0, 0], seller_stock: [{ stock: 10 }], original_price: 100, model_sku: "SKU-001" }, ...]
 */
export async function initTierVariation(
  creds: ShopeeCredentials,
  itemId: number,
  tierVariation: Array<{ name: string; option_list: Array<{ option: string; image?: { image_id: string } }> }>,
  model: Array<{ tier_index: number[]; seller_stock: Array<{ stock: number }>; original_price: number; model_sku?: string }>
): Promise<{ data: unknown; error?: string }> {
  return shopeeApiRequest(creds, 'POST', '/api/v2/product/init_tier_variation', {}, {
    item_id: itemId,
    tier_variation: tierVariation,
    model: model,
  });
}

// ============================================
// Package Detail API
// ============================================

export interface PackageDetail {
  order_sn: string;
  package_number: string;
  can_split_order?: boolean;
  can_unsplit_order?: boolean;
  is_split_up?: boolean;
  item_list?: {
    item_id: number;
    model_id: number;
    model_quantity: number;
    order_item_id: number;
    promotion_group_id: number;
  }[];
}

/**
 * Get package detail from Shopee — includes can_split_order flag.
 * Requires package_number (from get_order_detail package_list).
 */
export async function getPackageDetail(
  creds: ShopeeCredentials,
  packageNumbers: string[],
): Promise<{ packages: PackageDetail[]; error?: string }> {
  // Shopee docs: GET method with package_number_list as query param
  const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_package_detail', {
    package_number_list: packageNumbers.join(','),
  });
  if (error) return { packages: [], error };
  const response = data as { package_list?: PackageDetail[] };
  return { packages: response?.package_list || [] };
}

// ============================================
// Order Split/Unsplit API Functions
// ============================================

export interface SplitOrderPackageItem {
  item_id: number;
  model_id: number;
  order_item_id?: number;
  promotion_group_id?: number;
  model_quantity?: number;
}

export interface SplitOrderResultPackage {
  package_number: string;
  item_list: SplitOrderPackageItem[];
}

/**
 * Split an order into multiple parcels.
 * Must be called when order is READY_TO_SHIP.
 * Max 5 parcels for Thailand (30 for Taiwan).
 * Each package_list entry contains items for one parcel.
 */
export async function splitOrder(
  creds: ShopeeCredentials,
  orderSn: string,
  packageList: SplitOrderPackageItem[][]
): Promise<{
  data: unknown;
  error?: string;
  packageList?: SplitOrderResultPackage[];
}> {
  // Shopee split_order: POST with body (despite docs saying GET)
  const { data, error } = await shopeeApiRequest(creds, 'POST', '/api/v2/order/split_order', {}, {
    order_sn: orderSn,
    package_list: packageList.map(items => ({ item_list: items })),
  });

  if (error) return { data, error };

  const response = data as { package_list?: SplitOrderResultPackage[] };
  return { data, packageList: response?.package_list };
}

/**
 * Undo a split order — revert to single package.
 * Only works when order is still READY_TO_SHIP.
 */
export async function unsplitOrder(
  creds: ShopeeCredentials,
  orderSn: string
): Promise<{ data: unknown; error?: string }> {
  // Shopee unsplit_order: POST with body (despite docs saying GET)
  return shopeeApiRequest(creds, 'POST', '/api/v2/order/unsplit_order', {}, {
    order_sn: orderSn,
  });
}

/**
 * TikTok Shop error translation — TikTok error messages → Thai user-friendly messages.
 *
 * Pattern matches Shopee error translation system (lib/shopee/errors.ts).
 */

interface ErrorTranslation {
  error_key: string;
  is_regex: boolean;
  thai_message: string;
  category: string;
  is_active: boolean;
  sort_order: number;
}

const BUILT_IN_DEFAULTS: ErrorTranslation[] = [
  // Order errors
  { error_key: 'order_not_found', is_regex: false, thai_message: 'ไม่พบออเดอร์นี้ในระบบ TikTok', category: 'order', is_active: true, sort_order: 10 },
  { error_key: 'order_status_not_match', is_regex: false, thai_message: 'สถานะออเดอร์ไม่ตรงกับที่ระบบ TikTok ต้องการ', category: 'order', is_active: true, sort_order: 11 },
  { error_key: 'order_already_shipped', is_regex: false, thai_message: 'ออเดอร์นี้จัดส่งไปแล้ว', category: 'order', is_active: true, sort_order: 12 },
  { error_key: 'order_cancelled', is_regex: false, thai_message: 'ออเดอร์นี้ถูกยกเลิกแล้ว', category: 'order', is_active: true, sort_order: 13 },

  // Fulfillment errors
  { error_key: 'package_not_found', is_regex: false, thai_message: 'ไม่พบพัสดุนี้ในระบบ TikTok', category: 'fulfillment', is_active: true, sort_order: 20 },
  { error_key: 'shipping_provider_not_found', is_regex: false, thai_message: 'ไม่พบขนส่งที่เลือก', category: 'fulfillment', is_active: true, sort_order: 21 },
  { error_key: 'tracking_number_invalid', is_regex: false, thai_message: 'เลข tracking ไม่ถูกต้อง', category: 'fulfillment', is_active: true, sort_order: 22 },

  // Product errors
  { error_key: 'product_not_found', is_regex: false, thai_message: 'ไม่พบสินค้านี้ใน TikTok Shop', category: 'product', is_active: true, sort_order: 30 },
  { error_key: 'sku_not_found', is_regex: false, thai_message: 'ไม่พบ SKU นี้ใน TikTok Shop', category: 'product', is_active: true, sort_order: 31 },

  // Auth errors
  { error_key: 'access_token_expired', is_regex: false, thai_message: 'Token หมดอายุ กรุณาเชื่อมต่อ TikTok Shop ใหม่', category: 'auth', is_active: true, sort_order: 40 },
  { error_key: 'invalid_access_token', is_regex: false, thai_message: 'Token ไม่ถูกต้อง กรุณาเชื่อมต่อ TikTok Shop ใหม่', category: 'auth', is_active: true, sort_order: 41 },
  { error_key: 'shop_not_authorized', is_regex: false, thai_message: 'ร้านค้ายังไม่ได้อนุญาตการเข้าถึง กรุณาเชื่อมต่อใหม่', category: 'auth', is_active: true, sort_order: 42 },

  // Common errors
  { error_key: 'param_invalid', is_regex: false, thai_message: 'พารามิเตอร์ไม่ถูกต้อง', category: 'common', is_active: true, sort_order: 50 },
  { error_key: 'api_rate_limit', is_regex: false, thai_message: 'เรียก API บ่อยเกินไป กรุณารอสักครู่', category: 'common', is_active: true, sort_order: 51 },
  { error_key: 'Internal error', is_regex: false, thai_message: 'เกิดข้อผิดพลาดภายใน TikTok กรุณาลองใหม่', category: 'common', is_active: true, sort_order: 52 },

  // Regex patterns
  { error_key: 'rate.*limit', is_regex: true, thai_message: 'เรียก API บ่อยเกินไป กรุณารอสักครู่', category: 'common', is_active: true, sort_order: 90 },
  { error_key: 'token.*expired', is_regex: true, thai_message: 'Token หมดอายุ กรุณาเชื่อมต่อ TikTok Shop ใหม่', category: 'auth', is_active: true, sort_order: 91 },
  { error_key: 'unauthorized', is_regex: true, thai_message: 'ไม่มีสิทธิ์เข้าถึง กรุณาเชื่อมต่อ TikTok Shop ใหม่', category: 'auth', is_active: true, sort_order: 92 },
];

// In-memory cache
let cachedTranslations: ErrorTranslation[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load error translations (DB + built-in defaults, cached 5 min).
 */
async function loadTranslations(): Promise<ErrorTranslation[]> {
  if (cachedTranslations && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedTranslations;
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin');
    const { data } = await supabaseAdmin
      .from('marketplace_error_translations')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    // Merge: DB takes priority, built-ins fill gaps
    const dbKeys = new Set((data || []).map(d => d.error_key));
    const builtInFills = BUILT_IN_DEFAULTS.filter(b => !dbKeys.has(b.error_key));
    cachedTranslations = [...(data || []), ...builtInFills];
  } catch {
    cachedTranslations = [...BUILT_IN_DEFAULTS];
  }

  cacheTimestamp = Date.now();
  return cachedTranslations;
}

/**
 * Translate a TikTok error message to Thai.
 */
export async function translateTikTokError(error: string): Promise<string> {
  const translations = await loadTranslations();

  for (const t of translations) {
    if (!t.is_active) continue;
    if (t.is_regex) {
      try {
        if (new RegExp(t.error_key, 'i').test(error)) {
          return t.thai_message;
        }
      } catch { /* invalid regex, skip */ }
    } else {
      if (error.toLowerCase().includes(t.error_key.toLowerCase())) {
        return t.thai_message;
      }
    }
  }

  return error; // Return original if no translation found
}

/**
 * Sync version (uses only built-in defaults, no DB call).
 */
export function translateTikTokErrorSync(error: string): string {
  for (const t of BUILT_IN_DEFAULTS) {
    if (!t.is_active) continue;
    if (t.is_regex) {
      try {
        if (new RegExp(t.error_key, 'i').test(error)) {
          return t.thai_message;
        }
      } catch { /* skip */ }
    } else {
      if (error.toLowerCase().includes(t.error_key.toLowerCase())) {
        return t.thai_message;
      }
    }
  }
  return error;
}

export function invalidateErrorCache() {
  cachedTranslations = null;
  cacheTimestamp = 0;
}

export function getBuiltInDefaults() {
  return BUILT_IN_DEFAULTS;
}

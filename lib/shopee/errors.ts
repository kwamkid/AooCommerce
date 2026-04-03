// ─── Shopee Error → Thai Translation ───────────────────
// Maps known Shopee API error messages/codes to user-friendly Thai messages.
// Supports both built-in defaults and DB-stored custom translations.

import { supabaseAdmin } from '@/lib/supabase-admin';

// ─── Built-in defaults (always available, even if DB is empty) ───

export interface ErrorTranslation {
  id?: string;
  error_key: string;
  is_regex: boolean;
  thai_message: string;
  category: string;
  is_active: boolean;
  sort_order: number;
}

const BUILT_IN_DEFAULTS: ErrorTranslation[] = [
  // Product / KYC
  { error_key: 'The shop did not pass KYC', is_regex: false, thai_message: 'ร้านค้ายังไม่ผ่านการยืนยันตัวตน (KYC) บน Shopee — กรุณาดำเนินการที่ Shopee Seller Centre', category: 'product', is_active: true, sort_order: 1 },
  { error_key: 'shop is banned', is_regex: false, thai_message: 'ร้านค้าถูกระงับบน Shopee', category: 'product', is_active: true, sort_order: 2 },
  { error_key: 'shop is frozen', is_regex: false, thai_message: 'ร้านค้าถูกระงับชั่วคราวบน Shopee', category: 'product', is_active: true, sort_order: 3 },
  { error_key: 'item is banned', is_regex: false, thai_message: 'สินค้าถูกระงับโดย Shopee', category: 'product', is_active: true, sort_order: 4 },
  { error_key: 'item count exceed', is_regex: false, thai_message: 'สินค้าในร้านเกินจำนวนที่ Shopee อนุญาต', category: 'product', is_active: true, sort_order: 5 },
  { error_key: 'exceed.*item.*limit', is_regex: true, thai_message: 'สินค้าในร้านเกินจำนวนที่ Shopee อนุญาต', category: 'product', is_active: true, sort_order: 6 },

  // Bundle Deal
  { error_key: 'bundle.bundle_deal_error_unknown', is_regex: false, thai_message: 'สินค้าอาจอยู่ใน Bundle Deal อื่นที่ยัง active อยู่', category: 'bundle_deal', is_active: true, sort_order: 10 },
  { error_key: 'bundle.item_already_in_bundle_deal', is_regex: false, thai_message: 'สินค้าอยู่ใน Bundle Deal อื่นแล้ว', category: 'bundle_deal', is_active: true, sort_order: 11 },
  { error_key: 'bundle_deal_stock_error', is_regex: false, thai_message: 'สินค้ามีสต็อก 0 หรือไม่เพียงพอ — เพิ่มสต็อกบน Shopee ก่อน', category: 'bundle_deal', is_active: true, sort_order: 12 },
  { error_key: 'bundle_deal_item_limit_exceeded', is_regex: false, thai_message: 'จำนวนสินค้าเกินลิมิต Bundle Deal', category: 'bundle_deal', is_active: true, sort_order: 13 },
  { error_key: 'bundle_deal_overlap', is_regex: false, thai_message: 'ช่วงเวลาซ้ำกับ Bundle Deal อื่น', category: 'bundle_deal', is_active: true, sort_order: 14 },

  // Add-on Deal
  { error_key: 'add_on_deal_item_limit_exceeded', is_regex: false, thai_message: 'จำนวนสินค้าเกินลิมิต Add-on Deal', category: 'addon_deal', is_active: true, sort_order: 20 },
  { error_key: 'add_on_item_overlap', is_regex: false, thai_message: 'สินค้านี้อยู่ใน Add-on Deal อื่นที่ยัง active อยู่ — ต้องลบออกจาก deal เก่าก่อน', category: 'addon_deal', is_active: true, sort_order: 21 },
  { error_key: 'already in other add on deal', is_regex: false, thai_message: 'สินค้านี้อยู่ใน Add-on Deal อื่นที่ยัง active อยู่ — ต้องลบออกจาก deal เก่าก่อน', category: 'addon_deal', is_active: true, sort_order: 22 },
  { error_key: 'no_stock', is_regex: false, thai_message: 'สินค้าสต็อก 0 — ระบบเพิ่มสต็อกอัตโนมัติและลองใหม่แล้ว', category: 'addon_deal', is_active: true, sort_order: 23 },
  { error_key: 'no stock', is_regex: false, thai_message: 'สินค้าสต็อก 0 — ระบบเพิ่มสต็อกอัตโนมัติและลองใหม่แล้ว', category: 'addon_deal', is_active: true, sort_order: 24 },
  { error_key: 'add_on.add_on_no_item', is_regex: false, thai_message: 'ไม่พบสินค้าบน Shopee — อาจถูกลบหรือ variation ไม่ตรงกัน', category: 'addon_deal', is_active: true, sort_order: 25 },
  { error_key: 'add_on.add_on_edit_error', is_regex: false, thai_message: 'แก้ไข Add-on Deal ไม่สำเร็จ — ตรวจสอบค่าที่กรอก', category: 'addon_deal', is_active: true, sort_order: 26 },
  { error_key: 'add_on.add_on_duplicate_item', is_regex: false, thai_message: 'สินค้านี้ถูกเพิ่มใน Deal นี้แล้ว (ซ้ำ)', category: 'addon_deal', is_active: true, sort_order: 27 },
  { error_key: 'add_on.add_on_purchase_limit_error', is_regex: false, thai_message: 'จำนวนจำกัดการซื้อไม่ถูกต้อง', category: 'addon_deal', is_active: true, sort_order: 28 },
  { error_key: 'add_on.add_on_deal_not_exists', is_regex: false, thai_message: 'ไม่พบ Add-on Deal บน Shopee — อาจถูกลบไปแล้ว', category: 'addon_deal', is_active: true, sort_order: 29 },

  // Logistics
  { error_key: 'logistics.can_not_print_jit_order', is_regex: false, thai_message: 'ช่องทางขนส่งนี้พิมพ์ใบปะหน้าได้จาก Shopee Seller Center เท่านั้น', category: 'logistics', is_active: true, sort_order: 30 },

  // Common
  { error_key: 'product.error_param', is_regex: false, thai_message: 'ข้อมูลสินค้าไม่ถูกต้อง — ตรวจสอบรายละเอียดสินค้าอีกครั้ง', category: 'common', is_active: true, sort_order: 40 },
  { error_key: 'not support cross.?border', is_regex: true, thai_message: 'สินค้านี้ไม่รองรับ Cross-border', category: 'common', is_active: true, sort_order: 41 },
  { error_key: 'category.*not.*found', is_regex: true, thai_message: 'หมวดหมู่สินค้าไม่ถูกต้องหรือถูกลบไปแล้ว', category: 'common', is_active: true, sort_order: 42 },
];

// ─── In-memory cache ───

let cachedTranslations: ErrorTranslation[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function loadTranslations(): Promise<ErrorTranslation[]> {
  const now = Date.now();
  if (cachedTranslations && now - cacheLoadedAt < CACHE_TTL) {
    return cachedTranslations;
  }

  try {
    const { data } = await supabaseAdmin
      .from('marketplace_error_translations')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (data && data.length > 0) {
      // Merge: DB takes priority, then add built-in defaults not in DB
      const dbKeys = new Set(data.map((d: any) => d.error_key));
      const missingDefaults = BUILT_IN_DEFAULTS.filter(d => !dbKeys.has(d.error_key));
      cachedTranslations = [...(data as ErrorTranslation[]), ...missingDefaults];
      cacheLoadedAt = now;
      return cachedTranslations;
    }
  } catch {
    // DB not ready or table doesn't exist — use defaults
  }

  cachedTranslations = BUILT_IN_DEFAULTS;
  cacheLoadedAt = now;
  return cachedTranslations;
}

/** Force refresh cache (after CRUD operations) */
export function invalidateErrorCache() {
  cachedTranslations = null;
  cacheLoadedAt = 0;
}

/** Get all translations (for superadmin page) */
export async function getAllTranslations(): Promise<ErrorTranslation[]> {
  try {
    const { data } = await supabaseAdmin
      .from('marketplace_error_translations')
      .select('*')
      .order('sort_order', { ascending: true });

    if (data && data.length > 0) return data as ErrorTranslation[];
  } catch {
    // Table doesn't exist yet
  }
  return BUILT_IN_DEFAULTS;
}

/** Get built-in defaults (for seeding DB) */
export function getBuiltInDefaults(): ErrorTranslation[] {
  return BUILT_IN_DEFAULTS;
}

/**
 * Translate a Shopee error message/code to Thai.
 * Checks DB translations first (cached), falls back to built-in defaults.
 * Returns the original message if no translation is found.
 */
export async function translateShopeeError(error: string): Promise<string> {
  if (!error) return error;

  const translations = await loadTranslations();

  for (const t of translations) {
    if (!t.is_active) continue;
    if (t.is_regex) {
      try {
        if (new RegExp(t.error_key, 'i').test(error)) return t.thai_message;
      } catch { /* invalid regex, skip */ }
    } else {
      if (error.includes(t.error_key)) return t.thai_message;
    }
  }

  return error;
}

/**
 * Synchronous version using cached data only (for places that can't await).
 * Falls back to built-in defaults if cache is empty.
 */
export function translateShopeeErrorSync(error: string): string {
  if (!error) return error;

  const translations = cachedTranslations || BUILT_IN_DEFAULTS;

  for (const t of translations) {
    if (!t.is_active) continue;
    if (t.is_regex) {
      try {
        if (new RegExp(t.error_key, 'i').test(error)) return t.thai_message;
      } catch { /* invalid regex, skip */ }
    } else {
      if (error.includes(t.error_key)) return t.thai_message;
    }
  }

  return error;
}

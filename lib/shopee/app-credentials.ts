// Shopee app credentials ต่อบริษัท (server-only)
//
// ทำไมต้องมีตารางนี้ — Shopee ให้ **Chat API เฉพาะ app ประเภท "Seller In House"**
// และ app แบบนั้นผูกกับบัญชี seller ที่จดมันขึ้นมา ⇒ **ทุกบริษัทที่อยากใช้แชท Shopee
// ต้องมี app ของตัวเอง** (app กลางของ AOO ใช้แทนกันไม่ได้) · ส่วนออเดอร์/สินค้า
// ยังใช้ app กลาง (Third-party Partner) ที่ร้านไหนก็ authorize ได้เหมือนเดิม
//
// ⚠️ ไฟล์นี้เป็น **ที่เดียวในระบบที่อ่าน SHOPEE_SELLER_APP_*** — env พวกนั้นเหลือสถานะ
// "ทางถอยของบริษัทที่ยังไม่มีแถวในตาราง" เท่านั้น ห้าม process.env.SHOPEE_SELLER_APP_*
// ที่อื่นอีก (grep แล้วต้องเจอแค่ไฟล์นี้)

import { supabaseAdmin } from '@/lib/supabase-admin';

export type ShopeeAppRole = 'seller';

/**
 * app ใบนี้ทำหน้าที่อะไรให้บริษัท — **บริษัทเลือกเอง** ไม่ใช่ระบบเดาจากสภาพร้าน
 *   full = ทางเข้าออเดอร์ + สินค้า + แชท (ร้าน authorize ผ่าน app นี้ตรง ๆ ตั้งแต่แรก)
 *   chat = แชทอย่างเดียว — ออเดอร์/สินค้าเข้าทาง app กลางของระบบ
 * เดาเอาไม่ได้เพราะสองโครงหน้าตาเหมือนกันตอนที่ยังไม่มีร้านเชื่อมสักร้าน
 */
export type ShopeeAppUsage = 'full' | 'chat';

export interface ShopeeAppCredentials {
  /** row id ใน marketplace_app_credentials — null = มาจาก env (legacy fallback) */
  id: string | null;
  partner_id: number;
  partner_key: string;
  /** Live Push Partner Key (Push Mechanism > Set Push) — ไม่ตั้ง = ใช้ partner_key ตรวจ push */
  push_key: string | null;
  env: 'production' | 'sandbox';
  usage: ShopeeAppUsage;
  /** company = แถวของบริษัทนี้ · env = ตกมาใช้ค่าใน environment ของ server */
  source: 'company' | 'env';
  label: string | null;
}

const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  at: number;
  value: T;
}

/** key = `${companyId}:${role}` — บริษัทที่ไม่มีแถวก็ cache ผลว่า "ไม่มี" เหมือนกัน */
const appCache = new Map<string, CacheEntry<ShopeeAppCredentials | null>>();
let pushKeyCache: CacheEntry<string[]> | null = null;

/** ล้าง cache หลังบันทึก/ลบ app — ไม่งั้นผู้ใช้กดบันทึกแล้วต้องรอถึง 60 วิ */
export function invalidateShopeeAppCache(): void {
  appCache.clear();
  pushKeyCache = null;
}

function normalizeEnv(value: string | null | undefined): 'production' | 'sandbox' {
  return value === 'sandbox' ? 'sandbox' : 'production';
}

/**
 * app แบบ seller ที่ตั้งไว้ใน environment ของ server (ของเดิมก่อนมีตารางนี้)
 * ไม่ตั้ง SHOPEE_SELLER_APP_ENV = ใช้ค่าเดียวกับ partner app เหมือนพฤติกรรมเดิม
 */
function envSellerApp(): ShopeeAppCredentials | null {
  const partnerId = parseInt(process.env.SHOPEE_SELLER_APP_ID || '0', 10);
  const partnerKey = process.env.SHOPEE_SELLER_APP_KEY || '';
  if (!partnerId || !partnerKey) return null;
  return {
    id: null,
    partner_id: partnerId,
    partner_key: partnerKey,
    push_key: process.env.SHOPEE_SELLER_APP_PUSH_KEY || null,
    env: normalizeEnv(process.env.SHOPEE_SELLER_APP_ENV || process.env.SHOPEE_PARTNER_APP_ENV),
    // env app ยุคก่อนมีตารางนี้ = app ของ ABC ที่รับทั้งออเดอร์และแชท → full คือพฤติกรรมเดิม
    usage: 'full',
    source: 'env',
    label: 'app จาก environment (legacy)',
  };
}

interface AppRow {
  id: string;
  partner_id: number | string;
  partner_key: string;
  push_key: string | null;
  env: string;
  usage: string;
  label: string | null;
}

export function normalizeUsage(value: string | null | undefined): ShopeeAppUsage {
  return value === 'chat' ? 'chat' : 'full';
}

function rowToCreds(row: AppRow): ShopeeAppCredentials {
  return {
    id: row.id,
    // bigint กลับมาเป็น string จาก PostgREST ได้ — Number() ก่อนเสมอ ไม่งั้นลายเซ็นเพี้ยน
    partner_id: Number(row.partner_id),
    partner_key: row.partner_key,
    push_key: row.push_key || null,
    env: normalizeEnv(row.env),
    usage: normalizeUsage(row.usage),
    source: 'company',
    label: row.label,
  };
}

/**
 * app ของบริษัทนี้ (ตาราง → env) — null = บริษัทนี้ยังไม่มี app แบบนั้นเลย
 *
 * companyId ว่าง = ข้ามการอ่าน DB ไปใช้ env ตรง ๆ (จุดที่ยังไม่รู้ว่าเป็นบริษัทไหน)
 */
export async function getCompanyShopeeApp(
  companyId: string | null | undefined,
  role: ShopeeAppRole = 'seller'
): Promise<ShopeeAppCredentials | null> {
  if (!companyId) return envSellerApp();

  const key = `${companyId}:${role}`;
  const cached = appCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const { data } = await supabaseAdmin
    .from('marketplace_app_credentials')
    .select('id, partner_id, partner_key, push_key, env, usage, label')
    .eq('company_id', companyId)
    .eq('platform', 'shopee')
    .eq('app_role', role)
    .eq('is_active', true)
    .maybeSingle();

  const value = data ? rowToCreds(data as AppRow) : envSellerApp();
  appCache.set(key, { at: Date.now(), value });
  return value;
}

/**
 * key ทุกใบที่อาจถูกใช้เซ็น push ของ app แบบ seller (ทุกบริษัท)
 *
 * webhook ตัวเดียวรับ push จาก app ของทุกบริษัท — ตกใบใดใบหนึ่งไป = push ของบริษัทนั้น
 * ถูกตีตกเงียบ ๆ ทั้งหมด · Live Push Partner Key แยกจาก API key ได้ จึงเอา push_key ก่อน
 */
export async function listActiveSellerPushKeys(): Promise<string[]> {
  if (pushKeyCache && Date.now() - pushKeyCache.at < CACHE_TTL_MS) return pushKeyCache.value;

  const { data } = await supabaseAdmin
    .from('marketplace_app_credentials')
    .select('partner_key, push_key')
    .eq('platform', 'shopee')
    .eq('is_active', true);

  const keys = new Set<string>();
  for (const row of (data || []) as { partner_key: string; push_key: string | null }[]) {
    const key = row.push_key || row.partner_key;
    if (key) keys.add(key);
  }
  // env fallback ยังต้องอยู่ในลิสต์ — บริษัทที่ยังไม่ได้ย้ายเข้าตารางใช้ใบนี้เซ็น push
  const fallback = envSellerApp();
  if (fallback) keys.add(fallback.push_key || fallback.partner_key);

  const value = [...keys];
  pushKeyCache = { at: Date.now(), value };
  return value;
}

/**
 * ร้าน Shopee ที่ยังใช้งานของบริษัทนี้ แบ่งตาม app ที่ออก **token ชุดหลัก** ให้ร้านนั้น
 *
 * ใช้ตัดสินเรื่องที่ต้องอ้างของจริง ไม่ใช่ค่าที่ผู้ใช้เลือก: ร้านใน `sellerMainShopIds`
 * รับออเดอร์ผ่าน app ของบริษัท ⇒ ลดโหมดเป็น "แชทอย่างเดียว" เมื่อไหร่ push ออเดอร์ของ
 * ร้านพวกนี้ถูกปิดตาม (ออเดอร์หายเงียบ) และร้านพวกนี้ต้องถูก block ที่ app กลางเสมอ
 */
export async function getCompanyShopeeShopSplit(companyId: string): Promise<{
  sellerMainShopIds: number[];
  partnerShopIds: number[];
}> {
  const { data } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('shop_id, metadata')
    .eq('company_id', companyId)
    .eq('platform', 'shopee')
    .eq('is_active', true);

  const sellerMainShopIds: number[] = [];
  const partnerShopIds: number[] = [];
  for (const row of (data || []) as { shop_id: number | string; metadata: Record<string, unknown> | null }[]) {
    const id = Number(row.shop_id);
    if (!id) continue;
    (row.metadata?.shopee_app === 'seller' ? sellerMainShopIds : partnerShopIds).push(id);
  }
  return { sellerMainShopIds, partnerShopIds };
}

/**
 * ข้อความตอนปฏิเสธการลดโหมดเป็น "แชทอย่างเดียว" — บอกทางออกทั้งสองทาง ไม่ใช่แค่ห้าม
 * (ปฏิเสธเฉย ๆ ผู้ใช้จะไปกดปิด app ทิ้งแทน ซึ่งแย่กว่าเดิม)
 */
export const SHOPEE_CHAT_ONLY_BLOCKED =
  'มีร้านที่เชื่อมผ่าน app ของบริษัทนี้อยู่ — ออเดอร์ของร้านเหล่านั้นเข้าทาง app นี้ เปลี่ยนเป็น "แชทอย่างเดียว" จะทำให้ push ออเดอร์ถูกปิด ' +
  'ให้คงโหมด "ครบในตัว" ไว้ หรือเชื่อมร้านเหล่านั้นใหม่ผ่าน app กลางของระบบก่อนแล้วค่อยเปลี่ยนโหมด';

/**
 * ปิดบัง secret ก่อนส่งออกจาก API — โชว์ 4 ตัวท้ายพอให้ผู้ใช้ยืนยันว่าใส่ใบไหนไว้
 * **ทุก response ที่มี key ต้องผ่านตัวนี้** ไม่มีข้อยกเว้น
 */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 4 ? '••••' : `••••${value.slice(-4)}`;
}

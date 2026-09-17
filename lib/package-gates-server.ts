// ─────────────────────────────────────────────────────────────────────────────
// บังคับเพดานของแพ็กเกจที่ฝั่งเซิร์ฟเวอร์
//
// **ทำไมต้องมีแยกจาก lib/package-features.ts**: ไฟล์นั้นเป็นตรรกะล้วน ใช้ได้ทั้ง
// ฝั่ง client (ล็อกสวิตช์ · ซ่อนเมนู) ส่วนไฟล์นี้แตะ DB จึงเป็น server-only
//
// ⚠️ การล็อกที่สวิตช์กับที่เมนูเป็นแค่ชั้น UX — คนยิง API ตรงได้เสมอ
// อะไรที่มีเพดานจริง (จำนวนร้าน · จำนวนคลัง) ต้องดักตรงจุดที่สร้างของด้วย
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  gatesFromPackageFeatures,
  featureLockReason,
  applyPackageGates,
  PERMISSIVE_GATES,
  type PackageGates,
  type GatedFeatureKey,
} from '@/lib/package-features';
import { parseFeatures, DEFAULT_FEATURES, type FeatureFlags } from '@/lib/features';
import { isFeatureOn } from '@/lib/feature-routes';

export interface CompanyFeatureContext {
  /** สวิตช์ที่ร้านเปิดไว้ (clamp ตามแพ็กเกจแล้ว) */
  features: FeatureFlags;
  /** เพดานของแพ็กเกจ */
  gates: PackageGates;
}

/**
 * แคชระดับโปรเซส คีย์ด้วย companyId
 *
 * **ทำไมต้องแคช**: ถ้าไม่มี ทุก API ที่ผ่านด่านจะเพิ่ม 2 query ต่อคำขอ
 * (companies.settings + subscription→package) ซึ่งเปิดหน้าหนึ่งยิงหลาย API พร้อมกัน
 * จะกลายเป็นหลายสิบ query ที่อ่านของชุดเดียวกันซ้ำ ๆ
 *
 * ท่าเดียวกับแคช auth ใน `lib/supabase-admin.ts` — TTL สั้นพอที่การเปลี่ยนแพ็กเกจ
 * หรือเปิด/ปิดฟีเจอร์จะมีผลภายในไม่กี่สิบวินาที และหน้าที่เขียนค่าเรียก
 * `invalidateCompanyFeatureCache()` ให้มีผลทันทีอยู่แล้ว
 */
const FEATURE_CACHE_TTL_MS = 60_000;
type CachedContext = { expiresAt: number; ctx: CompanyFeatureContext };
const featureCache = new Map<string, CachedContext>();

/** เรียกหลังบันทึกฟีเจอร์/แพ็กเกจ เพื่อให้ค่าใหม่มีผลทันทีไม่ต้องรอ TTL */
export function invalidateCompanyFeatureCache(companyId?: string) {
  if (companyId) featureCache.delete(companyId);
  else featureCache.clear();
}

/** สวิตช์ + เพดานของบริษัทนี้ (แคช) — อ่านสองตารางพร้อมกันเมื่อแคชไม่โดน */
export async function getCompanyFeatureContext(companyId: string): Promise<CompanyFeatureContext> {
  const cached = featureCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.ctx;

  const [companyRes, subRes] = await Promise.all([
    supabaseAdmin.from('companies').select('settings').eq('id', companyId).single(),
    supabaseAdmin
      .from('user_subscriptions')
      .select('package:packages(features)')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .single(),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkgFeatures = (subRes.data?.package as any)?.features || null;
  const gates = subRes.data ? gatesFromPackageFeatures(pkgFeatures) : PERMISSIVE_GATES;

  const settings = (companyRes.data?.settings as Record<string, unknown>) || null;
  const features = settings
    ? applyPackageGates(parseFeatures(settings).features, gates)
    : DEFAULT_FEATURES;

  const ctx: CompanyFeatureContext = { features, gates };
  featureCache.set(companyId, { expiresAt: Date.now() + FEATURE_CACHE_TTL_MS, ctx });

  // เก็บกวาดรายการหมดอายุแบบ best-effort (ขอบเขตหน่วยความจำ)
  if (featureCache.size > 256) {
    const now = Date.now();
    for (const [k, v] of featureCache.entries()) {
      if (v.expiresAt <= now) featureCache.delete(k);
    }
  }
  return ctx;
}

/** อ่านเพดานของแพ็กเกจที่บริษัทใช้อยู่ — ไม่มี subscription = ไม่ล็อกอะไร */
export async function getCompanyGates(companyId: string): Promise<PackageGates> {
  return (await getCompanyFeatureContext(companyId)).gates;
}

/**
 * null = ผ่าน · string = เหตุผลที่ทำไม่ได้
 * ตรวจสองชั้นเหมือน FeatureGuard ฝั่งหน้า: แพ็กเกจไม่รองรับ → สวิตช์ยังไม่เปิด
 */
export async function featureBlockedReason(
  companyId: string,
  key: GatedFeatureKey,
): Promise<string | null> {
  const { features, gates } = await getCompanyFeatureContext(companyId);
  const locked = featureLockReason(key, gates);
  if (locked) return locked;
  if (!isFeatureOn(features, key)) return 'ฟีเจอร์นี้ยังไม่ได้เปิดใช้งาน — เปิดที่ ตั้งค่า › Feature เสริม';
  return null;
}

/**
 * ด่านของ API — ใส่บรรทัดเดียวต้นฟังก์ชัน
 *
 * ```ts
 * const blocked = await guardFeature(companyId, 'broadcast');
 * if (blocked) return blocked;
 * ```
 *
 * ⚠️ ต้องมีคู่กับ `FeatureGuard` ฝั่งหน้า — ตัวนั้นกันคนหลงเข้าหน้า
 * ตัวนี้กันคนยิง API ตรง (ซึ่ง UI กันไม่ได้เลย)
 */
export async function guardFeature(
  companyId: string,
  key: GatedFeatureKey,
): Promise<NextResponse | null> {
  const reason = await featureBlockedReason(companyId, key);
  return reason ? NextResponse.json({ error: reason }, { status: 403 }) : null;
}

/**
 * เชื่อมร้านใหม่ได้อีกไหมในแพลตฟอร์มนี้
 *
 * นับเฉพาะร้านที่ยัง active และ **ไม่นับร้านเดิมที่กำลัง re-authorize** —
 * ต่ออายุ token ของร้านที่มีอยู่แล้วต้องทำได้เสมอ ไม่งั้นพอชนเพดานจะกลายเป็น
 * "ร้านเดิมก็ใช้ต่อไม่ได้" ซึ่งไม่ใช่เจตนาของเพดาน
 *
 * @param existingShopIds shop_id ของร้านที่มีอยู่แล้วในรอบนี้ (ไม่ถือว่าเป็นร้านใหม่)
 */
export async function shopQuotaBlockedReason(
  companyId: string,
  platform: string,
  existingShopIds: string[] = [],
): Promise<string | null> {
  const gates = await getCompanyGates(companyId);
  if (gates.maxShopsPerPlatform === null) return null;

  const { data } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('shop_id')
    .eq('company_id', companyId)
    .eq('platform', platform)
    .eq('is_active', true);

  const current = new Set((data || []).map(r => String(r.shop_id)));
  for (const id of existingShopIds) current.delete(String(id));

  if (current.size < gates.maxShopsPerPlatform) return null;

  return `แพ็กเกจปัจจุบันเชื่อมได้ ${gates.maxShopsPerPlatform} ร้านต่อแพลตฟอร์ม `
    + `(ตอนนี้มี ${current.size} ร้านแล้ว) — อัปเกรดเพื่อเชื่อมร้านเพิ่ม`;
}

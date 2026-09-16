// ─────────────────────────────────────────────────────────────────────────────
// บังคับเพดานของแพ็กเกจที่ฝั่งเซิร์ฟเวอร์
//
// **ทำไมต้องมีแยกจาก lib/package-features.ts**: ไฟล์นั้นเป็นตรรกะล้วน ใช้ได้ทั้ง
// ฝั่ง client (ล็อกสวิตช์ · ซ่อนเมนู) ส่วนไฟล์นี้แตะ DB จึงเป็น server-only
//
// ⚠️ การล็อกที่สวิตช์กับที่เมนูเป็นแค่ชั้น UX — คนยิง API ตรงได้เสมอ
// อะไรที่มีเพดานจริง (จำนวนร้าน · จำนวนคลัง) ต้องดักตรงจุดที่สร้างของด้วย
// ─────────────────────────────────────────────────────────────────────────────
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  gatesFromPackageFeatures,
  featureLockReason,
  PERMISSIVE_GATES,
  type PackageGates,
  type GatedFeatureKey,
} from '@/lib/package-features';

/** อ่านเพดานของแพ็กเกจที่บริษัทใช้อยู่ — ไม่มี subscription = ไม่ล็อกอะไร */
export async function getCompanyGates(companyId: string): Promise<PackageGates> {
  const { data } = await supabaseAdmin
    .from('user_subscriptions')
    .select('package:packages(features)')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .single();

  if (!data) return PERMISSIVE_GATES;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pkgFeatures = (data.package as any)?.features || null;
  return gatesFromPackageFeatures(pkgFeatures);
}

/** null = ผ่าน · string = เหตุผลที่ทำไม่ได้ (เอาไปตอบ 403 ได้เลย) */
export async function featureBlockedReason(
  companyId: string,
  key: GatedFeatureKey,
): Promise<string | null> {
  return featureLockReason(key, await getCompanyGates(companyId));
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

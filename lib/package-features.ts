// ─────────────────────────────────────────────────────────────────────────────
// แพ็กเกจกำหนดว่าบริษัทเปิด Feature เสริมตัวไหนได้บ้าง — ที่เดียวของทั้งระบบ
//
// ใช้โดย:
//   - หน้า ตั้งค่า > Feature เสริม (ล็อกสวิตช์ + บอกว่าต้องอัปเกรด)
//   - Sidebar (ซ่อนเมนูของฟีเจอร์ที่ถูกล็อก)
//   - Onboarding
//   - API ฝั่งเซิร์ฟเวอร์ที่ต้องบังคับจริง (จำนวนคลัง · จำนวนร้าน marketplace)
//
// **สำคัญ**: การล็อกที่สวิตช์กับที่เมนูเป็นแค่ชั้น UX — คนยิง API ตรงได้เสมอ
// ฟีเจอร์ที่มีผลกับเงิน/ข้อมูลต้องดักซ้ำที่ API ด้วย (ดู `assertFeatureAllowed`)
//
// เดิมไฟล์นี้ล็อกได้ตัวเดียวคือ `stock` ส่วนที่เหลือเปิดได้หมดทุกแพ็กเกจ —
// เพิ่มแบบรายฟีเจอร์ที่ `PACKAGE_LOCKS` ไม่ใช่ไปโปรย if กระจายตามหน้า
// ─────────────────────────────────────────────────────────────────────────────

import type { FeatureFlags } from '@/lib/features';

/** คีย์ของฟีเจอร์ที่เป็นสวิตช์เปิด/ปิดได้ (ไม่รวมตัวที่ติดมาเป็น default เสมอ) */
export type GatedFeatureKey = keyof FeatureFlags;

export interface PackageGates {
  /** เปิดระบบคลังสินค้าได้ไหม */
  stockEnabled: boolean;
  /** จำนวนคลังสูงสุด — null = ไม่จำกัด */
  maxWarehouses: number | null;
  /** ร้านต่อ 1 แพลตฟอร์ม (Shopee/Lazada/TikTok) — null = ไม่จำกัด */
  maxShopsPerPlatform: number | null;
  /** ฟีเจอร์ที่แพ็กเกจนี้ยังไม่รองรับ */
  lockedFeatures: GatedFeatureKey[];
}

/**
 * ค่าที่ใช้เมื่อยังไม่รู้แพ็กเกจ (โหลดไม่ทัน / ไม่มี subscription)
 * เปิดหมดไว้ก่อนดีกว่าล็อกหมด — ข้อมูลหายไปชั่วคราวไม่ควรทำให้คนใช้งานไม่ได้
 */
export const PERMISSIVE_GATES: PackageGates = {
  stockEnabled: true,
  maxWarehouses: null,
  maxShopsPerPlatform: null,
  lockedFeatures: [],
};

/** อ่าน gates จาก `packages.features` (JSONB) */
export function gatesFromPackageFeatures(
  features: Record<string, unknown> | null | undefined,
): PackageGates {
  const f = features || {};
  const locked = Array.isArray(f.locked_features)
    ? (f.locked_features as string[]).filter(Boolean) as GatedFeatureKey[]
    : [];

  return {
    stockEnabled: f.stock_enabled !== false,
    maxWarehouses: (f.max_warehouses as number | null | undefined) ?? null,
    maxShopsPerPlatform: (f.max_shops_per_platform as number | null | undefined) ?? null,
    lockedFeatures: locked,
  };
}

/** คำอธิบายที่ผู้ใช้เห็นเมื่อฟีเจอร์ถูกล็อก — เขียนว่า "ยังไม่รองรับอะไร" ไม่ใช่รหัสคีย์ */
const LOCK_REASONS: Partial<Record<GatedFeatureKey, string>> = {
  stock: 'แพ็กเกจปัจจุบันยังไม่รองรับระบบคลังสินค้า',
  marketplace_sync: 'แพ็กเกจปัจจุบันยังไม่รองรับการเชื่อมร้าน Marketplace',
  pos: 'แพ็กเกจปัจจุบันยังไม่รองรับ Cashier (POS)',
  storefront: 'แพ็กเกจปัจจุบันยังไม่รองรับหน้าร้านออนไลน์',
  counter_sales: 'แพ็กเกจปัจจุบันยังไม่รองรับหน้าขาย PC ประจำห้าง',
  consignment: 'แพ็กเกจปัจจุบันยังไม่รองรับลูกค้าตัวแทน',
  department_store: 'แพ็กเกจปัจจุบันยังไม่รองรับลูกค้าห้าง',
  supplier: 'แพ็กเกจปัจจุบันยังไม่รองรับซัพพลายเออร์และใบสั่งซื้อ',
  broadcast: 'แพ็กเกจปัจจุบันยังไม่รองรับบรอดแคสต์',
  audience: 'แพ็กเกจปัจจุบันยังไม่รองรับกลุ่มเป้าหมายและ Audience Sync',
};

/** null = เปิดได้ · string = เหตุผลที่เปิดไม่ได้ */
export function featureLockReason(
  key: GatedFeatureKey,
  gates: PackageGates,
): string | null {
  // stock มี flag ของตัวเองใน packages.features มาก่อน locked_features จะมีอยู่
  if (key === 'stock' && !gates.stockEnabled) return LOCK_REASONS.stock!;
  if (!gates.lockedFeatures.includes(key)) return null;
  return LOCK_REASONS[key] ?? 'แพ็กเกจปัจจุบันยังไม่รองรับฟีเจอร์นี้';
}

/**
 * บังคับให้ฟีเจอร์ที่ถูกล็อกเป็น "ปิด" เสมอ ไม่ว่าเคยบันทึกไว้ว่าอะไร
 * — ใช้ตอน**อ่าน** เพื่อให้บริษัทที่ดาวน์เกรดไม่เห็น UI ที่ไม่มีสิทธิ์แล้ว
 */
export function applyPackageGates(features: FeatureFlags, gates: PackageGates): FeatureFlags {
  const out = { ...features };
  if (!gates.stockEnabled) out.stock = false;

  for (const key of gates.lockedFeatures) {
    const current = out[key];
    if (typeof current === 'boolean') {
      (out[key] as boolean) = false;
    } else if (current && typeof current === 'object' && 'enabled' in current) {
      (out[key] as { enabled: boolean; required: boolean }) = { enabled: false, required: false };
    }
  }
  return out;
}

/** ฟีเจอร์นี้ "เปิดอยู่จริงและแพ็กเกจอนุญาต" หรือไม่ — ใช้ดักที่ปุ่ม/หน้า/API */
export function isFeatureUsable(
  key: GatedFeatureKey,
  features: FeatureFlags,
  gates: PackageGates,
): boolean {
  if (featureLockReason(key, gates) !== null) return false;
  const v = features[key];
  return typeof v === 'boolean' ? v : !!(v as { enabled: boolean })?.enabled;
}

// ─────────────────────────────────────────────────────────────────────────────
// เส้นทาง → ฟีเจอร์ที่ต้องเปิด — **ทะเบียนเดียวของทั้งระบบ**
//
// ก่อนหน้านี้การดักฟีเจอร์กระจายอยู่ 3 ที่ที่ไม่รู้จักกัน: ซ่อนเมนูใน Sidebar ·
// ล็อกสวิตช์ในหน้าตั้งค่า · if ตามหน้าบางหน้า — ผลคือ**ปิดฟีเจอร์แล้วเมนูหาย
// แต่พิมพ์ URL ตรงยังเข้าได้** และเพิ่มฟีเจอร์ใหม่ทีต้องไล่แก้หลายที่แล้วลืมบางที่
//
// ตอนนี้ประกาศที่นี่ที่เดียว แล้วมีสองตัวไปใช้ต่อ:
//   • `<FeatureGuard>` ใน Layout — ครอบทุกหน้าอัตโนมัติ ไม่ต้องแตะหน้าเดิม
//   • `featureForPath()` ฝั่ง API — ดักซ้ำที่ชั้นข้อมูล (UI อย่างเดียวกันคนยิงตรงไม่ได้)
//
// ⛔ หน้าที่ไม่อยู่ในทะเบียน = เปิดได้เสมอ (ตั้งใจ) — ห้ามใส่หน้าพื้นฐาน
//    (ออเดอร์ · สินค้า · ลูกค้า · แชท) เพราะไม่มีฟีเจอร์ไหนปิดมันได้
// ─────────────────────────────────────────────────────────────────────────────
import type { FeatureFlags } from '@/lib/features';

export interface FeatureRoute {
  /** ขึ้นต้นด้วย prefix นี้ = อยู่ใต้ฟีเจอร์นี้ */
  prefix: string;
  feature: keyof FeatureFlags;
  /** ชื่อที่ผู้ใช้เห็นในหน้าปิดกั้น */
  label: string;
}

/**
 * เรียงจาก **เจาะจงที่สุดก่อน** — ตัวแรกที่ match ชนะ
 * (`/settings/sales-channels` ต้องมาก่อน `/settings` ถ้าวันหนึ่งมีกฎของ `/settings`)
 */
export const FEATURE_ROUTES: FeatureRoute[] = [
  // ช่องทางขาย
  { prefix: '/pos',                        feature: 'pos',              label: 'Cashier (POS)' },
  { prefix: '/settings/pos-terminals',     feature: 'pos',              label: 'Cashier (POS)' },
  { prefix: '/pc',                         feature: 'counter_sales',    label: 'หน้าขาย PC ประจำห้าง' },
  { prefix: '/counter-sales',              feature: 'counter_sales',    label: 'ยอดขาย PC' },
  { prefix: '/settings/storefront',        feature: 'storefront',       label: 'หน้าร้านออนไลน์' },
  { prefix: '/marketplace',                feature: 'marketplace_sync', label: 'ซิงค์ Marketplace' },

  // ลูกค้าธุรกิจ
  { prefix: '/consignment',                feature: 'consignment',      label: 'ลูกค้าตัวแทน' },
  { prefix: '/replenishments',             feature: 'consignment',      label: 'ลูกค้าตัวแทน' },
  { prefix: '/dealer-orders',              feature: 'consignment',      label: 'ลูกค้าตัวแทน' },
  { prefix: '/settings/consignment',       feature: 'consignment',      label: 'ลูกค้าตัวแทน' },
  { prefix: '/department-store',           feature: 'department_store', label: 'ลูกค้าห้าง' },
  { prefix: '/department-orders',          feature: 'department_store', label: 'ลูกค้าห้าง' },
  { prefix: '/dept-wholesale-orders',      feature: 'department_store', label: 'ลูกค้าห้าง' },
  { prefix: '/settings/department-store',  feature: 'department_store', label: 'ลูกค้าห้าง' },

  // สินค้า & คลัง
  { prefix: '/inventory',                  feature: 'stock',            label: 'ระบบคลังสินค้า' },
  { prefix: '/settings/warehouses',        feature: 'stock',            label: 'ระบบคลังสินค้า' },
  { prefix: '/settings/brands',            feature: 'product_brand',    label: 'แบรนด์สินค้า' },
  { prefix: '/settings/suppliers',         feature: 'supplier',         label: 'ซัพพลายเออร์ / ใบสั่งซื้อ' },
  { prefix: '/reports/supplier',           feature: 'supplier',         label: 'ซัพพลายเออร์ / ใบสั่งซื้อ' },

  // การตลาด
  { prefix: '/marketing/broadcast',        feature: 'broadcast',        label: 'บรอดแคสต์' },
  { prefix: '/marketing/audiences',        feature: 'audience',         label: 'กลุ่มเป้าหมาย + Audience Sync' },
  { prefix: '/settings/ad-accounts',       feature: 'audience',         label: 'กลุ่มเป้าหมาย + Audience Sync' },

  // จัดส่ง
  { prefix: '/settings/delivery',          feature: 'delivery_zone',    label: 'พื้นที่จัดส่ง' },
];

/** หน้านี้อยู่ใต้ฟีเจอร์ไหน — ไม่อยู่ใต้อะไร = null (เปิดได้เสมอ) */
export function featureForPath(pathname: string | null | undefined): FeatureRoute | null {
  if (!pathname) return null;
  return FEATURE_ROUTES.find(
    r => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  ) ?? null;
}

/** ฟีเจอร์นี้ "เปิดอยู่" ไหม — รองรับทั้ง boolean และ `{enabled}` */
export function isFeatureOn(features: FeatureFlags, key: keyof FeatureFlags): boolean {
  const v = features[key];
  return typeof v === 'boolean' ? v : !!(v as { enabled: boolean })?.enabled;
}

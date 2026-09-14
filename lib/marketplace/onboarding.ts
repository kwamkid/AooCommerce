// ลำดับการตั้งร้าน marketplace ที่เพิ่งเชื่อมต่อ — ที่เดียวที่รู้ว่า "ร้านนี้ค้างขั้นไหน"
// (client-safe: ห้าม import อะไรที่เป็น server-only — โมดัลต้อนรับกับการ์ดร้านอ่านไฟล์นี้)
//
// ทำไมต้องเรียงลำดับ ไม่ใช่ให้เลือกอิสระว่าจะซิงค์สินค้าหรือสต็อก:
//   1. ดึง/ส่งสต็อกก่อนนำเข้าสินค้า = ยังไม่มี marketplace_product_links ให้เทียบ → ไม่มีอะไรเกิดขึ้น
//   2. เปิด auto sync ก่อนตั้งยอดตั้งต้น = ทุกครั้งที่สต็อกขยับ ระบบส่งยอดของคลังที่ยัง
//      ไม่เคยตั้ง (0) ขึ้นไปทับของจริงบนร้าน — ร้านปิดการขายเงียบ ๆ ทั้งร้าน
// ⇒ ห้ามสลับลำดับ และห้าม hard-code ลำดับนี้ซ้ำในหน้าไหนอีก

export type OnboardingStepKey = 'link_products' | 'init_stock' | 'auto_sync';

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  /** บรรทัดอธิบายว่าขั้นนี้ทำอะไร — ใช้ทั้งใน Stepper และแถบสถานะบนการ์ด */
  description: string;
  done: boolean;
  /** ทำขั้นนี้ไม่ได้จนกว่าขั้นก่อนหน้าจะเสร็จ */
  blocked: boolean;
  /** เสร็จแล้วแต่ผิดลำดับ — เปิด auto sync ทั้งที่ยังไม่ได้ตั้งยอด */
  warning?: string;
}

/** ร้านเท่าที่ขั้นตอนต้อนรับต้องรู้ — ไม่ผูกกับ type ของหน้าไหน */
export interface OnboardingAccount {
  linked_product_count: number;
  auto_sync_stock: boolean;
  metadata: Record<string, unknown> | null;
}

/** ตั้งยอดตั้งต้นแล้วหรือยัง — route ดึง/ส่งสต็อกทั้งร้านเป็นคนประทับเวลานี้ */
export function stockInitializedAt(account: OnboardingAccount): string | null {
  const raw = account.metadata?.stock_initialized_at;
  return typeof raw === 'string' ? raw : null;
}

export function marketplaceOnboardingSteps(
  account: OnboardingAccount,
  opts: { stockEnabled: boolean }
): OnboardingStep[] {
  const linked = account.linked_product_count > 0;
  const steps: OnboardingStep[] = [
    {
      key: 'link_products',
      label: 'นำเข้าสินค้า',
      description: 'ดึงรายการสินค้าจากร้านมาผูกกับสินค้าในระบบ — ขั้นนี้คือตัวเชื่อมที่ทุกอย่างหลังจากนี้ใช้',
      done: linked,
      blocked: false,
    },
  ];

  // แพ็กเกจที่ไม่มีระบบคลัง = จบที่ขั้นเดียว (ไม่มีอะไรให้ตั้งยอดหรือซิงค์)
  if (!opts.stockEnabled) return steps;

  const stockReady = stockInitializedAt(account) !== null;
  const autoOn = account.auto_sync_stock !== false;
  steps.push(
    {
      key: 'init_stock',
      label: 'ตั้งยอดสต็อกตั้งต้น',
      description: 'เลือกว่าจะยึดยอดของร้าน (ดึงลงมา) หรือยึดยอดในระบบ (ส่งขึ้นไป) — ทำครั้งเดียวตอนเริ่ม',
      done: stockReady,
      blocked: !linked,
    },
    {
      key: 'auto_sync',
      label: 'เปิดซิงค์สต็อกอัตโนมัติ',
      description: 'จากนี้ทุกครั้งที่สต็อกขยับ ระบบส่งยอดขึ้นร้านให้เอง',
      done: autoOn,
      blocked: !linked,
      warning:
        autoOn && !stockReady
          ? 'เปิดอยู่แล้วทั้งที่ยังไม่ได้ตั้งยอดตั้งต้น — ถ้าสต็อกขยับตอนนี้ ระบบจะส่งยอดของคลังที่ยังเป็น 0 ขึ้นไปทับของจริงบนร้าน'
          : undefined,
    }
  );
  return steps;
}

/** ขั้นที่ควรทำต่อ — ไม่มี = ตั้งครบแล้ว */
export function nextOnboardingStep(steps: OnboardingStep[]): OnboardingStep | null {
  return steps.find(s => !s.done) || null;
}

/** มีอะไรต้องเตือนบนการ์ดร้านไหม (ยังตั้งไม่ครบ หรือเปิด auto sync ผิดลำดับ) */
export function onboardingIncomplete(steps: OnboardingStep[]): boolean {
  return steps.some(s => !s.done || s.warning);
}

// แถบขั้นตอนการสั่งซื้อ — ตะกร้า → ข้อมูลจัดส่ง → ชำระเงิน
//
// เป็นแค่ตัวแปลง "หน้าไหนอยู่ขั้นไหน" แล้วส่งต่อให้ Stepper ตัวกลาง
// (หน้าตา/สี/ขนาด อยู่ที่ components/ui/Stepper + globals.css ที่เดียว)
//
// ขั้นที่ผ่านมาแล้วกดย้อนกลับได้ ขั้นที่ยังไม่ถึงกดไม่ได้ — ปล่อยให้ข้ามไปหน้า
// ชำระเงินโดยยังไม่กรอกที่อยู่จะเจอฟอร์มเปล่าแล้วงงว่าพัง
import Stepper, { type StepItem } from '@/components/ui/Stepper';
import { storefrontHref } from '@/lib/storefront';

export type CheckoutStep = 'cart' | 'info' | 'pay';

const STEPS: { key: CheckoutStep; label: string; path: string | null }[] = [
  { key: 'cart', label: 'ตะกร้า', path: '/cart' },
  { key: 'info', label: 'ข้อมูลจัดส่ง', path: '/checkout' },
  { key: 'pay', label: 'ชำระเงิน', path: null },
];

export default function CheckoutSteps({ shop, current }: { shop: string; current: CheckoutStep }) {
  const at = STEPS.findIndex(s => s.key === current);
  const steps: StepItem[] = STEPS.map((s, i) => ({
    key: s.key,
    label: s.label,
    state: i < at ? 'done' : i === at ? 'current' : 'todo',
    href: i < at && s.path ? storefrontHref(shop, s.path) : undefined,
  }));

  return (
    <Stepper
      steps={steps}
      layout="inline"
      ariaLabel="ขั้นตอนการสั่งซื้อ"
      className="sf-checkout-steps"
    />
  );
}

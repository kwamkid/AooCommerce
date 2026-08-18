// แถบขั้นตอนการสั่งซื้อ — ตะกร้า → ข้อมูลจัดส่ง → ชำระเงิน
//
// ขั้นที่ผ่านมาแล้วกดย้อนกลับได้ (เป็น <Link>) ขั้นที่ยังไม่ถึงกดไม่ได้ —
// ปล่อยให้ข้ามไปหน้าชำระเงินโดยยังไม่กรอกที่อยู่จะเจอฟอร์มเปล่าแล้วงงว่าพัง
import Link from 'next/link';
import { Check } from 'lucide-react';
import { storefrontHref } from '@/lib/storefront';

export type CheckoutStep = 'cart' | 'info' | 'pay';

const STEPS: { key: CheckoutStep; label: string; path: string | null }[] = [
  { key: 'cart', label: 'ตะกร้า', path: '/cart' },
  { key: 'info', label: 'ข้อมูลจัดส่ง', path: '/checkout' },
  { key: 'pay', label: 'ชำระเงิน', path: null },
];

export default function CheckoutSteps({ shop, current }: { shop: string; current: CheckoutStep }) {
  const at = STEPS.findIndex(s => s.key === current);

  return (
    <ol className="sf-steps" aria-label="ขั้นตอนการสั่งซื้อ">
      {STEPS.map((s, i) => {
        const state = i < at ? 'done' : i === at ? 'now' : 'next';
        const body = (
          <>
            <span className="sf-step-dot">
              {state === 'done' ? <Check strokeWidth={3} aria-hidden="true" /> : i + 1}
            </span>
            <span className="sf-step-label">{s.label}</span>
          </>
        );
        return (
          <li
            key={s.key}
            className={`sf-step sf-step-${state}`}
            aria-current={state === 'now' ? 'step' : undefined}
          >
            {state === 'done' && s.path ? (
              <Link href={storefrontHref(shop, s.path)} className="sf-step-in">{body}</Link>
            ) : (
              <span className="sf-step-in">{body}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// Path: components/ui/Stepper.tsx
// แถบขั้นตอนของทั้งระบบ — ตัวเดียว ใช้ทั้งตอนสั่งซื้อและตอนติดตามออเดอร์
//
// เดิมมีสองตัว (CheckoutSteps ใช้ CSS .sf-step*, OrderProgress ใช้ inline style)
// พอแก้ทีละที่ก็หลุดกันเรื่อย ๆ — สีคนละเฉด ขนาดตัวอักษร 13 กับ 14 เส้นเชื่อม
// ชนวงบ้างไม่ชนบ้าง · ตอนนี้เหลือที่เดียว แก้ทีเดียวเปลี่ยนหมด
//
// มี layout เดียวเท่านั้น (ชื่ออยู่ใต้วง) — เคยมี inline/stacked ให้เลือก แล้วสอง
// แถบก็หน้าตาไม่ตรงกันอยู่ดีทั้งที่เป็น component เดียวกัน · ถ้าจะเพิ่ม layout ใหม่
// ให้คิดก่อนว่าคุ้มกับการที่ผู้ใช้เห็นสองแบบในเว็บเดียวไหม
//
// ภาษาที่ใช้ (ห้ามเปลี่ยนเฉพาะที่ใดที่หนึ่ง):
//   ผ่านแล้ว  = วงทึบ + ติ๊ก
//   กำลังทำ   = วงขอบสีเน้น + เลข
//   ยังไม่ถึง = วงขอบเทา + เลข
//   เส้นเชื่อมเว้นช่องว่างจากวงกลม ไม่ลากชน
//
// สีอยู่ที่ --step-color / --step-ink ใน globals.css (ไม่ผูกกับสีแบรนด์ร้าน
// เพราะเป็นภาษาบอกความคืบหน้าของระบบ ควรหมายถึงสิ่งเดียวกันทุกร้าน)
'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';

export type StepState = 'done' | 'current' | 'todo';

export interface StepItem {
  key: string;
  label: string;
  /** บรรทัดขยายใต้ชื่อขั้น — ใส่เฉพาะขั้นที่กำลังทำอยู่ */
  note?: string;
  state: StepState;
  /** กดย้อนกลับไปขั้นนั้นได้ — ใส่เฉพาะขั้นที่ผ่านแล้วและย้อนได้จริง */
  href?: string;
}

interface Props {
  steps: StepItem[];
  /** หน้าที่สลับธีมเองด้วยตัวแปร JS (บิลออนไลน์) — ไม่ใช่ class .dark ของ Tailwind */
  dark?: boolean;
  ariaLabel?: string;
  className?: string;
}

export default function Stepper({
  steps, dark = false, ariaLabel = 'ขั้นตอน', className = '',
}: Props) {
  return (
    <ol
      aria-label={ariaLabel}
      className={`stepper${dark ? ' stepper-dark' : ''}${className ? ` ${className}` : ''}`}
    >
      {steps.map((s, i) => {
        const prevDone = i > 0 && steps[i - 1].state === 'done';
        const body = (
          <>
            <span className="stepper-dot">
              {s.state === 'done' ? <Check strokeWidth={3} aria-hidden="true" /> : i + 1}
            </span>
            <span className="stepper-label">
              {s.label}
              {s.note && <span className="stepper-note">{s.note}</span>}
            </span>
          </>
        );
        return (
          <li
            key={s.key}
            className={`stepper-step stepper-${s.state}${prevDone ? ' stepper-after-done' : ''}`}
            aria-current={s.state === 'current' ? 'step' : undefined}
          >
            {s.href && s.state === 'done'
              ? <Link href={s.href} className="stepper-in">{body}</Link>
              : <span className="stepper-in">{body}</span>}
          </li>
        );
      })}
    </ol>
  );
}

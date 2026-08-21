// Path: components/ui/OrderProgress.tsx
// แถบ "ออเดอร์ถึงขั้นไหนแล้ว" — ใช้ทั้งหน้าร้าน (/store/.../order) และบิลออนไลน์ (/bills)
//
// เขียนด้วย inline style ล้วน ไม่พึ่ง Tailwind และไม่พึ่ง sf-* เพราะสองหน้านี้
// อยู่คนละระบบ CSS กัน — ตัวเดียวจึงวางได้ทั้งคู่โดยไม่ต้อง copy markup สองชุด
// สี/โทนรับผ่าน props (บิลออนไลน์มีโหมดมืด หน้าร้านสว่างอย่างเดียว)
'use client';

import { X } from 'lucide-react';
import { getOrderProgress } from '@/lib/order-progress';
import Stepper, { type StepItem } from './Stepper';

interface Props {
  order: { order_status: string; payment_status: string; is_cancelled?: boolean | null; is_expired?: boolean | null };
  dark?: boolean;
}

export default function OrderProgress({ order, dark = false }: Props) {
  const { steps, cancelled, cancelledLabel } = getOrderProgress(order);

  if (cancelled) {
    return (
      <div
        role="status"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
          borderRadius: 10, background: dark ? 'rgba(220,38,38,.15)' : '#fef2f2',
          color: dark ? '#fca5a5' : '#b91c1c', fontSize: 15, fontWeight: 500,
        }}
      >
        <X size={17} strokeWidth={2.5} aria-hidden="true" />
        {cancelledLabel}
      </div>
    );
  }

  const items: StepItem[] = steps.map(s => ({
    key: s.key,
    label: s.label,
    note: s.note,
    state: s.state,
  }));

  return <Stepper steps={items} layout="stacked" dark={dark} ariaLabel="สถานะคำสั่งซื้อ" />;
}

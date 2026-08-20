// Path: components/ui/OrderProgress.tsx
// แถบ "ออเดอร์ถึงขั้นไหนแล้ว" — ใช้ทั้งหน้าร้าน (/store/.../order) และบิลออนไลน์ (/bills)
//
// เขียนด้วย inline style ล้วน ไม่พึ่ง Tailwind และไม่พึ่ง sf-* เพราะสองหน้านี้
// อยู่คนละระบบ CSS กัน — ตัวเดียวจึงวางได้ทั้งคู่โดยไม่ต้อง copy markup สองชุด
// สี/โทนรับผ่าน props (บิลออนไลน์มีโหมดมืด หน้าร้านสว่างอย่างเดียว)
'use client';

import { Check, X } from 'lucide-react';
import { getOrderProgress } from '@/lib/order-progress';

interface Props {
  order: { order_status: string; payment_status: string; is_cancelled?: boolean | null; is_expired?: boolean | null };
  dark?: boolean;
}

export default function OrderProgress({ order, dark = false }: Props) {
  const { steps, cancelled, cancelledLabel } = getOrderProgress(order);

  const muted = dark ? '#94a3b8' : '#9ca3af';
  const text = dark ? '#e2e8f0' : '#111827';
  const line = dark ? '#334155' : '#e5e7eb';
  // อ่านสีผ่าน CSS variable เพื่อให้ลองสีสดได้จากแผง ColorLab ตอน dev
  // (ค่าหลัง comma คือค่าจริงที่ใช้ใน production)
  const doneColor = 'var(--op-done, #15803d)';
  // ขั้นที่กำลังทำอยู่ใช้สีกลาง ไม่ใช่สีแบรนด์ร้าน — ร้านที่แบรนด์เป็นโทนแดง
  // จะได้จุดแดงกลางแถบสถานะ ซึ่งอ่านเป็น "ผิดพลาด" ทั้งที่ทุกอย่างปกติดี
  const currentColor = dark ? 'var(--op-current-dark, #e2e8f0)' : 'var(--op-current, #1f2937)';
  const currentInk = dark ? '#0f172a' : '#ffffff';
  const currentRing = `color-mix(in srgb, ${currentColor} 16%, transparent)`;

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

  return (
    <ol
      aria-label="สถานะคำสั่งซื้อ"
      style={{ display: 'flex', listStyle: 'none', margin: 0, padding: 0, width: '100%' }}
    >
      {steps.map((s, i) => {
        const color = s.state === 'done' ? doneColor : s.state === 'current' ? currentColor : muted;
        const filled = s.state !== 'todo';
        return (
          <li
            key={s.key}
            aria-current={s.state === 'current' ? 'step' : undefined}
            style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
          >
            {/* จุด + เส้นเชื่อม — เส้นวาดสองข้างของจุด จะได้ชิดจุดพอดีทุกความกว้าง */}
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <span style={{ flex: 1, height: 2, background: i === 0 ? 'transparent' : (steps[i - 1].state === 'done' ? doneColor : line) }} />
              <span
                style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${color}`,
                  background: filled ? color : 'transparent',
                  color: filled ? (s.state === 'current' ? currentInk : '#fff') : muted,
                  fontSize: 13, fontWeight: 600, lineHeight: 1,
                  // ขั้นที่กำลังทำอยู่ต้องเด่นกว่าขั้นที่ผ่านมาแล้ว ไม่งั้นตาไปหยุดที่ขั้นสุดท้ายที่เป็นสีเขียว
                  boxShadow: s.state === 'current' ? `0 0 0 4px ${currentRing}` : undefined,
                }}
              >
                {s.state === 'done' ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : i + 1}
              </span>
              <span style={{ flex: 1, height: 2, background: i === steps.length - 1 ? 'transparent' : (s.state === 'done' ? doneColor : line) }} />
            </div>
            <span
              style={{
                // จอ 390px ต้องวาง 5 ขั้นให้พอดี — ป้ายเล็กลงนิดแต่ยังอ่านออก
                fontSize: 12.5, lineHeight: 1.35, textAlign: 'center', padding: '0 3px',
                color: s.state === 'todo' ? muted : text,
                fontWeight: s.state === 'current' ? 600 : 400,
              }}
            >
              {s.label}
              {s.note && (
                <span style={{ display: 'block', fontSize: 11.5, marginTop: 1, color: muted, fontWeight: 400 }}>
                  {s.note}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

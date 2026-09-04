'use client';

import { useEffect, type RefObject } from 'react';

/**
 * ปัดขวาเพื่อย้อนกลับ — ท่าที่คนคาดหวังจากแอปแชททุกตัวบนมือถือ
 *
 * ใช้กับหน้าจอที่ "ซ้อนทับ" หน้าก่อนหน้าในมุมมองมือถือ (เช่นหน้าคุยที่ทับรายชื่อแชท)
 * ซึ่งเบราว์เซอร์ไม่มีท่าย้อนกลับให้เอง เพราะไม่ได้เปลี่ยน URL
 *
 * เกณฑ์ตั้งใจให้ "ตั้งใจปัดจริงเท่านั้น" ถึงจะติด — ไม่งั้นเลื่อนอ่านข้อความแล้วเด้งออกเอง:
 *   ปัดไปขวาเกิน 80px · เบี่ยงแนวตั้งไม่เกิน 60px · แนวนอนต้องชัดกว่าแนวตั้งอย่างน้อย 2 เท่า
 *   · จบภายใน 600ms (ปัด ไม่ใช่ลาก) · นิ้วเดียว
 *
 * ข้ามให้อัตโนมัติเมื่อเริ่มปัดจากในกล่องที่เลื่อนแนวนอนได้เอง หรือช่องกรอกข้อความ —
 * ครอบ element ที่ไม่อยากให้ปัดด้วย `data-no-swipe-back` ได้
 */
export function useSwipeBack(
  ref: RefObject<HTMLElement | null>,
  onBack: () => void,
  enabled: boolean
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let startX = 0;
    let startY = 0;
    let startAt = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      tracking = false;
      if (e.touches.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-no-swipe-back], input, textarea, select, [contenteditable="true"]')) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startAt = e.timeStamp;
      tracking = true;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = e.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (dx < 80) return;
      if (Math.abs(dy) > 60) return;
      if (dx < Math.abs(dy) * 2) return;
      if (e.timeStamp - startAt > 600) return;
      onBack();
    };

    // passive — แค่ฟัง ไม่ preventDefault จึงไม่ไปขวางการเลื่อนอ่านข้อความ
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [ref, onBack, enabled]);
}

'use client';

import { useEffect } from 'react';

/**
 * กันล้อเมาส์/สองนิ้วบนแทร็กแพดเปลี่ยนค่าใน `<input type="number">` ทั้งเว็บ
 *
 * เบราว์เซอร์ถือว่าการเลื่อนบนช่องตัวเลขที่ focus อยู่ = การปรับค่าทีละ `step`
 * ผู้ใช้ที่พิมพ์เสร็จแล้วเลื่อนหน้าจอต่อจึงได้ตัวเลขเพี้ยนแบบ "เกือบถูก" โดยไม่มี
 * อะไรเตือน — ค่าส่ง 100 กลายเป็น 99.96 (step 0.01 × 4 จังหวะ) ทั้งบิลจริง
 * ORD-202609-0017 เมื่อ 7 ก.ย. 2026 → ยอดเก็บเงินลูกค้าผิดตามไปด้วย
 *
 * `NumberInput` กันในตัวเองอยู่แล้ว ตัวนี้ครอบช่อง `type="number"` ดิบ ๆ ที่ยัง
 * เหลืออยู่อีก 40+ จุด (ราคาสินค้า ต้นทุน ส่วนลด สต็อก ฯลฯ) — blur ไม่ใช่
 * preventDefault เพื่อให้หน้ายังเลื่อนได้ตามปกติ
 */
export default function NumberWheelGuard() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || el !== document.activeElement) return;
      if (el.tagName !== 'INPUT' || (el as HTMLInputElement).type !== 'number') return;
      (el as HTMLInputElement).blur();
    };
    document.addEventListener('wheel', onWheel, { passive: true, capture: true });
    return () => document.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  return null;
}

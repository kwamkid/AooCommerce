'use client';

import { useEffect } from 'react';
import { registerServiceWorker, clearAppBadge } from '@/lib/push/client';
import { initInstallPromptCapture } from '@/lib/pwa-install';

// ลงทะเบียน service worker ตอนเปิดแอพ (แค่ register — ยังไม่ขอ permission แจ้งเตือน)
// + ล้างเลขบนไอคอนแอปเมื่อผู้ใช้ "เห็น" ของใหม่จริง ๆ
export default function PwaRegister() {
  useEffect(() => {
    // รับช่วง beforeinstallprompt ที่ inline script ใน layout เก็บไว้ให้ (idempotent)
    initInstallPromptCapture();
    registerServiceWorker();

    // เลขบนไอคอนหมายถึง "มีเรื่องที่ยังไม่ได้ดู" — ต้องหายตอนผู้ใช้เห็นแล้ว
    // ไม่งั้นเลขค้างจนคนเลิกเชื่อ แล้ววันที่มีเรื่องจริงก็จะโดนมองข้าม
    //
    // เปิดแอปมาใหม่ (mount) = เขากดไอคอนที่มีเลขติดอยู่เข้ามาเอง = เห็นแล้วแน่นอน → ล้างทันที
    //
    // ⚠️ แต่ "กลับมาเห็นหน้าจอ" ไม่ได้แปลว่าเห็นเลขเสมอไป — เคสที่ทำให้ผู้ใช้บ่นว่า
    // "เลขบนไอคอนมีบ้างไม่มีบ้าง" คือ เปิดแอปค้างไว้แล้วล็อกจอ → push เข้า เลขขึ้นบนไอคอน
    // → พอปลดล็อก แอปเด้งกลับมาข้างหน้าเองโดยที่เขายังไม่ได้แตะอะไรเลย ถ้าล้างตรงนี้
    // เลขจะหายไปก่อนที่เขาจะได้กลับไปมองหน้า home screen ด้วยซ้ำ
    // → ตอนกลับมา visible แค่ "ตั้งท่ารอ" ไว้ แล้วล้างจริงเมื่อเขาแตะ/กดปุ่มครั้งแรก
    let disarm: (() => void) | null = null;

    const cancelArm = () => {
      disarm?.();
      disarm = null;
    };

    const arm = () => {
      if (disarm) return;
      const onInteract = () => {
        cancelArm();
        clearAppBadge();
      };
      // capture: true — จับให้ได้ก่อนที่ handler ของหน้าจะ stopPropagation
      document.addEventListener('pointerdown', onInteract, true);
      document.addEventListener('keydown', onInteract, true);
      disarm = () => {
        document.removeEventListener('pointerdown', onInteract, true);
        document.removeEventListener('keydown', onInteract, true);
      };
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') arm();
      // ปิดจอ/สลับไปแอปอื่น = ปลดท่ารอ เลขที่เข้ามาตอนอยู่หลังบ้านจะได้อยู่รอด
      // จนกว่าเขาจะกลับมาแตะแอปจริง ๆ
      else cancelArm();
    };

    clearAppBadge();
    document.addEventListener('visibilitychange', onVisibility);
    // bfcache: กลับมาจากปุ่ม back ไม่ยิง visibilitychange เสมอไป
    window.addEventListener('pageshow', arm);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', arm);
      cancelArm();
    };
  }, []);
  return null;
}

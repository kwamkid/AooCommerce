'use client';

import { useEffect } from 'react';
import { registerServiceWorker, clearAppBadge } from '@/lib/push/client';
import { initInstallPromptCapture } from '@/lib/pwa-install';

// ลงทะเบียน service worker ตอนเปิดแอพ (แค่ register — ยังไม่ขอ permission แจ้งเตือน)
// + ล้างเลขบนไอคอนแอปทุกครั้งที่ผู้ใช้กลับมาเห็นหน้าจอ
export default function PwaRegister() {
  useEffect(() => {
    // รับช่วง beforeinstallprompt ที่ inline script ใน layout เก็บไว้ให้ (idempotent)
    initInstallPromptCapture();
    registerServiceWorker();

    // เลขบนไอคอนหมายถึง "มีเรื่องที่ยังไม่ได้ดู" — พอเปิดแอปมาเห็นแล้วต้องหายทันที
    // ไม่งั้นเลขค้างจนคนเลิกเชื่อ แล้ววันที่มีเรื่องจริงก็จะโดนมองข้าม
    const clear = () => {
      if (document.visibilityState === 'visible') clearAppBadge();
    };
    clear();
    document.addEventListener('visibilitychange', clear);
    return () => document.removeEventListener('visibilitychange', clear);
  }, []);
  return null;
}

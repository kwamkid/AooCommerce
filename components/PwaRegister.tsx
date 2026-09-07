'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { registerServiceWorker } from '@/lib/push/client';
import { initInstallPromptCapture } from '@/lib/pwa-install';
import { isNativeApp, bindNativeNavigation } from '@/lib/native/bridge';

// ลงทะเบียน service worker ตอนเปิดแอพ (แค่ register — ยังไม่ขอ permission แจ้งเตือน)
//
// เลขบนไอคอนแอป **ไม่ได้ล้างที่นี่แล้ว** — เลขคือ "ข้อความแชทที่ยังไม่อ่าน" จริงจากเซิร์ฟเวอร์
// (lib/push/badge.ts) ตั้งโดย HeaderSummaryProvider ทุกครั้งที่ตัวเลขในแอปเปลี่ยน และแนบมากับ push
// ทุกใบ · ของเดิมนับ push ในเครื่องแล้วล้างตอนเปิดแอป ทำให้ "เปิดแอปปุ๊บเลขหายทั้งที่ยังอ่านไม่หมด"
// (ผู้ใช้ตีกลับ 7 ก.ย. 2026 — ดู fix-bug.md)
export default function PwaRegister() {
  const router = useRouter();
  useEffect(() => {
    if (isNativeApp()) {
      // เปลือกแอป native (mobile/): ไม่มี service worker · แจ้งเตือน+เลขบนไอคอนเป็นของ OS
      // ฟังการแตะแจ้งเตือน/Universal Link ให้พาไปหน้าที่ถูก — เลขบนไอคอน provider ตั้งให้เหมือน PWA
      return bindNativeNavigation((path) => router.push(path));
    }
    // รับช่วง beforeinstallprompt ที่ inline script ใน layout เก็บไว้ให้ (idempotent)
    initInstallPromptCapture();
    registerServiceWorker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

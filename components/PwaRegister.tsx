'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/lib/push/client';

// ลงทะเบียน service worker ตอนเปิดแอพ (แค่ register — ยังไม่ขอ permission แจ้งเตือน)
export default function PwaRegister() {
  useEffect(() => {
    registerServiceWorker();
  }, []);
  return null;
}

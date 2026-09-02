// Web Push client helpers (browser only) — จัดการ service worker + subscription ของ device นี้
'use client';

import { apiFetch } from '@/lib/api-client';

/**
 * สายแจ้งเตือนของ device นี้ — คนละสาย = คนละ service worker scope = คนละ subscription
 * 'app'        = แอปของร้าน (เรื่องที่ร้านแก้เอง: token หมด แชทหมดอายุ ออเดอร์ใหม่ แชทเข้า)
 * 'superadmin' = แอปผู้ดูแลระบบ (เรื่องระบบ: cron ตาย webhook ตกค้าง โควตาโดนแบน)
 *
 * ⚠️ scope ต้องตรงกับ `scope` ใน manifest ของแต่ละแอป — เปลี่ยนที่นี่ต้องเปลี่ยนที่นั่นด้วย
 */
export type PushAudience = 'app' | 'superadmin';

const PUSH_SCOPES: Record<PushAudience, string> = {
  app: '/',
  superadmin: '/superadmin/',
};

export type PushState =
  | 'unsupported'       // browser ไม่รองรับ push เลย
  | 'ios-needs-install' // iPhone/iPad ยังไม่ได้ Add to Home Screen (push ใช้ได้เฉพาะใน installed PWA)
  | 'denied'            // user เคยกดปฏิเสธ permission — ต้องไปเปิดเองใน browser settings
  | 'subscribed'        // เปิดแจ้งเตือนอยู่
  | 'unsubscribed';     // รองรับแต่ยังไม่เปิด

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/**
 * ลงทะเบียน service worker ของสายนั้น (idempotent — เรียกซ้ำได้)
 * ใช้ไฟล์ /sw.js ตัวเดียวกันทั้งสองสาย แต่จดคนละ scope → เบราว์เซอร์นับเป็นคนละ
 * registration → `pushManager.subscribe()` ได้คนละ endpoint = แยกสายกันได้จริง
 */
export async function registerServiceWorker(
  audience: PushAudience = 'app'
): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: PUSH_SCOPES[audience] });
  } catch (err) {
    console.error('[Push] SW register failed:', err);
    return null;
  }
}

export async function getPushState(audience: PushAudience = 'app'): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration(PUSH_SCOPES[audience]);
    // getRegistration คืนตัวที่คุม path นั้น — ถ้ายังไม่ได้จด scope ย่อย จะได้ตัว '/' มาแทน
    // ต้องเช็ค scope จริงด้วย ไม่งั้นแอปแอดมินจะรายงานว่า "เปิดอยู่แล้ว" ทั้งที่ยังไม่เคยเปิด
    if (!reg || !reg.scope.endsWith(PUSH_SCOPES[audience])) return 'unsubscribed';
    const sub = await reg.pushManager.getSubscription();
    return sub ? 'subscribed' : 'unsubscribed';
  } catch {
    return 'unsubscribed';
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(rawData, (c) => c.charCodeAt(0));
}

/** ขอ permission + subscribe + บันทึกลง server — คืน state ใหม่ */
export async function enablePush(audience: PushAudience = 'app'): Promise<PushState> {
  const state = await getPushState(audience);
  if (state === 'unsupported' || state === 'ios-needs-install' || state === 'denied') return state;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'unsubscribed';

  const reg = await registerServiceWorker(audience);
  if (!reg) return 'unsupported';

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    console.error('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set');
    return 'unsupported';
  }

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  const json = sub.toJSON();
  await apiFetch('/api/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, audience }),
  });
  return 'subscribed';
}

/** ยกเลิกแจ้งเตือนของ device นี้ */
export async function disablePush(audience: PushAudience = 'app'): Promise<PushState> {
  try {
    const reg = await navigator.serviceWorker.getRegistration(PUSH_SCOPES[audience]);
    const sub = reg && reg.scope.endsWith(PUSH_SCOPES[audience])
      ? await reg.pushManager.getSubscription()
      : null;
    if (sub) {
      await apiFetch('/api/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {}); // server ลบไม่ได้ก็ยัง unsubscribe ฝั่ง browser ต่อ
      await sub.unsubscribe();
    }
  } catch (err) {
    console.error('[Push] disable failed:', err);
  }
  return 'unsubscribed';
}

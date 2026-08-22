// Web Push client helpers (browser only) — จัดการ service worker + subscription ของ device นี้
'use client';

import { apiFetch } from '@/lib/api-client';

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

/** ลงทะเบียน service worker (idempotent — เรียกซ้ำได้) */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.error('[Push] SW register failed:', err);
    return null;
  }
}

export async function getPushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIos() && !isStandalone()) return 'ios-needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
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
export async function enablePush(): Promise<PushState> {
  const state = await getPushState();
  if (state === 'unsupported' || state === 'ios-needs-install' || state === 'denied') return state;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'unsubscribed';

  const reg = (await registerServiceWorker()) || (await navigator.serviceWorker.ready);
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
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  return 'subscribed';
}

/** ยกเลิกแจ้งเตือนของ device นี้ */
export async function disablePush(): Promise<PushState> {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
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

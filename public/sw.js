// AooCommerce service worker — รับ web push + จัดการคลิกแจ้งเตือน + เลขบนไอคอนแอป
// ตั้งใจไม่ทำ offline caching — ให้ Next.js จัดการ asset เอง (กัน stale cache bug)

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── เลขบนไอคอนแอป (Badging API) ────────────────────────────────────────────
// iOS/Android **ไม่ได้** เอาจำนวนแจ้งเตือนมาแปะไอคอนให้เอง สำหรับ PWA — ต้องเรียก
// navigator.setAppBadge() เองทุกครั้ง (iOS 16.4+ เฉพาะแอปที่ติดตั้งแล้ว)
//
// service worker ถูกปลุก-ฆ่าเป็นรอบ ๆ ตัวแปรใน memory จึงอยู่ไม่รอด — เก็บตัวนับไว้
// ใน Cache API (คีย์-ค่าเล็ก ๆ ที่ SW เข้าถึงได้ ไม่ต้องแบก IndexedDB มาทั้งก้อน)
const BADGE_CACHE = 'aoo-badge';
const BADGE_KEY = '/__badge_count';

async function readBadgeCount() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const res = await cache.match(BADGE_KEY);
    if (!res) return 0;
    const n = parseInt(await res.text(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

async function writeBadgeCount(n) {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.put(BADGE_KEY, new Response(String(n)));
  } catch { /* โควตาเต็ม/โหมดส่วนตัว — ตัวนับพลาดได้ ไม่คุ้มให้ push ทั้งใบล้ม */ }
}

/** บวกตัวนับแล้วแปะเลขบนไอคอน — เงียบเสมอเมื่อเบราว์เซอร์ไม่รองรับ */
async function bumpBadge() {
  const next = (await readBadgeCount()) + 1;
  await writeBadgeCount(next);
  if (self.navigator && 'setAppBadge' in self.navigator) {
    try { await self.navigator.setAppBadge(next); } catch { /* ไม่รองรับ/ไม่ได้ติดตั้ง */ }
  }
}

/** ล้างเลขบนไอคอน — เรียกตอนผู้ใช้เปิดแอปมาอ่านแล้ว */
async function clearBadge() {
  await writeBadgeCount(0);
  if (self.navigator && 'clearAppBadge' in self.navigator) {
    try { await self.navigator.clearAppBadge(); } catch { /* ignore */ }
  }
}

self.addEventListener('push', (event) => {
  let payload = { title: 'AooCommerce', body: '', url: '/', tag: undefined, icon: undefined };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        // ไอคอนมาจาก payload ได้ — แอปผู้ดูแลระบบส่งไอคอนของตัวเองมา จะได้แยกออก
        // ตั้งแต่ยังไม่กดอ่านว่าเป็นเรื่องระบบหรือเรื่องร้าน
        icon: payload.icon || '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        data: { url: payload.url },
      }),
      bumpBadge(),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    Promise.all([
      clearBadge(),
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        // มีแท็บ/แอพเปิดอยู่แล้ว → focus แล้วนำทางไปหน้าเป้าหมาย
        for (const client of clients) {
          if ('focus' in client) {
            client.focus();
            if ('navigate' in client && client.url !== new URL(url, self.location.origin).href) {
              return client.navigate(url).catch(() => {});
            }
            return;
          }
        }
        return self.clients.openWindow(url);
      }),
    ])
  );
});

// หน้าเว็บบอกมาว่า "ผู้ใช้เปิดแอปมาดูแล้ว" → ล้างเลข
// (ตัวหน้าเว็บเรียก clearAppBadge ของตัวเองด้วย แต่ตัวนับอยู่ที่ SW จึงต้องบอกให้ reset)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'clear-badge') {
    event.waitUntil(clearBadge());
  }
});

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
//
// นอกจากตัวนับ ยังจด "ครั้งล่าสุดที่พยายามตั้ง/ล้างเลข" ไว้ด้วย (BADGE_LAST_PUSH /
// BADGE_LAST_CLEAR) — เพราะเลขบนไอคอน "มีบ้างไม่มีบ้าง" เป็นอาการที่ดูจากข้างนอกไม่ออก
// เลยว่าตายที่ไหน: SW ไม่ได้ถูกปลุก · setAppBadge ไม่รองรับ/โยน error · หรือถูกล้างไป
// ก่อนผู้ใช้ทันเห็น · หน้าเว็บขอดูบันทึกนี้ผ่าน message 'badge-status' แล้วโชว์ใน
// สวิตช์แจ้งเตือน (PushNotificationToggle) จะได้มีหลักฐานแทนการเดา
const BADGE_CACHE = 'aoo-badge';
const BADGE_KEY = '/__badge_count';
const BADGE_LAST_PUSH = '/__badge_last_push';
const BADGE_LAST_CLEAR = '/__badge_last_clear';

// Cache API ตอบช้าผิดปกติได้ตอน SW เพิ่งถูกปลุกจากศูนย์ (storage ยังไม่ตื่น) — รอเกินนี้
// ให้ถือว่าอ่านไม่ได้แล้วตั้งเลขไปก่อน ดีกว่ารอจน iOS ฆ่า SW แล้วไม่มีเลขเลย
const BADGE_READ_TIMEOUT_MS = 1500;

function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); }
    );
  });
}

async function cacheReadText(key) {
  const cache = await caches.open(BADGE_CACHE);
  const res = await cache.match(key);
  return res ? res.text() : null;
}

async function cacheWriteText(key, text) {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.put(key, new Response(text));
  } catch { /* โควตาเต็ม/โหมดส่วนตัว — บันทึกพลาดได้ ไม่คุ้มให้ push ทั้งใบล้ม */ }
}

/** อ่านตัวนับ — คืน null เมื่ออ่านไม่ได้/ช้าเกิน (ต่างจาก 0 = อ่านได้แต่ยังไม่มี) */
async function readBadgeCount() {
  const text = await withTimeout(cacheReadText(BADGE_KEY), BADGE_READ_TIMEOUT_MS, undefined);
  if (text === undefined) return null;
  if (text === null) return 0;
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function readJson(key) {
  try {
    const text = await withTimeout(cacheReadText(key), BADGE_READ_TIMEOUT_MS, null);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function badgeSupported() {
  return !!(self.navigator && 'setAppBadge' in self.navigator);
}

// ตัวนับเป็นแบบ "อ่านแล้วเขียนทับ" — push สองใบที่มาพร้อมกันจะอ่านค่าเดิมพร้อมกัน
// (ทั้งคู่อ่าน 0 → ทั้งคู่เขียน 1) แล้วเลขบนไอคอนจะหายไปหนึ่งใบทุกครั้งที่ลูกค้าทัก
// ติด ๆ กัน — ต่อคิวงานตัวนับไว้เส้นเดียว ใบหลังจึงอ่านค่าที่ใบก่อนเขียนไปแล้วเสมอ
// (ใส่ body ทั้งขา resolve และ reject เพื่อให้คิวเดินต่อแม้ใบก่อนหน้าจะล้ม)
let badgeOp = Promise.resolve();
function queueBadgeOp(body) {
  badgeOp = badgeOp.then(body, body);
  return badgeOp;
}

/**
 * บวกตัวนับแล้วแปะเลขบนไอคอน — เงียบเสมอเมื่อเบราว์เซอร์ไม่รองรับ
 *
 * ลำดับสำคัญ: **ตั้งเลขก่อน แล้วค่อยเขียนตัวนับลง cache** — สิ่งที่ผู้ใช้ต้องเห็นคือเลข
 * บนไอคอน ตัวนับเป็นแค่ความจำสำหรับใบถัดไป ถ้า SW โดนฆ่ากลางทางให้เสียตัวนับ
 * ไม่ใช่เสียเลข · อ่านตัวนับไม่ได้ (timeout) ก็ตั้งเป็น 1 ไปก่อน
 */
function bumpBadge() {
  return queueBadgeOp(async () => {
    const read = await readBadgeCount();
    const next = (read === null ? 0 : read) + 1;
    const record = {
      at: Date.now(),
      count: next,
      source: read === null ? 'timeout' : 'cache',
      supported: badgeSupported(),
      ok: false,
      error: null,
    };
    if (record.supported) {
      try {
        await self.navigator.setAppBadge(next);
        record.ok = true;
      } catch (e) {
        record.error = String((e && e.message) || e);
      }
    }
    await cacheWriteText(BADGE_KEY, String(next));
    await cacheWriteText(BADGE_LAST_PUSH, JSON.stringify(record));
  });
}

/** ล้างเลขบนไอคอน — เรียกตอนผู้ใช้เปิดแอปมาอ่านแล้ว · `reason` เก็บไว้ดูว่าใครสั่งล้าง */
function clearBadge(reason) {
  return queueBadgeOp(async () => {
    const record = { at: Date.now(), reason: reason || 'unknown', supported: badgeSupported(), ok: false, error: null };
    if (record.supported) {
      try {
        await self.navigator.clearAppBadge();
        record.ok = true;
      } catch (e) {
        record.error = String((e && e.message) || e);
      }
    }
    await cacheWriteText(BADGE_KEY, '0');
    await cacheWriteText(BADGE_LAST_CLEAR, JSON.stringify(record));
  });
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
      clearBadge('notification-click'),
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

// หน้าเว็บคุยกับ SW:
// - 'clear-badge'  = ผู้ใช้เปิดแอปมาดูแล้ว → ล้างเลข (หน้าเว็บเรียก clearAppBadge ของตัวเอง
//                    ด้วย แต่ตัวนับอยู่ที่ SW จึงต้องบอกให้ reset)
// - 'badge-status' = ขอดูว่า SW ตั้ง/ล้างเลขล่าสุดเมื่อไหร่ สำเร็จไหม (ตอบกลับทาง port)
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'clear-badge') {
    event.waitUntil(clearBadge(data.reason || 'page'));
    return;
  }
  if (data.type === 'badge-status') {
    event.waitUntil(
      (async () => {
        const [count, lastPush, lastClear] = await Promise.all([
          readBadgeCount(),
          readJson(BADGE_LAST_PUSH),
          readJson(BADGE_LAST_CLEAR),
        ]);
        const status = { type: 'badge-status', supported: badgeSupported(), scope: self.registration.scope, count, lastPush, lastClear };
        const port = event.ports && event.ports[0];
        if (port) port.postMessage(status);
        else if (event.source) event.source.postMessage(status);
      })()
    );
  }
});

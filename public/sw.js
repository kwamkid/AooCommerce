// AooCommerce service worker — รับ web push + จัดการคลิกแจ้งเตือน
// ตั้งใจไม่ทำ offline caching — ให้ Next.js จัดการ asset เอง (กัน stale cache bug)

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'AooCommerce', body: '', url: '/', tag: undefined };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: payload.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
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
    })
  );
});

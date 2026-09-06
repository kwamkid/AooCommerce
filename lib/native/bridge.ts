// สะพานไปหาเปลือกแอป Capacitor (mobile/) — client-only
//
// เว็บตัวจริงถูกเปิดใน WebView ของแอป · Capacitor ฉีด `window.Capacitor` ให้ทุกหน้าที่โหลดจาก server.url
// จึงเรียก plugin ผ่าน `Capacitor.registerPlugin()` ได้โดย**ไม่ต้องติดตั้ง @capacitor/* ใน repo เว็บ**
// (native side ของ plugin อยู่ใน mobile/package.json) · ทุกฟังก์ชันที่นี่ต้องเงียบเมื่อไม่ได้อยู่ในแอป
//
// สิ่งที่แอป native ทำต่างจาก PWA:
//   - push: ไม่มี service worker — ใช้ PushNotifications plugin ได้ device token (FCM) ส่งไป /api/push/subscribe kind 'fcm'
//   - เลขบนไอคอน: Badge plugin (เซิร์ฟเวอร์ส่งเลขมากับ push ด้วย — ไม่ต้องนับเองเหมือน SW)
//   - OAuth (Google/LINE): เปิดใน system browser (Google บล็อก webview) แล้วกลับเข้าแอปด้วย Universal Link / App Link
'use client';

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  registerPlugin?: <T = unknown>(name: string) => T;
  Plugins?: Record<string, unknown>;
};

type Listener = { remove: () => Promise<void> | void };
type PushPlugin = {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  addListener(
    event: 'registration' | 'registrationError' | 'pushNotificationReceived' | 'pushNotificationActionPerformed',
    cb: (data: unknown) => void,
  ): Promise<Listener> | Listener;
  removeAllDeliveredNotifications?: () => Promise<void>;
};
type BadgePlugin = { set(o: { count: number }): Promise<void>; clear(): Promise<void>; get(): Promise<{ count: number }> };
type BrowserPlugin = { open(o: { url: string; presentationStyle?: string }): Promise<void>; close(): Promise<void> };
type AppPlugin = {
  addListener(event: 'appUrlOpen' | 'resume' | 'appStateChange', cb: (data: { url?: string; isActive?: boolean }) => void): Promise<Listener> | Listener;
};

function cap(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null;
  return ((window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor) || null;
}

/** อยู่ในเปลือกแอป native หรือไม่ (ไม่ใช่ Safari/Chrome/PWA) */
export function isNativeApp(): boolean {
  const c = cap();
  return !!c?.isNativePlatform?.();
}

export function nativePlatform(): 'ios' | 'android' | null {
  const p = cap()?.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : null;
}

function plugin<T>(name: string): T | null {
  const c = cap();
  if (!c?.isNativePlatform?.()) return null;
  try {
    return (c.registerPlugin?.<T>(name) as T) || ((c.Plugins?.[name] as T) ?? null);
  } catch {
    return null;
  }
}

const TOKEN_KEY = 'aoo-native-push-token';

export type NativePushState = 'granted' | 'denied' | 'prompt';

export async function getNativePushPermission(): Promise<NativePushState> {
  const push = plugin<PushPlugin>('PushNotifications');
  if (!push) return 'denied';
  const { receive } = await push.checkPermissions();
  return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt';
}

/** token ที่เครื่องนี้ลงทะเบียนไว้ล่าสุด (เก็บใน WebView storage) */
export function getStoredNativeToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

/**
 * ขอสิทธิ์ + ลงทะเบียน push ของเครื่องนี้ → คืน device token (FCM) หรือ null เมื่อไม่ได้สิทธิ์/ล้ม
 * ผู้เรียก (lib/push/client.ts) เป็นคนส่ง token ไป /api/push/subscribe
 */
export async function registerNativePush(): Promise<string | null> {
  const push = plugin<PushPlugin>('PushNotifications');
  if (!push) return null;
  let { receive } = await push.checkPermissions();
  if (receive === 'prompt' || receive === 'prompt-with-rationale') {
    ({ receive } = await push.requestPermissions());
  }
  if (receive !== 'granted') return null;

  const token = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 15_000);
    Promise.resolve(push.addListener('registration', (data) => {
      clearTimeout(timer);
      resolve(((data as { value?: string })?.value) || null);
    })).catch(() => { clearTimeout(timer); resolve(null); });
    Promise.resolve(push.addListener('registrationError', () => { clearTimeout(timer); resolve(null); })).catch(() => {});
    push.register().catch(() => { clearTimeout(timer); resolve(null); });
  });
  if (token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* ignore */ }
  }
  return token;
}

export async function unregisterNativePush(): Promise<void> {
  const push = plugin<PushPlugin>('PushNotifications');
  try { await push?.unregister(); } catch { /* ignore */ }
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

/** ตั้ง/ล้างเลขบนไอคอน — เงียบเมื่อไม่ได้อยู่ในแอป */
export async function setNativeBadge(count: number): Promise<void> {
  const badge = plugin<BadgePlugin>('Badge');
  if (!badge) return;
  try {
    if (count > 0) await badge.set({ count });
    else await badge.clear();
  } catch { /* ignore */ }
}

/** เปิด URL ใน system browser (SFSafariViewController / Custom Tabs) — ใช้กับ OAuth ที่ webview โดนบล็อก */
export async function openInSystemBrowser(url: string): Promise<boolean> {
  const browser = plugin<BrowserPlugin>('Browser');
  if (!browser) return false;
  try {
    await browser.open({ url, presentationStyle: 'popover' });
    return true;
  } catch {
    return false;
  }
}

/**
 * ฟัง event ของแอป: แตะแจ้งเตือน → ไปหน้า `data.url` · Universal Link/App Link เปิดแอป → นำทางไป path นั้น
 * เรียกครั้งเดียวตอนแอปเริ่ม (PwaRegister) — คืนฟังก์ชันถอด listener
 */
export function bindNativeNavigation(navigate: (path: string) => void): () => void {
  const push = plugin<PushPlugin>('PushNotifications');
  const app = plugin<AppPlugin>('App');
  const handles: Promise<Listener>[] = [];
  if (push) {
    handles.push(Promise.resolve(push.addListener('pushNotificationActionPerformed', (data) => {
      const url = ((data as { notification?: { data?: { url?: string } } })?.notification?.data?.url) || '/';
      navigate(url.startsWith('/') ? url : '/');
    })));
  }
  if (app) {
    handles.push(Promise.resolve(app.addListener('appUrlOpen', ({ url }) => {
      if (!url) return;
      try {
        const u = new URL(url);
        // ปิด in-app browser ที่ค้างจาก OAuth แล้วพาไปหน้า callback ใน WebView
        plugin<BrowserPlugin>('Browser')?.close().catch(() => {});
        navigate(u.pathname + u.search + u.hash);
      } catch { /* ไม่ใช่ URL ที่รู้จัก */ }
    })));
  }
  return () => { handles.forEach(h => h.then(l => l.remove()).catch(() => {})); };
}

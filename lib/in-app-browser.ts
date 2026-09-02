// Path: lib/in-app-browser.ts
// ตรวจว่าหน้านี้ถูกเปิดอยู่ใน "เบราว์เซอร์ในแอป" (LINE / Facebook / Instagram)
//
// ทำไมต้องรู้: **Google บล็อกการล็อกอินใน webview ของแอป** (error
// `disallowed_useragent`) — ลิงก์เชิญพนักงานที่ส่งกันทาง LINE จึงกดปุ่ม
// "เข้าสู่ระบบด้วย Google" ไม่ได้เลย ต้องพาผู้ใช้ออกไปเบราว์เซอร์จริงก่อน
//
// LINE มีทางออกให้: ต่อ `openExternalBrowser=1` ท้าย URL แล้วลิงก์ที่กดจากแชท
// LINE จะเปิดด้วยเบราว์เซอร์ประจำเครื่องแทน (พารามิเตอร์นี้ไม่มีผลกับที่อื่น
// จึงติดไปกับลิงก์เชิญได้เสมอ)

export type InAppBrowser = 'line' | 'facebook' | 'instagram' | null;

/** คืนชื่อแอปที่ห่อ webview อยู่ · null = เบราว์เซอร์ปกติ (หรือ SSR) */
export function detectInAppBrowser(userAgent?: string): InAppBrowser {
  const ua = userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (!ua) return null;
  if (/\bLine\//i.test(ua)) return 'line';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
  return null;
}

export const IN_APP_LABELS: Record<Exclude<InAppBrowser, null>, string> = {
  line: 'LINE',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

/** ต่อ `openExternalBrowser=1` — LINE จะเปิดลิงก์ด้วยเบราว์เซอร์ประจำเครื่อง */
export function withExternalBrowserFlag(url: string): string {
  if (url.includes('openExternalBrowser=')) return url;
  return url + (url.includes('?') ? '&' : '?') + 'openExternalBrowser=1';
}

/**
 * URL ของหน้าปัจจุบันที่พร้อมเปิดในเบราว์เซอร์จริง
 * (LINE ใช้ธงได้เลย · แอปอื่นไม่มีธงแบบนี้ ต้องให้ผู้ใช้กดเมนู "เปิดในเบราว์เซอร์" เอง)
 */
export function currentUrlForExternalBrowser(): string {
  if (typeof window === 'undefined') return '';
  return withExternalBrowserFlag(window.location.href);
}

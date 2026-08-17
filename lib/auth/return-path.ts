// ปลายทางหลัง OAuth — ใช้ร่วมกันระหว่าง /auth/callback และ /line-callback
'use client';

import { AUTH_RETURN_COOKIE } from './login-methods';

/**
 * อ่าน path ที่ต้องกลับไป แล้วล้าง cookie ทิ้งทันที (ใช้ครั้งเดียว)
 * คืน null ถ้าไม่มีหรือค่าไม่ปลอดภัย — caller ค่อย fallback ไป /onboarding
 */
export function takeAuthReturnPath(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${AUTH_RETURN_COOKIE}=([^;]*)`));
  if (!match) return null;
  document.cookie = `${AUTH_RETURN_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  try {
    const path = decodeURIComponent(match[1]);
    // ต้องเป็น path ภายในเว็บเท่านั้น — กัน open redirect
    return path.startsWith('/') && !path.startsWith('//') ? path : null;
  } catch {
    return null;
  }
}

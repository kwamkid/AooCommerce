// Path: lib/auth/session-manager.ts
// CLIENT-SIDE session management — the single owner of the cached access
// token. api-client reads tokens from here; login flows that receive tokens
// from our own server (LINE mint, future custom providers) hand them over
// via adoptSession(). Keeping this out of auth-context lets non-React code
// (api-client) share the same session source.

import { supabase } from '@/lib/supabase';
import { getSessionTokensFromCookies } from '@/lib/auth/cookie-token';

let cachedAccessToken: string | null = null;

/**
 * ให้เซิร์ฟเวอร์เขียนคุกกี้ session ทับด้วยอายุยาว
 *
 * ⚠️ Safari (ITP) บีบอายุคุกกี้ที่เขียนด้วย `document.cookie` เหลือ **7 วัน** เสมอ
 * ซึ่งเป็นวิธีที่ @supabase/ssr ฝั่งเบราว์เซอร์ใช้ → ผู้ใช้ iPhone หลุด login เป็นระยะ
 * โดยเฉพาะในแอปที่ติดตั้ง (PWA) ที่มีถังคุกกี้ของตัวเองแยกจาก Safari
 * คุกกี้จาก `Set-Cookie` ของเซิร์ฟเวอร์ไม่โดนเพดานนั้น — จึงยิงตามหลังทุกครั้งที่
 * SDK เพิ่งเขียนคุกกี้ใหม่ เพื่อให้ "คนเขียนคนสุดท้าย" เป็นเซิร์ฟเวอร์
 *
 * เงียบเสมอ: ต่ออายุไม่สำเร็จก็แค่กลับไปมีอายุ 7 วันเท่าเดิม ไม่ใช่เรื่องที่ต้องขัดจังหวะผู้ใช้
 */
let lastPersistAt = 0;
function persistSessionCookie(): void {
  const now = Date.now();
  if (now - lastPersistAt < 60_000) return; // กันยิงรัวตอน event หลายตัวมาพร้อมกัน
  lastPersistAt = now;
  fetch('/api/auth/persist-session', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
}

/**
 * ตรวจว่า session ที่ SDK ถืออยู่ "ใน memory" ยังตรงกับคุกกี้จริงหรือเปล่า ถ้าไม่ตรงให้เอาของในคุกกี้มาใช้
 *
 * ⚠️ **นี่คือตัวกันไม่ให้ผู้ใช้หลุด login แบบไม่มีสาเหตุ** — อย่าถอดออก
 *
 * Supabase หมุน refresh token ทุกครั้งที่ต่ออายุ (ใบเก่าถูกเพิกถอนทันที) และถ้ามีใคร
 * เอา **ใบที่ถูกใช้ไปแล้ว** มายื่นซ้ำ มันจะถือว่าเป็นการขโมย token แล้ว
 * **เพิกถอนทั้งสายทิ้งทันที** (log ขึ้นว่า `Possible abuse attempt`) = หลุดทุกที่พร้อมกัน
 *
 * ปัญหาคือ supabase-js เก็บ session ไว้ใน memory ด้วย ไม่ได้อ่านคุกกี้ใหม่ทุกครั้ง
 * บน iOS หน้าเว็บที่ถูกพักไว้ (สลับแอป / bfcache / แอปที่ติดตั้งถูกแช่แข็ง) จะ **ตื่นมา
 * พร้อมสำเนาเก่า** แล้วยิงต่ออายุด้วย token ที่โดนหมุนทิ้งไปแล้ว
 * ของจริงที่เจอ: ตื่นมาใช้ใบที่เก่า 20 ชั่วโมง → โดนเพิกถอนทั้งสาย → เด้งหน้า login
 * (2026-09-02/03 ดู fix-bug.md)
 *
 * เทียบแล้วไม่ตรงจึงต้องดึงของในคุกกี้ (= ของล่าสุดที่ทุก context ใช้ร่วมกัน) มาใส่ก่อน
 * ที่ตัวต่ออายุอัตโนมัติจะได้ทำงาน
 */
export async function resyncSessionFromCookie(): Promise<void> {
  if (typeof document === 'undefined') return;
  try {
    const cookies = document.cookie.split('; ').flatMap((pair) => {
      const i = pair.indexOf('=');
      if (i < 1) return [];
      return [{ name: pair.slice(0, i), value: pair.slice(i + 1) }];
    });
    const fromCookie = getSessionTokensFromCookies(cookies);
    if (!fromCookie) return; // ไม่มีคุกกี้ = ออกจากระบบไปแล้วจริง ๆ ไม่ต้องยัด session กลับ

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    if (session.refresh_token === fromCookie.refresh_token) return; // ตรงกันอยู่แล้ว

    // ของในคุกกี้ใหม่กว่าเสมอ — ทุก context เขียนลงที่เดียวกัน ส่วนใน memory เป็นสำเนา
    await supabase.auth.setSession(fromCookie);
  } catch {
    // อ่าน/ตั้งค่าไม่ได้ก็ปล่อยให้ SDK ทำงานตามปกติ — อย่างแย่คือกลับไปเป็นพฤติกรรมเดิม
  }
}

// Keep the cache in sync with sign-in / sign-out / silent token refresh.
if (typeof window !== 'undefined') {
  supabase.auth.getSession().then(({ data: { session } }) => {
    cachedAccessToken = session?.access_token ?? null;
    if (session) persistSessionCookie();
  });
  supabase.auth.onAuthStateChange((event, session) => {
    cachedAccessToken = session?.access_token ?? null;
    // ทุก event ที่ทำให้ SDK เขียนคุกกี้ใหม่ (ซึ่งจะโดน Safari ตัดเหลือ 7 วัน)
    if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
      persistSessionCookie();
    }
  });

  // จังหวะที่หน้าเว็บ "ตื่น" — ต้องเช็คก่อนที่ตัวต่ออายุอัตโนมัติจะยิง token เก่าออกไป
  // visibilitychange = สลับกลับมาที่แอป · pageshow(persisted) = โดนคืนจาก bfcache
  // ซึ่ง **ไม่ยิง visibilitychange** จึงต้องดักทั้งสองตัว
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void resyncSessionFromCookie();
  });
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) void resyncSessionFromCookie();
  });
}

/** Current access token — cache-first, getSession() only on cold start. */
export async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken) return cachedAccessToken;
  const { data: { session } } = await supabase.auth.getSession();
  cachedAccessToken = session?.access_token ?? null;
  return cachedAccessToken;
}

/**
 * Install a session minted outside the SDK's own flows (e.g. /api/auth/line
 * returns token pair after verifying with LINE). Any future custom provider
 * should end its callback with this.
 */
export async function adoptSession(tokens: { access_token: string; refresh_token: string }): Promise<{ error: string | null }> {
  const { data, error } = await supabase.auth.setSession(tokens);
  if (error) return { error: error.message };
  cachedAccessToken = data.session?.access_token ?? null;
  return { error: null };
}

/** Sign out of Supabase and drop the cached token. */
export async function clearSession(): Promise<void> {
  cachedAccessToken = null;
  await supabase.auth.signOut();
}

const LEGACY_STORAGE_KEY = 'joolzjuice-auth';

/**
 * One-time migration from the pre-cookie era: sessions used to live in
 * localStorage under 'joolzjuice-auth'. If the new cookie-based client has
 * no session but a legacy one exists, adopt it so users deployed onto the
 * cookie build stay logged in. The legacy key is removed either way.
 */
export async function migrateLegacyLocalStorageSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return false;
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    const legacy = JSON.parse(raw);
    if (typeof legacy?.access_token === 'string' && typeof legacy?.refresh_token === 'string') {
      const { error } = await adoptSession({
        access_token: legacy.access_token,
        refresh_token: legacy.refresh_token,
      });
      return !error;
    }
  } catch {
    // Corrupt legacy entry — user just logs in again.
  }
  return false;
}

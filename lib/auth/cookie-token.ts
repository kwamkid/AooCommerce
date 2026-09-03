// Path: lib/auth/cookie-token.ts
// EDGE-SAFE extraction of the Supabase access token from request cookies.
// @supabase/ssr stores the session as `sb-<projectRef>-auth-token`, chunked
// into `.0`/`.1`/... when large, optionally `base64-`-prefixed JSON.
// Used by proxy.ts (edge) and the dual-mode auth checks in supabase-admin.

import type { NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function projectRef(): string {
  // https://<ref>.supabase.co → <ref>
  return new URL(supabaseUrl).hostname.split('.')[0];
}

function decodeCookieValue(raw: string): string | null {
  try {
    let value = decodeURIComponent(raw);
    if (value.startsWith('base64-')) {
      const b64 = value.slice(7).replace(/-/g, '+').replace(/_/g, '/');
      value = atob(b64);
    }
    return value;
  } catch {
    return null;
  }
}

/** ชื่อคุกกี้ฐาน (ยังไม่รวมท้าย `.0` `.1` ตอนที่ session ยาวจนต้องหั่น) */
export function authCookieBaseName(): string {
  return `sb-${projectRef()}-auth-token`;
}

/**
 * ต่อคุกกี้ auth กลับเป็นก้อนเดียว (รองรับแบบหั่นเป็น chunk) แล้ว parse เป็น JSON
 * คืน null เมื่อไม่มีคุกกี้หรือ parse ไม่ได้
 */
function readAuthCookieSession(cookies: { name: string; value: string }[]): unknown {
  const base = authCookieBaseName();

  const whole = cookies.find(c => c.name === base);
  let raw: string | null = null;
  if (whole) {
    raw = whole.value;
  } else {
    const chunks = cookies
      .filter(c => c.name.startsWith(`${base}.`))
      .sort((a, b) => Number(a.name.slice(base.length + 1)) - Number(b.name.slice(base.length + 1)));
    if (chunks.length === 0) return null;
    raw = chunks.map(c => c.value).join('');
  }
  if (!raw) return null;

  const decoded = decodeCookieValue(raw);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Reassemble the Supabase auth cookie (handling chunking) and pull out the
 * access token. Returns null when no auth cookie is present or parsing fails.
 */
export function getAccessTokenFromCookies(cookies: { name: string; value: string }[]): string | null {
  const session = readAuthCookieSession(cookies) as { access_token?: unknown } | unknown[] | null;
  if (!session) return null;
  // Object form { access_token } or legacy tuple form [access_token, refresh_token, ...]
  const token = Array.isArray(session) ? session[0] : session?.access_token;
  return typeof token === 'string' && token ? token : null;
}

/**
 * คู่ token ที่ "อยู่ในคุกกี้จริง ๆ ตอนนี้" — ใช้เทียบกับ session ที่ SDK ถืออยู่ใน memory
 *
 * จำเป็นเพราะ supabase-js เก็บ session ไว้ใน memory ด้วย และหน้าที่ถูกแช่แข็งไว้
 * (iOS พักแอปที่อยู่เบื้องหลัง / bfcache) จะตื่นมาพร้อม refresh token เก่า —
 * ยิงไปแล้ว Supabase มองเป็น **การใช้ token ซ้ำ** แล้วเพิกถอนทั้งสายทันที
 * ดู resyncSessionFromCookie() ใน lib/auth/session-manager.ts
 */
export function getSessionTokensFromCookies(
  cookies: { name: string; value: string }[]
): { access_token: string; refresh_token: string } | null {
  const session = readAuthCookieSession(cookies) as
    | { access_token?: unknown; refresh_token?: unknown }
    | unknown[]
    | null;
  if (!session) return null;
  const access = Array.isArray(session) ? session[0] : session?.access_token;
  const refresh = Array.isArray(session) ? session[1] : session?.refresh_token;
  if (typeof access !== 'string' || !access) return null;
  if (typeof refresh !== 'string' || !refresh) return null;
  return { access_token: access, refresh_token: refresh };
}

/** True when any Supabase auth cookie exists (cheap logged-in heuristic for the middleware gate). */
export function hasAuthCookie(request: NextRequest): boolean {
  const base = `sb-${projectRef()}-auth-token`;
  return request.cookies.getAll().some(c => c.name === base || c.name.startsWith(`${base}.`));
}

/**
 * Resolve the caller's access token from a request — Authorization Bearer
 * header first (apiFetch, external callers), then the Supabase auth cookie
 * (browser same-origin, future SSR). Dual-mode keeps every existing API
 * consumer working during and after the cookie migration.
 */
export function extractRequestToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.substring(7);
  return getAccessTokenFromCookies(request.cookies.getAll());
}

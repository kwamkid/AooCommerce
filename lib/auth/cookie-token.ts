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

/**
 * Reassemble the Supabase auth cookie (handling chunking) and pull out the
 * access token. Returns null when no auth cookie is present or parsing fails.
 */
export function getAccessTokenFromCookies(cookies: { name: string; value: string }[]): string | null {
  const base = `sb-${projectRef()}-auth-token`;

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
    const session = JSON.parse(decoded);
    // Object form { access_token } or legacy tuple form [access_token, refresh_token, ...]
    const token = Array.isArray(session) ? session[0] : session?.access_token;
    return typeof token === 'string' && token ? token : null;
  } catch {
    return null;
  }
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

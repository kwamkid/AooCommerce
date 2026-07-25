// Path: lib/auth/session-manager.ts
// CLIENT-SIDE session management — the single owner of the cached access
// token. api-client reads tokens from here; login flows that receive tokens
// from our own server (LINE mint, future custom providers) hand them over
// via adoptSession(). Keeping this out of auth-context lets non-React code
// (api-client) share the same session source.

import { supabase } from '@/lib/supabase';

let cachedAccessToken: string | null = null;

// Keep the cache in sync with sign-in / sign-out / silent token refresh.
if (typeof window !== 'undefined') {
  supabase.auth.getSession().then(({ data: { session } }) => {
    cachedAccessToken = session?.access_token ?? null;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token ?? null;
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

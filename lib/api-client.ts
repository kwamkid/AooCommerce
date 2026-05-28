import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'aoo-current-company-id';

// Cache the access token to avoid calling getSession() on every API request.
// Updated by auth state change listener below.
let cachedAccessToken: string | null = null;

// Listen for auth state changes to keep token cached
if (typeof window !== 'undefined') {
  // Seed from current session
  supabase.auth.getSession().then(({ data: { session } }) => {
    cachedAccessToken = session?.access_token ?? null;
  });

  // Keep in sync with auth changes (sign-in, sign-out, token refresh)
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token ?? null;
  });
}

// Dedup in-flight GET requests: if the same URL is already being fetched,
// reuse the same Promise instead of making a duplicate network call.
const inflightGets = new Map<string, Promise<Response>>();

// Per-URL response cache for "stable" GETs that change rarely (warehouses,
// sales-channels, features). The key is the URL string (so different
// query params get separate entries) and the value is a Response cached
// for `ttlMs` from `cachedAt`. Cache is keyed by company so switching
// companies invalidates everything.
//
// To register a URL pattern as cacheable, add it to `CACHED_GET_PATHS` below.
// To invalidate after a write, call `invalidateApiCache(urlPrefix)`.
type CacheEntry = { cachedAt: number; ttlMs: number; companyId: string | null; response: Response };
const responseCache = new Map<string, CacheEntry>();

const CACHED_GET_PATHS: { match: (url: string) => boolean; ttlMs: number }[] = [
  // Stable per-company master data — re-fetched on company switch or after explicit invalidation.
  { match: u => u === '/api/warehouses' || u.startsWith('/api/warehouses?'), ttlMs: 60_000 },
  { match: u => u.startsWith('/api/sales-channels'), ttlMs: 60_000 },
  { match: u => u === '/api/settings/features', ttlMs: 60_000 },
];

function cacheableFor(url: string): number | null {
  for (const rule of CACHED_GET_PATHS) {
    if (rule.match(url)) return rule.ttlMs;
  }
  return null;
}

/**
 * Drop cached entries whose URL starts with the given prefix. Call after a
 * write to invalidate any stale reads (e.g. after creating a warehouse,
 * `invalidateApiCache('/api/warehouses')`).
 */
export function invalidateApiCache(urlPrefix: string) {
  for (const key of responseCache.keys()) {
    if (key.startsWith(urlPrefix)) responseCache.delete(key);
  }
}

export async function apiFetch(url: string, options: RequestInit = {}) {
  // Use cached token; fall back to getSession() only if cache is empty
  let accessToken = cachedAccessToken;
  if (!accessToken) {
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;
    cachedAccessToken = accessToken;
  }

  const companyId = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  if (companyId) {
    headers['X-Company-Id'] = companyId;
  }

  const method = (options.method || 'GET').toUpperCase();

  // Only dedup + cache GET requests (safe & idempotent)
  if (method === 'GET') {
    // Serve from in-memory cache when fresh and same company context
    const ttl = cacheableFor(url);
    if (ttl !== null) {
      const cached = responseCache.get(url);
      if (cached && cached.companyId === companyId && Date.now() - cached.cachedAt < cached.ttlMs) {
        return cached.response.clone();
      }
    }

    const existing = inflightGets.get(url);
    if (existing) {
      // Clone the response so each consumer gets its own readable body
      return existing.then(res => res.clone());
    }

    const promise = fetch(url, { ...options, headers }).finally(() => {
      inflightGets.delete(url);
    });
    inflightGets.set(url, promise);

    return promise.then(res => {
      // Only cache successful responses on registered cacheable URLs
      if (ttl !== null && res.ok) {
        responseCache.set(url, { cachedAt: Date.now(), ttlMs: ttl, companyId, response: res.clone() });
      }
      // Return a clone so the cached original stays readable for other consumers
      return res.clone();
    });
  }

  // For writes (POST/PUT/PATCH/DELETE), auto-invalidate any matching cached
  // GETs so the next read returns fresh data. Pulls the resource prefix from
  // the URL (strip query, keep `/api/<resource>`) so e.g. PUT /api/warehouses
  // wipes both `/api/warehouses` and `/api/warehouses?active=true`.
  const path = url.split('?')[0];
  if (cacheableFor(path) !== null || cacheableFor(url) !== null) {
    invalidateApiCache(path);
  }

  return fetch(url, { ...options, headers });
}

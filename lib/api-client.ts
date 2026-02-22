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

  // Only dedup GET requests (safe & idempotent)
  if (method === 'GET') {
    const existing = inflightGets.get(url);
    if (existing) {
      // Clone the response so each consumer gets its own readable body
      return existing.then(res => res.clone());
    }

    const promise = fetch(url, { ...options, headers }).finally(() => {
      inflightGets.delete(url);
    });
    inflightGets.set(url, promise);

    // Return a clone so the cached original stays readable for other consumers
    return promise.then(res => res.clone());
  }

  return fetch(url, { ...options, headers });
}

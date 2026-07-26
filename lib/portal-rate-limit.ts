// Path: lib/portal-rate-limit.ts
// Thin wrapper over the check_portal_auth_rate_limit RPC for the public portal
// login endpoints. Fails OPEN on RPC error (availability > lockout) — a broken
// limiter must never lock out legitimate dealers/suppliers.
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface RateLimitResult {
  allowed: boolean;
  locked_until: string | null;
  attempts: number;
}

const MAX_ATTEMPTS = 10;
const WINDOW_SECS = 900; // 15 min
const LOCK_SECS = 900; // 15 min

async function call(key: string, action: 'check' | 'fail' | 'reset'): Promise<RateLimitResult> {
  try {
    const { data } = await supabaseAdmin.rpc('check_portal_auth_rate_limit', {
      p_key: key,
      p_max: MAX_ATTEMPTS,
      p_window_secs: WINDOW_SECS,
      p_lock_secs: LOCK_SECS,
      p_action: action,
    });
    return (data as RateLimitResult) ?? { allowed: true, locked_until: null, attempts: 0 };
  } catch {
    return { allowed: true, locked_until: null, attempts: 0 };
  }
}

export const portalRateLimit = {
  /** Is this key currently allowed (not locked)? Does not count as an attempt. */
  check: (key: string) => call(key, 'check'),
  /** Record a failed attempt; locks the key once the threshold is hit. */
  fail: (key: string) => call(key, 'fail'),
  /** Clear the key after a successful login. */
  reset: (key: string) => call(key, 'reset'),
};

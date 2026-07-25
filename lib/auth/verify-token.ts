// Path: lib/auth/verify-token.ts
// SERVER-ONLY — access-token verification for API routes. Do not import from
// client code or the edge middleware (proxy.ts uses jwt-local directly).
//
// Fast path: local JWT verify against Supabase JWKS (ES256) via jwt-local —
// no network round-trip per request. Network `auth.getUser()` is only a
// fallback (legacy HS256 token, signing-key rotation edge, JWKS outage) so
// behaviour degrades to the old path instead of rejecting valid sessions.
//
// Accepted trade-off: a banned/deleted user's token passes local verification
// until it expires (~1h). Company-level cutoff (company_members.is_active)
// still takes effect within ≤30s via the membership lookup in
// checkAuthWithCompany.

import { verifyJwtLocally } from '@/lib/auth/jwt-local';
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface VerifiedToken {
  userId: string;
  /**
   * Authenticator Assurance Level claim — 'aal1' (single factor) or 'aal2'
   * (passed 2FA). Exposed so future routes can require aal2 for sensitive
   * actions once MFA is enabled.
   */
  aal?: string;
  sessionId?: string;
  verifiedBy: 'local' | 'network';
}

const TRANSIENT_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'];

function isTransientFetchError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; message?: string; code?: string; cause?: { code?: string } };
  if (e.name === 'TypeError' && e.message?.includes('fetch failed')) return true;
  if (e.code && TRANSIENT_ERROR_CODES.includes(e.code)) return true;
  if (e.cause?.code && TRANSIENT_ERROR_CODES.includes(e.cause.code)) return true;
  return false;
}

// Warn once per process when local verification keeps failing for non-expiry
// reasons — signals the project is still issuing HS256 tokens (JWT signing
// keys not migrated) and every request is paying the network fallback.
let warnedLocalVerifyFallback = false;

export async function verifyAccessToken(token: string): Promise<VerifiedToken | null> {
  const local = await verifyJwtLocally(token);
  if (local.ok) {
    return { ...local.payload, verifiedBy: 'local' };
  }
  // Expired is a definitive reject — no point re-checking over the network.
  if (local.reason === 'expired') return null;

  if (!warnedLocalVerifyFallback) {
    warnedLocalVerifyFallback = true;
    console.warn('[verifyAccessToken] local JWT verify failed, using network fallback');
  }

  // Network fallback with retry on transient errors (previous behaviour).
  const delays = [0, 100, 300];
  let lastErr: unknown;
  for (const delay of delays) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) return null;
      return { userId: user.id, verifiedBy: 'network' };
    } catch (err) {
      lastErr = err;
      if (!isTransientFetchError(err)) throw err;
    }
  }
  console.error('[verifyAccessToken] network fallback retries exhausted:', lastErr);
  return null;
}

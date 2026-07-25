// Path: lib/auth/jwt-local.ts
// EDGE-SAFE local JWT verification — no Supabase client, no Node-only APIs,
// so it can run in both proxy.ts (edge middleware) and API routes (node).
// jose uses WebCrypto which exists in both runtimes.

import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface LocalJwtPayload {
  userId: string;
  aal?: string;
  sessionId?: string;
}

export type LocalVerifyResult =
  | { ok: true; payload: LocalJwtPayload }
  | { ok: false; reason: 'expired' | 'unverifiable' };

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`), {
      cooldownDuration: 30_000,
      timeoutDuration: 10_000,
    });
  }
  return jwks;
}

/**
 * Verify a Supabase access token locally against the project JWKS (ES256).
 * 'expired' is a definitive reject; 'unverifiable' covers bad signature,
 * legacy HS256 tokens, and JWKS outage — callers decide whether that case
 * falls back to a network check (API routes do, the edge middleware doesn't).
 */
export async function verifyJwtLocally(token: string): Promise<LocalVerifyResult> {
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      algorithms: ['ES256'],
      audience: 'authenticated',
      clockTolerance: 5,
    });
    if (typeof payload.sub !== 'string' || !payload.sub) {
      return { ok: false, reason: 'unverifiable' };
    }
    return {
      ok: true,
      payload: {
        userId: payload.sub,
        aal: typeof payload.aal === 'string' ? payload.aal : undefined,
        sessionId: typeof payload.session_id === 'string' ? payload.session_id : undefined,
      },
    };
  } catch (err) {
    const expired = (err as { code?: string })?.code === 'ERR_JWT_EXPIRED';
    return { ok: false, reason: expired ? 'expired' : 'unverifiable' };
  }
}

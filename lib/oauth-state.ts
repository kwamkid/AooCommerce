// Path: lib/oauth-state.ts
// SERVER-ONLY — signed OAuth `state` for marketplace connect flows (Shopee/TikTok).
//
// Why: the callbacks attach a shop (with live tokens) to whatever company the
// `state` names, via a service-role upsert that bypasses RLS. Previously
// `state` was the raw company UUID and the callback was unauthenticated, so
// anyone could bind a shop to a victim company (OAuth CSRF / account-linking).
//
// This makes `state` a tamper-proof, expiring, user-bound token: base64url
// payload + HMAC-SHA256. The callback verifies the signature + expiry, then
// (separately) confirms the completing session belongs to the embedded user
// and that user may connect marketplaces for the embedded company.

import crypto from 'crypto';
import type { NextRequest } from 'next/server';
import { supabaseAdmin, can } from '@/lib/supabase-admin';
import { extractRequestToken } from '@/lib/auth/cookie-token';
import { verifyAccessToken } from '@/lib/auth/verify-token';

export type OAuthPlatform = 'shopee' | 'tiktok' | 'lazada';

export interface OAuthStatePayload {
  companyId: string;
  userId: string;
  platform: OAuthPlatform;
  /**
   * TikTok + Lazada: การเชื่อมร้านหนึ่งครั้งต้องผ่าน 2 app (ออเดอร์ → แชท)
   * ค่านี้บอก callback ว่ากำลังกลับมาจากขาไหน — ไม่ใส่ = ขาออเดอร์
   */
  app?: 'order' | 'chat';
}

interface SignedPayload extends OAuthStatePayload {
  iat: number; // issued-at, seconds
}

const TTL_SECONDS = 600; // 10 min — enough to complete an OAuth round-trip

// Reuse an always-present server secret so no new env var is required in prod.
function secret(): string {
  const s =
    process.env.OAUTH_STATE_SECRET ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('oauth-state: no signing secret configured');
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function hmac(data: string): string {
  return b64url(crypto.createHmac('sha256', secret()).update(data).digest());
}

/** Produce a signed state string for the OAuth `state` param + cookie backup. */
export function signOAuthState(payload: OAuthStatePayload): string {
  const body: SignedPayload = { ...payload, iat: Math.floor(Date.now() / 1000) };
  const encoded = b64url(Buffer.from(JSON.stringify(body)));
  return `${encoded}.${hmac(encoded)}`;
}

/**
 * Verify a signed state. Returns the payload on success, null on any failure
 * (bad format, bad signature, expired). Timing-safe signature compare.
 */
export function verifyOAuthState(state: string | null | undefined): OAuthStatePayload | null {
  if (!state || typeof state !== 'string') return null;
  const dot = state.lastIndexOf('.');
  if (dot <= 0) return null;
  const encoded = state.slice(0, dot);
  const sig = state.slice(dot + 1);

  const expected = hmac(encoded);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const body = JSON.parse(fromB64url(encoded).toString('utf8')) as SignedPayload;
    if (!body.companyId || !body.userId || !body.platform) return null;
    if (typeof body.iat !== 'number' || Date.now() / 1000 - body.iat > TTL_SECONDS) return null;
    // `app` ต้องกลับไปด้วยเสมอ — callback ของ TikTok/Lazada ใช้ค่านี้แยกว่ากลับมาจาก
    // ขาออเดอร์หรือขาแชท ตกหล่นเมื่อไหร่ = ขาแชทถูกมองเป็นขาออเดอร์ แล้วเอา code
    // ของ app แชทไป exchange ด้วย key ของ app ออเดอร์ → เชื่อมแชทไม่ได้ตลอดกาล
    // (เจอจริง 2026-08-28)
    return {
      companyId: body.companyId,
      userId: body.userId,
      platform: body.platform,
      app: body.app === 'chat' ? 'chat' : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Authorize a marketplace OAuth callback before it attaches a shop.
 * Verifies: (1) the signed state is valid + unexpired, (2) the completing
 * session (via Supabase auth cookie on the top-level redirect) belongs to the
 * embedded user, (3) that user is an active member of the embedded company
 * with `marketplace.connect`. Returns the trusted companyId, never the raw param.
 *
 * Do NOT use checkAuthWithCompany here — it resolves company from the
 * X-Company-Id header (absent on a redirect) and would fall back to the user's
 * first company, not the one the flow targeted.
 */
export async function authorizeMarketplaceCallback(
  request: NextRequest,
  rawState: string | null,
): Promise<{ ok: true; companyId: string; payload: OAuthStatePayload } | { ok: false; reason: string }> {
  const payload = verifyOAuthState(rawState);
  if (!payload) return { ok: false, reason: 'invalid_state' };

  const token = extractRequestToken(request);
  const verified = token ? await verifyAccessToken(token) : null;
  if (!verified) return { ok: false, reason: 'not_authenticated' };
  if (verified.userId !== payload.userId) return { ok: false, reason: 'user_mismatch' };

  const { data: membership } = await supabaseAdmin
    .from('company_members')
    .select('roles')
    .eq('user_id', verified.userId)
    .eq('company_id', payload.companyId)
    .eq('is_active', true)
    .single();

  if (!membership || !can(membership.roles, 'marketplace.connect')) {
    return { ok: false, reason: 'not_member' };
  }
  return { ok: true, companyId: payload.companyId, payload };
}

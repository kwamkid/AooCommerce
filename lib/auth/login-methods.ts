// Path: lib/auth/login-methods.ts
// CLIENT-SIDE login providers — one function per sign-in method.
//
// Adding a new login method = add one function here returning LoginResult;
// auth-context and the login page consume the shared result shape, so no
// other layer needs to change. Server-minted providers (LINE-style flows)
// should end with `adoptSession()` from session-manager.
//
// 2FA (Supabase MFA/TOTP) is wired in: password login reports
// `mfa_required` when the account has an enrolled factor, and
// `verifyMfaCode()` completes the challenge. Enabling 2FA later is a
// UI/enrollment task only — this layer is ready.

import { supabase } from '@/lib/supabase';

export type LoginResult =
  | { status: 'success' }
  | { status: 'redirect' }                         // OAuth redirect started — page will unload
  | { status: 'mfa_required'; factorId: string }   // session is aal1, needs TOTP verify to reach aal2
  | { status: 'error'; error: string };

/** Email + password via Supabase Auth. */
export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      return { status: 'error', error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' };
    }
    return { status: 'error', error: error.message };
  }
  if (!data.session) return { status: 'error', error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' };

  const mfa = await checkMfaRequired();
  if (mfa) return mfa;
  return { status: 'success' };
}

/**
 * ปลายทางที่ต้องกลับไปหลัง OAuth สำเร็จ — ใช้กับหน้าร้านออนไลน์ที่ต้องพากลับ
 * เข้าร้านเดิม ไม่ใช่ /onboarding ของฝั่งพนักงาน
 *
 * เก็บเป็น cookie เพราะ OAuth วิ่งออกนอกเว็บแล้วกลับมาที่ callback คงที่
 * (วิธีเดียวกับ invite_token) — callback เป็นคนอ่านและล้างทิ้ง
 */
export const AUTH_RETURN_COOKIE = 'aoo_auth_return';

function setReturnTo(returnTo?: string) {
  // รับเฉพาะ path ภายในเว็บ กัน open redirect ไปโดเมนอื่น
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) return;
  document.cookie = `${AUTH_RETURN_COOKIE}=${encodeURIComponent(returnTo)}; path=/; max-age=900; SameSite=Lax`;
}

/** Google OAuth (PKCE) — Supabase redirects back to /auth/callback. */
export async function loginWithGoogle(inviteToken?: string, returnTo?: string): Promise<LoginResult> {
  try {
    if (inviteToken) {
      document.cookie = `invite_token=${inviteToken}; path=/; max-age=3600; SameSite=Lax`;
    }
    setReturnTo(returnTo);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) return { status: 'error', error: error.message };
    return { status: 'redirect' };
  } catch {
    return { status: 'error', error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google' };
  }
}

/**
 * LINE Login — custom flow (Supabase has no LINE provider). Redirects to
 * LINE OAuth; /line-callback exchanges the code via /api/auth/line which
 * mints a Supabase session server-side.
 */
/**
 * @param shopSlug ร้านที่เริ่ม flow (หน้าร้านออนไลน์) — ต้องส่งมาคู่กับ channelId
 *   ของร้านนั้น ฝั่ง callback จะได้รู้ว่าต้องใช้ secret ของใครแลก token
 * @param channelId LINE Login channel ของร้าน · ไม่ส่ง = ใช้ของระบบ (ล็อกอินหลังบ้าน)
 */
export async function loginWithLINE(
  inviteToken?: string,
  returnTo?: string,
  opts?: { shopSlug?: string; channelId?: string },
): Promise<LoginResult> {
  try {
    if (inviteToken) {
      document.cookie = `invite_token=${inviteToken}; path=/; max-age=3600; SameSite=Lax`;
    }
    setReturnTo(returnTo);
    const channelId = opts?.channelId || process.env.NEXT_PUBLIC_LINE_LOGIN_CHANNEL_ID;
    if (!channelId) {
      return { status: 'error', error: 'LINE Login ยังไม่ได้ตั้งค่า' };
    }
    // callback เป็นหน้ากลาง ไม่รู้ว่ามาจากร้านไหน — ฝากไว้ให้มันอ่านตอนแลก token
    try {
      if (opts?.shopSlug) sessionStorage.setItem('sf_line_shop', opts.shopSlug);
      else sessionStorage.removeItem('sf_line_shop');
    } catch { /* โหมดส่วนตัวบางเบราว์เซอร์เขียนไม่ได้ — ตกไปใช้ channel ระบบ */ }
    const redirectUri = `${window.location.origin}/line-callback`;
    const state = Math.random().toString(36).substring(2);
    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&scope=profile%20openid`;
    window.location.href = lineAuthUrl;
    return { status: 'redirect' };
  } catch {
    return { status: 'error', error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย LINE' };
  }
}

/**
 * After a first-factor login, detect whether the account must pass 2FA.
 * Accounts with no enrolled factor pass straight through (current state of
 * every user until MFA enrollment ships).
 */
async function checkMfaRequired(): Promise<LoginResult | null> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (data && data.nextLevel === 'aal2' && data.nextLevel !== data.currentLevel) {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find(f => f.status === 'verified') ?? factors?.totp?.[0];
      if (totp) return { status: 'mfa_required', factorId: totp.id };
    }
  } catch {
    // MFA not available on this project — treat as single-factor pass.
  }
  return null;
}

/** Complete a 2FA challenge with a TOTP code — upgrades the session to aal2. */
export async function verifyMfaCode(factorId: string, code: string): Promise<LoginResult> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { status: 'error', error: 'รหัสยืนยันไม่ถูกต้อง กรุณาลองใหม่' };
  return { status: 'success' };
}

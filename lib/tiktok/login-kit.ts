import crypto from 'crypto';

// TikTok Login Kit — **คนละระบบกับ TikTok Shop โดยสิ้นเชิง**
//
// ══════════════════════════════════════════════════════════════════════════
//  ทำไมต้องมีไฟล์นี้ ทั้งที่เรามี lib/tiktok/api.ts อยู่แล้ว
// ══════════════════════════════════════════════════════════════════════════
//  โลโก้ร้าน TikTok **ไม่มีใน API ฝั่งขายเลย** (ยืนยัน 2026-08-30 ยิงจริงตอน scope
//  seller.shop.info ผ่านแล้ว: /seller/202309/shops คืนแค่ {id, region}) รูปที่คนเห็น
//  เป็นโลโก้ร้านจริง ๆ คือ avatar ของ**บัญชี TikTok** ที่เป็นเจ้าของร้าน ซึ่งอยู่คนละ
//  บ้านกัน — developers.tiktok.com ไม่ใช่ Partner Center
//
//    | | TikTok Shop (lib/tiktok/api.ts)   | Login Kit (ไฟล์นี้)              |
//    | host      | open-api.tiktokglobalshop.com | open.tiktokapis.com        |
//    | credential| app_key / app_secret          | client_key / client_secret |
//    | ยืนยัน     | ร้าน (shop_cipher)            | บัญชีผู้ใช้ (open_id)        |
//    | ลายเซ็น    | HMAC ต่อ request              | OAuth 2.0 + PKCE มาตรฐาน    |
//
//  ⚠️ token ของสองระบบใช้แทนกันไม่ได้ — ทดสอบแล้วได้ 401 access_token_invalid
//
// ══════════════════════════════════════════════════════════════════════════
//  เก็บอะไรบ้าง
// ══════════════════════════════════════════════════════════════════════════
//  **เก็บแค่ URL รูป ไม่เก็บ token เลย** — งานนี้ต้องการรูปที่เปลี่ยนปีละครั้ง
//  ไม่คุ้มกับการถือ credential ของบัญชีส่วนตัวลูกค้าไว้ตลอด · อยากได้รูปใหม่
//  ก็กดเชื่อมอีกครั้ง (ไม่กี่วินาที เพราะ TikTok จำการอนุญาตไว้แล้ว)
//
//  ถ้าวันหนึ่งทำ affiliate/creator ซึ่งต้องยิง API นี้เรื่อย ๆ ค่อยเพิ่มตารางเก็บ
//  token แยก — อย่าเอามายัดใน marketplace_accounts ที่เป็นของฝั่งร้าน

const OAUTH_BASE = 'https://www.tiktok.com/v2/auth/authorize/';
const API_BASE = 'https://open.tiktokapis.com';

/** ขอแค่ตัวที่ให้ display_name + avatar_url — ไม่ขอเกินความจำเป็น */
const SCOPES = ['user.info.basic'];

export function isLoginKitConfigured(): boolean {
  return !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET);
}

function creds(): { key: string; secret: string } {
  const key = process.env.TIKTOK_CLIENT_KEY;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!key || !secret) {
    throw new Error('ยังไม่ได้ตั้ง TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET');
  }
  return { key, secret };
}

/** คู่ PKCE — verifier ต้องเก็บฝั่งเราไว้ใช้ตอน exchange (เราเก็บใน cookie httpOnly) */
export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

/**
 * ⚠️ `redirect_uri` ต้องตรงกับที่ลงทะเบียนไว้ใน developers.tiktok.com **เป๊ะทุกตัวอักษร**
 * และต้องส่งค่าเดิมซ้ำตอน exchange ด้วย ไม่งั้น TikTok ปฏิเสธ
 * (ต่างจากฝั่ง Shop ที่ไม่ต้องส่ง redirect_uri เลย — ใช้ค่าที่ตั้งใน Partner Center)
 */
export function getLoginKitAuthUrl(input: {
  state: string;
  redirectUri: string;
  codeChallenge: string;
}): string {
  const { key } = creds();
  // TikTok ใช้ชื่อ client_key ไม่ใช่ client_id (นอกนั้นเป็น OAuth 2.0 มาตรฐาน)
  const params = new URLSearchParams({
    client_key: key,
    response_type: 'code',
    scope: SCOPES.join(','),
    redirect_uri: input.redirectUri,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `${OAUTH_BASE}?${params.toString()}`;
}

/** endpoint มี slash ปิดท้าย — ตัดออกจะได้ 404 · body ต้องเป็น form-urlencoded */
export async function exchangeLoginKitCode(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; openId: string }> {
  const { key, secret } = creds();
  const res = await fetch(`${API_BASE}/v2/oauth/token/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache',
    },
    body: new URLSearchParams({
      client_key: key,
      client_secret: secret,
      code: input.code,
      grant_type: 'authorization_code',
      redirect_uri: input.redirectUri,
      code_verifier: input.codeVerifier,
    }).toString(),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(`แลก token ไม่สำเร็จ: ${json.error_description || json.error || res.status}`);
  }
  return { accessToken: json.access_token as string, openId: json.open_id as string };
}

/** ชื่อ + รูปโปรไฟล์ของบัญชีที่เพิ่งอนุญาต */
export async function getLoginKitUserInfo(accessToken: string): Promise<{
  displayName: string | null;
  avatarUrl: string | null;
}> {
  const fields = 'open_id,display_name,avatar_url';
  const res = await fetch(`${API_BASE}/v2/user/info/?fields=${encodeURIComponent(fields)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  // TikTok ตอบ error เป็นก้อน { error: { code, message } } โดย code 'ok' = สำเร็จ
  if (!res.ok || (json.error && json.error.code !== 'ok') || !json.data?.user) {
    throw new Error(`ดึงข้อมูลบัญชีไม่สำเร็จ: ${json.error?.message || res.status}`);
  }
  const u = json.data.user;
  return {
    displayName: u.display_name || null,
    avatarUrl: u.avatar_url || null,
  };
}

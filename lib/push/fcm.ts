// ยิง push ไปแอป native (Capacitor) ผ่าน Firebase Cloud Messaging HTTP v1 — ทั้ง iOS (ผ่าน APNs) และ Android
//
// ทำไม FCM ทั้งสองค่าย: sender ตัวเดียว · Firebase ส่งต่อให้ APNs เอง (ต้องอัปโหลด APNs key ใน Firebase console)
// ไม่ใช้ firebase-admin (หนัก) — เซ็น JWT ของ service account ด้วย jose แล้วแลก access token เอง
//
// env: FIREBASE_SERVICE_ACCOUNT_JSON = JSON ของ service account (ทั้งก้อน หรือ base64 ของก้อนนั้น)
//      ดาวน์โหลดจาก Firebase console › Project settings › Service accounts › Generate new private key
import { SignJWT, importPKCS8 } from 'jose';

interface ServiceAccount { project_id: string; client_email: string; private_key: string }

export interface FcmMessage {
  title: string;
  body: string;
  /** path ในระบบ — แอปเปิดหน้านี้เมื่อแตะแจ้งเตือน */
  url: string;
  /** แจ้งเตือน tag เดียวกันแทนที่กัน (apns-collapse-id / android tag) */
  tag?: string;
  /** เลขบนไอคอน (iOS ต้องส่งเลขจริง ไม่มี "บวกหนึ่ง") — ไม่ส่ง = ไม่แตะเลขเดิม */
  badge?: number | null;
}

let cached: { sa: ServiceAccount; token: string; exp: number } | null = null;

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const sa = JSON.parse(text) as ServiceAccount;
    if (!sa.project_id || !sa.client_email || !sa.private_key) return null;
    return sa;
  } catch {
    return null;
  }
}

export function isFcmConfigured(): boolean {
  return !!loadServiceAccount();
}

/** access token ของ service account (อายุ 1 ชม.) — cache ต่อ process */
async function getAccessToken(): Promise<{ sa: ServiceAccount; token: string } | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return { sa: cached.sa, token: cached.token };
  const sa = loadServiceAccount();
  if (!sa) return null;
  const key = await importPKCS8(sa.private_key.replace(/\\n/g, '\n'), 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/firebase.messaging' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`FCM token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { sa, token: data.access_token, exp: now + (data.expires_in || 3600) };
  return { sa, token: cached.token };
}

export type FcmResult = { ok: true } | { ok: false; status: number; unregistered: boolean; error: string };

/** ส่ง 1 ข้อความไป 1 device token — `unregistered` = token ตายแล้ว ลบแถวทิ้งได้ */
export async function sendFcm(deviceToken: string, msg: FcmMessage): Promise<FcmResult> {
  const auth = await getAccessToken();
  if (!auth) return { ok: false, status: 0, unregistered: false, error: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' };

  const body = {
    message: {
      token: deviceToken,
      notification: { title: msg.title, body: msg.body },
      // ทุกอย่างที่แอปต้องใช้ตอนแตะ — ต้องเป็น string ล้วนตาม FCM
      data: { url: msg.url, tag: msg.tag || '' },
      apns: {
        headers: {
          'apns-priority': '10',
          ...(msg.tag ? { 'apns-collapse-id': msg.tag.slice(0, 64) } : {}),
        },
        payload: {
          aps: {
            sound: 'default',
            ...(msg.tag ? { 'thread-id': msg.tag } : {}),
            ...(typeof msg.badge === 'number' ? { badge: Math.max(0, Math.round(msg.badge)) } : {}),
          },
        },
      },
      android: {
        priority: 'HIGH',
        notification: {
          ...(msg.tag ? { tag: msg.tag } : {}),
          ...(typeof msg.badge === 'number' ? { notification_count: Math.max(0, Math.round(msg.badge)) } : {}),
        },
      },
    },
  };

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const text = await res.text();
  // UNREGISTERED / 404 = token ถูกยกเลิก (ลบแอป/ปิดแจ้งเตือน) → ลบแถว เหมือน 404/410 ของ Web Push
  const unregistered = res.status === 404 || /UNREGISTERED|NOT_FOUND/i.test(text);
  return { ok: false, status: res.status, unregistered, error: text.slice(0, 300) };
}

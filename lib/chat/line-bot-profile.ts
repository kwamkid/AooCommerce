// รูปโปรไฟล์ OA ของ LINE — server only
//
// รูป OA จาก LINE เป็น URL ที่ตายได้เมื่อ OA เปลี่ยนรูป (เจอจริง 4 ก.ย. 2026 —
// aDay Fresh เก็บ URL profile.line-scdn.net ไว้ตั้งแต่วันเชื่อม พอเปลี่ยนรูปใหม่
// URL เดิมกลายเป็น 404 → รายชื่อแชทโชว์วงกลมขาวว่าง) จึงต้องรีเฟรชเป็นระยะ
// ไม่ใช่ดึงครั้งเดียวตอนสร้างบัญชีเหมือนเดิม
import { supabaseAdmin } from '@/lib/supabase-admin';

/** รีเฟรชวันละครั้งพอ — รูป OA ไม่ได้เปลี่ยนบ่อย และทุก request ที่ stale จะยิง LINE 1 ครั้ง */
export const LINE_BOT_PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

/** จริงเมื่อบัญชีนี้มี token ใช้ยิงได้ และยังไม่เคยรีเฟรช/รีเฟรชไปนานเกิน TTL */
export function isLineBotProfileStale(creds: Record<string, unknown> | null): boolean {
  if (!creds) return false;
  if (!creds.channel_access_token) return false;

  const fetchedAt = creds.bot_profile_fetched_at;
  if (typeof fetchedAt !== 'string' || !fetchedAt) return true;

  const ts = new Date(fetchedAt).getTime();
  if (Number.isNaN(ts)) return true;

  return Date.now() - ts > LINE_BOT_PROFILE_TTL_MS;
}

/** premiumId = ID แบบตั้งเอง (@abcthebaby) มีเฉพาะ OA ที่ซื้อ premium ID — โชว์ตัวนี้ก่อน basicId (@vyq5483e) */
export interface LineBotInfo { displayName?: string; pictureUrl?: string; basicId?: string; premiumId?: string; userId?: string }

/**
 * ยิง `/v2/bot/info` ด้วย channel access token — ใช้ทั้ง "ตรวจว่า token ใช้ได้จริง" ตอนบันทึก
 * และดึงชื่อ/รูป OA · 401 = token ผิด (เคสจริง 7 ก.ย. 2026: วาง Channel secret (32 ตัว) ลงช่อง
 * access token — webhook verify ผ่านเพราะไม่ได้ใช้ token แต่ส่งข้อความ/ดึงรูปพังหมด)
 */
export async function fetchLineBotInfo(token: string): Promise<{ ok: true; info: LineBotInfo } | { ok: false; status: number; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('https://api.line.me/v2/bot/info', {
      headers: { Authorization: `Bearer ${token.trim()}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, status: res.status, message: text.slice(0, 200) };
    }
    return { ok: true, info: (await res.json()) as LineBotInfo };
  } catch (e) {
    return { ok: false, status: 0, message: e instanceof Error ? e.message : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/** ข้อความอธิบายให้คนแก้ได้ — token 32 ตัว = วาง Channel secret ผิดช่องแน่นอน */
export function describeLineTokenError(token: string, status: number): string {
  const t = token.trim();
  if (status === 401) {
    if (/^[0-9a-f]{32}$/i.test(t)) {
      return 'Channel access token ไม่ถูกต้อง — ค่าที่วางเป็นรูปแบบเดียวกับ Channel secret (32 ตัว) · token จริงยาว ~170 ตัว ได้จาก LINE Developers › แท็บ Messaging API › Channel access token (long-lived) › Issue';
    }
    return 'Channel access token ไม่ถูกต้อง (LINE ตอบ 401) — กด Issue token ใหม่ในแท็บ Messaging API ของ Channel นี้ แล้ววางทั้งก้อน';
  }
  return `LINE ไม่รับ token (HTTP ${status || 'network'}) — ลองใหม่อีกครั้ง`;
}

/**
 * ดึงชื่อ + รูป OA จาก LINE แล้วเขียนทับลง `chat_accounts.credentials`
 *
 * คืน credentials ชุดใหม่เมื่อสำเร็จ · คืน `null` เมื่อล้ม (แต่ยัง stamp
 * `bot_profile_fetched_at` ไว้เสมอ ไม่งั้น token ที่ตายแล้วจะทำให้ยิง LINE ใหม่
 * ทุก request) · **ห้าม throw** เพราะถูกเรียกจาก `after()` ของ route handler
 */
export async function refreshLineBotProfile(
  accountId: string,
  creds: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const token = creds.channel_access_token;
  if (typeof token !== 'string' || !token) return null;

  const stampedAt = new Date().toISOString();

  try {
    const result = await fetchLineBotInfo(token);
    if (!result.ok) {
      // จดเหตุผลไว้ให้การ์ดบอกผู้ใช้ (ไม่ใช่รูปว่างเงียบ ๆ) — ล้างเมื่อสำเร็จรอบถัดไป
      await stampFetchedAt(accountId, { ...creds, bot_profile_error: describeLineTokenError(token, result.status) }, stampedAt);
      return null;
    }

    const botInfo = result.info;
    const updated: Record<string, unknown> = {
      ...creds,
      bot_name: botInfo.displayName || '',
      bot_picture_url: botInfo.pictureUrl || '',
      basic_id: botInfo.basicId || '',
      premium_id: botInfo.premiumId || '',
      bot_profile_error: null,
      bot_profile_fetched_at: stampedAt,
    };

    const { error } = await supabaseAdmin
      .from('chat_accounts')
      .update({ credentials: updated, updated_at: stampedAt })
      .eq('id', accountId);
    if (error) {
      console.warn('refreshLineBotProfile: update failed', error.message);
      return null;
    }

    return updated;
  } catch (e) {
    console.warn('refreshLineBotProfile failed:', e);
    await stampFetchedAt(accountId, creds, stampedAt);
    return null;
  }
}

/** ล้มแล้วก็ยังต้องจดว่า "ลองแล้ว" — เก็บรูปเดิมไว้ ไม่ล้างทิ้ง */
async function stampFetchedAt(
  accountId: string,
  creds: Record<string, unknown>,
  stampedAt: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from('chat_accounts')
      .update({
        credentials: { ...creds, bot_profile_fetched_at: stampedAt },
        updated_at: stampedAt,
      })
      .eq('id', accountId);
  } catch (e) {
    console.warn('refreshLineBotProfile: stamp failed', e);
  }
}

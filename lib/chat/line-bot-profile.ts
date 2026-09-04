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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    let res: Response;
    try {
      res = await fetch('https://api.line.me/v2/bot/info', {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      await stampFetchedAt(accountId, creds, stampedAt);
      return null;
    }

    const botInfo = await res.json();
    const updated: Record<string, unknown> = {
      ...creds,
      bot_name: botInfo.displayName || '',
      bot_picture_url: botInfo.pictureUrl || '',
      basic_id: botInfo.basicId || '',
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

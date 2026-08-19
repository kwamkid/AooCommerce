// รูปโปรไฟล์ลูกค้า — ดึงจากผู้ให้บริการ login ครั้งเดียวแล้วเก็บไว้เอง
//
// ทำไมไม่ใช้ URL ของ Google/LINE ตรง ๆ:
//  - lh3.googleusercontent.com ตอบ 403 ให้คำขอที่มี referrer จากโดเมนอื่น
//  - URL หมุนเปลี่ยนได้ ของเก่ากลายเป็นรูปแตกโดยไม่มีสัญญาณเตือน
//  - CRM / แชท / รายชื่อลูกค้า จะใช้รูปนี้ด้วย พึ่ง CDN ภายนอกคือรูปแตกทั้งระบบ
//
// ⚠️ URL ต้นทางต้องอ่านจาก auth ฝั่ง server เท่านั้น ห้ามรับจาก client
// ไม่งั้นกลายเป็น SSRF — สั่งเซิร์ฟเวอร์เรายิงไปยัง URL ภายในอะไรก็ได้
import { supabaseAdmin } from '@/lib/supabase-admin';

const BUCKET = 'customer-avatars';
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
};
/** ดึงรูปซ้ำถี่ ๆ ไม่มีประโยชน์ — คนเปลี่ยนรูปโปรไฟล์กันปีละครั้ง */
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

/** URL รูปที่ผู้ให้บริการ login แนบมากับบัญชี (Google = picture, LINE = picture_url) */
function providerAvatar(meta: Record<string, unknown> | null | undefined): string | null {
  const m = meta || {};
  const raw = (m.avatar_url || m.picture || m.picture_url) as string | undefined;
  if (!raw || typeof raw !== 'string') return null;
  // ยอมรับเฉพาะ https ภายนอก — กันทั้ง SSRF และ data:/blob: ที่ไม่ใช่รูปจริง
  return /^https:\/\//i.test(raw) ? raw : null;
}

/**
 * ซิงก์รูปโปรไฟล์ของลูกค้าจากบัญชีที่ผูกไว้
 *
 * เงียบเสมอเมื่อทำไม่ได้ — รูปโปรไฟล์ไม่ใช่เหตุผลที่จะทำให้หน้าชำระเงินพัง
 *
 * @returns URL รูปในสตอเรจของเรา (null = ยังไม่มี)
 */
export async function syncCustomerAvatar(
  customerId: string,
  authUserId: string,
): Promise<string | null> {
  try {
    const { data: row } = await supabaseAdmin
      .from('customers')
      .select('avatar_url, avatar_source_url, avatar_synced_at')
      .eq('id', customerId)
      .single();

    const syncedAt = row?.avatar_synced_at ? Date.parse(row.avatar_synced_at as string) : 0;
    const fresh = row?.avatar_url && Date.now() - syncedAt < STALE_MS;
    if (fresh) return row!.avatar_url as string;

    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(authUserId);
    const source = providerAvatar(userRes?.user?.user_metadata as Record<string, unknown>);
    if (!source) return (row?.avatar_url as string) || null;

    // รูปเดิม ไม่ต้องโหลดซ้ำ — แค่เลื่อนเวลาเช็คครั้งถัดไปออกไป
    if (row?.avatar_source_url === source && row?.avatar_url) {
      await supabaseAdmin
        .from('customers')
        .update({ avatar_synced_at: new Date().toISOString() })
        .eq('id', customerId);
      return row.avatar_url as string;
    }

    const res = await fetch(source, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return (row?.avatar_url as string) || null;

    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED.has(type)) return (row?.avatar_url as string) || null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return (row?.avatar_url as string) || null;

    // ชื่อไฟล์คงที่ต่อลูกค้า — อัปทับของเดิม ไม่สะสมไฟล์ขยะทุกครั้งที่เปลี่ยนรูป
    const path = `${customerId}.${EXT[type]}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: type, upsert: true });
    if (upErr) return (row?.avatar_url as string) || null;

    const { data: pub } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    // ต่อ cache-buster เพราะชื่อไฟล์เดิมถูกเขียนทับ เบราว์เซอร์จะได้ไม่โชว์รูปเก่า
    const publicUrl = `${pub.publicUrl}?v=${Date.now()}`;

    await supabaseAdmin
      .from('customers')
      .update({
        avatar_url: publicUrl,
        avatar_source_url: source,
        avatar_synced_at: new Date().toISOString(),
      })
      .eq('id', customerId);

    return publicUrl;
  } catch {
    return null;
  }
}

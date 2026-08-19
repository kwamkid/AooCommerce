// LINE Login channel ของแต่ละร้าน (server-only)
//
// ⚠️ channel secret ห้ามอยู่ใน `companies.settings.storefront` เด็ดขาด —
// ก้อนนั้นถูก parse แล้วส่งไปฝั่ง client ทั้งชุด (CSS token, ชื่อร้าน ฯลฯ)
// จึงเก็บแยกไว้ที่ `companies.settings.line_login` ซึ่งไม่มีทางไหลออกหน้าร้าน
//
// ทำไมต้องแยกต่อร้าน: LINE user ID ผูกกับ provider ถ้าใช้ channel กลางของระบบ
// ไอดีที่ได้จะอยู่คนละชุดกับ OA ของร้าน ส่งแจ้งเตือนเข้า OA ร้านไม่ได้เลย
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface LineLoginCredentials {
  channel_id: string;
  channel_secret: string;
}

export function parseLineLogin(settings: Record<string, unknown> | null | undefined): LineLoginCredentials {
  const raw = (settings?.line_login as Partial<LineLoginCredentials> | undefined) || {};
  return {
    channel_id: (raw.channel_id || '').trim(),
    channel_secret: (raw.channel_secret || '').trim(),
  };
}

/** channel id อย่างเดียว — เปิดเผยได้ (มันอยู่ใน URL ที่พาไป LINE อยู่แล้ว) */
export async function getLineLoginChannelId(companyId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .single();
  return parseLineLogin(data?.settings as Record<string, unknown> | null).channel_id;
}

/**
 * credentials ที่ใช้แลก code เป็น token — เรียกได้เฉพาะฝั่ง server
 * @param slug ร้านที่เริ่ม flow มา · ไม่ส่งมา = ใช้ channel กลางของระบบ (ล็อกอินหลังบ้าน)
 */
export async function resolveLineLoginCredentials(slug?: string | null): Promise<LineLoginCredentials | null> {
  if (slug) {
    const { data } = await supabaseAdmin
      .from('companies')
      .select('settings')
      .eq('slug', slug)
      .single();
    const cred = parseLineLogin(data?.settings as Record<string, unknown> | null);
    // ตั้งไม่ครบถือว่าไม่ได้ตั้ง — อย่าเงียบ ๆ ตกไปใช้ channel กลาง เพราะ code
    // ที่ได้มาถูกออกให้ channel ของร้าน แลกกับ channel อื่นยังไงก็ไม่ผ่าน
    if (cred.channel_id && cred.channel_secret) return cred;
    return null;
  }

  const channel_id = process.env.LINE_LOGIN_CHANNEL_ID || '';
  const channel_secret = process.env.LINE_LOGIN_CHANNEL_SECRET || '';
  return channel_id && channel_secret ? { channel_id, channel_secret } : null;
}

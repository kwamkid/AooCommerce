// Path: lib/chat/contact-tables.ts
//
// ตารางผู้ติดต่อของแต่ละแพลตฟอร์ม — **ทะเบียนเดียวของทั้งระบบ**
//
// ระบบแชทเป็นแบบ "ตารางต่อแพลตฟอร์ม" (line_contacts / fb_contacts / …) ⇒ ทุก route ที่รับ
// `platform` มาจากผู้ใช้ต้องแปลงเป็นชื่อตารางเอง ซึ่งเคยเขียน map ซ้ำกันหลายที่ —
// เพิ่มแพลตฟอร์มใหม่แล้วลืมแก้สักที่ = แถวของแพลตฟอร์มนั้นตกไปที่ line_contacts เงียบ ๆ
//
// ⚠️ **instagram ใช้ fb_contacts** (แถวเดียวกัน แยกด้วยคอลัมน์ `source`) ไม่ใช่ตารางของตัวเอง

import { supabaseAdmin } from '@/lib/supabase-admin';

export type ChatContactPlatform = 'line' | 'facebook' | 'instagram' | 'shopee' | 'lazada' | 'tiktok';

export type ChatContactTable =
  | 'line_contacts'
  | 'fb_contacts'
  | 'shopee_contacts'
  | 'lazada_contacts'
  | 'tiktok_contacts';

export const CONTACT_TABLE_BY_PLATFORM: Record<ChatContactPlatform, ChatContactTable> = {
  line: 'line_contacts',
  facebook: 'fb_contacts',
  instagram: 'fb_contacts',
  shopee: 'shopee_contacts',
  lazada: 'lazada_contacts',
  tiktok: 'tiktok_contacts',
};

/**
 * ชื่อตารางของแพลตฟอร์มนี้ — **ไม่รู้จัก = null ไม่ใช่ค่าเริ่มต้น**
 * (เดาเป็น line_contacts แล้วจะเช็คสิทธิ์ผิดตาราง แปลว่าไม่ได้เช็คอะไรเลย)
 */
export function contactTableFor(platform: string | null | undefined): ChatContactTable | null {
  const key = (platform || '').trim().toLowerCase();
  return (CONTACT_TABLE_BY_PLATFORM as Record<string, ChatContactTable | undefined>)[key] ?? null;
}

/**
 * ผู้ติดต่อรายนี้เป็นของบริษัทนี้จริงไหม — **กันการแก้ข้ามบริษัท**
 *
 * จำเป็นเพราะ `supabaseAdmin` เป็น service role ที่ข้าม RLS ⇒ route ต้องเช็ค company_id เอง
 * แพลตฟอร์มที่ไม่รู้จัก = false (ปฏิเสธไว้ก่อน)
 */
export async function contactBelongsToCompany(
  contactId: string,
  platform: string,
  companyId: string,
): Promise<boolean> {
  const table = contactTableFor(platform);
  if (!table || !contactId || !companyId) return false;

  const { data } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('id', contactId)
    .eq('company_id', companyId)
    .single();

  return !!data;
}

// เลขบนไอคอนแอป = "ข้อความแชทที่ยังไม่อ่าน" ของคนคนนั้น รวมทุกบริษัทที่เป็นสมาชิก (server-only)
//
// ใช้ร่วม 3 ทาง ให้เลขเดียวกันเสมอ:
//   - แนบไปกับ push ทุกใบ (Web Push → SW ตั้งเลขตรง ๆ · FCM → aps.badge) แทนการ "บวกหนึ่ง" ในเครื่อง
//   - /api/header/summary คืน `badgeTotal` ให้หน้าเว็บตั้งเลขเองทุกครั้งที่ตัวเลขในแอปเปลี่ยน (อ่านแล้ว/อ่านทั้งหมด)
//   - นับแบบเดียวกับตัวเลขในแอป (ผลรวม unread_count ของทุกคู่สนทนา) จะได้ไม่มีสองเลขที่ไม่ตรงกัน
//
// ทำไมต้องเป็นเลขจากเซิร์ฟเวอร์: ตัวนับในเครื่อง (SW บวกทีละ push แล้วล้างตอนเปิดแอป) ทำให้
// "เปิดแอปปุ๊บเลขหาย ทั้งที่ยังอ่านไม่หมด" — ผู้ใช้ตีกลับ 7 ก.ย. 2026 ขอให้ตรงกับ unread จริง
import { supabaseAdmin } from '@/lib/supabase-admin';

/** ตารางผู้ติดต่อของทุกแพลตฟอร์มแชท — ชุดเดียวกับที่ /api/header/summary ใช้ */
export const CHAT_CONTACT_TABLES = ['line_contacts', 'fb_contacts', 'shopee_contacts', 'lazada_contacts', 'tiktok_contacts'] as const;

/** ผลรวม unread_count ของทุกคู่สนทนาในบริษัทที่ระบุ */
export async function sumUnreadChat(companyIds: string[]): Promise<number> {
  if (!companyIds.length) return 0;
  const sums = await Promise.all(CHAT_CONTACT_TABLES.map(async (table) => {
    try {
      const { data } = await supabaseAdmin
        .from(table)
        .select('unread_count')
        .in('company_id', companyIds)
        .gt('unread_count', 0);
      return (data || []).reduce((acc, row) => acc + (Number(row.unread_count) || 0), 0);
    } catch {
      return 0;
    }
  }));
  return sums.reduce((a, b) => a + b, 0);
}

/** เลขบนไอคอนของผู้ใช้คนหนึ่ง — รวมทุกบริษัทที่ยัง active (คนดูแลหลายร้านเห็นยอดรวม) */
export async function countUnreadChatForUser(userId: string): Promise<number> {
  try {
    const { data: memberships } = await supabaseAdmin
      .from('company_members')
      .select('company_id')
      .eq('user_id', userId)
      .eq('is_active', true);
    return sumUnreadChat((memberships || []).map(m => m.company_id as string));
  } catch {
    return 0;
  }
}

import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST — เคลียร์ "ยังไม่อ่าน" ทีเดียวทั้งชุด
 *
 * จำเป็นเพราะ **บางแพลตฟอร์มบอกเราไม่ได้ว่าแอดมินไปอ่าน/ตอบจากแอปของมันเอง**
 * - LINE: Messaging API ไม่ส่ง webhook ของข้อความที่ OA ส่งเอง และไม่มี event "อ่านแล้ว"
 *   → ตอบจาก LINE OA Manager แล้วฝั่งเราไม่มีทางรู้เลย ต้องเคลียร์เอง
 * - Facebook/Instagram: มี echo → เคลียร์ให้อัตโนมัติแล้ว (lib/services/chat/facebook.ts)
 * - Shopee: ข้อความขาออกเข้ามาทาง webhook → เคลียร์ให้อัตโนมัติแล้ว
 * - Lazada/TikTok: ดึงค่า unread จากตัวแพลตฟอร์มโดยตรงอยู่แล้ว
 *
 * body: { platform?: 'line'|'facebook'|'shopee'|'lazada'|'tiktok', account_id?: string }
 * ไม่ส่งอะไรมา = เคลียร์ทุกช่องทางของบริษัทนี้
 */
const TABLES: Record<string, string> = {
  line: 'line_contacts',
  facebook: 'fb_contacts',
  shopee: 'shopee_contacts',
  lazada: 'lazada_contacts',
  tiktok: 'tiktok_contacts',
};

export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const platform: string | undefined = body?.platform && body.platform !== 'all' ? body.platform : undefined;
    const accountId: string | undefined = body?.account_id || undefined;

    const tables = platform ? [TABLES[platform]].filter(Boolean) : Object.values(TABLES);
    if (tables.length === 0) return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });

    let cleared = 0;
    for (const table of tables) {
      let q = supabaseAdmin
        .from(table)
        .update({ unread_count: 0 })
        .eq('company_id', companyId)
        .gt('unread_count', 0);
      if (accountId) q = q.eq('chat_account_id', accountId);
      const { data, error } = await q.select('id');
      if (error) {
        console.error(`[chat/read-all] ${table}:`, error.message);
        continue; // ช่องทางหนึ่งพังไม่ควรทำให้ที่เหลือไม่ได้เคลียร์
      }
      cleared += (data || []).length;
    }

    return NextResponse.json({ success: true, cleared });
  } catch (error) {
    console.error('Mark all read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

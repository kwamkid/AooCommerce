// Path: app/api/chat/contacts/[id]/optin-invite/route.ts
//
// ชวนลูกค้า "รับข่าวสาร" บน Messenger — แอดมินกดเองจากห้องแชท
//
// ⚠️ กติกาของ Meta ที่ทำให้ปุ่มนี้ต้องมีเงื่อนไข (ยิงจริงยืนยันแล้ว 14 ก.ย. 2026):
//   • ส่งได้ **เฉพาะในกรอบ 24 ชม. นับจากลูกค้าทักล่าสุด** — พ้นกรอบ API ตอบ
//     code 10/2018278 "sent outside of allowed window"
//   • ส่งซ้ำได้ **1 ครั้ง/สัปดาห์/หัวข้อ/คน**
// ⇒ เช็คกรอบเวลาที่นี่ ไม่ใช่ที่หน้าจอ เพราะ `last_message_at` ของห้องขยับตอนแอดมินตอบด้วย
//   (กฎใน domains/chat.md) จะเอามาตัดสิน "ลูกค้าทักล่าสุด" ไม่ได้ — ต้องดูข้อความขาเข้าจริง
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getChatAccount } from '@/lib/chat-config';
import { logIntegrationNow } from '@/lib/integration-logger';
import { graphPost } from '@/lib/meta/graph';
import { BROADCAST_SETUP_KEYS } from '@/lib/broadcast/platforms';

export const dynamic = 'force-dynamic';

/** กรอบที่ Meta ยอมให้ส่งข้อความทั่วไป (รวมคำชวนสมัคร) */
const WINDOW_HOURS = 24;
const DEFAULT_TITLE = 'รับข่าวสารและโปรโมชัน';
/** ความถี่ที่ขอ — WEEKLY เป็นกลางที่สุด (DAILY ดูรบกวน · MONTHLY นาน จนลูกค้าลืมว่าสมัครไว้) */
const DEFAULT_FREQUENCY = 'WEEKLY';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
  if (!can(auth, 'chat.reply')) return NextResponse.json({ error: 'ไม่มีสิทธิ์ตอบแชท' }, { status: 403 });

  const { id: contactId } = await params;

  const { data: contact } = await supabaseAdmin
    .from('fb_contacts')
    .select('id, company_id, fb_psid, chat_account_id, display_name')
    .eq('id', contactId)
    .maybeSingle();
  if (!contact || contact.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'ไม่พบห้องแชทนี้' }, { status: 404 });
  }

  // ── กรอบ 24 ชม. — นับจาก "ข้อความขาเข้า" ล่าสุดเท่านั้น ──────────────
  const since = new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString();
  const { count: recentIncoming } = await supabaseAdmin
    .from('fb_messages')
    .select('id', { count: 'exact', head: true })
    .eq('fb_contact_id', contact.id)
    .eq('direction', 'incoming')
    .gte('created_at', since);
  if (!recentIncoming) {
    return NextResponse.json({
      error: `ลูกค้าไม่ได้ทักมาเกิน ${WINDOW_HOURS} ชั่วโมงแล้ว — Facebook ให้ชวนรับข่าวสารได้เฉพาะตอนที่ยังคุยกันอยู่ (รอให้ลูกค้าทักมาใหม่ก่อน)`,
      code: 'outside_window',
    }, { status: 400 });
  }

  const account = await getChatAccount(contact.chat_account_id);
  if (!account || account.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'ไม่พบเพจของห้องแชทนี้' }, { status: 404 });
  }
  const creds = (account.credentials || {}) as Record<string, unknown>;
  const pageId = typeof creds.page_id === 'string' ? creds.page_id : '';
  const pageToken = typeof creds.page_access_token === 'string' ? creds.page_access_token : '';
  if (!pageId || !pageToken) {
    return NextResponse.json({ error: 'เพจนี้ยังไม่มี token — เชื่อมต่อเพจใหม่ก่อน' }, { status: 400 });
  }

  // ข้อความชวนสมัครตั้งได้ต่อเพจ (การตลาด › บรอดแคสต์ › ตั้งค่า) — ไม่ตั้งก็ใช้ค่ากลาง
  const title = String(creds[BROADCAST_SETUP_KEYS.optinTitle] ?? '').trim()
    || `${DEFAULT_TITLE}จาก ${account.account_name || 'ร้าน'}`.slice(0, 65);
  const imageUrl = String(creds[BROADCAST_SETUP_KEYS.optinImage] ?? '').trim();
  const frequency = String(creds[BROADCAST_SETUP_KEYS.optinFrequency] ?? '').trim() || DEFAULT_FREQUENCY;

  const res = await graphPost<{ message_id?: string }>(`/${pageId}/messages`, pageToken, {
    recipient: { id: contact.fb_psid },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'notification_messages',
          title: title.slice(0, 65),
          ...(imageUrl ? { image_url: imageUrl, image_aspect_ratio: 'SQUARE' } : {}),
          notification_messages_frequency: frequency,
          notification_messages_cta_text: 'GET_UPDATES',
        },
      },
    },
  });

  await logIntegrationNow({
    company_id: auth.companyId,
    integration: 'facebook',
    account_id: account.id,
    account_name: account.account_name,
    direction: 'outgoing',
    action: 'send_optin_invite',
    method: 'POST',
    api_path: `/${pageId}/messages`,
    http_status: res.status,
    status: res.ok ? 'success' : 'error',
    error_message: res.error?.message,
    reference_type: 'fb_contact',
    reference_id: contact.id,
  });

  if (!res.ok) {
    // แปลรหัสที่เจอจริงให้อ่านรู้เรื่อง — ผู้ใช้ต้องรู้ว่าทำอะไรต่อได้ ไม่ใช่เห็นรหัสดิบ
    const code = res.error?.code;
    const sub = res.error?.error_subcode;
    if (code === 10 && sub === 2018278) {
      return NextResponse.json({
        error: `ลูกค้าไม่ได้ทักมาเกิน ${WINDOW_HOURS} ชั่วโมงแล้ว — รอให้ทักมาใหม่ก่อนถึงจะชวนได้`,
        code: 'outside_window',
      }, { status: 400 });
    }
    return NextResponse.json({
      error: res.error?.message || 'ส่งคำชวนไม่สำเร็จ',
      code: 'send_failed',
    }, { status: 400 });
  }

  // สำเนาลงห้องแชท — แอดมินคนอื่นต้องเห็นว่าเคยชวนไปแล้ว (กันชวนซ้ำจนโดนจำกัด 1 ครั้ง/สัปดาห์)
  const at = new Date().toISOString();
  await supabaseAdmin.from('fb_messages').insert({
    company_id: auth.companyId,
    fb_contact_id: contact.id,
    fb_message_id: res.body?.message_id || null,
    direction: 'outgoing',
    message_type: 'text',
    content: `[ชวนรับข่าวสาร] ${title}`,
    raw_message: { optin_invite: true, title, frequency },
    sent_by: auth.userId || null,
    sent_at: at,
    created_at: at,
  });

  return NextResponse.json({ ok: true, title });
}

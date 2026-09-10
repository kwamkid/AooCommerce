// Path: lib/ads/qualified-lead.ts
//
// "ห้องแชทนี้เป็นลูกค้าคุณภาพแล้วหรือยัง" — เกณฑ์ + ตัวตัดสินใจส่ง QualifiedLead ให้ Meta
//
// ทำไมต้องมี event นี้: โฆษณา Click-to-Messenger ที่รู้แค่ "มีคนทักมา" จะไปหาคนที่ชอบกดทัก
// (ซึ่งถูกที่สุดสำหรับ Meta) ไม่ใช่คนที่คุยแล้วซื้อ — ต้องบอกกลับไปว่าห้องไหน "คุยแล้วไปต่อ"
//
// ทริกเกอร์ 2 ทาง ซึ่งจงใจให้ต่างกัน:
//   • อัตโนมัติ — ลูกค้าพิมพ์มาเองครบ 3 ข้อความ (สัญญาณอ่อนแต่ได้ทุกห้องโดยไม่ต้องมีคนกด)
//   • คนยืนยัน — แอดมินติดแท็กที่ตั้งเป็นสัญญาณไว้ (สัญญาณแรงที่สุด เพราะคนดูแล้วตัดสิน)
// ทั้งคู่ลงที่ `evaluateQualifiedLead` ตัวเดียว และกันซ้ำที่สมุด `ad_events` ใบเดียวกัน
// (`event_id = 'ql:{contactId}'`) ⇒ ห้องหนึ่งส่งครั้งเดียวตลอดชีพ ไม่ว่ามาทางไหนก่อน
//
// **ห้าม throw** — ผู้เรียกทุกรายอยู่ใน after() ของ webhook/route ที่ตอบผู้ใช้ไปแล้ว

import { supabaseAdmin } from '@/lib/supabase-admin';
import { hasSentAdEvent } from './ledger';
import type { ConversionEventName } from './types';

/** พิมพ์มาเองครบเท่านี้ = ถือว่าคุยจริง ไม่ใช่แค่ทักแล้วหาย */
export const QUALIFIED_LEAD_MIN_MESSAGES = 3;

/**
 * ชื่อ event ที่ส่งให้ Meta + ที่ใช้เป็นคีย์ในสมุด `ad_events`
 * ถ้า Meta ปฏิเสธชื่อนี้บน business_messaging สลับเป็น 'Lead' **ที่นี่ที่เดียว**
 */
export const QUALIFIED_LEAD_EVENT_NAME: ConversionEventName = 'QualifiedLead';

/** ข้อความขาเข้าที่ไม่ได้เกิดจากการที่ลูกค้า "พิมพ์/ส่งอะไรมาจริง ๆ" */
const NON_GENUINE_TYPES = new Set(['postback', 'template', 'fallback', 'system', 'item']);

/** ชนิดที่นับได้ทุกใบแม้ไม่มีข้อความ — ลูกค้าลงมือส่งของมาจริง */
const MEDIA_TYPES = new Set(['image', 'file', 'sticker', 'audio', 'video']);

export interface InboundMessageRow {
  direction: string;
  message_type: string | null;
  content: string | null;
  raw_message: Record<string, unknown> | null;
}

/** ข้อความเดียวกันพิมพ์ซ้ำ = ตั้งใจเดียวกัน ต้องเทียบแบบไม่สนช่องว่าง/ตัวพิมพ์ */
function normalizeText(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * นับ "ข้อความที่ลูกค้าพิมพ์มาเองจริง ๆ" — **pure ทดสอบได้โดยไม่ต้องมี DB**
 *
 * ที่ต้องกรอง เพราะทั้งสามอย่างนี้ทำให้ห้องที่ไม่มีบทสนทนาเลยดูเหมือนคุยกันแล้ว:
 *   • ปุ่ม/quick reply/การ์ด — ลูกค้าแตะครั้งเดียวได้หลายแถว และเป็นของที่ *เรา* ยื่นให้กด
 *   • ข้อความซ้ำคำเดิม — "สวัสดี" รัว ๆ 3 ครั้งเพราะเน็ตค้าง ไม่ใช่การคุย 3 รอบ
 *   • แถวขาออก — ยิ่งเราตอบเยอะยิ่งดูเหมือนลูกค้าสนใจ ซึ่งกลับหัวกลับหาง
 */
export function countGenuineInbound(rows: InboundMessageRow[]): number {
  const seenText = new Set<string>();
  let count = 0;

  for (const row of rows) {
    if (row.direction !== 'incoming') continue;
    const type = (row.message_type || 'text').trim();
    if (NON_GENUINE_TYPES.has(type)) continue;
    // quick reply = ปุ่มที่เรายื่นให้กด ต่อให้ Facebook ส่งมาเป็น text ก็ไม่ใช่คำที่ลูกค้าคิดเอง
    if (row.raw_message && row.raw_message.quick_reply !== undefined && row.raw_message.quick_reply !== null) continue;

    if (MEDIA_TYPES.has(type)) {
      count += 1;
      continue;
    }

    const text = normalizeText(row.content || '');
    if (!text) continue;          // ไม่มีเนื้อ + ไม่ใช่สื่อ = ไม่มีอะไรให้นับ
    if (seenText.has(text)) continue;
    seenText.add(text);
    count += 1;
  }

  return count;
}

/** ข้อความล่าสุดที่หยิบมานับ — มากกว่านี้ไม่เปลี่ยนคำตอบ (เกณฑ์แค่ 3 ใบ) */
const INBOUND_LOOKBACK = 50;

/**
 * ใบที่ล้มซ้ำครบเท่านี้แล้วเลิกลอง — ทริกเกอร์ 'messages' มาทุกข้อความเข้า ถ้า Meta ปฏิเสธถาวร
 * (PSID ใช้ไม่ได้ · เพจไม่มีสิทธิ์) จะกลายเป็นยิง Graph ซ้ำทุกข้อความของห้องนั้นไม่รู้จบ
 */
const QUALIFIED_LEAD_MAX_ATTEMPTS = 5;

/** ใบเดิมล้มครบเพดานหรือยัง — หยุดก่อนไปนับข้อความ/ยิงซ้ำ */
async function exhaustedAttempts(eventId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('ad_events')
    .select('attempts')
    .eq('platform', 'meta')
    .eq('event_name', QUALIFIED_LEAD_EVENT_NAME)
    .eq('event_id', eventId)
    .eq('status', 'failed')
    .gte('attempts', QUALIFIED_LEAD_MAX_ATTEMPTS)
    .limit(1);
  return !!data?.length;
}

/**
 * ห้องนี้ถึงเกณฑ์แล้วยิงให้ Meta — เรียกได้ทั้งจาก webhook (ทุกข้อความ) และจากการติดแท็ก
 *
 * @param input.trigger `'messages'` = ต้องนับให้ถึงเกณฑ์ก่อน · `'tag'` = คนยืนยันแล้ว ส่งเลย
 */
export async function evaluateQualifiedLead(input: {
  companyId: string;
  contactId: string;
  trigger: 'messages' | 'tag';
}): Promise<'sent' | 'skipped' | 'failed'> {
  const { companyId, contactId, trigger } = input;
  try {
    // ส่งไปแล้วไม่ต้องนับอะไรอีก — ตัดตั้งแต่ก่อนแตะตารางข้อความ เพราะสายนี้วิ่งทุกข้อความเข้า
    if (await hasSentAdEvent('meta', QUALIFIED_LEAD_EVENT_NAME, `ql:${contactId}`)) return 'skipped';
    if (await exhaustedAttempts(`ql:${contactId}`)) return 'skipped';

    if (trigger === 'messages') {
      const { data: rows } = await supabaseAdmin
        .from('fb_messages')
        .select('direction, message_type, content, raw_message')
        .eq('company_id', companyId)
        .eq('fb_contact_id', contactId)
        .eq('direction', 'incoming')
        .order('created_at', { ascending: false })
        .limit(INBOUND_LOOKBACK);

      const genuine = countGenuineInbound((rows || []) as InboundMessageRow[]);
      if (genuine < QUALIFIED_LEAD_MIN_MESSAGES) return 'skipped';
    }

    // import ตอนเรียก ไม่ใช่ตอนโหลดไฟล์ — dispatch อ้าง subject.ts ซึ่งอ้างไฟล์นี้กลับมา
    // (ค่าคงที่ชื่อ event อยู่ที่นี่) ⇒ import แบบ static จะกลายเป็นวงกลม
    const { dispatchConversion } = await import('./dispatch');
    const result = await dispatchConversion({
      event: 'QualifiedLead',
      companyId,
      contactPlatform: 'facebook',
      contactId,
      trigger,
    });

    const statuses = [result.messaging, ...result.ads.map((a) => a.status)];
    if (statuses.includes('sent')) return 'sent';
    if (statuses.includes('failed')) return 'failed';
    return 'skipped';
  } catch (err) {
    console.error('[ads/qualified-lead] evaluate failed:', err instanceof Error ? err.message : err);
    return 'failed';
  }
}

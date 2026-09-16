// Path: lib/facebook/optin-invite.ts
//
// **ตัวส่งการ์ดชวนรับข่าวสารตัวเดียวของทั้งระบบ** — ปุ่มในห้องแชท · hook หลังปิดการขาย · cron
// ทั้งสามทางต้องเข้าที่นี่ ห้ามมีใครยิง Graph เองอีก (ไม่งั้นด่านกันส่งซ้ำ/กันผิดโทนหลุด)
//
// ⚠️ กติกาของ Meta ที่บังคับรูปร่างของไฟล์นี้ (ยิงจริงยืนยันแล้ว 14 ก.ย. 2026):
//   • ส่งได้เฉพาะใน 24 ชม. นับจาก **ลูกค้าทักล่าสุด** — พ้นกรอบได้ code 10/2018278
//   • ขอซ้ำได้ 1 ครั้ง/สัปดาห์/หัวข้อ/คน
// ⇒ "ลูกค้าทักล่าสุด" ต้องนับจากข้อความ **ขาเข้า** เท่านั้น ห้ามใช้ `fb_contacts.last_message_at`
//   (ค่านั้นขยับตอนแอดมินตอบด้วย — กฎใน domains/chat.md)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { getChatAccount } from '@/lib/chat-config';
import { logIntegrationNow } from '@/lib/integration-logger';
import { graphPost } from '@/lib/meta/graph';
import { loadOrderForConversion } from '@/lib/ads/subject';
import {
  readOptinConfig,
  OPTIN_WINDOW_HOURS,
  OPTIN_MIN_REASK_DAYS,
  type OptinTrigger,
} from '@/lib/broadcast/optin';
import { claimOptinInvite, finishOptinInvite } from './optin-ledger';

/** คนที่กด "เลิกรับ" ห้ามชวนซ้ำ — ยกเว้นแอดมินกดเองหลังผ่านไปนานมาก (ถือว่ามีบริบทใหม่) */
const UNSUBSCRIBED_MANUAL_COOLDOWN_DAYS = 90;

export type OptinSkipCode =
  | 'not_found'
  | 'not_facebook'
  | 'disabled'
  | 'already_subscribed'
  | 'unsubscribed'
  | 'max_asks'
  | 'too_soon'
  | 'no_image'
  | 'outside_window'
  | 'claimed'
  | 'no_token'
  | 'send_failed';

export interface SendOptinInput {
  companyId: string;
  contactId: string;
  trigger: OptinTrigger;
  /** จำเป็นเมื่อ trigger = after_sale (ใช้เป็นกุญแจกันส่งซ้ำ) */
  orderId?: string | null;
  requestedBy?: string | null;
  /** cron รู้ค่านี้จาก RPC อยู่แล้ว — ส่งมาเพื่อข้าม query กรอบ 24 ชม. รายคน */
  knownLastIncomingAt?: string;
}

export interface SendOptinResult {
  status: 'sent' | 'skipped' | 'failed';
  /** ข้อความไทยที่เอาไปโชว์ผู้ใช้ได้เลย */
  reason?: string;
  code?: OptinSkipCode;
  title?: string;
}

interface ContactRow {
  id: string;
  company_id: string;
  fb_psid: string;
  chat_account_id: string | null;
  display_name: string | null;
  source: string | null;
  optin_status: string | null;
  optin_status_at: string | null;
  optin_invited_at: string | null;
  optin_invite_count: number | null;
}

const DAY_MS = 86_400_000;

/** กุญแจกันส่งซ้ำ = "เหตุผลที่ควรถามครั้งนี้" ไม่ใช่เวลาที่กด (ดู lib/facebook/optin-ledger.ts) */
function dedupeKeyFor(input: SendOptinInput): string | null {
  if (input.trigger === 'after_sale') return input.orderId ? `order:${input.orderId}` : null;
  if (input.trigger === 'quiet') return input.knownLastIncomingAt ? `quiet:${input.knownLastIncomingAt}` : null;
  // ⚠️ UTC โดยจงใจ — ห้ามเปลี่ยนเป็นเวลาไทย ไม่งั้นกุญแจเพี้ยนตอนข้ามวันคนละแบบกับที่เทียบเวลาอื่น
  return `manual:${new Date().toISOString().slice(0, 10)}`;
}

/** ลูกค้าทักมาภายใน 24 ชม. ไหม — นับ **ขาเข้าเท่านั้น** */
async function hasRecentIncoming(contactId: string): Promise<boolean> {
  const since = new Date(Date.now() - OPTIN_WINDOW_HOURS * 3600_000).toISOString();
  const { count } = await supabaseAdmin
    .from('fb_messages')
    .select('id', { count: 'exact', head: true })
    .eq('fb_contact_id', contactId)
    .eq('direction', 'incoming')
    .gte('created_at', since);
  return !!count;
}

/**
 * ส่งการ์ดชวนรับข่าวสารหนึ่งใบ
 *
 * ลำดับด่านเรียงจาก **ถูกไปแพง** และ **จองสิทธิ์เป็นขั้นก่อนสุดท้ายเสมอ** —
 * จองแล้วค่อยพบว่าไม่ควรส่ง = ใบนั้นถูกปิดตายทั้งที่ไม่เคยส่ง (กุญแจเดิมใช้ซ้ำไม่ได้)
 */
export async function sendOptinInvite(input: SendOptinInput): Promise<SendOptinResult> {
  const { companyId, contactId, trigger } = input;

  const { data: contact } = await supabaseAdmin
    .from('fb_contacts')
    .select('id, company_id, fb_psid, chat_account_id, display_name, source, optin_status, optin_status_at, optin_invited_at, optin_invite_count')
    .eq('id', contactId)
    .maybeSingle<ContactRow>();

  if (!contact || contact.company_id !== companyId) {
    return { status: 'skipped', code: 'not_found', reason: 'ไม่พบห้องแชทนี้' };
  }
  // IG อยู่ตารางเดียวกัน แต่ส่ง notification_messages ไม่ได้
  if (contact.source !== 'facebook') {
    return { status: 'skipped', code: 'not_facebook', reason: 'ชวนรับข่าวสารได้เฉพาะห้องแชทของเพจ Facebook' };
  }

  if (!contact.chat_account_id) {
    return { status: 'skipped', code: 'not_found', reason: 'ห้องแชทนี้ยังไม่ผูกกับเพจ' };
  }
  const account = await getChatAccount(contact.chat_account_id);
  if (!account || account.company_id !== companyId) {
    return { status: 'skipped', code: 'not_found', reason: 'ไม่พบเพจของห้องแชทนี้' };
  }
  const creds = (account.credentials || {}) as Record<string, unknown>;
  const pageId = typeof creds.page_id === 'string' ? creds.page_id : '';
  const pageToken = typeof creds.page_access_token === 'string' ? creds.page_access_token : '';
  if (!pageId || !pageToken) {
    return { status: 'skipped', code: 'no_token', reason: 'เพจนี้ยังไม่มี token — เชื่อมต่อเพจใหม่ก่อน' };
  }

  const cfg = readOptinConfig(creds, account.account_name || 'ร้าน');
  const scenario = cfg[trigger];
  if (!scenario.enabled) {
    return { status: 'skipped', code: 'disabled', reason: 'ยังไม่ได้เปิดใช้การชวนแบบนี้ (ตั้งค่าที่ การตลาด › บรอดแคสต์ › ตั้งค่า)' };
  }

  if (contact.optin_status === 'subscribed') {
    return { status: 'skipped', code: 'already_subscribed', reason: 'ลูกค้ากดรับข่าวสารไปแล้ว' };
  }
  if (contact.optin_status === 'unsubscribed') {
    const since = contact.optin_status_at ? Date.now() - new Date(contact.optin_status_at).getTime() : 0;
    const cooledDown = trigger === 'manual' && since > UNSUBSCRIBED_MANUAL_COOLDOWN_DAYS * DAY_MS;
    if (!cooledDown) {
      return { status: 'skipped', code: 'unsubscribed', reason: 'ลูกค้าเคยกดเลิกรับข่าวสาร — ไม่ชวนซ้ำ' };
    }
  }

  if ((contact.optin_invite_count ?? 0) >= cfg.max_asks) {
    return { status: 'skipped', code: 'max_asks', reason: `ชวนครบ ${cfg.max_asks} ครั้งแล้ว — ไม่ชวนอีก` };
  }

  if (contact.optin_invited_at) {
    const waitDays = Math.max(cfg.reask_days, OPTIN_MIN_REASK_DAYS);
    const elapsed = Date.now() - new Date(contact.optin_invited_at).getTime();
    if (elapsed < waitDays * DAY_MS) {
      const left = Math.ceil((waitDays * DAY_MS - elapsed) / DAY_MS);
      return { status: 'skipped', code: 'too_soon', reason: `เพิ่งชวนไปแล้ว — ชวนใหม่ได้ในอีก ${left} วัน` };
    }
  }

  // กรอบ 24 ชม. — cron รู้มาแล้วจาก RPC ไม่ต้องถาม DB ซ้ำรายคน
  if (!input.knownLastIncomingAt && !(await hasRecentIncoming(contact.id))) {
    return {
      status: 'skipped',
      code: 'outside_window',
      reason: `ลูกค้าไม่ได้ทักมาเกิน ${OPTIN_WINDOW_HOURS} ชั่วโมงแล้ว — Facebook ให้ชวนรับข่าวสารได้เฉพาะตอนที่ยังคุยกันอยู่ (รอให้ลูกค้าทักมาใหม่ก่อน)`,
    };
  }

  // รูปเป็นฟิลด์บังคับจริง (ดูคอมเมนต์ที่ payload ข้างล่าง) — เช็คก่อนจองสิทธิ์
  // ไม่งั้นใบนั้นถูกปิดตายทั้งที่ยิงไม่ออกตั้งแต่แรก
  if (!scenario.image_url.trim()) {
    return {
      status: 'skipped',
      code: 'no_image',
      reason: 'ยังไม่ได้ใส่รูปบนการ์ด — Facebook ไม่รับการ์ดชวนสมัครที่ไม่มีรูป (ตั้งที่ การตลาด › บรอดแคสต์ › ตั้งค่า)',
    };
  }

  const dedupeKey = dedupeKeyFor(input);
  if (!dedupeKey) {
    return { status: 'failed', code: 'send_failed', reason: 'ข้อมูลไม่ครบสำหรับกันส่งซ้ำ' };
  }

  const title = scenario.title.trim();
  const claim = await claimOptinInvite({
    company_id: companyId,
    chat_account_id: account.id,
    fb_contact_id: contact.id,
    trigger,
    dedupe_key: dedupeKey,
    title,
    frequency: scenario.frequency,
    order_id: input.orderId ?? null,
    requested_by: input.requestedBy ?? null,
  });
  if (!claim) {
    return { status: 'skipped', code: 'claimed', reason: 'ชวนไปแล้วในรอบนี้' };
  }

  // ⚠️ รูปแบบนี้ผ่านการยิงจริงแล้ว (16 ก.ย. 2026) — **ห้ามแก้ตามเอกสารโดยไม่ยิงทดสอบ** เอกสาร
  // สาธารณะของ Meta ไม่ตรงกับของจริงหลายจุด:
  //   • `image_url` **เป็นฟิลด์บังคับ** ถึงเอกสารจะบอกว่า optional — ไม่มีรูป Meta ตอบ
  //     `-1/2018012 (#-1) Unexpected internal error` ซึ่งอ่านไม่ออกเลยว่าขาดอะไร (เสียเวลาไล่ทั้งวัน)
  //   • `notification_messages_frequency` ใส่ไม่ได้ → `(#100) Invalid keys … in param "name_placeholder"`
  //     (ความถี่เป็นสิ่งที่ลูกค้าเลือกเองตอนกดรับ แล้วส่งกลับมาทาง webhook)
  //   • `notification_messages_timezone` ไม่จำเป็น (ตัวที่ยิงผ่านไม่มี)
  const res = await graphPost<{ message_id?: string }>(`/${pageId}/messages`, pageToken, {
    recipient: { id: contact.fb_psid },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'notification_messages',
          title,
          image_url: scenario.image_url,
          image_aspect_ratio: 'SQUARE',
          notification_messages_cta_text: 'GET_UPDATES',
          // กลับมาทาง webhook ตอนลูกค้ากดรับ — บอกว่าเขาสมัครจากจังหวะไหน
          payload: `AOO_OPTIN_${trigger}`,
        },
      },
    },
  });

  await logIntegrationNow({
    company_id: companyId,
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
    reference_label: trigger,
  });

  if (!res.ok) {
    const outsideWindow = res.error?.code === 10 && res.error?.error_subcode === 2018278;
    await finishOptinInvite(claim.id, {
      status: 'failed',
      http_status: res.status,
      error: res.error?.message ?? 'send failed',
    });
    return {
      status: 'failed',
      code: outsideWindow ? 'outside_window' : 'send_failed',
      reason: outsideWindow
        ? `ลูกค้าไม่ได้ทักมาเกิน ${OPTIN_WINDOW_HOURS} ชั่วโมงแล้ว — รอให้ทักมาใหม่ก่อนถึงจะชวนได้`
        : res.error?.message || 'ส่งคำชวนไม่สำเร็จ',
    };
  }

  const messageId = res.body?.message_id || null;
  await finishOptinInvite(claim.id, { status: 'sent', fb_message_id: messageId, http_status: res.status });

  // สำเนาลงห้องแชท — แอดมินคนอื่นต้องเห็นว่าเคยชวนไปแล้ว
  // ⚠️ **ต้องเก็บ fb_message_id เสมอ** — การ์ดใบนี้จะ echo กลับมาทาง webhook แล้ว
  // saveEchoMessage จะ dedupe ด้วยค่านี้; ไม่เก็บ = ได้แถวซ้ำ + last_message_at เด้ง
  // ⇒ ตรรกะ "ห้องนี้เงียบแล้ว" ของ cron พังเงียบ ๆ
  // ⛔ ห้ามแตะ last_message_at / unread_count ที่นี่ (คำชวนไม่ใช่บทสนทนา)
  const at = new Date().toISOString();
  await supabaseAdmin.from('fb_messages').insert({
    company_id: companyId,
    fb_contact_id: contact.id,
    fb_message_id: messageId,
    direction: 'outgoing',
    message_type: 'text',
    content: `[ชวนรับข่าวสาร] ${title}`,
    raw_message: { optin_invite: true, trigger, title, frequency: scenario.frequency },
    sent_by: input.requestedBy ?? null,
    sent_at: at,
    created_at: at,
  });

  await supabaseAdmin.rpc('bump_fb_optin_invited', { p_contact_id: contact.id, p_trigger: trigger });

  return { status: 'sent', title };
}

/**
 * ชวนหลังปิดการขาย — เรียกจากทุกจุดที่บิล "เพิ่งกลายเป็น paid" (ใน `after()` เสมอ)
 *
 * ตัวมันเองเช็คว่าบิลนี้มาจากห้องแชท Facebook ไหม ⇒ **hook เกินได้ ไม่เสียหาย**
 * (ต้นทุน = อ่านแถวเดียวผ่าน PK) · บิลใบเดียวถูกเรียกหลายทางก็ส่งใบเดียว เพราะ
 * กุญแจกันซ้ำคือ `order:<id>` ที่ระดับฐานข้อมูล
 *
 * ⛔ ห้ามเอาไปแขวนกับ `dispatchConversion` — สายนั้นมีตัวกวาดย้อนหลังได้ถึง 7 วัน
 * จะกลายเป็นชวนคนที่ซื้อไปเมื่อ 5 วันก่อน
 */
export async function inviteAfterSale(orderId: string): Promise<void> {
  try {
    const order = await loadOrderForConversion(orderId);
    if (!order) return;
    if (order.chat_platform !== 'facebook' || !order.chat_contact_id) return;
    if (order.payment_status !== 'paid') return;
    if (order.order_status === 'cancelled') return;

    await sendOptinInvite({
      companyId: order.company_id,
      contactId: order.chat_contact_id,
      trigger: 'after_sale',
      orderId,
    });
  } catch (err) {
    // งานเสริมหลังบ้าน — ห้ามทำให้สายที่เรียกล้ม
    console.error('[optin/after-sale] failed:', err instanceof Error ? err.message : String(err));
  }
}

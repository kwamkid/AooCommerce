// Path: lib/meta/marketing-messages.ts
//
// ข้อความการตลาดบน Messenger (Marketing Message API) — **ชั้นเดียวที่คุยกับ Meta เรื่องนี้**
//
// ═══ กลไกจริง (ยิงของจริงสำเร็จ 14 ก.ย. 2026) ═══
//  1. รายชื่อผู้สมัคร: GET /{page_id}/notification_message_tokens  ← อยู่ที่ Meta **ห้ามเก็บสำเนา**
//     (ลูกค้ากดเลิกรับเมื่อไหร่ก็ได้ · เวลาที่ส่งได้ครั้งถัดไปขยับทุกครั้งที่ส่ง)
//  2. สร้างแคมเปญ: POST act_<AD_ACCOUNT_ID>/message_campaign {name, page_id, daily_budget}
//     → คืน id (เป็น **ad id** ไม่ใช่ campaign id · Meta สร้าง campaign+adset+ad ให้ครบชุด)
//  3. ส่ง: POST act_<AD_ACCOUNT_ID>/messages
//     {message_id: <id จากข้อ 2>, messenger_delivery_data:{subscription_token}, message}
//
// ⚠️ **แคมเปญที่เพิ่งสร้างส่งทันทีไม่ได้** — Meta ใช้เวลาเตรียมก่อน (วัดจริง 139 นาที)
//    error ไล่ขั้น 2300012 "still being populated" → 2300041 "not ready for delivery" → สำเร็จ
//    ทั้งสองตัวไม่ใช่ความผิดพลาด แต่แปลว่า "ยังไม่ถึงเวลา ลองใหม่" (isCampaignNotReady)
// ⚠️ เพดาน 1 ข้อความ/12 ชม./คน · เสียเงินต่อข้อความที่ส่งถึงเครื่องจริง (งบเป็นเพดาน ไม่ใช่ยอดหัก)
// ⚠️ ต้องใช้ **system user token** ของ business (ไม่ใช่ page token / ad account token)
import { supabaseAdmin } from '@/lib/supabase-admin';
import { graphGet, graphPost } from './graph';

/** คีย์ใน `app_flags` ที่ route เชื่อม business เขียนไว้ */
const MM_TOKEN_KEY = (companyId: string) => `meta_mm_business:${companyId}`;

/**
 * system user token ของบริษัท — **ที่เดียวที่อ่านค่านี้** (ตัวส่ง · หน้าตั้งค่า · สคริปต์ ใช้ร่วม)
 * อ่าน `app_flags` กระจายหลายที่แล้ววันหนึ่งย้ายที่เก็บจะตกหล่นทีละจุด
 */
export async function getMarketingSystemToken(companyId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('app_flags')
    .select('value')
    .eq('key', MM_TOKEN_KEY(companyId))
    .maybeSingle();
  const token = (data?.value as { access_token?: unknown } | null)?.access_token;
  return typeof token === 'string' && token.trim() ? token : null;
}

export interface MarketingSubscriber {
  /** PSID — ใช้ผูกกับ `fb_contacts.fb_psid` เพื่อเขียนสำเนาลงห้องแชท */
  psid: string;
  /** โทเค็นที่ใช้ส่ง — **ความลับ ห้ามเก็บลง DB/log** ดึงสดทุกครั้งที่จะส่ง */
  token: string;
  topicTitle: string | null;
  /** ส่งได้อีกครั้งเมื่อไหร่ (epoch วินาที) — ผ่านไปแล้ว/ไม่มี = ส่งได้ตอนนี้ */
  nextEligibleAt: number | null;
}

interface TokenRow {
  notification_messages_token?: string;
  recipient_id?: string;
  topic_title?: string;
  notification_messages_reoptin?: string;
  next_eligible_time_for_paid_messaging?: number | string;
}

/**
 * ผู้สมัครของเพจ — กรองคนที่กดเลิกรับออกแล้ว
 * `MAX_PAGES` กันวนไม่จบเมื่อร้านมีผู้สมัครหลักหมื่น (1,000/หน้า)
 */
export async function listMarketingSubscribers(
  pageId: string,
  pageToken: string,
  maxPages = 10,
): Promise<{ ok: boolean; subscribers: MarketingSubscriber[]; error: string | null }> {
  const subscribers: MarketingSubscriber[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params: Record<string, string> = { limit: '1000' };
    if (after) params.after = after;
    const res = await graphGet<{ data?: TokenRow[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `/${pageId}/notification_message_tokens`, pageToken, params,
    );
    if (!res.ok) return { ok: false, subscribers, error: res.error?.message || `Graph ตอบ ${res.status}` };

    for (const row of res.body?.data || []) {
      if (!row.notification_messages_token || !row.recipient_id) continue;
      // กดเลิกรับแล้ว = ส่งไม่ได้ ไม่ต้องนับเป็นผู้รับ
      if (row.notification_messages_reoptin && row.notification_messages_reoptin !== 'ENABLED') continue;
      const next = Number(row.next_eligible_time_for_paid_messaging || 0);
      subscribers.push({
        psid: String(row.recipient_id),
        token: row.notification_messages_token,
        topicTitle: row.topic_title || null,
        nextEligibleAt: next > 0 ? next : null,
      });
    }

    const nextCursor = res.body?.paging?.next ? res.body?.paging?.cursors?.after : undefined;
    if (!nextCursor) break;
    after = nextCursor;
  }

  return { ok: true, subscribers, error: null };
}

/** ตอนนี้ส่งถึงคนนี้ได้ไหม (เพดาน 1 ข้อความ/12 ชม./คน) */
export function isEligibleNow(s: MarketingSubscriber, nowSec = Math.floor(Date.now() / 1000)): boolean {
  return !s.nextEligibleAt || s.nextEligibleAt <= nowSec;
}

export interface CampaignResult {
  ok: boolean;
  /** id ที่ใช้เป็น `message_id` ตอนส่ง */
  id: string | null;
  error: string | null;
}

/**
 * สร้างแคมเปญข้อความการตลาด — **สร้างครั้งเดียวต่อบรอดแคสต์** (เก็บ id ไว้ใน `platform_data`)
 * `dailyBudgetSatang` = หน่วยย่อยของสกุลเงิน (10000 = 100 บาท) · 1 บาทถูกปฏิเสธ ต่ำสุดราว 33 บาท
 */
export async function createMessageCampaign(
  adAccountExternalId: string,
  systemToken: string,
  input: { name: string; pageId: string; dailyBudgetSatang: number },
): Promise<CampaignResult> {
  const res = await graphPost<{ id?: string }>(`/act_${adAccountExternalId}/message_campaign`, systemToken, {
    name: input.name.slice(0, 80),
    page_id: input.pageId,
    daily_budget: String(Math.round(input.dailyBudgetSatang)),
  });
  if (!res.ok || !res.body?.id) {
    return { ok: false, id: null, error: res.error?.message || `สร้างแคมเปญไม่สำเร็จ (${res.status})` };
  }
  return { ok: true, id: res.body.id, error: null };
}

export interface SendResult {
  ok: boolean;
  trackingId: string | null;
  error: string | null;
  /** แคมเปญยังเตรียมไม่เสร็จ — ไม่ใช่ความผิดพลาด ให้ลองใหม่ทีหลัง */
  notReady: boolean;
}

/** รหัสที่แปลว่า "แคมเปญยังไม่พร้อม" — เจอจริงทั้งสองตัวตอนทดสอบ */
const NOT_READY_CODES = new Set([2300012, 2300041]);

export function isCampaignNotReady(code: number | null | undefined, message?: string | null): boolean {
  if (code && NOT_READY_CODES.has(code)) return true;
  return /still being populated|not ready for message delivery/i.test(message || '');
}

/**
 * ส่งข้อความการตลาด 1 ใบ — `message` เป็นรูปเดียวกับ Send API ปกติ
 * (generic template ใช้ได้: รูป + หัวข้อ + คำอธิบาย + ปุ่ม ≤3 · การ์ดเลื่อน ≤10)
 */
export async function sendMarketingMessage(
  adAccountExternalId: string,
  systemToken: string,
  input: { campaignId: string; subscriptionToken: string; message: Record<string, unknown> },
): Promise<SendResult> {
  const res = await graphPost<{ success?: boolean; marketing_message_tracking_id?: string }>(
    `/act_${adAccountExternalId}/messages`,
    systemToken,
    {
      message_id: input.campaignId,
      messenger_delivery_data: { subscription_token: input.subscriptionToken },
      message: input.message,
    },
  );
  if (res.ok) {
    return { ok: true, trackingId: res.body?.marketing_message_tracking_id || null, error: null, notReady: false };
  }
  const message = res.error?.message || `ส่งไม่สำเร็จ (${res.status})`;
  return {
    ok: false,
    trackingId: null,
    error: message,
    notReady: isCampaignNotReady(res.error?.code, message),
  };
}

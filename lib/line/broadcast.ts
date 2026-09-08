// บรอดแคสต์ LINE — ส่งข้อความหาลูกค้าหลายคนพร้อมกันจากระบบเรา
//
// ทำไมต้องส่งจากที่นี่: Messaging API ของ LINE **อ่านประวัติแชทไม่ได้** และข้อความที่
// ร้านส่งจาก LINE Official Account Manager (บรอดแคสต์/ตอบมือ) **ไม่เข้ามาที่ webhook เรา**
// ⇒ ส่งจากระบบเราเท่านั้นที่ทำให้ข้อความไปโผล่ในห้องแชทของลูกค้าทุกคน และรู้ตัวว่า
// กินโควตารายเดือนของ OA ไปเท่าไหร่ (ข้อความ push/multicast/broadcast กินโควตาทุกใบ —
// การตอบด้วย reply token ไม่กิน)
//
// งานส่งจริงออกแบบให้ **กดซ้ำได้เสมอ**: หั่นผู้รับเป็นล็อตละ 500 แล้วผูก
// `X-Line-Retry-Key` (uuid) ไว้กับล็อตตั้งแต่ก่อนยิง — ฟังก์ชันตายกลางทาง/หมดเวลา
// แล้วเรียกใหม่ ล็อตเดิมจะไม่ถูกส่งซ้ำเพราะ LINE จำ retry key ไว้ให้

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getChatAccount, getLineCredsFromAccount } from '@/lib/chat-config';
import { logIntegrationNow } from '@/lib/integration-logger';
import { fetchAllRows } from '@/lib/supabase-paging';
import { LINE_TEXT_MAX, MULTICAST_BATCH_SIZE } from '@/lib/line/constants';

const LINE_API = 'https://api.line.me/v2/bot';

export { LINE_TEXT_MAX, MULTICAST_BATCH_SIZE };

// ─── Types ────────────────────────────────────────────────────────────

export type BroadcastAudienceType = 'all' | 'contacts' | 'tags' | 'customers';
export type BroadcastStatus = 'pending' | 'sending' | 'sent' | 'partial' | 'failed';

export interface BroadcastAudienceFilter {
  tag_ids?: string[];
}

export type LineMessageObject =
  | { type: 'text'; text: string }
  | { type: 'image'; originalContentUrl: string; previewImageUrl: string };

export interface LineQuota {
  /** 'none' = ไม่จำกัด · 'limited' = มีเพดานรายเดือน · 'unknown' = ถาม LINE ไม่สำเร็จ */
  type: 'none' | 'limited' | 'unknown';
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface BroadcastRecipient {
  contact_id: string;
  line_user_id: string;
}

export interface BroadcastBatch {
  index: number;
  /** ผูกกับล็อตตั้งแต่ก่อนยิง — ยิงซ้ำด้วยคีย์เดิม LINE จะไม่ส่งข้อความซ้ำ */
  retry_key: string;
  user_ids: string[];
  contact_ids: string[];
  status: 'pending' | 'sent' | 'failed';
  request_id?: string | null;
  error?: string | null;
}

interface BroadcastRow {
  id: string;
  company_id: string;
  chat_account_id: string;
  created_by: string | null;
  audience_type: BroadcastAudienceType;
  audience_filter: BroadcastAudienceFilter | null;
  messages: LineMessageObject[];
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: BroadcastStatus;
  batches: BroadcastBatch[] | null;
  platform_request_ids: string[] | null;
  started_at: string | null;
}

// ─── โควตา / ผู้ติดตาม ─────────────────────────────────────────────────

/**
 * โควตาข้อความของ OA เดือนนี้ — **ไม่ throw** ถามไม่ได้ก็คืน type 'unknown'
 * (โควตาเป็นข้อมูลประกอบการตัดสินใจ ห้ามทำให้หน้าจอพังเพราะถามไม่ได้)
 */
export async function getLineQuota(accessToken: string): Promise<LineQuota> {
  const unknown: LineQuota = { type: 'unknown', limit: null, used: 0, remaining: null };
  try {
    const [quotaRes, usageRes] = await Promise.all([
      fetch(`${LINE_API}/message/quota`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch(`${LINE_API}/message/quota/consumption`, { headers: { Authorization: `Bearer ${accessToken}` } }),
    ]);
    if (!quotaRes.ok) return unknown;

    const quota = (await quotaRes.json()) as { type?: string; value?: number };
    const usage = usageRes.ok
      ? ((await usageRes.json()) as { totalUsage?: number })
      : { totalUsage: undefined };

    const used = typeof usage.totalUsage === 'number' ? usage.totalUsage : 0;
    if (quota.type === 'limited' && typeof quota.value === 'number') {
      return { type: 'limited', limit: quota.value, used, remaining: Math.max(0, quota.value - used) };
    }
    if (quota.type === 'none') return { type: 'none', limit: null, used, remaining: null };
    return { ...unknown, used };
  } catch {
    return unknown;
  }
}

/** โควตาไม่พอสำหรับจำนวนผู้รับนี้หรือไม่ (ไม่รู้เพดาน = ไม่ขวาง) */
export function quotaBlocks(quota: LineQuota, recipientCount: number): boolean {
  return quota.type === 'limited' && quota.remaining !== null && quota.remaining < recipientCount;
}

/** วันที่แบบ YYYYMMDD ตามโซนเวลาที่ LINE ใช้ (UTC+9) ย้อนหลัง n วัน */
function jstDateString(daysAgo: number): string {
  const d = new Date(Date.now() + 9 * 3600_000 - daysAgo * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export interface LineFollowerStats {
  /** คนที่ยิงข้อความถึงได้จริงตอนนี้ — ตรงกับเลข "เพื่อน" ที่ LINE OA Manager โชว์ */
  reachable: number | null;
  /** ยอดสะสมที่เคยกดแอดมาทั้งหมด (ไม่ลดเมื่อบล็อก/ลบบัญชี) — ไว้อธิบายส่วนต่างเท่านั้น */
  totalAdds: number | null;
  /** จำนวนที่บล็อก OA อยู่ */
  blocks: number | null;
}

/**
 * จำนวนผู้ติดตาม OA จาก `/insight/followers` — LINE สรุปเป็นรายวันและพร้อมช้ากว่าเวลาจริง
 * จึงถามของ "เมื่อวาน" · ยังไม่พร้อม (`unready`) หรือถามไม่ได้ = null ทุกช่อง (ห้ามเดาเป็น 0)
 *
 * ⚠️ **`followers` ของ LINE ไม่ใช่จำนวนเพื่อนปัจจุบัน** — เอกสารระบุว่ามันคือยอดสะสมของการ
 * กดแอด และ **ไม่ลดลงเมื่อผู้ใช้บล็อกหรือลบบัญชีตัวเอง** · ของจริงที่วัดได้ 8 ก.ย. 2026:
 * aDay Fresh followers=41,490 แต่ OA Manager โชว์เพื่อน 15,751 = `targetedReaches` (15,752)
 * ไม่ใช่ followers และไม่ใช่ followers−blocks (23,837) เพราะยังมีบัญชีที่ถูกลบทิ้งปนอยู่
 * ⇒ **จำนวนผู้รับต้องใช้ `targetedReaches` เสมอ** (ตกไป followers−blocks เฉพาะตอน LINE
 * ส่ง 0 มา ซึ่งเกิดเมื่อกลุ่มเป้าหมายน้อยกว่า 20 คน)
 */
export async function getLineFollowerStats(accessToken: string): Promise<LineFollowerStats> {
  const empty: LineFollowerStats = { reachable: null, totalAdds: null, blocks: null };
  try {
    const res = await fetch(`${LINE_API}/insight/followers?date=${jstDateString(1)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return empty;
    const data = (await res.json()) as {
      status?: string; followers?: number; targetedReaches?: number; blocks?: number;
    };
    if (data.status !== 'ready') return empty;

    const totalAdds = typeof data.followers === 'number' ? data.followers : null;
    const blocks = typeof data.blocks === 'number' ? data.blocks : null;
    const targeted = typeof data.targetedReaches === 'number' ? data.targetedReaches : null;

    // targetedReaches = 0 แปลว่า "น้อยกว่า 20 คน" ไม่ใช่ "ไม่มีใครเลย" — ตกไปใช้ยอดหักบล็อก
    const reachable = targeted && targeted > 0
      ? targeted
      : totalAdds !== null && blocks !== null
        ? Math.max(totalAdds - blocks, 0)
        : totalAdds;

    return { reachable, totalAdds, blocks };
  } catch {
    return empty;
  }
}

// ─── ผู้รับ ────────────────────────────────────────────────────────────

/**
 * รายชื่อผู้รับของบรอดแคสต์ใบหนึ่ง
 *
 * นับเฉพาะผู้ติดต่อที่ยัง active และเป็น **บุคคล** (`line_user_id` ขึ้นต้นด้วย U —
 * ห้อง group/room ขึ้นต้นด้วย C/R ยิง multicast ไม่ได้)
 *
 * `audience_type='all'` คืนรายชื่อชุดเดียวกับ `'contacts'` — ตัวส่งจริงของโหมดนั้น
 * คือ broadcast API (ส่งถึงผู้ติดตามทุกคนซึ่งเราไม่รู้ว่าเป็นใคร) รายชื่อนี้ใช้แค่
 * เขียนข้อความลงห้องแชทของคนที่เรารู้จัก
 */
export async function resolveBroadcastRecipients(
  companyId: string,
  chatAccountId: string,
  audienceType: BroadcastAudienceType,
  filter?: BroadcastAudienceFilter | null,
): Promise<BroadcastRecipient[]> {
  const tagIds = audienceType === 'tags' ? (filter?.tag_ids || []).filter(Boolean) : [];
  // เลือก "ตามแท็ก" แต่ไม่ได้ติ๊กแท็กไหนเลย = ไม่มีผู้รับ (ไม่ใช่ทุกคน)
  if (audienceType === 'tags' && tagIds.length === 0) return [];

  let allowedCustomerIds: Set<string> | null = null;
  if (audienceType === 'tags') {
    // กันแท็กข้ามบริษัท — เอาเฉพาะ tag_id ที่เป็นของบริษัทนี้จริง
    const { data: ownTags } = await supabaseAdmin
      .from('customer_tags')
      .select('id')
      .eq('company_id', companyId)
      .in('id', tagIds);
    const ownTagIds = (ownTags || []).map(t => t.id as string);
    if (ownTagIds.length === 0) return [];

    const { rows: links } = await fetchAllRows<{ customer_id: string }>((from, to) =>
      supabaseAdmin
        .from('customer_tag_links')
        .select('customer_id', { count: 'exact' })
        .in('tag_id', ownTagIds)
        .range(from, to),
    );
    allowedCustomerIds = new Set(links.map(l => l.customer_id));
  }

  // แท็กติดกับ "ผู้ติดต่อในแชท" โดยตรงได้ด้วย (contact_tag_links — ยังไม่ผูกลูกค้าก็ติดได้)
  // ต้องนับทั้งสองทาง ไม่งั้นคนที่ติดแท็กจากหน้าแชทจะไม่ได้รับ
  let allowedContactIds: Set<string> | null = null;
  if (audienceType === 'tags') {
    const { data: ownTags } = await supabaseAdmin
      .from('customer_tags')
      .select('id')
      .eq('company_id', companyId)
      .in('id', tagIds);
    const ownTagIds = (ownTags || []).map(t => t.id as string);
    const { rows: contactLinks } = ownTagIds.length
      ? await fetchAllRows<{ contact_id: string }>((from, to) =>
          supabaseAdmin
            .from('contact_tag_links')
            .select('contact_id', { count: 'exact' })
            .eq('platform', 'line')
            .in('tag_id', ownTagIds)
            .range(from, to),
        )
      : { rows: [] as { contact_id: string }[] };
    allowedContactIds = new Set(contactLinks.map(l => l.contact_id));
    if ((allowedCustomerIds?.size ?? 0) === 0 && allowedContactIds.size === 0) return [];
  }

  const needsCustomer = audienceType === 'customers';

  // ⚠️ ต้องผ่าน fetchAllRows — Supabase ตัดที่ 1,000 แถวเงียบ ๆ และร้านเดียวมีผู้ติดต่อ
  //    เกินพันคนแล้ว (aDay Fresh 1,409) ถ้าไม่แบ่งหน้า คนท้ายรายชื่อจะไม่ได้รับข้อความ
  const { rows: contacts } = await fetchAllRows<{ id: string; line_user_id: string; customer_id: string | null }>(
    (from, to) => {
      let q = supabaseAdmin
        .from('line_contacts')
        .select('id, line_user_id, customer_id', { count: 'exact' })
        .eq('company_id', companyId)
        .eq('chat_account_id', chatAccountId)
        .eq('status', 'active')
        .like('line_user_id', 'U%');
      if (needsCustomer) q = q.not('customer_id', 'is', null);
      return q.order('created_at', { ascending: true }).range(from, to);
    },
  );

  const seen = new Set<string>();
  const out: BroadcastRecipient[] = [];
  for (const c of contacts) {
    if (!c.line_user_id) continue;
    if (audienceType === 'tags') {
      const viaCustomer = !!c.customer_id && !!allowedCustomerIds?.has(c.customer_id);
      const viaContact = !!allowedContactIds?.has(c.id);
      if (!viaCustomer && !viaContact) continue;
    }
    if (seen.has(c.line_user_id)) continue;   // ผู้ใช้คนเดียวห้ามได้ข้อความซ้ำ
    seen.add(c.line_user_id);
    out.push({ contact_id: c.id, line_user_id: c.line_user_id });
  }
  return out;
}

// ─── ข้อความ ──────────────────────────────────────────────────────────

/** แปลงข้อความที่ผู้ใช้กรอกเป็น message object ของ LINE (ข้อความก่อน แล้วรูป) */
export function buildLineMessages(input: { text?: string | null; imageUrl?: string | null }): LineMessageObject[] {
  const text = (input.text || '').trim();
  const imageUrl = (input.imageUrl || '').trim();
  const messages: LineMessageObject[] = [];

  if (text) {
    if (text.length > LINE_TEXT_MAX) {
      throw new Error(`ข้อความยาวเกิน ${LINE_TEXT_MAX.toLocaleString()} ตัวอักษร`);
    }
    messages.push({ type: 'text', text });
  }

  if (imageUrl) {
    if (!/^https:\/\//i.test(imageUrl)) {
      throw new Error('ลิงก์รูปต้องเป็น https');
    }
    messages.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl });
  }

  if (messages.length === 0) throw new Error('ต้องมีข้อความหรือรูปอย่างน้อยหนึ่งอย่าง');
  return messages;
}

/** ตัดรายชื่อผู้รับเป็นล็อตละ 500 พร้อม retry key ประจำล็อต */
export function planBroadcastBatches(recipients: BroadcastRecipient[]): BroadcastBatch[] {
  const batches: BroadcastBatch[] = [];
  for (let i = 0; i < recipients.length; i += MULTICAST_BATCH_SIZE) {
    const slice = recipients.slice(i, i + MULTICAST_BATCH_SIZE);
    batches.push({
      index: batches.length,
      retry_key: crypto.randomUUID(),
      user_ids: slice.map(r => r.line_user_id),
      contact_ids: slice.map(r => r.contact_id),
      status: 'pending',
    });
  }
  return batches;
}

// ─── ตัวส่ง ───────────────────────────────────────────────────────────

interface LineSendResult {
  ok: boolean;
  httpStatus: number;
  requestId: string | null;
  error?: string;
}

async function callLineSend(
  path: '/message/multicast' | '/message/broadcast',
  accessToken: string,
  retryKey: string,
  body: Record<string, unknown>,
): Promise<LineSendResult> {
  try {
    const res = await fetch(`${LINE_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify(body),
    });
    const requestId = res.headers.get('X-Line-Request-Id') || res.headers.get('x-line-request-id');
    if (res.ok) return { ok: true, httpStatus: res.status, requestId };
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, httpStatus: res.status, requestId, error: err.message || `LINE API ${res.status}` };
  } catch (e) {
    return { ok: false, httpStatus: 0, requestId: null, error: e instanceof Error ? e.message : 'network error' };
  }
}

function normalizeBatches(value: unknown): BroadcastBatch[] {
  return Array.isArray(value) ? (value as BroadcastBatch[]) : [];
}

/** ข้อความที่จะไปโผล่ในห้องแชท — ชนิด/เนื้อความอ่านจาก message object ที่ส่งไปจริง */
function threadRowShape(messages: LineMessageObject[]): {
  message_type: string;
  content: string;
  imageUrl: string | null;
} {
  const text = messages.find((m): m is Extract<LineMessageObject, { type: 'text' }> => m.type === 'text');
  const image = messages.find((m): m is Extract<LineMessageObject, { type: 'image' }> => m.type === 'image');
  return {
    message_type: text ? 'text' : 'image',
    content: text ? text.text : '[รูปภาพ]',
    imageUrl: image ? image.originalContentUrl : null,
  };
}

/**
 * เขียนข้อความลงห้องแชทของผู้รับ
 *
 * ⚠️ **ห้ามแตะ `last_message_at` / `unread_count`** — บรอดแคสต์ไม่ใช่บทสนทนา
 * ถ้าขยับสองค่านี้ รายชื่อแชททั้งร้านจะถูกสลับลำดับใหม่หมดในคราวเดียว
 */
async function insertThreadRows(
  row: BroadcastRow,
  contactIds: string[],
  shape: ReturnType<typeof threadRowShape>,
  sentBy: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  const raw: Record<string, unknown> = { broadcast_id: row.id };
  if (shape.imageUrl) raw.imageUrl = shape.imageUrl;

  for (let i = 0; i < contactIds.length; i += 200) {
    const chunk = contactIds.slice(i, i + 200).map(contactId => ({
      company_id: row.company_id,
      line_contact_id: contactId,
      direction: 'outgoing',
      message_type: shape.message_type,
      content: shape.content,
      raw_message: raw,
      sent_by: sentBy,
      sent_at: now,
      created_at: now,
    }));
    const { error } = await supabaseAdmin.from('line_messages').insert(chunk);
    if (error) {
      // ข้อความออกไปหาลูกค้าแล้ว — เขียนสำเนาลงห้องแชทไม่ได้ก็ห้ามล้มทั้งงาน
      console.error('[LineBroadcast] insert thread rows failed:', error.message);
    }
  }
}

/** `sent_by` มี FK ไป user_profiles — ผู้ใช้ที่ยังไม่มีโปรไฟล์ต้องเป็น null ไม่งั้น insert ล้มทั้งชุด */
async function resolveSentBy(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin.from('user_profiles').select('id').eq('id', userId).maybeSingle();
  return data ? userId : null;
}

/**
 * ส่งบรอดแคสต์ใบหนึ่งจนจบ — **เรียกซ้ำได้เสมอ**
 *
 * เดินจากสถานะที่บันทึกไว้ในแถว: ล็อตที่ `sent` แล้วข้าม · ล็อตที่ยังไม่ส่งใช้ retry key
 * เดิมของมัน · หมดงบเวลาก่อนจบก็คงสถานะ `sending` ไว้ให้เรียกต่อ (ปุ่ม "ส่งต่อ" ในหน้ารายการ)
 */
export async function runLineBroadcast(
  broadcastId: string,
  opts: { timeBudgetMs?: number } = {},
): Promise<void> {
  const startedAtMs = Date.now();
  const timeBudgetMs = opts.timeBudgetMs ?? 240_000;

  const patch = (values: Record<string, unknown>) =>
    supabaseAdmin.from('broadcasts').update(values).eq('id', broadcastId);

  try {
    const { data } = await supabaseAdmin.from('broadcasts').select('*').eq('id', broadcastId).single();
    const row = (data as BroadcastRow | null) ?? null;
    if (!row) return;
    if (row.status === 'sent' || row.status === 'failed') return;

    await patch({ status: 'sending', started_at: row.started_at || new Date().toISOString() });

    const account = await getChatAccount(row.chat_account_id);
    const creds = account && account.company_id === row.company_id ? getLineCredsFromAccount(account) : null;
    if (!creds) {
      await patch({
        status: 'failed',
        error: 'ไม่พบ token ของ LINE OA นี้ — ตรวจที่ ตั้งค่า > ช่องทาง Chat',
        finished_at: new Date().toISOString(),
      });
      return;
    }

    const token = creds.channel_access_token;
    const messages = Array.isArray(row.messages) ? row.messages : [];
    const shape = threadRowShape(messages);
    const sentBy = await resolveSentBy(row.created_by);
    const requestIds = Array.isArray(row.platform_request_ids) ? [...row.platform_request_ids] : [];

    // ─ โหมด "ทุกคนที่แอดเพื่อน" — ยิง broadcast ใบเดียว ─────────────────
    if (row.audience_type === 'all') {
      let batches = normalizeBatches(row.batches);
      if (batches.length === 0) {
        // จด retry key ก่อนยิง — ยิงแล้วฟังก์ชันตาย เรียกใหม่จะได้ไม่ส่งซ้ำ
        batches = [{ index: 0, retry_key: crypto.randomUUID(), user_ids: [], contact_ids: [], status: 'pending' }];
        await patch({ batches });
      }
      const batch = batches[0];

      if (batch.status !== 'sent') {
        const res = await callLineSend('/message/broadcast', token, batch.retry_key, { messages });
        if (!res.ok) {
          batch.status = 'failed';
          batch.error = res.error || null;
          await logIntegrationNow({
            company_id: row.company_id,
            integration: 'line',
            account_id: row.chat_account_id,
            direction: 'outgoing',
            action: 'broadcast',
            method: 'POST',
            api_path: '/v2/bot/message/broadcast',
            http_status: res.httpStatus,
            status: 'error',
            error_message: res.error,
            reference_type: 'broadcast',
            reference_id: broadcastId,
          });
          await patch({
            batches,
            failed_count: 1,
            status: res.httpStatus === 429 ? 'partial' : 'failed',
            error: res.error || null,
            finished_at: new Date().toISOString(),
          });
          return;
        }
        batch.status = 'sent';
        if (res.requestId) requestIds.push(res.requestId);
        await patch({ batches, platform_request_ids: requestIds });
      }

      // ข้อความไปถึงผู้ติดตามทุกคนแล้ว — เขียนสำเนาลงห้องแชทของคนที่เรารู้จัก
      const recipients = await resolveBroadcastRecipients(row.company_id, row.chat_account_id, 'contacts', null);
      await insertThreadRows(row, recipients.map(r => r.contact_id), shape, sentBy);

      // recipient_count ของโหมดนี้ = จำนวนผู้ติดตามที่ LINE รายงานตอนสร้าง (โควตาที่ถูกใช้จริง)
      // ห้ามทับด้วยจำนวนผู้ติดต่อที่เรารู้จัก ไม่งั้นหน้ารายการจะโชว์ 1,400/1,400 ทั้งที่ยิงไป 5,000
      const reached = row.recipient_count > 0 ? row.recipient_count : recipients.length;
      await patch({
        recipient_count: reached,
        sent_count: reached,
        status: 'sent',
        error: null,
        finished_at: new Date().toISOString(),
      });
      await logIntegrationNow({
        company_id: row.company_id,
        integration: 'line',
        account_id: row.chat_account_id,
        direction: 'outgoing',
        action: 'broadcast',
        method: 'POST',
        api_path: '/v2/bot/message/broadcast',
        status: 'success',
        reference_type: 'broadcast',
        reference_id: broadcastId,
        reference_label: `ผู้รับ ${recipients.length} คน`,
      });
      return;
    }

    // ─ โหมดเจาะกลุ่ม — multicast ล็อตละ 500 ────────────────────────────
    let batches = normalizeBatches(row.batches);
    if (batches.length === 0) {
      const recipients = await resolveBroadcastRecipients(
        row.company_id, row.chat_account_id, row.audience_type, row.audience_filter,
      );
      if (recipients.length === 0) {
        await patch({
          status: 'failed',
          error: 'ไม่มีผู้รับที่ตรงเงื่อนไข',
          recipient_count: 0,
          finished_at: new Date().toISOString(),
        });
        return;
      }
      batches = planBroadcastBatches(recipients);
      // จดแผนล็อต (พร้อม retry key) ก่อนยิงใบแรกเสมอ
      await patch({ batches, recipient_count: recipients.length });
    }

    // ⚠️ นับจากสถานะของล็อตเสมอ ห้ามบวกสะสม — กด "ส่งต่อ" แล้วล็อตที่เคย failed ถูกลองใหม่
    //    ถ้าบวกสะสมจะนับซ้ำ ตัวเลขบนหน้าจอจะเกินจำนวนผู้รับจริง
    const tally = (status: BroadcastBatch['status']) =>
      batches.filter(b => b.status === status).reduce((sum, b) => sum + b.user_ids.length, 0);
    let sentCount = tally('sent');
    let failedCount = tally('failed');
    let pausedError: string | null = null;

    for (const batch of batches) {
      if (batch.status === 'sent') continue;
      if (Date.now() - startedAtMs > timeBudgetMs) {
        // หมดงบเวลา — คงสถานะ sending ไว้ ผู้เรียกกด "ส่งต่อ" แล้วเดินต่อจากล็อตนี้
        await patch({ batches, sent_count: sentCount, failed_count: failedCount });
        return;
      }

      const res = await callLineSend('/message/multicast', token, batch.retry_key, {
        to: batch.user_ids,
        messages,
      });

      if (res.ok) {
        batch.status = 'sent';
        batch.error = null;
        if (res.requestId) requestIds.push(res.requestId);
        await insertThreadRows(row, batch.contact_ids, shape, sentBy);
        sentCount = tally('sent');
        failedCount = tally('failed');   // ล็อตนี้อาจเคยอยู่ใน failed มาก่อน
        await patch({ batches, sent_count: sentCount, failed_count: failedCount, platform_request_ids: requestIds });
      } else if (res.httpStatus === 429) {
        // โดนจำกัดอัตรา — ล็อตนี้ยัง pending (retry key เดิม) หยุดไว้ก่อน
        batch.status = 'pending';
        batch.error = res.error || null;
        failedCount = tally('failed');
        pausedError = res.error || 'LINE จำกัดอัตราการส่งชั่วคราว — กด "ส่งต่อ" อีกครั้งภายหลัง';
        await logIntegrationNow({
          company_id: row.company_id,
          integration: 'line',
          account_id: row.chat_account_id,
          direction: 'outgoing',
          action: 'broadcast',
          method: 'POST',
          api_path: '/v2/bot/message/multicast',
          http_status: res.httpStatus,
          status: 'error',
          error_message: res.error,
          reference_type: 'broadcast',
          reference_id: broadcastId,
        });
        await patch({
          batches, sent_count: sentCount, failed_count: failedCount,
          status: 'partial', error: pausedError,
        });
        return;
      } else {
        batch.status = 'failed';
        batch.error = res.error || null;
        failedCount = tally('failed');
        await logIntegrationNow({
          company_id: row.company_id,
          integration: 'line',
          account_id: row.chat_account_id,
          direction: 'outgoing',
          action: 'broadcast',
          method: 'POST',
          api_path: '/v2/bot/message/multicast',
          http_status: res.httpStatus,
          status: 'error',
          error_message: res.error,
          reference_type: 'broadcast',
          reference_id: broadcastId,
        });
        await patch({ batches, failed_count: failedCount, error: res.error || null });
      }

      // เว้นจังหวะระหว่างล็อต — ยิงรัวเป็นชุดคือทางลัดไปหา 429
      await new Promise(r => setTimeout(r, 100));
    }

    const anySent = batches.some(b => b.status === 'sent');
    const anyFailed = batches.some(b => b.status !== 'sent');
    // ไม่มีล็อตไหนออกไปได้เลย = ล้มเหลว (ไม่ใช่ "ส่งไม่ครบ") — คนอ่านต้องแยกสองเคสนี้ออก
    const finalStatus: BroadcastStatus = !anySent ? 'failed' : anyFailed ? 'partial' : 'sent';

    await patch({
      batches,
      sent_count: sentCount,
      failed_count: failedCount,
      platform_request_ids: requestIds,
      status: finalStatus,
      finished_at: new Date().toISOString(),
    });

    await logIntegrationNow({
      company_id: row.company_id,
      integration: 'line',
      account_id: row.chat_account_id,
      direction: 'outgoing',
      action: 'broadcast',
      method: 'POST',
      api_path: '/v2/bot/message/multicast',
      status: finalStatus === 'sent' ? 'success' : 'error',
      error_message: finalStatus === 'sent' ? undefined : `ส่งไม่สำเร็จ ${failedCount} คน`,
      reference_type: 'broadcast',
      reference_id: broadcastId,
      reference_label: `ผู้รับ ${sentCount} คน`,
    });
  } catch (e) {
    // อะไรที่หลุดมาถึงตรงนี้คือ bug — บันทึกไว้ที่แถว ห้ามให้ route ล้มตาม
    const message = e instanceof Error ? e.message : 'unknown error';
    console.error('[LineBroadcast] unexpected error:', message);
    await patch({ status: 'failed', error: message, finished_at: new Date().toISOString() });
  }
}

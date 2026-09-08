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
import type { BroadcastContent, BroadcastProductCard } from '@/lib/broadcast/content';

const LINE_API = 'https://api.line.me/v2/bot';

export { LINE_TEXT_MAX, MULTICAST_BATCH_SIZE };

// ─── Types ────────────────────────────────────────────────────────────

export type BroadcastAudienceType =
  | 'all' | 'contacts' | 'tags' | 'customers' | 'contacts_pick'
  // แบ่งตามสถานะการซื้อ — ดู migration broadcasts_audience_purchase_segments
  | 'not_bought' | 'bought' | 'bought_within' | 'bought_before' | 'bought_once';

/** กลุ่มที่ต้องรู้ประวัติการซื้อของลูกค้าก่อนถึงจะกรองได้ */
const PURCHASE_AUDIENCES = new Set<string>(['not_bought', 'bought', 'bought_within', 'bought_before', 'bought_once']);
// 'scheduled' = ตั้งเวลาไว้ รอ cron หยิบ · 'cancelled' = ผู้ใช้ยกเลิกก่อนถึงเวลา
// (ตัวส่งต้องข้ามสองสถานะนี้เสมอ — ใบที่ยังไม่ถึงเวลา/ถูกยกเลิกแล้วห้ามหลุดไปถึงลูกค้า)
export type BroadcastStatus =
  | 'scheduled' | 'pending' | 'sending' | 'sent' | 'partial' | 'failed' | 'cancelled';

export interface BroadcastAudienceFilter {
  tag_ids?: string[];
  /** ผู้ติดต่อที่เลือกเอง (audience_type='contacts_pick') — ใช้ทดสอบส่ง/ส่งกลุ่มเล็ก */
  contact_ids?: string[];
  /** จำนวนวันของกลุ่ม `bought_within` / `bought_before` */
  days?: number;
  /**
   * ── ตัวกรองซ้อน (ใช้ได้กับทุกกลุ่มที่มีรายชื่อผู้ติดต่อจริง) ──
   * ไม่ใช่กลุ่มใหม่ แต่เป็นการหั่นกลุ่มที่เลือกให้แคบลง
   */
  /** คุยกันมาแล้วอย่างน้อยกี่ข้อความ (นับเฉพาะที่ลูกค้าพิมพ์มา) */
  min_messages?: number;
  /** **ลูกค้าพิมพ์หาเรา** ล่าสุดภายในกี่วัน — ตัดคนที่เงียบไปนานออก */
  last_chat_days?: number;
}

/** ปุ่มบนการ์ด/ปุ่มตอบเร็ว — uri = เปิดลิงก์ · message = ส่งข้อความกลับเข้าห้องแชท */
export type LineAction =
  | { type: 'uri'; label: string; uri: string }
  | { type: 'message'; label: string; text: string };

export interface LineQuickReply {
  items: { type: 'action'; action: LineAction }[];
}

export interface LineCarouselColumn {
  thumbnailImageUrl?: string;
  title?: string;
  text: string;
  actions: LineAction[];
}

export type LineMessageObject =
  | { type: 'text'; text: string; quickReply?: LineQuickReply }
  | { type: 'image'; originalContentUrl: string; previewImageUrl: string; quickReply?: LineQuickReply }
  | {
      type: 'template';
      altText: string;
      quickReply?: LineQuickReply;
      template:
        | { type: 'buttons'; thumbnailImageUrl?: string; title?: string; text: string; actions: LineAction[] }
        | { type: 'carousel'; columns: LineCarouselColumn[] };
    };

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

  const pickedIds = audienceType === 'contacts_pick' ? (filter?.contact_ids || []).filter(Boolean) : [];
  if (audienceType === 'contacts_pick' && pickedIds.length === 0) return [];

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

  // กลุ่ม "เป็นลูกค้าแล้ว" ทุกแบบต้องผูกลูกค้าก่อน — ไม่ผูก = ไม่มีทางรู้ว่าเคยซื้อ
  const needsCustomer = audienceType === 'customers'
    || audienceType === 'bought' || audienceType === 'bought_within'
    || audienceType === 'bought_before' || audienceType === 'bought_once';

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
      // เลือกเอง — กรองที่ DB เลย ไม่ต้องดึงผู้ติดต่อทั้งร้านมากรองในเครื่อง
      if (pickedIds.length > 0) q = q.in('id', pickedIds);
      return q.order('created_at', { ascending: true }).range(from, to);
    },
  );

  // ── ประวัติการซื้อ (เฉพาะกลุ่มที่ต้องใช้) ───────────────────────────
  //
  // ⚠️ ผู้ติดต่อที่ **ยังไม่ผูกกับลูกค้า** (`customer_id` null) ระบบไม่มีทางรู้ว่าเคยซื้อไหม
  // — LINE ไม่ให้เบอร์/อีเมลเลย · ตรงนี้นับเป็น "ยังไม่เคยซื้อ" เพราะไม่มีหลักฐานว่าซื้อ
  // แต่หน้าจอ **ต้องบอกจำนวนคนที่ยังไม่ได้ผูกข้อมูล** กำกับไว้เสมอ ไม่งั้นผู้ใช้จะเข้าใจว่า
  // ลูกค้าเก่าของตัวเองไม่มีใครเคยซื้อ (aDay Fresh ผูกไว้ 1.2% ของ 1,432 คน)
  let orderStats: Map<string, { order_count: number; last_order_date: string | null }> | null = null;
  if (PURCHASE_AUDIENCES.has(audienceType)) {
    const customerIds = [...new Set(contacts.map(c => c.customer_id).filter((v): v is string => !!v))];
    orderStats = new Map();
    if (customerIds.length > 0) {
      const { data, error } = await supabaseAdmin.rpc('get_chat_customer_order_stats', {
        p_company_id: companyId,
        p_customer_ids: customerIds,
      });
      // query พัง = กรองมั่วไม่ได้ ต้องคืนว่าง ดีกว่าส่งผิดกลุ่มไปหาลูกค้าจริง
      if (error) {
        console.error('[broadcast] get_chat_customer_order_stats:', error.message);
        return [];
      }
      for (const row of (data || []) as { customer_id: string; order_count: number; last_order_date: string | null }[]) {
        orderStats.set(row.customer_id, { order_count: Number(row.order_count) || 0, last_order_date: row.last_order_date });
      }
    }
  }

  const days = Math.max(1, Number(filter?.days) || 30);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  // ── ตัวกรองซ้อน: คุยกันกี่ข้อความ / คุยล่าสุดเมื่อไหร่ ────────────────
  const minMessages = Math.max(0, Number(filter?.min_messages) || 0);
  const lastChatDays = Math.max(0, Number(filter?.last_chat_days) || 0);
  const lastChatCutoff = lastChatDays > 0
    ? new Date(Date.now() - lastChatDays * 86_400_000).toISOString()
    : null;

  // ทั้งสองเกณฑ์อ่านจาก RPC ตัวเดียวกัน (นับรอบเดียวต่อ OA)
  //
  // ⚠️ **ห้ามใช้ `line_contacts.last_message_at` เป็น "คุยล่าสุด"** — ค่านั้นขยับตอน
  // **แอดมินตอบ** ด้วย ⇒ ห้องที่ลูกค้าเงียบมาครึ่งปีแต่แอดมินเพิ่งไปตอบเมื่อวาน จะหลุด
  // เข้ามาในกลุ่ม "คุยกันล่าสุด 30 วัน" ทั้งที่ลูกค้าไม่ได้พูดอะไรเลย
  let engagement: Map<string, { count: number; lastIncomingAt: string | null }> | null = null;
  if (minMessages > 0 || lastChatDays > 0) {
    const { data, error } = await supabaseAdmin.rpc('get_line_contact_message_counts', {
      p_company_id: companyId,
      p_chat_account_id: chatAccountId,
    });
    if (error) {
      // นับไม่ได้ = กรองมั่วไม่ได้ ต้องคืนว่าง ดีกว่ายิงกว้างเกินที่ผู้ใช้ตั้งใจ
      console.error('[broadcast] get_line_contact_message_counts:', error.message);
      return [];
    }
    engagement = new Map(
      (data || []).map((r: { contact_id: string; incoming_count: number; last_incoming_at: string | null }) =>
        [r.contact_id, { count: Number(r.incoming_count) || 0, lastIncomingAt: r.last_incoming_at }]),
    );
  }

  const seen = new Set<string>();
  const out: BroadcastRecipient[] = [];
  for (const c of contacts) {
    if (!c.line_user_id) continue;
    if (audienceType === 'tags') {
      const viaCustomer = !!c.customer_id && !!allowedCustomerIds?.has(c.customer_id);
      const viaContact = !!allowedContactIds?.has(c.id);
      if (!viaCustomer && !viaContact) continue;
    }
    if (orderStats) {
      const st = c.customer_id ? orderStats.get(c.customer_id) : undefined;
      const count = st?.order_count ?? 0;
      const last = st?.last_order_date ?? null;
      if (audienceType === 'not_bought' && count > 0) continue;
      if (audienceType === 'bought' && count === 0) continue;
      if (audienceType === 'bought_once' && count !== 1) continue;
      if (audienceType === 'bought_within' && !(count > 0 && last && last >= cutoff)) continue;
      // "หายไป" = เคยซื้อ แต่ครั้งล่าสุดเก่ากว่ากรอบที่ตั้งไว้
      if (audienceType === 'bought_before' && !(count > 0 && last && last < cutoff)) continue;
    }
    if (engagement) {
      // ห้องที่ลูกค้ายังไม่เคยพิมพ์อะไรเลยจะไม่มีใน map — นับเป็น 0 / ไม่เคยคุย
      const e = engagement.get(c.id);
      if (minMessages > 0 && (e?.count ?? 0) < minMessages) continue;
      if (lastChatCutoff && !(e?.lastIncomingAt && e.lastIncomingAt >= lastChatCutoff)) continue;
    }
    if (seen.has(c.line_user_id)) continue;   // ผู้ใช้คนเดียวห้ามได้ข้อความซ้ำ
    seen.add(c.line_user_id);
    out.push({ contact_id: c.id, line_user_id: c.line_user_id });
  }
  return out;
}

/**
 * ระบบรู้ประวัติการซื้อของผู้ติดต่อกี่คน — `total` = ผู้ติดต่อที่ยิงถึงได้ทั้งหมดของ OA นี้
 * `linked` = ส่วนที่ผูกกับข้อมูลลูกค้าแล้ว (มีทางรู้ว่าเคยซื้อไหม)
 *
 * ⚠️ ต้องโชว์คู่กันเสมอบนหน้าจอที่แบ่งกลุ่มตามการซื้อ — LINE ไม่ให้เบอร์/อีเมล
 * คนที่ยังไม่ผูกจะถูกนับเป็น "ยังไม่เคยซื้อ" ทั้งหมด ผู้ใช้ต้องรู้ว่านั่นแปลว่า
 * "ไม่มีหลักฐานว่าซื้อ" ไม่ใช่ "ยืนยันแล้วว่าไม่เคยซื้อ"
 * (เงื่อนไขต้องตรงกับ resolveBroadcastRecipients เป๊ะ — active + line_user_id ขึ้นต้น U)
 */
export async function getLineContactCounts(
  companyId: string,
  chatAccountId: string,
): Promise<{ total: number; linked: number }> {
  const base = () => supabaseAdmin
    .from('line_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('chat_account_id', chatAccountId)
    .eq('status', 'active')
    .like('line_user_id', 'U%');

  const [totalRes, linkedRes] = await Promise.all([
    base(),
    base().not('customer_id', 'is', null),
  ]);
  return { total: totalRes.count ?? 0, linked: linkedRes.count ?? 0 };
}

// ─── ข้อความ ──────────────────────────────────────────────────────────

/** แปลงข้อความที่ผู้ใช้กรอกเป็น message object ของ LINE (ข้อความก่อน แล้วรูป) */
/**
 * แปลงเนื้อหาชนิดกลางเป็น message object ของ LINE
 *
 * ⚠️ **LINE นับโควตาต่อ "การส่ง 1 ครั้ง" (สูงสุด 3 bubble ยังนับเป็น 1)** — การ์ดที่มี
 * รูป + หัวข้อ + ข้อความ + ปุ่ม เป็น object เดียว จึงไม่แพงกว่าส่งข้อความเปล่าเลย
 * แต่เกิน 3 object เมื่อไหร่กลายเป็น 2 credit ต่อคน จึงกันเพดานไว้ที่นี่
 */
export const LINE_MAX_BUBBLES = 3;

/** ปุ่มตอบเร็ว — แนบไปกับ object สุดท้าย ไม่นับเป็น bubble เพิ่ม */
function buildQuickReply(labels: string[] | undefined): LineQuickReply | undefined {
  const items = (labels || []).map(l => l.trim()).filter(Boolean);
  if (items.length === 0) return undefined;
  return {
    items: items.map(label => ({
      type: 'action' as const,
      // message action = ลูกค้ากดแล้วข้อความนั้นถูกส่งเข้าห้องแชทเหมือนพิมพ์เอง
      // ⇒ ได้บทสนทนาให้แอดมินปิดการขายต่อ (และเปิดหน้าต่างตอบกลับของแพลตฟอร์มอื่นด้วย)
      action: { type: 'message' as const, label, text: label },
    })),
  };
}

/** ปุ่มของการ์ดสินค้า — ไม่มีลิงก์ก็ยังต้องมีปุ่ม (LINE บังคับ ≥1 action ต่อคอลัมน์) */
function productAction(p: BroadcastProductCard): LineAction {
  if (p.url) return { type: 'uri', label: 'ดูสินค้า', uri: p.url };
  return { type: 'message', label: 'สนใจสินค้านี้', text: `สนใจ ${p.name}`.slice(0, 300) };
}

export function buildLineMessagesFromContent(content: BroadcastContent): LineMessageObject[] {
  const title = (content.title || '').trim();
  const text = (content.text || '').trim();
  const imageUrl = (content.image_url || '').trim();
  const quickReply = buildQuickReply(content.quick_replies);
  let messages: LineMessageObject[] = [];

  if (content.kind === 'promo') {
    // การ์ดเดียวจบ: รูปอยู่ในตัวการ์ด (thumbnailImageUrl) ไม่ต้องส่งรูปแยก
    messages = [{
      type: 'template',
      altText: (title || text).slice(0, 400),
      template: {
        type: 'buttons',
        ...(imageUrl ? { thumbnailImageUrl: imageUrl } : {}),
        ...(title ? { title } : {}),
        text,
        actions: (content.buttons || []).map(b => ({
          type: 'uri' as const, label: b.label.trim(), uri: b.url.trim(),
        })),
      },
    }];

  } else if (content.kind === 'products') {
    const products = content.products || [];
    const columns: LineCarouselColumn[] = products.map(p => ({
      ...(p.image_url ? { thumbnailImageUrl: p.image_url } : {}),
      title: p.name.slice(0, 40),
      // LINE บังคับให้คอลัมน์มีข้อความ — ไม่มีราคาก็ต้องมีอะไรสักอย่าง
      text: (p.price != null ? `฿${p.price.toLocaleString()}` : 'ดูรายละเอียด').slice(0, 60),
      actions: [productAction(p)],
    }));

    // ข้อความเกริ่นเป็น bubble แรก (ถ้ามี) แล้วตามด้วยการ์ด — รวมยังไม่เกิน 3
    if (text) messages.push({ type: 'text', text });
    messages.push({ type: 'template', altText: (text || title || 'สินค้าแนะนำ').slice(0, 400), template: { type: 'carousel', columns } });

  } else {
    if (text) {
      if (text.length > LINE_TEXT_MAX) {
        throw new Error(`ข้อความยาวเกิน ${LINE_TEXT_MAX.toLocaleString()} ตัวอักษร`);
      }
      messages.push({ type: 'text', text });
    }
    if (imageUrl) {
      if (!/^https:\/\//i.test(imageUrl)) throw new Error('ลิงก์รูปต้องเป็น https');
      messages.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl });
    }
  }

  if (messages.length === 0) throw new Error('ต้องมีข้อความหรือรูปอย่างน้อยหนึ่งอย่าง');
  if (messages.length > LINE_MAX_BUBBLES) {
    throw new Error(`ส่งได้ไม่เกิน ${LINE_MAX_BUBBLES} ส่วนต่อหนึ่งข้อความ`);
  }

  // ปุ่มตอบเร็วเกาะไปกับ object สุดท้ายเสมอ (LINE แสดงของ object ท้ายสุดเท่านั้น)
  if (quickReply) messages[messages.length - 1] = { ...messages[messages.length - 1], quickReply };

  return messages;
}

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
  const template = messages.find((m): m is Extract<LineMessageObject, { type: 'template' }> => m.type === 'template');

  // สำเนาในห้องแชทเป็นข้อความธรรมดา — หน้าแชทยังไม่มีตัววาดการ์ดของ LINE
  // จึงถอดการ์ดเป็นบรรทัดที่อ่านรู้เรื่องแทน (ดีกว่าโชว์ "[เทมเพลต]" เปล่า ๆ)
  if (template) {
    const t = template.template;
    if (t.type === 'buttons') {
      return {
        message_type: 'text',
        content: [t.title, t.text].filter(Boolean).join('\n') || template.altText,
        imageUrl: t.thumbnailImageUrl || null,
      };
    }
    const names = t.columns.map(c => c.title).filter(Boolean);
    const intro = text ? `${text.text}\n` : '';
    return {
      message_type: 'text',
      content: `${intro}${names.map(n => `• ${n}`).join('\n')}`.trim() || template.altText,
      imageUrl: t.columns.find(c => c.thumbnailImageUrl)?.thumbnailImageUrl || null,
    };
  }

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
    if (['sent', 'failed', 'cancelled', 'scheduled'].includes(row.status)) return;

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

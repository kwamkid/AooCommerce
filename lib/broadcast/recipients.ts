// Path: lib/broadcast/recipients.ts
//
// "ใครบ้างที่อยู่ในกลุ่มนี้" — ตัวเดียวของทั้งระบบ (บรอดแคสต์ LINE · กลุ่มเป้าหมายโฆษณา)
//
// เดิมโค้ดก้อนนี้อยู่ใน lib/line/broadcast.ts และผูกกับ LINE อยู่ **3 จุดเท่านั้น**
// (ชื่อตาราง · คอลัมน์ id ของผู้ใช้ · RPC นับข้อความ) ที่เหลือ — แท็ก · ประวัติการซื้อ ·
// ตัวกรองซ้อน · การตัดคนซ้ำ — เป็นตรรกะกลางล้วน ๆ ⇒ ยกออกมาแล้วรับ `platform` เป็นพารามิเตอร์
// แทนการ copy ไปเขียนใหม่ต่อแพลตฟอร์ม (ก็อปเมื่อไหร่ = จำนวนที่ preview บอกกับจำนวนที่
// ส่งจริงจะเริ่มไม่ตรงกันทีละนิดโดยไม่มีใครรู้)
//
// ⚠️ **พฤติกรรมของ LINE ต้องเหมือนเดิมเป๊ะ** — lib/line/broadcast.ts เหลือเป็นตัวห่อบาง ๆ
// ที่แปลงผลลัพธ์กลับเป็นรูปเดิม ({contact_id, line_user_id}) เท่านั้น
//
// ⚠️ instagram **ไม่ใช่** แพลตฟอร์มของตัวเองที่นี่ — อยู่ตาราง fb_contacts เหมือนกันแต่แยกด้วย
// คอลัมน์ `source` · ตอนนี้รองรับเฉพาะ 'facebook' (IG ยังไม่มีทางส่งเป็นชุด)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';

/** แพลตฟอร์มที่มี "ห้องแชทของเราเอง" จึงมีรายชื่อผู้ติดต่อให้เลือกกลุ่มได้ */
export type ChatRecipientPlatform = 'line' | 'facebook';

export type BroadcastAudienceType =
  | 'all' | 'contacts' | 'tags' | 'customers' | 'contacts_pick'
  // แบ่งตามสถานะการซื้อ — ดู migration broadcasts_audience_purchase_segments
  | 'not_bought' | 'bought' | 'bought_within' | 'bought_before' | 'bought_once'
  // เฉพาะ Facebook — ทักมาจากโฆษณา Click-to-Messenger แล้วยังไม่มีออเดอร์
  | 'ads_not_bought';

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

/** ผู้รับหนึ่งคน — `platform_user_id` คือ id ที่ใช้ยิงถึงเขา (LINE user id / PSID) */
export interface ChatRecipient {
  contact_id: string;
  platform: ChatRecipientPlatform;
  platform_user_id: string;
  customer_id: string | null;
  /** เพจที่คุยกันอยู่ (Facebook) — PSID ใช้ได้เฉพาะคู่กับเพจของมัน · LINE เป็น null เสมอ */
  page_id: string | null;
}

/** กลุ่มที่ต้องรู้ประวัติการซื้อของลูกค้าก่อนถึงจะกรองได้ */
export const PURCHASE_AUDIENCES = new Set<string>([
  'not_bought', 'bought', 'bought_within', 'bought_before', 'bought_once', 'ads_not_bought',
]);

/** กลุ่ม "เป็นลูกค้าแล้ว" ทุกแบบต้องผูกลูกค้าก่อน — ไม่ผูก = ไม่มีทางรู้ว่าเคยซื้อ */
const NEEDS_CUSTOMER = new Set<string>([
  'customers', 'bought', 'bought_within', 'bought_before', 'bought_once',
]);

export interface PurchaseStat {
  order_count: number;
  last_order_date: string | null;
}

/**
 * คนคนนี้อยู่ในกลุ่มตามสถานะการซื้อไหม — **pure** เพื่อให้สายผู้ติดต่อ (แชท) กับสายลูกค้า
 * (audience จากตาราง customers) ตัดสินด้วยกติกาชุดเดียวกันเป๊ะ
 *
 * ⚠️ ผู้ติดต่อที่ยังไม่ผูกลูกค้า (ไม่มี stat) นับเป็น "ยังไม่เคยซื้อ" เพราะไม่มีหลักฐานว่าซื้อ
 * — หน้าจอต้องบอกจำนวนคนที่ยังไม่ผูกกำกับไว้เสมอ
 */
export function matchesPurchaseBucket(
  audienceType: string,
  stat: PurchaseStat | null | undefined,
  cutoff: string,
): boolean {
  const count = stat?.order_count ?? 0;
  const last = stat?.last_order_date ?? null;
  if (audienceType === 'not_bought' || audienceType === 'ads_not_bought') return count === 0;
  if (audienceType === 'bought') return count > 0;
  if (audienceType === 'bought_once') return count === 1;
  if (audienceType === 'bought_within') return count > 0 && !!last && last >= cutoff;
  // "หายไป" = เคยซื้อ แต่ครั้งล่าสุดเก่ากว่ากรอบที่ตั้งไว้
  if (audienceType === 'bought_before') return count > 0 && !!last && last < cutoff;
  return true;
}

/** วันตัดของกลุ่มที่นับเป็นช่วงเวลา (YYYY-MM-DD เทียบกับ last_order_date ซึ่งเป็น date) */
export function purchaseCutoff(filter?: BroadcastAudienceFilter | null): string {
  const days = Math.max(1, Number(filter?.days) || 30);
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/** ประวัติการซื้อของลูกค้าชุดหนึ่ง — RPC เดียวกับที่หน้าแชทใช้ ตัวเลขจึงตรงกันเสมอ */
export async function fetchPurchaseStats(
  companyId: string,
  customerIds: string[],
): Promise<Map<string, PurchaseStat> | null> {
  const stats = new Map<string, PurchaseStat>();
  if (customerIds.length === 0) return stats;

  // RPC รับ array ตรง ๆ ได้ แต่รายชื่อลูกค้าหลักหมื่นในคำขอเดียวคือ payload ที่ใหญ่เกินจำเป็น
  for (let i = 0; i < customerIds.length; i += 500) {
    const chunk = customerIds.slice(i, i + 500);
    const { data, error } = await supabaseAdmin.rpc('get_chat_customer_order_stats', {
      p_company_id: companyId,
      p_customer_ids: chunk,
    });
    // query พัง = กรองมั่วไม่ได้ ต้องบอกผู้เรียกว่าอ่านไม่ได้ ดีกว่าส่งผิดกลุ่มไปหาลูกค้าจริง
    if (error) {
      console.error('[broadcast] get_chat_customer_order_stats:', error.message);
      return null;
    }
    for (const row of (data || []) as { customer_id: string; order_count: number; last_order_date: string | null }[]) {
      stats.set(row.customer_id, {
        order_count: Number(row.order_count) || 0,
        last_order_date: row.last_order_date,
      });
    }
  }
  return stats;
}

// ─── ตารางผู้ติดต่อของแต่ละแพลตฟอร์ม (จุดเดียวที่รู้ว่าใครเก็บที่ไหน) ───────

interface PlatformConfig {
  table: 'line_contacts' | 'fb_contacts';
  /** คอลัมน์ที่เก็บ id ที่ใช้ยิงถึงผู้ใช้ */
  idCol: 'line_user_id' | 'fb_psid';
  /** คอลัมน์เพจ (Facebook) — ไม่มี = null */
  pageCol: 'fb_page_id' | null;
  /**
   * ตัวกรอง "เป็นคน" ของแพลตฟอร์มนั้น
   * LINE: user id ขึ้นต้น U (group/room ขึ้น C/R ยิง multicast ไม่ได้)
   * Facebook: แถวใน fb_contacts ที่ source='facebook' (instagram อยู่ตารางเดียวกัน)
   */
  personFilter: { col: string; op: 'like' | 'eq'; value: string };
  countsRpc: 'get_line_contact_message_counts' | 'get_fb_contact_message_counts';
}

const PLATFORMS: Record<ChatRecipientPlatform, PlatformConfig> = {
  line: {
    table: 'line_contacts',
    idCol: 'line_user_id',
    pageCol: null,
    personFilter: { col: 'line_user_id', op: 'like', value: 'U%' },
    countsRpc: 'get_line_contact_message_counts',
  },
  facebook: {
    table: 'fb_contacts',
    idCol: 'fb_psid',
    pageCol: 'fb_page_id',
    personFilter: { col: 'source', op: 'eq', value: 'facebook' },
    countsRpc: 'get_fb_contact_message_counts',
  },
};

interface ContactRow {
  id: string;
  customer_id: string | null;
  [key: string]: unknown;
}

/**
 * รายชื่อผู้รับของกลุ่มหนึ่ง ในช่องทางหนึ่งบัญชี
 *
 * นับเฉพาะผู้ติดต่อที่ยัง active และเป็น **บุคคล** ตามกติกาของแพลตฟอร์มนั้น
 *
 * `audience_type='all'` คืนรายชื่อชุดเดียวกับ `'contacts'` — ตัวส่งจริงของโหมดนั้นคือ
 * broadcast API (ถึงผู้ติดตามทุกคนซึ่งเราไม่รู้ว่าเป็นใคร) รายชื่อนี้ใช้แค่เขียนข้อความ
 * ลงห้องแชทของคนที่เรารู้จัก
 */
export async function resolveChatRecipients(
  companyId: string,
  platform: ChatRecipientPlatform,
  chatAccountId: string,
  audienceType: string,
  filter?: BroadcastAudienceFilter | null,
): Promise<ChatRecipient[]> {
  const cfg = PLATFORMS[platform];
  if (!cfg) return [];

  // กลุ่ม "ทักมาจากโฆษณา" อ่านจาก fb_contacts.referral_source ซึ่งมีเฉพาะฝั่ง Meta
  if (audienceType === 'ads_not_bought' && platform !== 'facebook') return [];

  const tagIds = audienceType === 'tags' ? (filter?.tag_ids || []).filter(Boolean) : [];
  // เลือก "ตามแท็ก" แต่ไม่ได้ติ๊กแท็กไหนเลย = ไม่มีผู้รับ (ไม่ใช่ทุกคน)
  if (audienceType === 'tags' && tagIds.length === 0) return [];

  const pickedIds = audienceType === 'contacts_pick' ? (filter?.contact_ids || []).filter(Boolean) : [];
  if (audienceType === 'contacts_pick' && pickedIds.length === 0) return [];

  let allowedCustomerIds: Set<string> | null = null;
  let allowedContactIds: Set<string> | null = null;
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

    // แท็กติดกับ "ผู้ติดต่อในแชท" โดยตรงได้ด้วย (contact_tag_links — ยังไม่ผูกลูกค้าก็ติดได้)
    // ต้องนับทั้งสองทาง ไม่งั้นคนที่ติดแท็กจากหน้าแชทจะไม่ได้รับ
    const { rows: contactLinks } = await fetchAllRows<{ contact_id: string }>((from, to) =>
      supabaseAdmin
        .from('contact_tag_links')
        .select('contact_id', { count: 'exact' })
        .eq('platform', platform)
        .in('tag_id', ownTagIds)
        .range(from, to),
    );
    allowedContactIds = new Set(contactLinks.map(l => l.contact_id));
    if (allowedCustomerIds.size === 0 && allowedContactIds.size === 0) return [];
  }

  const needsCustomer = NEEDS_CUSTOMER.has(audienceType);
  const columns = ['id', cfg.idCol, 'customer_id', ...(cfg.pageCol ? [cfg.pageCol] : [])].join(', ');

  // ⚠️ ต้องผ่าน fetchAllRows — Supabase ตัดที่ 1,000 แถวเงียบ ๆ และร้านเดียวมีผู้ติดต่อ
  //    เกินพันคนแล้ว (aDay Fresh 1,409) ถ้าไม่แบ่งหน้า คนท้ายรายชื่อจะไม่ได้รับข้อความ
  const { rows: contacts } = await fetchAllRows<ContactRow>((from, to) => {
    let q = supabaseAdmin
      .from(cfg.table)
      .select(columns, { count: 'exact' })
      .eq('company_id', companyId)
      .eq('chat_account_id', chatAccountId)
      .eq('status', 'active');
    q = cfg.personFilter.op === 'like'
      ? q.like(cfg.personFilter.col, cfg.personFilter.value)
      : q.eq(cfg.personFilter.col, cfg.personFilter.value);
    // ทักมาจากโฆษณา Click-to-Messenger (webhook จด referral มาให้ตอนเปิดห้อง)
    if (audienceType === 'ads_not_bought') q = q.eq('referral_source', 'ADS');
    if (needsCustomer) q = q.not('customer_id', 'is', null);
    // เลือกเอง — กรองที่ DB เลย ไม่ต้องดึงผู้ติดต่อทั้งร้านมากรองในเครื่อง
    if (pickedIds.length > 0) q = q.in('id', pickedIds);
    return q.order('created_at', { ascending: true }).range(from, to) as unknown as
      PromiseLike<{ data: ContactRow[] | null; error: { message: string } | null; count?: number | null }>;
  });

  // ── ประวัติการซื้อ (เฉพาะกลุ่มที่ต้องใช้) ───────────────────────────
  //
  // ⚠️ ผู้ติดต่อที่ **ยังไม่ผูกกับลูกค้า** (`customer_id` null) ระบบไม่มีทางรู้ว่าเคยซื้อไหม
  // — LINE ไม่ให้เบอร์/อีเมลเลย · ตรงนี้นับเป็น "ยังไม่เคยซื้อ" เพราะไม่มีหลักฐานว่าซื้อ
  // แต่หน้าจอ **ต้องบอกจำนวนคนที่ยังไม่ได้ผูกข้อมูล** กำกับไว้เสมอ
  let orderStats: Map<string, PurchaseStat> | null = null;
  if (PURCHASE_AUDIENCES.has(audienceType)) {
    const customerIds = [...new Set(contacts.map(c => c.customer_id).filter((v): v is string => !!v))];
    orderStats = await fetchPurchaseStats(companyId, customerIds);
    if (!orderStats) return [];
  }

  const cutoff = purchaseCutoff(filter);

  // ── ตัวกรองซ้อน: คุยกันกี่ข้อความ / คุยล่าสุดเมื่อไหร่ ────────────────
  const minMessages = Math.max(0, Number(filter?.min_messages) || 0);
  const lastChatDays = Math.max(0, Number(filter?.last_chat_days) || 0);
  const lastChatCutoff = lastChatDays > 0
    ? new Date(Date.now() - lastChatDays * 86_400_000).toISOString()
    : null;

  // ทั้งสองเกณฑ์อ่านจาก RPC ตัวเดียวกัน (นับรอบเดียวต่อบัญชี)
  //
  // ⚠️ **ห้ามใช้ `*_contacts.last_message_at` เป็น "คุยล่าสุด"** — ค่านั้นขยับตอน
  // **แอดมินตอบ** ด้วย ⇒ ห้องที่ลูกค้าเงียบมาครึ่งปีแต่แอดมินเพิ่งไปตอบเมื่อวาน จะหลุด
  // เข้ามาในกลุ่ม "คุยกันล่าสุด 30 วัน" ทั้งที่ลูกค้าไม่ได้พูดอะไรเลย
  let engagement: Map<string, { count: number; lastIncomingAt: string | null }> | null = null;
  if (minMessages > 0 || lastChatDays > 0) {
    const { data, error } = await supabaseAdmin.rpc(cfg.countsRpc, {
      p_company_id: companyId,
      p_chat_account_id: chatAccountId,
    });
    if (error) {
      // นับไม่ได้ = กรองมั่วไม่ได้ ต้องคืนว่าง ดีกว่ายิงกว้างเกินที่ผู้ใช้ตั้งใจ
      console.error(`[broadcast] ${cfg.countsRpc}:`, error.message);
      return [];
    }
    engagement = new Map(
      (data || []).map((r: { contact_id: string; incoming_count: number; last_incoming_at: string | null }) =>
        [r.contact_id, { count: Number(r.incoming_count) || 0, lastIncomingAt: r.last_incoming_at }]),
    );
  }

  const seen = new Set<string>();
  const out: ChatRecipient[] = [];
  for (const c of contacts) {
    const userId = typeof c[cfg.idCol] === 'string' ? (c[cfg.idCol] as string) : '';
    if (!userId) continue;
    if (audienceType === 'tags') {
      const viaCustomer = !!c.customer_id && !!allowedCustomerIds?.has(c.customer_id);
      const viaContact = !!allowedContactIds?.has(c.id);
      if (!viaCustomer && !viaContact) continue;
    }
    if (orderStats) {
      const st = c.customer_id ? orderStats.get(c.customer_id) : undefined;
      if (!matchesPurchaseBucket(audienceType, st, cutoff)) continue;
    }
    if (engagement) {
      // ห้องที่ลูกค้ายังไม่เคยพิมพ์อะไรเลยจะไม่มีใน map — นับเป็น 0 / ไม่เคยคุย
      const e = engagement.get(c.id);
      if (minMessages > 0 && (e?.count ?? 0) < minMessages) continue;
      if (lastChatCutoff && !(e?.lastIncomingAt && e.lastIncomingAt >= lastChatCutoff)) continue;
    }
    if (seen.has(userId)) continue;   // ผู้ใช้คนเดียวห้ามได้ข้อความซ้ำ
    seen.add(userId);
    out.push({
      contact_id: c.id,
      platform,
      platform_user_id: userId,
      customer_id: c.customer_id,
      page_id: cfg.pageCol && typeof c[cfg.pageCol] === 'string' ? (c[cfg.pageCol] as string) : null,
    });
  }
  return out;
}

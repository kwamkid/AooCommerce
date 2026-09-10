// Path: lib/audiences/resolve.ts
//
// "กลุ่มเป้าหมาย" ที่บันทึกไว้ (`audiences`) → รายชื่อคนจริง + ตัวจับคู่ที่ส่งให้ Meta ได้
//
// ต่างจากบรอดแคสต์ตรงที่ **หยิบคนจากหลายแหล่งมารวมเป็นกลุ่มเดียว** (ห้องแชท LINE + เพจ
// Facebook + ข้อมูลลูกค้าในระบบ) เพราะปลายทางคือ Custom Audience ของ Meta ซึ่งจับคู่คนด้วย
// เบอร์/อีเมล/PSID — ไม่ใช่การส่งข้อความที่ต้องรู้ว่ายิงเข้าห้องไหน
//
// กติกา:
// - เกณฑ์การแบ่งกลุ่ม (ยังไม่เคยซื้อ / หายไปเกิน N วัน / ตามแท็ก) ใช้ตัวเดียวกับบรอดแคสต์
//   ผ่าน `lib/broadcast/recipients.ts` — ตัวเลขที่ผู้ใช้เห็นสองที่จึงตรงกันเสมอ
// - **แหล่งที่ไม่รองรับกลุ่มนั้นให้ข้ามไปเฉย ๆ** (ไม่ล้มทั้งใบ) เช่นเลือก "คนที่เคยทักเข้ามา"
//   แล้วมีแหล่ง "ข้อมูลลูกค้า" ปนอยู่ — ตารางลูกค้าไม่มีแนวคิด "เคยทัก" จึงไม่มีใครมาจากแหล่งนั้น
//   (หน้าจอเห็นได้จาก by_source ของ /preview-count)
// - ⛔ `all` (ผู้ติดตามทุกคนของ LINE) **ใช้ทำกลุ่มเป้าหมายไม่ได้** — เราไม่มีรายชื่อคนพวกนั้น
//   จึงไม่มีเบอร์/อีเมลจะส่งให้ Meta อยู่แล้ว

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { identityKeys } from '@/lib/meta/hashing';
import { resolveAccountPicture } from '@/lib/chat/account-picture';
import { AUDIENCE_OPTIONS, CUSTOMER_SOURCE_AUDIENCE_KEYS, type StoredAudienceFilter } from '@/lib/broadcast/audience';
import {
  PURCHASE_AUDIENCES,
  fetchPurchaseStats,
  matchesPurchaseBucket,
  purchaseCutoff,
  resolveChatRecipients,
  type ChatRecipientPlatform,
  type PurchaseStat,
} from '@/lib/broadcast/recipients';

export type AudienceSource =
  | { kind: 'chat'; platform: ChatRecipientPlatform; chat_account_id: string }
  | { kind: 'customers' };

export interface AudienceDefinition {
  audience_type: string;
  audience_filter: StoredAudienceFilter;
  sources: AudienceSource[];
}

export interface AudienceMember {
  /** กุญแจตัดคนซ้ำ — คนเดียวกันที่ทักมาทั้ง LINE และ Facebook ต้องนับครั้งเดียวถ้าผูกลูกค้าเดียวกัน */
  key: string;
  customer_id: string | null;
  contact_id: string | null;
  contact_platform: ChatRecipientPlatform | null;
  page_id: string | null;
  psid: string | null;
  phone: string | null;
  email: string | null;
}

export interface AudienceStats {
  total: number;
  with_phone: number;
  with_email: number;
  with_psid: number;
  /** มีตัวจับคู่อย่างน้อยหนึ่งอย่าง — ที่เหลือส่งให้ Meta ไปก็ไม่มีทางเจอ */
  syncable: number;
  not_syncable: number;
  /** ชนเพดานแล้ว — รายชื่อที่คืนมาไม่ครบ */
  capped: boolean;
}

/**
 * เพดานคนต่อกลุ่ม — กันงานหนึ่งใบลากทั้งฐานข้อมูลมาไว้ในหน่วยความจำ
 * (Custom Audience ของ Meta รับได้มากกว่านี้มาก แต่ระบบเราไม่มีร้านไหนใกล้เลขนี้)
 */
export const AUDIENCE_MEMBER_CAP = 50_000;

/** ตัวเลือกที่ตารางลูกค้าตอบได้เอง — ทะเบียนอยู่ lib/broadcast/audience.ts ที่เดียว (หน้าจอใช้ตัวเดียวกัน) */
const CUSTOMER_AUDIENCE_KEYS = CUSTOMER_SOURCE_AUDIENCE_KEYS;

/** จำนวนแหล่งต่อหนึ่งกลุ่ม — มากกว่านี้คือกรอกผิด ไม่ใช่ความตั้งใจ */
const MAX_SOURCES = 20;

function sourceKey(s: AudienceSource): string {
  return s.kind === 'customers' ? 'customers' : `chat:${s.platform}:${s.chat_account_id}`;
}

/** ป้ายสั้น ๆ ของแหล่ง — ใช้ในข้อความ error และ by_source ของ preview */
export function audienceSourceLabel(s: AudienceSource): string {
  if (s.kind === 'customers') return 'ข้อมูลลูกค้าในระบบ';
  return s.platform === 'line' ? 'ห้องแชท LINE' : 'ห้องแชท Facebook';
}

/** คีย์กลุ่มที่แหล่งนี้ตอบได้ */
function keysForSource(s: AudienceSource): ReadonlySet<string> {
  if (s.kind === 'customers') return CUSTOMER_AUDIENCE_KEYS;
  return new Set((AUDIENCE_OPTIONS[s.platform] || []).map(o => o.key));
}

// ─── ตรวจรูปของ definition ────────────────────────────────────────────

export function validateAudienceDefinition(
  def: unknown,
): { ok: true; def: AudienceDefinition } | { ok: false; error: string } {
  const raw = (def || {}) as Record<string, unknown>;
  const audienceType = typeof raw.audience_type === 'string' ? raw.audience_type.trim() : '';
  if (!audienceType) return { ok: false, error: 'กรุณาเลือกกลุ่มผู้รับ' };
  if (audienceType === 'all') {
    return { ok: false, error: 'กลุ่ม "ผู้ติดตามทั้งหมด" ใช้ทำกลุ่มเป้าหมายโฆษณาไม่ได้ — ระบบไม่มีรายชื่อของคนที่ไม่เคยทักเข้ามา' };
  }

  const rawSources = Array.isArray(raw.sources) ? raw.sources : [];
  if (rawSources.length === 0) return { ok: false, error: 'กรุณาเลือกแหล่งข้อมูลอย่างน้อยหนึ่งแหล่ง' };
  if (rawSources.length > MAX_SOURCES) return { ok: false, error: `เลือกแหล่งข้อมูลได้ไม่เกิน ${MAX_SOURCES} แหล่ง` };

  const sources: AudienceSource[] = [];
  const seen = new Set<string>();
  for (const item of rawSources) {
    const s = (item || {}) as Record<string, unknown>;
    if (s.kind === 'customers') {
      const parsed: AudienceSource = { kind: 'customers' };
      if (!seen.has(sourceKey(parsed))) { seen.add(sourceKey(parsed)); sources.push(parsed); }
      continue;
    }
    if (s.kind !== 'chat') return { ok: false, error: 'แหล่งข้อมูลไม่ถูกต้อง' };
    if (s.platform !== 'line' && s.platform !== 'facebook') {
      return { ok: false, error: 'ตอนนี้ดึงผู้ติดต่อได้จาก LINE และ Facebook เท่านั้น' };
    }
    const accountId = typeof s.chat_account_id === 'string' ? s.chat_account_id.trim() : '';
    if (!accountId) return { ok: false, error: 'กรุณาเลือกบัญชีของช่องทางแชทที่จะดึงผู้ติดต่อ' };
    const parsed: AudienceSource = { kind: 'chat', platform: s.platform, chat_account_id: accountId };
    if (!seen.has(sourceKey(parsed))) { seen.add(sourceKey(parsed)); sources.push(parsed); }
  }

  // **ทุกแหล่ง** ที่เลือกต้องตอบกลุ่มนี้ได้ (เจ้าของเลือกแบบเข้ม 11 ก.ย. 2026) — แหล่งที่ตอบไม่ได้
  // ส่งคนมา 0 คนแต่ยังโผล่ในรายชื่อแหล่งของกลุ่ม ผู้ใช้จะเข้าใจผิดว่ามีคนจากแหล่งนั้นอยู่ด้วย
  // · หน้าจอใช้กฎเดียวกันผ่าน audienceOptionsForSources() — แก้ที่หนึ่งต้องแก้อีกที่
  const unsupported = sources.filter(s => !keysForSource(s).has(audienceType));
  if (unsupported.length > 0) {
    const labels = [...new Set(unsupported.map(audienceSourceLabel))].join(' และ ');
    return { ok: false, error: `${labels} ไม่มีข้อมูลของกลุ่มนี้ — เอาออกจากแหล่งที่มาก่อน` };
  }

  const rawFilter = (raw.audience_filter || {}) as Record<string, unknown>;
  const filter: StoredAudienceFilter = {};

  if (audienceType === 'tags') {
    const tagIds = (Array.isArray(rawFilter.tag_ids) ? rawFilter.tag_ids : [])
      .filter((v): v is string => typeof v === 'string' && !!v.trim());
    if (tagIds.length === 0) return { ok: false, error: 'กรุณาเลือกแท็กอย่างน้อยหนึ่งอัน' };
    filter.tag_ids = tagIds;
  }

  if (audienceType === 'contacts_pick') {
    const contactIds = (Array.isArray(rawFilter.contact_ids) ? rawFilter.contact_ids : [])
      .filter((v): v is string => typeof v === 'string' && !!v.trim());
    if (contactIds.length === 0) return { ok: false, error: 'กรุณาเลือกผู้ติดต่ออย่างน้อยหนึ่งคน' };
    filter.contact_ids = contactIds;
  }

  if (audienceType === 'bought_within' || audienceType === 'bought_before') {
    const days = Math.floor(Number(rawFilter.days));
    if (!Number.isFinite(days) || days < 1) return { ok: false, error: 'กรุณาระบุจำนวนวัน' };
    filter.days = days;
  }

  // ตัวกรองซ้อนใช้ได้กับทุกกลุ่มที่มีรายชื่อจริง ยกเว้นกลุ่มที่เลือกรายคนมาเองแล้ว
  if (audienceType !== 'contacts_pick') {
    const minMessages = Math.floor(Number(rawFilter.min_messages));
    if (Number.isFinite(minMessages) && minMessages > 0) filter.min_messages = minMessages;
    const lastChatDays = Math.floor(Number(rawFilter.last_chat_days));
    if (Number.isFinite(lastChatDays) && lastChatDays > 0) filter.last_chat_days = lastChatDays;
  }

  return { ok: true, def: { audience_type: audienceType, audience_filter: filter, sources } };
}

/**
 * แหล่งทั้งหมดเป็นของบริษัทนี้จริงไหม — **กันการอ้างบัญชีข้ามบริษัท**
 * (supabaseAdmin เป็น service role ที่ข้าม RLS ⇒ ต้องเช็ค company_id เอง)
 *
 * @returns ข้อความ error หรือ null เมื่อผ่าน
 */
export async function assertSourcesBelongToCompany(
  companyId: string,
  def: AudienceDefinition,
): Promise<string | null> {
  const chatIds = [...new Set(
    def.sources.filter((s): s is Extract<AudienceSource, { kind: 'chat' }> => s.kind === 'chat')
      .map(s => s.chat_account_id),
  )];
  if (chatIds.length === 0) return null;

  const { data, error } = await supabaseAdmin
    .from('chat_accounts')
    .select('id, platform, company_id')
    .eq('company_id', companyId)
    .in('id', chatIds);
  if (error) return 'ตรวจสอบช่องทางแชทไม่สำเร็จ';

  const byId = new Map((data || []).map(a => [a.id as string, a.platform as string]));
  for (const s of def.sources) {
    if (s.kind !== 'chat') continue;
    const platform = byId.get(s.chat_account_id);
    if (!platform) return 'ไม่พบช่องทางแชทที่เลือก หรือไม่ใช่ของบริษัทนี้';
    if (platform !== s.platform) return 'ช่องทางแชทที่เลือกไม่ตรงกับแพลตฟอร์มที่ระบุ';
  }
  return null;
}

// ─── หาสมาชิกจริง ──────────────────────────────────────────────────────

interface CustomerIdentity { phone: string | null; email: string | null }

/** เบอร์/อีเมลของลูกค้าชุดหนึ่ง — ยิงเป็นก้อนละ 200 (id list ยาวเกินไปทำให้ URL ยาวเกิน) */
async function loadCustomerIdentities(
  companyId: string,
  customerIds: string[],
): Promise<Map<string, CustomerIdentity>> {
  const out = new Map<string, CustomerIdentity>();
  for (let i = 0; i < customerIds.length; i += 200) {
    const chunk = customerIds.slice(i, i + 200);
    const { data, error } = await supabaseAdmin
      .from('customers')
      .select('id, phone, email')
      .eq('company_id', companyId)
      .in('id', chunk);
    if (error) {
      console.error('[audiences] load customer identities:', error.message);
      continue;
    }
    for (const row of (data || []) as { id: string; phone: string | null; email: string | null }[]) {
      out.set(row.id, { phone: row.phone, email: row.email });
    }
  }
  return out;
}

/** ลูกค้าที่ติดแท็กชุดนี้ (เฉพาะแท็กของบริษัทนี้) — คืน null เมื่อไม่มีแท็กที่ใช้ได้เลย */
async function customerIdsWithTags(companyId: string, tagIds: string[]): Promise<Set<string> | null> {
  const { data: ownTags } = await supabaseAdmin
    .from('customer_tags')
    .select('id')
    .eq('company_id', companyId)
    .in('id', tagIds);
  const ownTagIds = (ownTags || []).map(t => t.id as string);
  if (ownTagIds.length === 0) return null;

  const { rows } = await fetchAllRows<{ customer_id: string }>((from, to) =>
    supabaseAdmin
      .from('customer_tag_links')
      .select('customer_id', { count: 'exact' })
      .in('tag_id', ownTagIds)
      .range(from, to),
  );
  return new Set(rows.map(r => r.customer_id));
}

interface RawMember {
  customer_id: string | null;
  contact_id: string | null;
  contact_platform: ChatRecipientPlatform | null;
  page_id: string | null;
  psid: string | null;
}

/** คนจากแหล่ง "ข้อมูลลูกค้าในระบบ" — ไม่ผ่านห้องแชท จึงไม่มี PSID */
async function resolveCustomerSource(
  companyId: string,
  def: AudienceDefinition,
): Promise<RawMember[]> {
  const type = def.audience_type;
  if (!CUSTOMER_AUDIENCE_KEYS.has(type)) return [];

  let allowed: Set<string> | null = null;
  if (type === 'tags') {
    allowed = await customerIdsWithTags(companyId, def.audience_filter.tag_ids || []);
    if (!allowed || allowed.size === 0) return [];
  }

  const { rows } = await fetchAllRows<{ id: string }>((from, to) =>
    supabaseAdmin
      .from('customers')
      .select('id', { count: 'exact' })
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .range(from, to),
  );

  let ids = rows.map(r => r.id);
  if (allowed) ids = ids.filter(id => allowed.has(id));

  let stats: Map<string, PurchaseStat> | null = null;
  if (PURCHASE_AUDIENCES.has(type)) {
    stats = await fetchPurchaseStats(companyId, ids);
    // อ่านประวัติการซื้อไม่ได้ = กรองมั่วไม่ได้ ต้องคืนว่าง ดีกว่าใส่คนผิดกลุ่มขึ้นโฆษณา
    if (!stats) return [];
  }

  const cutoff = purchaseCutoff(def.audience_filter);
  const out: RawMember[] = [];
  for (const id of ids) {
    if (stats && !matchesPurchaseBucket(type, stats.get(id), cutoff)) continue;
    out.push({ customer_id: id, contact_id: null, contact_platform: null, page_id: null, psid: null });
  }
  return out;
}

/**
 * รายชื่อคนในกลุ่มนี้ พร้อมสรุปว่าส่งให้ Meta จับคู่ได้กี่คน
 *
 * ไล่ทีละแหล่งแล้วรวม — คนที่ผูกลูกค้าคนเดียวกันจากหลายแหล่งนับครั้งเดียว (แต่ยัง
 * เก็บ PSID ของห้องแชทไว้ให้ เพราะ PSID จับคู่ได้แม่นกว่าเบอร์ที่พนักงานพิมพ์เอง)
 */
export async function resolveAudienceMembers(
  companyId: string,
  def: AudienceDefinition,
): Promise<{ members: AudienceMember[]; stats: AudienceStats }> {
  // เพจของแต่ละบัญชี Facebook — ใช้เติมให้ผู้ติดต่อที่แถวไม่มี fb_page_id (ห้องยุคก่อน)
  const chatSources = def.sources.filter(
    (s): s is Extract<AudienceSource, { kind: 'chat' }> => s.kind === 'chat',
  );
  const pageByAccount = new Map<string, string>();
  if (chatSources.some(s => s.platform === 'facebook')) {
    const { data } = await supabaseAdmin
      .from('chat_accounts')
      .select('id, credentials')
      .eq('company_id', companyId)
      .in('id', chatSources.filter(s => s.platform === 'facebook').map(s => s.chat_account_id));
    for (const row of (data || []) as { id: string; credentials: Record<string, unknown> | null }[]) {
      const pageId = row.credentials?.page_id;
      if (typeof pageId === 'string' && pageId) pageByAccount.set(row.id, pageId);
    }
  }

  const raw: RawMember[] = [];
  for (const source of def.sources) {
    if (!keysForSource(source).has(def.audience_type)) continue;

    if (source.kind === 'customers') {
      raw.push(...await resolveCustomerSource(companyId, def));
      continue;
    }

    const recipients = await resolveChatRecipients(
      companyId, source.platform, source.chat_account_id, def.audience_type, def.audience_filter,
    );
    for (const r of recipients) {
      const pageId = r.page_id || pageByAccount.get(source.chat_account_id) || null;
      raw.push({
        customer_id: r.customer_id,
        contact_id: r.contact_id,
        contact_platform: r.platform,
        page_id: source.platform === 'facebook' ? pageId : null,
        psid: source.platform === 'facebook' ? r.platform_user_id : null,
      });
    }
  }

  // ── ตัดคนซ้ำ ───────────────────────────────────────────────────────
  // ผูกลูกค้าแล้ว = คนเดียวกันแน่นอน · ยังไม่ผูก = รู้แค่ว่าเป็นห้องแชทคนละห้อง
  const byKey = new Map<string, AudienceMember>();
  let capped = false;
  for (const r of raw) {
    const key = r.customer_id
      ? `customer:${r.customer_id}`
      : `contact:${r.contact_platform}:${r.contact_id}`;
    const existing = byKey.get(key);
    if (existing) {
      // แหล่งหลังเติมของที่แหล่งแรกไม่มี (PSID จากห้องแชท / customer_id จากอีกช่องทาง)
      if (!existing.psid && r.psid) {
        existing.psid = r.psid;
        existing.page_id = r.page_id;
        existing.contact_id = existing.contact_id || r.contact_id;
        existing.contact_platform = existing.contact_platform || r.contact_platform;
      }
      continue;
    }
    if (byKey.size >= AUDIENCE_MEMBER_CAP) { capped = true; break; }
    byKey.set(key, {
      key,
      customer_id: r.customer_id,
      contact_id: r.contact_id,
      contact_platform: r.contact_platform,
      page_id: r.page_id,
      psid: r.psid,
      phone: null,
      email: null,
    });
  }

  const members = [...byKey.values()];

  // ── เติมเบอร์/อีเมลจากข้อมูลลูกค้า ──────────────────────────────────
  const customerIds = [...new Set(members.map(m => m.customer_id).filter((v): v is string => !!v))];
  if (customerIds.length > 0) {
    const identities = await loadCustomerIdentities(companyId, customerIds);
    for (const m of members) {
      const found = m.customer_id ? identities.get(m.customer_id) : undefined;
      if (!found) continue;
      m.phone = found.phone;
      m.email = found.email;
    }
  }

  const stats: AudienceStats = {
    total: members.length,
    with_phone: 0,
    with_email: 0,
    with_psid: 0,
    syncable: 0,
    not_syncable: 0,
    capped,
  };
  for (const m of members) {
    const ids = projectIdentities(m);
    if (ids.some(i => i.kind === 'PHONE')) stats.with_phone += 1;
    if (ids.some(i => i.kind === 'EMAIL')) stats.with_email += 1;
    if (ids.some(i => i.kind === 'PAGEUID')) stats.with_psid += 1;
    if (ids.length > 0) stats.syncable += 1;
    else stats.not_syncable += 1;
  }

  return { members, stats };
}

// ─── ตัวจับคู่ที่ส่งให้ Meta ────────────────────────────────────────────

export interface Identity {
  /** กุญแจของสมาชิกใน `audience_sync_members` — เทียบได้โดยไม่ต้องเก็บเบอร์/อีเมลดิบ */
  key: string;
  kind: 'PHONE' | 'EMAIL' | 'PAGEUID';
  /** PHONE/EMAIL = ค่าที่ hash แล้ว · PAGEUID = PSID ดิบ (Meta ห้าม hash) */
  value: string;
  /** บังคับเมื่อ kind เป็น PAGEUID — PSID ใช้ได้เฉพาะคู่กับเพจของมัน */
  pageId?: string;
}

/**
 * ตัวจับคู่ทุกอย่างที่คนคนนี้มี — ส่งได้หลายอย่างต่อคน Meta จับคู่ได้อันไหนก็เอาอันนั้น
 *
 * PSID ใส่เฉพาะเมื่อ **รู้เพจ** ด้วย — PAGEUID ที่ไม่มีเพจกำกับ Meta ปฏิเสธทั้งก้อน
 */
export function projectIdentities(m: AudienceMember): Identity[] {
  const out: Identity[] = [];
  const keys = identityKeys({ phone: m.phone, email: m.email });

  if (keys.phoneKey) {
    out.push({ key: keys.phoneKey, kind: 'PHONE', value: keys.phoneKey.slice(3) });
  }
  if (keys.emailKey) {
    out.push({ key: keys.emailKey, kind: 'EMAIL', value: keys.emailKey.slice(3) });
  }
  if (m.psid && m.page_id) {
    out.push({ key: `psid:${m.page_id}:${m.psid}`, kind: 'PAGEUID', value: m.psid, pageId: m.page_id });
  }
  return out;
}

// ─── รูปที่ API ส่งให้หน้าจอ ────────────────────────────────────────────
//
// ประกอบที่นี่ที่เดียวเพื่อให้ list · get · create · update ตอบโครงเดียวกันเสมอ
// (หน้าจอจะได้ไม่ต้องเดาว่าต้อง refetch ทั้งรายการหลังกดบันทึกหรือใช้ค่าที่ตอบกลับมาได้เลย)

export interface AudienceSourceView {
  kind: 'chat' | 'customers';
  platform?: ChatRecipientPlatform;
  chat_account_id?: string;
  /** ชื่อที่ผู้ใช้อ่านออก (ชื่อ OA / ชื่อเพจ / "ข้อมูลลูกค้าในระบบ") */
  name: string;
  picture_url?: string | null;
}

export interface AudienceSyncView {
  id: string;
  ad_account_id: string;
  ad_account_name: string | null;
  external_audience_id: string | null;
  status: string;
  auto_sync: boolean;
  last_sync_at: string | null;
  next_sync_at: string | null;
  last_counts: Record<string, unknown>;
  approx_size_lower: number | null;
  approx_size_upper: number | null;
  error: string | null;
}

export interface AudienceView {
  id: string;
  name: string;
  description: string | null;
  definition: AudienceDefinition | Record<string, unknown>;
  member_count: number | null;
  member_count_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sources: AudienceSourceView[];
  syncs: AudienceSyncView[];
}

const AUDIENCE_COLUMNS =
  'id, company_id, name, description, definition, member_count, member_count_at, is_active, created_at, updated_at';

interface AudienceBaseRow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  definition: Record<string, unknown>;
  member_count: number | null;
  member_count_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * กลุ่มเป้าหมายของบริษัทนี้ พร้อมชื่อแหล่งข้อมูลและสถานะการซิงก์ทุกบัญชีโฆษณา
 *
 * @param opts.id        เอาใบเดียว (ไม่ใส่ = ทั้งหมด)
 * @param opts.activeOnly เอาเฉพาะที่ยังเปิดใช้ (ค่าเริ่มต้น true — ใบที่ลบไปแล้วไม่ควรโผล่ในรายการ)
 */
export async function loadAudienceViews(
  companyId: string,
  opts: { id?: string; activeOnly?: boolean } = {},
): Promise<AudienceView[]> {
  let q = supabaseAdmin
    .from('audiences')
    .select(AUDIENCE_COLUMNS)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });
  if (opts.id) q = q.eq('id', opts.id);
  if (opts.activeOnly !== false) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) throw error;
  const rows = (data || []) as unknown as AudienceBaseRow[];
  if (rows.length === 0) return [];

  // ชื่อ/รูปของช่องทางแชทที่ definition อ้างถึง
  const chatIds = new Set<string>();
  for (const row of rows) {
    for (const s of (Array.isArray(row.definition?.sources) ? row.definition.sources : []) as AudienceSource[]) {
      if (s?.kind === 'chat' && s.chat_account_id) chatIds.add(s.chat_account_id);
    }
  }

  const [chatRes, syncRes] = await Promise.all([
    chatIds.size
      ? supabaseAdmin
          .from('chat_accounts')
          .select('id, account_name, platform, credentials')
          .eq('company_id', companyId)
          .in('id', [...chatIds])
      : Promise.resolve({ data: [] as ChatAccountLite[] }),
    supabaseAdmin
      .from('audience_syncs')
      .select('id, audience_id, ad_account_id, external_audience_id, status, auto_sync, last_sync_at, next_sync_at, last_counts, approx_size_lower, approx_size_upper, error')
      .eq('company_id', companyId)
      .in('audience_id', rows.map(r => r.id))
      .order('created_at', { ascending: true }),
  ]);

  const chatById = new Map(
    ((chatRes.data || []) as ChatAccountLite[]).map(a => [a.id, a]),
  );

  const syncRows = (syncRes.data || []) as unknown as (Omit<AudienceSyncView, 'ad_account_name'> & { audience_id: string })[];
  const adIds = [...new Set(syncRows.map(s => s.ad_account_id))];
  const adNames = new Map<string, string>();
  if (adIds.length > 0) {
    const { data: ads } = await supabaseAdmin
      .from('ad_accounts')
      .select('id, name, external_id')
      .eq('company_id', companyId)
      .in('id', adIds);
    for (const a of (ads || []) as { id: string; name: string | null; external_id: string }[]) {
      adNames.set(a.id, a.name || `act_${a.external_id}`);
    }
  }

  const syncsByAudience = new Map<string, AudienceSyncView[]>();
  for (const s of syncRows) {
    const list = syncsByAudience.get(s.audience_id) || [];
    list.push({
      id: s.id,
      ad_account_id: s.ad_account_id,
      ad_account_name: adNames.get(s.ad_account_id) || null,
      external_audience_id: s.external_audience_id,
      status: s.status,
      auto_sync: s.auto_sync,
      last_sync_at: s.last_sync_at,
      next_sync_at: s.next_sync_at,
      last_counts: s.last_counts || {},
      approx_size_lower: s.approx_size_lower,
      approx_size_upper: s.approx_size_upper,
      error: s.error,
    });
    syncsByAudience.set(s.audience_id, list);
  }

  return rows.map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    definition: row.definition as unknown as AudienceDefinition,
    member_count: row.member_count,
    member_count_at: row.member_count_at,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sources: ((Array.isArray(row.definition?.sources) ? row.definition.sources : []) as AudienceSource[])
      .map(s => toSourceView(s, chatById)),
    syncs: syncsByAudience.get(row.id) || [],
  }));
}

interface ChatAccountLite {
  id: string;
  account_name: string | null;
  platform: string;
  credentials: Record<string, unknown> | null;
}

function toSourceView(s: AudienceSource, chatById: Map<string, ChatAccountLite>): AudienceSourceView {
  if (!s || s.kind === 'customers') return { kind: 'customers', name: audienceSourceLabel({ kind: 'customers' }) };
  const account = chatById.get(s.chat_account_id);
  return {
    kind: 'chat',
    platform: s.platform,
    chat_account_id: s.chat_account_id,
    // บัญชีที่ถูกลบไปแล้วต้องยังอ่านออกว่าเคยเป็นอะไร ไม่ใช่ขึ้นเป็นช่องว่าง
    name: account?.account_name || audienceSourceLabel(s),
    picture_url: resolveAccountPicture(s.platform, account?.credentials ?? null, {}),
  };
}

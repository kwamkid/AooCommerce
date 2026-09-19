// Path: lib/leads/service.ts
//
// ผู้สนใจ (lead) — ชั้นบริการเดียวของระบบติดตามลูกค้าในแชท (server only)
//
// แนวคิด: **นัดผูกกับ "คน" ไม่ใช่ห้องแชท** — คนเดียวทักทั้ง LINE และ FB ต้องได้นัดเดียว
//   leads (สถานะ + นัด + ผู้รับผิดชอบ)  1 : N  lead_contacts (ห้องแชทของคนนั้น)
// ห้องที่ยังไม่ผูกลูกค้าก็มี lead ของตัวเองได้ (`customer_id` ว่าง) แล้ว **รวมร่าง** วันที่ถูกผูก
//
// ⚠️ ใช้ supabaseAdmin (service role ข้าม RLS) ⇒ ทุก query ต้อง filter `company_id` เอง

import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  DEFAULT_LEAD_STAGES, DEFAULT_STAGE_KEY, CLOSED_STAGE_KEYS,
  QUOTED_STAGE_KEY, WON_STAGE_KEY,
  type LeadStage,
} from './stages';
import { FOLLOW_UP_HOUR } from './followup-presets';

/** ส่งบิลแล้วกี่วันถึงทวง — ค่าตั้งต้นของระบบ (ร้านปรับได้ภายหลัง) */
export const DEFAULT_QUOTE_REMIND_DAYS = 2;
/** นัดหลังการขาย: ส่งของสำเร็จแล้วกี่วันถึงชวนคุยอีกที */
export const DEFAULT_AFTER_SALE_DAYS = 30;
/** รอโอนนานเกินกี่วันถึงเด้งให้คนตัดสินใจ (ปิดบิล / ตามยาว) */
export const QUOTE_DECISION_DAYS = 7;
const FOLLOW_UP_HOUR_LOCAL = FOLLOW_UP_HOUR;

export type LeadEventSource = 'manual' | 'system';

export interface LeadRow {
  id: string;
  company_id: string;
  customer_id: string | null;
  stage: string;
  stage_source: LeadEventSource;
  stage_changed_at: string;
  follow_up_at: string | null;
  follow_up_note: string | null;
  assigned_to: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  closed_reason: string | null;
  quote_order_id: string | null;
  quote_sent_at: string | null;
  reminded_count: number;
}

const LEAD_COLUMNS =
  'id, company_id, customer_id, stage, stage_source, stage_changed_at, follow_up_at, follow_up_note, ' +
  'assigned_to, last_inbound_at, last_outbound_at, closed_reason, quote_order_id, quote_sent_at, reminded_count';

/* ─────────────── ขั้นของบริษัท ─────────────── */

/**
 * ขั้นทั้งหมดของบริษัท — บริษัทที่ยังไม่มีแถว (สมัครใหม่หลัง migration) จะถูก seed ให้ที่นี่
 * เพื่อไม่ต้องไปผูกกับ flow สมัครสมาชิก
 */
export async function getCompanyStages(companyId: string): Promise<LeadStage[]> {
  const { data } = await supabaseAdmin
    .from('lead_stages')
    .select('key, name, color, sort_order, is_open, is_default, auto_managed')
    .eq('company_id', companyId)
    .order('sort_order');

  if (data && data.length > 0) return data as LeadStage[];

  await supabaseAdmin.from('lead_stages').insert(
    DEFAULT_LEAD_STAGES.map(s => ({ ...s, company_id: companyId })),
  );
  return DEFAULT_LEAD_STAGES;
}

/* ─────────────── หา / สร้าง lead ─────────────── */

/** lead ของห้องแชทนี้ — ไม่มีก็คืน null (ไม่สร้างให้) */
export async function getLeadForContact(
  companyId: string, contactId: string, platform: string,
): Promise<LeadRow | null> {
  const { data: link } = await supabaseAdmin
    .from('lead_contacts')
    .select('lead_id')
    .eq('contact_id', contactId)
    .eq('platform', platform)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!link?.lead_id) return null;

  const { data } = await supabaseAdmin
    .from('leads')
    .select(LEAD_COLUMNS)
    .eq('id', link.lead_id)
    .eq('company_id', companyId)
    .maybeSingle();

  return (data as unknown as LeadRow) || null;
}

/**
 * lead ของห้องนี้ **สร้างให้ถ้ายังไม่มี**
 *
 * ลำดับการหา: ห้องนี้ถูกผูกไว้แล้ว → lead ของลูกค้าคนนี้ (ถ้าห้องผูกลูกค้าแล้ว) → สร้างใหม่
 * ถ้าห้องมี lead อยู่แล้วและลูกค้าก็มี lead อยู่แล้วคนละใบ = **รวมร่าง**
 */
export async function resolveLeadForContact(params: {
  companyId: string;
  contactId: string;
  platform: string;
  customerId?: string | null;
}): Promise<LeadRow> {
  const { companyId, contactId, platform, customerId } = params;

  const existing = await getLeadForContact(companyId, contactId, platform);
  const byCustomer = customerId ? await getLeadByCustomer(companyId, customerId) : null;

  // ทั้งสองฝั่งมีใบของตัวเอง → รวมเป็นใบของลูกค้า
  if (existing && byCustomer && existing.id !== byCustomer.id) {
    return mergeLeads(companyId, byCustomer, existing);
  }
  if (existing) {
    // ห้องเพิ่งถูกผูกลูกค้า แต่ลูกค้ายังไม่มีใบ → เติม customer_id ให้ใบเดิม
    if (customerId && !existing.customer_id) {
      const { data } = await supabaseAdmin
        .from('leads')
        .update({ customer_id: customerId })
        .eq('id', existing.id)
        .eq('company_id', companyId)
        .select(LEAD_COLUMNS)
        .single();
      return (data as unknown as LeadRow) || existing;
    }
    return existing;
  }
  if (byCustomer) {
    await linkContactToLead(companyId, byCustomer.id, contactId, platform);
    return byCustomer;
  }

  const { data: created, error } = await supabaseAdmin
    .from('leads')
    .insert({
      company_id: companyId,
      customer_id: customerId || null,
      stage: DEFAULT_STAGE_KEY,
      stage_source: 'system',
    })
    .select(LEAD_COLUMNS)
    .single();

  if (error || !created) throw error || new Error('สร้างผู้สนใจไม่สำเร็จ');

  const createdLead = created as unknown as LeadRow;
  await linkContactToLead(companyId, createdLead.id, contactId, platform);
  return createdLead;
}

async function getLeadByCustomer(companyId: string, customerId: string): Promise<LeadRow | null> {
  const { data } = await supabaseAdmin
    .from('leads')
    .select(LEAD_COLUMNS)
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .maybeSingle();
  return (data as unknown as LeadRow) || null;
}

async function linkContactToLead(companyId: string, leadId: string, contactId: string, platform: string) {
  await supabaseAdmin
    .from('lead_contacts')
    .upsert(
      { company_id: companyId, lead_id: leadId, contact_id: contactId, platform },
      { onConflict: 'contact_id,platform' },
    );
}

/**
 * รวมใบของห้อง (`loser`) เข้าใบของลูกค้า (`winner`)
 *
 * กติกา: **นัดที่ใกล้กว่าชนะ · ขั้นที่ลึกกว่าชนะ** (ตาม sort_order) · โน้ต/ผู้รับผิดชอบเติมเฉพาะช่องที่ว่าง ·
 * ประวัติกับห้องแชทย้ายตามทั้งหมด แล้วลบใบที่เหลือทิ้ง
 */
async function mergeLeads(companyId: string, winner: LeadRow, loser: LeadRow): Promise<LeadRow> {
  const stages = await getCompanyStages(companyId);
  const orderOf = (key: string) => stages.find(s => s.key === key)?.sort_order ?? 0;

  const patch: Record<string, unknown> = {};
  if (orderOf(loser.stage) > orderOf(winner.stage)) {
    patch.stage = loser.stage;
    patch.stage_source = loser.stage_source;
    patch.stage_changed_at = loser.stage_changed_at;
  }
  const bothDue = [winner.follow_up_at, loser.follow_up_at].filter(Boolean) as string[];
  if (bothDue.length > 0) {
    const nearest = bothDue.sort()[0];
    if (nearest !== winner.follow_up_at) {
      patch.follow_up_at = nearest;
      patch.follow_up_note = loser.follow_up_note || winner.follow_up_note;
    }
  }
  if (!winner.follow_up_note && loser.follow_up_note) patch.follow_up_note = loser.follow_up_note;
  if (!winner.assigned_to && loser.assigned_to) patch.assigned_to = loser.assigned_to;
  if (!winner.quote_sent_at && loser.quote_sent_at) {
    patch.quote_sent_at = loser.quote_sent_at;
    patch.quote_order_id = loser.quote_order_id;
    patch.reminded_count = loser.reminded_count;
  }

  await supabaseAdmin.from('lead_contacts').update({ lead_id: winner.id }).eq('lead_id', loser.id).eq('company_id', companyId);
  await supabaseAdmin.from('lead_events').update({ lead_id: winner.id }).eq('lead_id', loser.id).eq('company_id', companyId);

  let merged = winner;
  if (Object.keys(patch).length > 0) {
    const { data } = await supabaseAdmin
      .from('leads').update(patch).eq('id', winner.id).eq('company_id', companyId)
      .select(LEAD_COLUMNS).single();
    if (data) merged = data as unknown as LeadRow;
  }

  await supabaseAdmin.from('leads').delete().eq('id', loser.id).eq('company_id', companyId);
  await logLeadEvent({
    companyId, leadId: winner.id, type: 'merged', source: 'system',
    meta: { merged_from: loser.id, stage: loser.stage, follow_up_at: loser.follow_up_at },
  });

  return merged;
}

/* ─────────────── เขียนค่า ─────────────── */

export async function logLeadEvent(params: {
  companyId: string;
  leadId: string;
  type: string;
  fromStage?: string | null;
  toStage?: string | null;
  followUpAt?: string | null;
  contactId?: string | null;
  platform?: string | null;
  source?: LeadEventSource;
  actorId?: string | null;
  meta?: Record<string, unknown> | null;
}) {
  await supabaseAdmin.from('lead_events').insert({
    company_id: params.companyId,
    lead_id: params.leadId,
    type: params.type,
    from_stage: params.fromStage ?? null,
    to_stage: params.toStage ?? null,
    follow_up_at: params.followUpAt ?? null,
    contact_id: params.contactId ?? null,
    platform: params.platform ?? null,
    source: params.source || 'manual',
    actor_id: params.actorId ?? null,
    meta: params.meta ?? null,
  });
}

export interface UpdateLeadInput {
  stage?: string;
  followUpAt?: string | null;
  followUpNote?: string | null;
  assignedTo?: string | null;
}

/**
 * แก้สถานะ/นัดของ lead หนึ่งใบ
 *
 * กติกาที่บังคับที่นี่ (ไม่ใช่ที่หน้าจอ — API ตัวอื่นก็ต้องได้กติกาเดียวกัน):
 * - เข้าขั้นที่ "จบแล้ว" (ซื้อแล้ว / ดูแลเสร็จ / ไม่เอาแล้ว) → **ล้างนัดเสมอ** + จด closed_reason
 * - ออกจากขั้น "รอโอน" → หยุดตัวนับวันรอโอน
 */
export async function updateLead(params: {
  companyId: string;
  lead: LeadRow;
  input: UpdateLeadInput;
  actorId?: string | null;
  source?: LeadEventSource;
  contactId?: string | null;
  platform?: string | null;
}): Promise<LeadRow> {
  const { companyId, lead, input, actorId, contactId, platform } = params;
  const source: LeadEventSource = params.source || 'manual';
  const patch: Record<string, unknown> = {};
  const events: Array<Parameters<typeof logLeadEvent>[0]> = [];

  let nextFollowUp = input.followUpAt !== undefined ? input.followUpAt : lead.follow_up_at;

  if (input.stage && input.stage !== lead.stage) {
    const closed = CLOSED_STAGE_KEYS.includes(input.stage);
    patch.stage = input.stage;
    patch.stage_source = source;
    patch.stage_changed_at = new Date().toISOString();
    patch.stage_changed_by = actorId ?? null;
    patch.closed_reason = closed ? input.stage : null;
    if (closed) nextFollowUp = null;
    if (lead.stage === 'quoted' && input.stage !== 'quoted') {
      patch.quote_sent_at = null;
      patch.quote_order_id = null;
      patch.reminded_count = 0;
    }
    events.push({
      companyId, leadId: lead.id, type: 'stage_change',
      fromStage: lead.stage, toStage: input.stage,
      source, actorId, contactId, platform,
    });
  }

  if (nextFollowUp !== lead.follow_up_at) {
    patch.follow_up_at = nextFollowUp;
    events.push({
      companyId, leadId: lead.id,
      type: nextFollowUp ? 'follow_up_set' : 'follow_up_cleared',
      followUpAt: nextFollowUp, source, actorId, contactId, platform,
    });
  }
  if (input.followUpNote !== undefined) patch.follow_up_note = input.followUpNote;
  if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo;

  if (Object.keys(patch).length === 0) return lead;

  const { data, error } = await supabaseAdmin
    .from('leads').update(patch).eq('id', lead.id).eq('company_id', companyId)
    .select(LEAD_COLUMNS).single();
  if (error) throw error;

  // ประวัติไม่ต้องให้ผู้ใช้รอ — ลงหลังตอบกลับ (after() ไม่ใช่ปล่อยลอย: Vercel freeze ทิ้งหลัง response)
  after(async () => {
    for (const e of events) await logLeadEvent(e).catch(err => console.error('lead event failed:', err));
  });
  return data as unknown as LeadRow;
}

/**
 * พนักงานพิมพ์ตอบในห้องนี้ = **ทักแล้ว** → ล้างนัดของคนนี้ (ทุกห้องของเขา)
 *
 * ⚠️ ใช้เฉพาะการตอบ 1:1 เท่านั้น — **บรอดแคสต์ห้ามเรียก** (ยิง 500 คนทีเดียวไม่ใช่การติดตามรายคน
 * ถ้านับเป็นทักแล้ว นัดที่สะสมทั้งเดือนจะหายเกลี้ยงในคลิกเดียว)
 *
 * คืนค่าว่ามีนัดถูกล้างไปจริงไหม — หน้าจอเอาไปถามต่อว่า "ตั้งนัดใหม่ไหม"
 */
export async function markContactedByStaff(params: {
  companyId: string;
  contactId: string;
  platform: string;
  actorId?: string | null;
}): Promise<{ cleared: boolean; leadId: string | null }> {
  const { companyId, contactId, platform, actorId } = params;
  const lead = await getLeadForContact(companyId, contactId, platform);
  if (!lead) return { cleared: false, leadId: null };

  const hadFollowUp = !!lead.follow_up_at;
  const patch: Record<string, unknown> = { last_outbound_at: new Date().toISOString() };
  if (hadFollowUp) {
    patch.follow_up_at = null;
    if (lead.stage === 'quoted') patch.reminded_count = (lead.reminded_count || 0) + 1;
  }

  await supabaseAdmin.from('leads').update(patch).eq('id', lead.id).eq('company_id', companyId);

  if (hadFollowUp) {
    await logLeadEvent({
      companyId, leadId: lead.id, type: 'contacted',
      source: 'manual', actorId, contactId, platform,
      meta: { cleared_follow_up_at: lead.follow_up_at },
    });
  }
  return { cleared: hadFollowUp, leadId: lead.id };
}

/* ─────────────── ระบบติดสถานะให้เอง (จากเหตุการณ์จริง) ─────────────── */

/**
 * ส่งลิงก์บิลให้ลูกค้าในแชท → "รอโอน" + เริ่มจับเวลา + ตั้งนัดทวงให้เอง
 *
 * เรียกจาก `POST /api/chat/messages` เมื่อข้อความนั้นคือบิล (`bill_order_id`) — ไม่ใช่ข้อความธรรมดา
 * จึง **ไม่ล้างนัด** แบบการตอบทั่วไป (เราเพิ่งโยนลูกไปฝั่งลูกค้า ต้องตามต่อ)
 */
export async function markBillSentToChat(params: {
  companyId: string;
  contactId: string;
  platform: string;
  orderId: string;
  customerId?: string | null;
  actorId?: string | null;
  /** กี่วันหลังส่งบิลถึงจะทวง (ค่าเริ่ม 2 วัน) */
  remindAfterDays?: number;
}): Promise<void> {
  const { companyId, contactId, platform, orderId, customerId, actorId } = params;
  const days = params.remindAfterDays ?? DEFAULT_QUOTE_REMIND_DAYS;

  const lead = await resolveLeadForContact({ companyId, contactId, platform, customerId });
  // ซื้อแล้ว/ปิดเคสไปแล้วก็ยังส่งบิลใบใหม่ได้ — ถือเป็นดีลรอบใหม่ จึงตั้ง "รอโอน" ทับได้
  const followUp = new Date();
  followUp.setDate(followUp.getDate() + days);
  followUp.setHours(FOLLOW_UP_HOUR_LOCAL, 0, 0, 0);

  await supabaseAdmin
    .from('leads')
    .update({
      stage: QUOTED_STAGE_KEY,
      stage_source: 'system',
      stage_changed_at: new Date().toISOString(),
      stage_changed_by: actorId ?? null,
      closed_reason: null,
      quote_order_id: orderId,
      quote_sent_at: new Date().toISOString(),
      reminded_count: 0,
      follow_up_at: followUp.toISOString(),
      follow_up_note: lead.follow_up_note || 'ส่งบิลแล้ว รอโอน',
      last_outbound_at: new Date().toISOString(),
    })
    .eq('id', lead.id)
    .eq('company_id', companyId);

  await logLeadEvent({
    companyId, leadId: lead.id, type: 'stage_change',
    fromStage: lead.stage, toStage: QUOTED_STAGE_KEY,
    followUpAt: followUp.toISOString(), source: 'system', actorId, contactId, platform,
    meta: { reason: 'bill_sent', order_id: orderId },
  });
}

/**
 * ลูกค้าจ่ายเงินแล้ว / ออเดอร์เดินต่อ → "ซื้อแล้ว" + ล้างนัด + หยุดตัวนับรอโอน
 *
 * หา lead จากห้องแชทที่เปิดบิล (ถ้าบิลมาจากแชท) ไม่งั้นจากลูกค้าเจ้าของบิล —
 * ไม่เจอ = ไม่ทำอะไร (บิลหน้าร้าน/POS ที่ไม่เคยคุยในแชทไม่ต้องมี lead)
 *
 * ⚠️ เรียกใน `after()` เสมอ และห้าม throw ออกไปให้การบันทึกบิลล้ม
 */
export async function markOrderPaid(params: { companyId: string; orderId: string }): Promise<void> {
  const { companyId, orderId } = params;

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, company_id, customer_id, chat_contact_id, chat_platform')
    .eq('id', orderId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!order) return;

  let lead: LeadRow | null = null;
  if (order.chat_contact_id && order.chat_platform) {
    lead = await getLeadForContact(companyId, order.chat_contact_id as string, order.chat_platform as string);
  }
  if (!lead && order.customer_id) {
    lead = await getLeadByCustomer(companyId, order.customer_id as string);
  }
  if (!lead || lead.stage === WON_STAGE_KEY) return;

  await supabaseAdmin
    .from('leads')
    .update({
      stage: WON_STAGE_KEY,
      stage_source: 'system',
      stage_changed_at: new Date().toISOString(),
      closed_reason: 'won',
      follow_up_at: null,
      quote_order_id: null,
      quote_sent_at: null,
      reminded_count: 0,
    })
    .eq('id', lead.id)
    .eq('company_id', companyId);

  await logLeadEvent({
    companyId, leadId: lead.id, type: 'stage_change',
    fromStage: lead.stage, toStage: WON_STAGE_KEY, source: 'system',
    meta: { reason: 'order_paid', order_id: orderId },
  });
}

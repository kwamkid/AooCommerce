// Path: lib/ads/subject.ts
//
// ประกอบ "เหตุการณ์หนึ่งใบ" (ConversionSubject) จากออเดอร์ + ตัดสินว่าใบนี้ควรส่งไหม
//
// ⚠️ **ส่วนบนของไฟล์ตั้งใจให้ pure** (ไม่แตะ DB) — กติกาว่าใบไหนส่งได้คือสิ่งที่ต้องทดสอบ
// ได้โดยไม่ต้องมีฐานข้อมูล และเป็นสิ่งที่เผลอเปลี่ยนแล้วผิดเงียบที่สุด (ออเดอร์ marketplace
// หลุดเข้าไปเคลมเป็นผลของโฆษณาเรา = ตัวเลขทั้งแคมเปญเพี้ยนโดยไม่มีอาการ)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { actionSourceForOrder, isMarketplaceOrder } from '@/lib/meta/capi';
import { QUALIFIED_LEAD_EVENT_NAME } from './qualified-lead';
import type { ConversionSubject, OrderForConversion } from './types';

// ─────────────────────── ส่วน pure (ทดสอบได้โดยไม่ต้องมี DB) ───────────────────────

/**
 * ประเภทบิลที่นับเป็น "การซื้อของลูกค้าปลายทาง" โดยค่าเริ่มต้น
 *
 * ตั้งใจเอาแค่ `r_retail` — บิลขายส่ง/ฝากขาย/ห้าง (w_*, c_*, d_*) คือการเติมของให้คู่ค้า
 * ไม่ใช่ผู้บริโภคที่โฆษณาพามา · ยิงเข้าไปด้วย Meta จะเรียนรู้ว่า "ลูกค้าคุณคือคนสั่งทีละแสน"
 * แล้วไปหาคนแบบนั้นให้ · ร้านที่อยากนับด้วยตั้งเองได้ที่ `metadata.include_flow_types`
 */
export const DEFAULT_INCLUDE_FLOW_TYPES: string[] = ['r_retail'];

/** ออเดอร์ที่ยังไม่ระบุ flow ถือเป็นบิลปลีก (ค่าเดิมของระบบก่อนมีคอลัมน์นี้) */
const FALLBACK_FLOW_TYPE = 'r_retail';

export interface EligibilityResult {
  ok: boolean;
  reason?: string;
}

/**
 * กติกาที่**ไม่เกี่ยวกับการชำระเงิน** — บิลใบนี้เป็นของลูกค้าปลายทางที่โฆษณาเราพามาไหม
 *
 * แยกออกมาเพราะ InitiateCheckout (เปิดบิลให้ ยังไม่จ่าย) ต้องใช้กติกาชุดเดียวกันเป๊ะ
 * ยกเว้นข้อ "จ่ายแล้ว" — copy ไปอีกชุดเมื่อไหร่ กติกาสองชุดจะเดินหนีกันโดยไม่มีใครรู้
 */
export function isConversionEligible(
  order: OrderForConversion | null,
  account?: { metadata?: Record<string, unknown> | null } | null,
): EligibilityResult {
  if (!order) return { ok: false, reason: 'order_not_found' };
  if (order.order_status === 'cancelled') return { ok: false, reason: 'cancelled' };
  // ออเดอร์ที่เกิดในแอปของแพลตฟอร์มอื่น — เราไม่ได้เป็นคนพาลูกค้ามา เคลมไม่ได้
  if (isMarketplaceOrder(order)) return { ok: false, reason: 'marketplace_order' };

  const value = Number(order.total_amount);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, reason: 'zero_value' };

  const configured = account?.metadata?.include_flow_types;
  const include = Array.isArray(configured) && configured.length > 0
    ? (configured as unknown[]).map((v) => String(v))
    : DEFAULT_INCLUDE_FLOW_TYPES;
  const flow = order.flow_type || FALLBACK_FLOW_TYPE;
  if (!include.includes(flow)) return { ok: false, reason: `flow_excluded:${flow}` };

  return { ok: true };
}

/**
 * ใบนี้ส่งเป็น Purchase ได้ไหม — **เช็คก่อนจองสิทธิ์เสมอ**
 * (จองแล้วค่อยพบว่าไม่ควรส่ง = ใบนั้นถูกปิดตายทั้งที่ไม่เคยยิง)
 */
export function isPurchaseEligible(
  order: OrderForConversion | null,
  account?: { metadata?: Record<string, unknown> | null } | null,
): EligibilityResult {
  if (!order) return { ok: false, reason: 'order_not_found' };
  if (order.payment_status !== 'paid') return { ok: false, reason: 'not_paid' };
  return isConversionEligible(order, account);
}

// ─────────────────────── ส่วนที่คุยกับฐานข้อมูล ───────────────────────

const ORDER_COLUMNS =
  'id, company_id, order_number, customer_id, total_amount, payment_status, order_status, ' +
  'source, marketplace_account_id, flow_type, chat_platform, chat_contact_id, chat_account_id, ' +
  'created_at, updated_at';

export async function loadOrderForConversion(orderId: string): Promise<OrderForConversion | null> {
  try {
    const { data } = await supabaseAdmin
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('id', orderId)
      .maybeSingle();
    return (data as unknown as OrderForConversion) ?? null;
  } catch {
    return null;
  }
}

export async function loadCustomerIdentity(
  customerId: string,
): Promise<{ id: string; phone: string | null; email: string | null } | null> {
  try {
    const { data } = await supabaseAdmin
      .from('customers')
      .select('id, phone, email')
      .eq('id', customerId)
      .maybeSingle<{ id: string; phone: string | null; email: string | null }>();
    return data ?? null;
  } catch {
    return null;
  }
}

/** สถานะการชำระที่ **ไม่นับ** ว่าเงินเข้า */
const DEAD_PAYMENT_STATUSES = new Set(['cancelled', 'rejected', 'failed']);

/**
 * เวลาที่เงินเข้าจริงของแต่ละออเดอร์ (epoch ms) — `orders` ไม่มีคอลัมน์นี้ ต้องอ่านจาก payment_records
 *
 * ยิงด้วยเวลา "ตอนนี้" ของออเดอร์เมื่อ 5 วันก่อน = สถิติของ Meta เพี้ยนทั้งแคมเปญ
 *
 * ⚠️ **กรองสถานะฝั่งเราเอง ไม่ใช่ `.not(...in...)`** — แถวที่ status เป็น NULL จะหลุด
 * ตะแกรงของ SQL (NOT IN กับ NULL ได้ NULL = ไม่ผ่าน) ทั้งที่มันคือใบที่ควรนับ
 */
export async function resolvePaidAt(orderIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (orderIds.length === 0) return out;

  try {
    const { rows } = await fetchAllRows<{
      order_id: string | null;
      payment_date: string | null;
      status: string | null;
    }>((from, to) =>
      supabaseAdmin
        .from('payment_records')
        .select('order_id, payment_date, status', { count: 'exact' })
        .in('order_id', orderIds)
        .range(from, to),
    );

    for (const row of rows) {
      if (!row.order_id || !row.payment_date) continue;
      if (row.status && DEAD_PAYMENT_STATUSES.has(row.status)) continue;
      const ts = Date.parse(row.payment_date);
      if (!Number.isFinite(ts)) continue;
      const prev = out.get(row.order_id);
      if (prev == null || ts > prev) out.set(row.order_id, ts);
    }
  } catch (err) {
    // อ่านไม่ได้ = ผู้เรียกตกไปใช้ updated_at ของออเดอร์แทน (หยาบกว่าแต่ยังอยู่ในกรอบ)
    console.error('[ads/subject] resolvePaidAt failed:', err instanceof Error ? err.message : err);
  }
  return out;
}

/**
 * ประกอบ subject ของ Purchase — ครั้งเดียวต่อออเดอร์ แล้วส่งให้ทุกบัญชีโฆษณายิงต่อ
 *
 * @returns subject หรือ `{ skip: reason }` เมื่อออเดอร์ไม่มีอยู่/ยังไม่ paid ฯลฯ
 */
export async function buildPurchaseSubject(
  orderId: string,
  opts: { eventTime?: number } = {},
): Promise<ConversionSubject | { skip: string }> {
  const order = await loadOrderForConversion(orderId);
  if (!order) return { skip: 'order_not_found' };
  if (order.payment_status !== 'paid') return { skip: 'not_paid' };

  const customer = order.customer_id ? await loadCustomerIdentity(order.customer_id) : null;
  const eventTime = opts.eventTime ?? Math.floor(Date.now() / 1000);

  return {
    companyId: order.company_id,
    eventName: 'Purchase',
    // event_id = order id → ยิงซ้ำ/ยิงสองปลายทางที่เป็น dataset เดียวกัน Meta นับครั้งเดียว
    eventId: order.id,
    eventTime,
    actionSource: actionSourceForOrder(order),
    order,
    customer,
    // สายบัญชีโฆษณาจับคู่คนด้วยเบอร์/อีเมล ไม่ใช่ PSID — ห้องแชทเป็นเรื่องของ dataset เพจ
    contact: null,
    customData: {
      currency: 'THB',
      value: Number(order.total_amount) || 0,
      order_id: order.order_number ?? order.id,
      content_type: 'product',
    },
  };
}

/**
 * ประกอบ subject ของ **InitiateCheckout** — "พนักงานเปิดบิลให้จากห้องแชทแล้ว"
 *
 * ⚠️ **ไม่มีเงื่อนไขว่าจ่ายแล้ว** (นั่นคือทั้งประเด็นของ event นี้) แต่ยังต้องผ่านกติกาอื่น
 * ครบชุดผ่าน `isConversionEligible` ตอน dispatch — และต้องมีห้องแชทผูกอยู่จริง
 * ไม่งั้นเราไม่มีทางบอก Meta ได้ว่าบทสนทนาไหนพาไปถึงตะกร้าใบนี้
 *
 * event_time = **เวลาที่เปิดบิล** ไม่ใช่ "ตอนนี้" (ยิงย้อนหลังด้วยเวลาปัจจุบัน = สถิติเพี้ยน)
 */
export async function buildInitiateCheckoutSubject(
  orderId: string,
): Promise<ConversionSubject | { skip: string }> {
  const order = await loadOrderForConversion(orderId);
  if (!order) return { skip: 'order_not_found' };
  if (order.order_status === 'cancelled') return { skip: 'cancelled' };
  // ออเดอร์ที่เกิดในแอปของแพลตฟอร์มอื่น — เราไม่ได้เป็นคนพาลูกค้ามา เคลมไม่ได้
  if (isMarketplaceOrder(order)) return { skip: 'marketplace_order' };
  if (!order.chat_contact_id) return { skip: 'no_chat_contact' };

  const customer = order.customer_id ? await loadCustomerIdentity(order.customer_id) : null;
  const createdMs = order.created_at ? Date.parse(order.created_at) : NaN;
  const eventTime = Number.isFinite(createdMs)
    ? Math.floor(createdMs / 1000)
    : Math.floor(Date.now() / 1000);

  return {
    companyId: order.company_id,
    eventName: 'InitiateCheckout',
    // คนละ prefix กับ Purchase (ซึ่งใช้ order id ล้วน) — event สองชนิดของบิลเดียวกัน
    // ต้องมี id คนละใบ ไม่งั้น Meta ตัดทิ้งเป็นใบซ้ำ
    eventId: `ic:${order.id}`,
    eventTime,
    actionSource: 'chat',
    order,
    customer,
    contact: null,
    customData: {
      currency: 'THB',
      value: Number(order.total_amount) || 0,
      order_id: order.order_number ?? order.id,
    },
  };
}

/** ผู้ติดต่อ Messenger เท่าที่ subject ของ QualifiedLead ต้องใช้ */
interface FbContactForSubject {
  id: string;
  company_id: string;
  fb_psid: string | null;
  fb_page_id: string | null;
  chat_account_id: string | null;
  customer_id: string | null;
  source: string | null;
}

/**
 * ประกอบ subject ของ **QualifiedLead** — "ห้องนี้คุยจนรู้แล้วว่าเป็นลูกค้าจริง"
 *
 * ไม่ผูกกับบิล (`order: null`) — จุดประสงค์คือบอก Meta ว่า *คนแบบไหน* คุยแล้วไปต่อ
 * เพื่อให้โฆษณาไปหาคนแบบนั้นเพิ่ม · เบอร์/อีเมลมีก็ต่อเมื่อห้องนี้ผูกกับลูกค้าในระบบแล้ว
 * (ไม่มีก็ยังยิงเข้า dataset ของเพจได้ เพราะสายนั้นจับคู่ด้วย PSID)
 */
export async function buildQualifiedLeadSubject(input: {
  companyId: string;
  contactId: string;
}): Promise<ConversionSubject | { skip: string }> {
  const { companyId, contactId } = input;

  const { data: contact } = await supabaseAdmin
    .from('fb_contacts')
    .select('id, company_id, fb_psid, fb_page_id, chat_account_id, customer_id, source')
    .eq('id', contactId)
    .eq('company_id', companyId)
    .maybeSingle<FbContactForSubject>();

  if (!contact) return { skip: 'contact_not_found' };
  // IG ยังไม่รองรับ (dataset ของเพจต้องใช้ ig user id + messaging_channel instagram)
  if (contact.source !== 'facebook') return { skip: 'not_facebook' };

  const customer = contact.customer_id ? await loadCustomerIdentity(contact.customer_id) : null;

  return {
    companyId,
    eventName: QUALIFIED_LEAD_EVENT_NAME,
    eventId: `ql:${contactId}`,
    eventTime: Math.floor(Date.now() / 1000),
    actionSource: 'chat',
    order: null,
    customer,
    contact:
      contact.fb_psid && contact.fb_page_id && contact.chat_account_id
        ? {
            platform: 'facebook',
            contactId: contact.id,
            psid: String(contact.fb_psid),
            pageId: String(contact.fb_page_id),
            chatAccountId: contact.chat_account_id,
          }
        : null,
    customData: {},
  };
}

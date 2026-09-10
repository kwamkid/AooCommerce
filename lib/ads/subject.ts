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
 * ใบนี้ส่งเป็น Purchase ได้ไหม — **เช็คก่อนจองสิทธิ์เสมอ**
 * (จองแล้วค่อยพบว่าไม่ควรส่ง = ใบนั้นถูกปิดตายทั้งที่ไม่เคยยิง)
 */
export function isPurchaseEligible(
  order: OrderForConversion | null,
  account?: { metadata?: Record<string, unknown> | null } | null,
): EligibilityResult {
  if (!order) return { ok: false, reason: 'order_not_found' };
  if (order.payment_status !== 'paid') return { ok: false, reason: 'not_paid' };
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

// ─────────────────────── ส่วนที่คุยกับฐานข้อมูล ───────────────────────

const ORDER_COLUMNS =
  'id, company_id, order_number, customer_id, total_amount, payment_status, order_status, ' +
  'source, marketplace_account_id, flow_type, chat_platform, chat_contact_id, chat_account_id, updated_at';

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

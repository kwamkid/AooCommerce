// Beam Checkout — "เงินเข้าแล้ว → อัพเดทออเดอร์" ที่เดียว ใช้ร่วมทั้ง webhook และ reconcile
//
// ทำไมต้องมี reconcile: webhook คือทางหลัก แต่มันขึ้นกับการตั้งค่าฝั่ง Beam Lighthouse
// (URL + HMAC key) ซึ่งพลาดได้และพลาดแล้วเงียบ (จ่ายบัตรผ่าน 3 ใบใน ก.ย. 2026 ไม่มีใบไหน
// อัพเดทเอง ร้านต้องบันทึกชำระมือทุกใบ) · ทาง "ถาม Beam เอง" จึงต้องมีเสมอ:
//   1. ลูกค้ากลับมาหน้าบิลหลังจ่าย (Beam redirect กลับ ?payment=success) → ถามทันที
//   2. cron กวาดแถว pending ที่ค้าง → ถามซ้ำ (เผื่อลูกค้าปิดเบราว์เซอร์ก่อนกลับมา)
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logIntegrationNow } from '@/lib/integration-logger';
import { getBeamPaymentLink, getBeamPaymentLinkCharges, loadBeamGateways, type BeamGateway } from './client';

/** ข้อความในช่อง notes ของแถวที่ระบบต้องไปถาม Beam เอง — ตัวเฝ้าใช้จับว่า webhook ไม่เข้า */
export const BEAM_RECONCILE_NOTE = 'ยืนยันจาก Beam API โดยตรง (webhook ไม่เข้า)';

export interface GatewayPaymentRecord {
  id: string;
  order_id: string;
  company_id: string;
  status: string;
  gateway_payment_link_id: string | null;
  created_at?: string;
}

export type SettleResult = 'settled' | 'already_verified' | 'order_already_paid' | 'failed';

/**
 * ทำให้ออเดอร์ "ชำระแล้ว" จากหลักฐานว่า Beam ตัดเงินสำเร็จ — idempotent
 *
 * - แถวนี้ verified อยู่แล้ว → ไม่ทำซ้ำ
 * - ออเดอร์ถูกบันทึกชำระไว้แล้วทางอื่น (ร้านกดบันทึกมือก่อน) → **ไม่สร้างยอดชำระซ้ำ**
 *   ปิดแถว gateway เป็น cancelled พร้อมจดว่า Beam ตัดเงินจริง (กันเงินหายจากสายตา)
 */
export async function settleGatewayPayment(opts: {
  record: GatewayPaymentRecord;
  chargeId: string | null;
  raw: unknown;
  via: 'webhook' | 'reconcile';
}): Promise<SettleResult> {
  const { record, chargeId, raw, via } = opts;
  if (record.status === 'verified') return 'already_verified';

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, order_status, payment_status')
    .eq('id', record.order_id)
    .eq('company_id', record.company_id)
    .single();
  if (!order) return 'failed';

  const now = new Date().toISOString();

  if (order.payment_status === 'paid') {
    await supabaseAdmin.from('payment_records').update({
      status: 'cancelled',
      gateway_status: 'PAID',
      gateway_charge_id: chargeId,
      gateway_raw_response: raw,
      notes: 'Beam ตัดเงินสำเร็จจริง แต่ออเดอร์ถูกบันทึกชำระไว้แล้วก่อนหน้า — ปิดแถวนี้กันนับยอดซ้ำ',
      updated_at: now,
    }).eq('id', record.id);
    await log(record, via, 'success', 'ออเดอร์ชำระแล้วอยู่ก่อน (บันทึกมือ) — ปิดแถว gateway กันนับซ้ำ');
    return 'order_already_paid';
  }

  const { error: verifyError } = await supabaseAdmin.from('payment_records').update({
    status: 'verified',
    gateway_status: 'PAID',
    gateway_charge_id: chargeId,
    gateway_raw_response: raw,
    payment_date: now,
    ...(via === 'reconcile' ? { notes: BEAM_RECONCILE_NOTE } : {}),
    updated_at: now,
  }).eq('id', record.id);
  if (verifyError) {
    // เงินเข้าแล้วแต่บันทึกไม่ติด — ต้องเห็นใน log ไม่ใช่เงียบ (เคยล้มเงียบมาแล้ว)
    console.error('[Beam] mark payment record verified failed:', verifyError);
    await log(record, via, 'error', `บันทึกแถวชำระไม่ติด: ${verifyError.message}`);
    return 'failed';
  }

  // เลื่อน order_status ด้วย (new → ready_to_ship) ให้ตรงกับทางแจ้งโอนสลิปใน /api/bills —
  // ไม่งั้นออเดอร์ที่จ่ายเงินเข้ามาจริงแล้วจะค้างอยู่แท็บ "ใหม่"
  const { error: orderError } = await supabaseAdmin.from('orders').update({
    payment_status: 'paid',
    ...(order.order_status === 'new' ? { order_status: 'ready_to_ship' } : {}),
    updated_at: now,
  }).eq('id', record.order_id);
  if (orderError) {
    console.error('[Beam] mark order paid failed:', orderError, record.order_id);
    await log(record, via, 'error', `อัพเดทออเดอร์ไม่ติด: ${orderError.message}`);
    return 'failed';
  }

  await log(record, via, 'success', via === 'webhook' ? 'อัพเดทออเดอร์เป็นชำระแล้ว (webhook)' : BEAM_RECONCILE_NOTE);
  return 'settled';
}

function log(record: GatewayPaymentRecord, via: 'webhook' | 'reconcile', status: 'success' | 'error', note: string) {
  return logIntegrationNow({
    company_id: record.company_id,
    integration: 'beam',
    direction: via === 'webhook' ? 'incoming' : 'outgoing',
    action: `settle_${via}`,
    api_path: via === 'webhook' ? '/api/beam/webhook' : '/api/v1/payment-links',
    request_body: { payment_record_id: record.id, payment_link_id: record.gateway_payment_link_id },
    response_body: { note },
    status,
    error_message: status === 'error' ? note : undefined,
    reference_type: 'order',
    reference_id: record.order_id,
  }).catch(() => { /* log ห้ามทำให้การบันทึกเงินล้ม */ });
}

/**
 * ถาม Beam ว่าลิงก์ของแถวนี้จ่ายแล้วหรือยัง แล้วจัดการให้ตรง
 * PAID → settle · ACTIVE → รอต่อ · อื่น ๆ (หมดอายุ/ปิด) → ปิดแถว
 */
export async function reconcileGatewayRecord(gw: BeamGateway, record: GatewayPaymentRecord): Promise<SettleResult | 'still_pending' | 'closed' | 'unknown'> {
  if (!record.gateway_payment_link_id) return 'unknown';
  const link = await getBeamPaymentLink(gw, record.gateway_payment_link_id);
  if (!link.ok || !link.data) {
    await log(record, 'reconcile', 'error', `ถามสถานะลิงก์ไม่ได้ (HTTP ${link.status}): ${link.raw.slice(0, 200)}`);
    return 'unknown';
  }
  const status = String(link.data.status || '').toUpperCase();
  if (status === 'PAID') {
    const charges = await getBeamPaymentLinkCharges(gw, record.gateway_payment_link_id);
    const success = charges.find(c => String(c.status).toUpperCase() === 'SUCCEEDED');
    return settleGatewayPayment({
      record,
      chargeId: success?.chargeId || null,
      raw: { ...link.data, charge: success || null },
      via: 'reconcile',
    });
  }
  if (status === 'ACTIVE') return 'still_pending';
  // EXPIRED / DISABLED / CANCELLED — ลิงก์นี้จ่ายไม่ได้แล้ว ปิดแถวไม่ให้ค้าง pending ตลอดไป
  await supabaseAdmin.from('payment_records').update({
    status: 'cancelled',
    gateway_status: status || 'CLOSED',
    gateway_raw_response: link.data,
    updated_at: new Date().toISOString(),
  }).eq('id', record.id).eq('status', 'pending');
  return 'closed';
}

/** ออเดอร์เดียว — เรียกตอนลูกค้ากลับมาหน้าบิลหลังจ่าย (Beam redirect ?payment=success) */
export async function reconcileBeamForOrder(orderId: string): Promise<{ checked: number; settled: number }> {
  const { data: records } = await supabaseAdmin
    .from('payment_records')
    .select('id, order_id, company_id, status, gateway_payment_link_id, created_at')
    .eq('order_id', orderId)
    .eq('payment_method', 'payment_gateway')
    .eq('gateway_provider', 'beam')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (!records || records.length === 0) return { checked: 0, settled: 0 };

  const [gw] = await loadBeamGateways({ companyId: records[0].company_id as string });
  if (!gw) return { checked: 0, settled: 0 };

  let settled = 0;
  for (const r of records as GatewayPaymentRecord[]) {
    const result = await reconcileGatewayRecord(gw, r);
    if (result === 'settled' || result === 'order_already_paid') settled++;
  }
  return { checked: records.length, settled };
}

/**
 * กวาดแถว gateway ที่ค้าง pending (cron) — ตาข่ายชั้นสุดท้ายเมื่อ webhook ไม่เข้าและลูกค้า
 * ไม่ได้กลับมาหน้าบิล · จำกัดอายุกันไปถาม Beam เรื่องลิงก์เก่า ๆ ทุก 15 นาทีไม่รู้จบ
 */
export async function reconcilePendingBeamPayments(opts: { maxAgeDays?: number; limit?: number } = {}): Promise<{ checked: number; settled: number; closed: number }> {
  const since = new Date(Date.now() - (opts.maxAgeDays ?? 3) * 86_400_000).toISOString();
  const { data: records } = await supabaseAdmin
    .from('payment_records')
    .select('id, order_id, company_id, status, gateway_payment_link_id, created_at')
    .eq('payment_method', 'payment_gateway')
    .eq('gateway_provider', 'beam')
    .eq('status', 'pending')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (!records || records.length === 0) return { checked: 0, settled: 0, closed: 0 };

  const gateways = new Map<string, BeamGateway | null>();
  let settled = 0;
  let closed = 0;
  for (const r of records as GatewayPaymentRecord[]) {
    if (!gateways.has(r.company_id)) {
      const [gw] = await loadBeamGateways({ companyId: r.company_id });
      gateways.set(r.company_id, gw || null);
    }
    const gw = gateways.get(r.company_id);
    if (!gw) continue;
    const result = await reconcileGatewayRecord(gw, r);
    if (result === 'settled' || result === 'order_already_paid') settled++;
    if (result === 'closed') closed++;
  }
  return { checked: records.length, settled, closed };
}

// Beam Checkout — ค่าธรรมเนียมต่อธุรกรรม → marketplace_settlements (platform 'beam')
//
// Beam คิดค่าธรรมเนียมเป็น RATE ต่อธุรกรรม (ที่เห็นจริง 2.5% + VAT 7% ของค่าธรรมเนียม)
// ข้อมูลมาได้ 2 ทาง และต้องมีทั้งสอง (push พลาดได้ · pull ไว้ตามเก็บ):
//   - webhook `transaction.created` (Beam ส่งทันทีที่ตัดเงิน)
//   - `GET /api/v1/transactions?referenceId=<order.id>` ถามเองตอน settle / cron backfill
// เก็บลงตาราง settlement เดียวกับ Shopee/TikTok/Lazada (1 แถว = 1 ออเดอร์ · account เป็น null)
// รายงานยอดขาย-ค่าธรรมเนียม-กำไรจึงเห็น Beam ต่อท้ายสามเจ้าโดยไม่ต้องมีรายงานแยก
//
// ⚠️ merchant เดียวถูกใช้จากระบบอื่นด้วย (referenceId แบบ ONL2026…) — เก็บเฉพาะที่ referenceId
//    เป็นออเดอร์ของบริษัทนี้จริง ที่เหลือข้าม ไม่ log (วันละหลายสิบใบ จะท่วมเปล่า ๆ)
import { supabaseAdmin } from '@/lib/supabase-admin';
import { emptyBuckets, type NormalizedSettlement, type SettlementLine } from '@/lib/marketplace/fee-types';
import { saveSettlement } from '@/lib/marketplace/settlement';
import { beamBaseUrl, loadBeamGateways, type BeamGateway } from './client';

export interface BeamTransaction {
  transactionId: string;
  sourceId?: string;
  merchantId?: string;
  referenceId?: string;
  chargeSource?: string;
  /** PAYMENT · REFUND (ยังไม่เคยเห็นของจริง — จับด้วยคำว่า REFUND) */
  transactionType?: string;
  currency?: string;
  /** หน่วยสตางค์ทั้งหมด */
  grossAmount?: number;
  feeStrategy?: string;
  feeAmount?: number;
  vatAmount?: number;
  netAmount?: number;
  transactionTime?: string;
  createdAt?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** referenceId ที่ระบบเราส่งไปคือ order.id (UUID) — รูปอื่นเป็นของระบบอื่นที่ใช้ merchant เดียวกัน */
export const isOurReference = (ref: unknown): ref is string => typeof ref === 'string' && UUID_RE.test(ref);

async function beamGet<T>(gw: BeamGateway, path: string): Promise<T | null> {
  try {
    const res = await fetch(`${beamBaseUrl(gw.environment)}${path}`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${gw.merchantId}:${gw.apiKey}`).toString('base64') },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** ธุรกรรมทั้งหมดของออเดอร์ (จ่าย + คืน) — ตัวกรอง referenceId ของ Beam ใช้ได้จริง (ยืนยัน 7 ก.ย. 2026) */
export async function listBeamTransactionsForOrder(gw: BeamGateway, orderId: string): Promise<BeamTransaction[]> {
  const res = await beamGet<{ data?: BeamTransaction[] }>(
    gw,
    `/api/v1/transactions?referenceId=${encodeURIComponent(orderId)}&limit=50`,
  );
  return Array.isArray(res?.data) ? res.data : [];
}

const satang = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) / 100 : 0);
const isRefund = (t: BeamTransaction) => String(t.transactionType || '').toUpperCase().includes('REFUND');
const isPayment = (t: BeamTransaction) => String(t.transactionType || '').toUpperCase() === 'PAYMENT';

/**
 * แปลงธุรกรรมของออเดอร์เดียวเป็น NormalizedSettlement
 * - gross_sales = ยอดที่ตัดเงินสำเร็จ · payment_fee = ค่าธรรมเนียม + VAT ของค่าธรรมเนียม
 *   (VAT ไม่มีช่องกลางแยก — เป็นต้นทุนรับเงินเหมือนกัน · แยกดูได้ที่บรรทัดย่อย `vat`)
 * - คืนเงิน → adjustment (ยอดคืน) และหักออกจาก net_payout
 */
export function normalizeBeamTransactions(txs: BeamTransaction[]): NormalizedSettlement | null {
  const buckets = emptyBuckets();
  const lines: SettlementLine[] = [];
  let net = 0;
  let latest: string | null = null;
  let sourceId: string | null = null;

  for (const t of txs) {
    const gross = Math.abs(satang(t.grossAmount));
    const fee = Math.abs(satang(t.feeAmount));
    const vat = Math.abs(satang(t.vatAmount));
    const txNet = satang(t.netAmount);
    const at = t.transactionTime || t.createdAt || null;
    if (at && (!latest || at > latest)) latest = at;
    if (t.sourceId) sourceId = t.sourceId;

    if (isPayment(t)) {
      buckets.gross_sales += gross;
      buckets.payment_fee += fee + vat;
      net += txNet;
      lines.push({
        bucket: 'payment_fee',
        platformFeeCode: 'BEAM_FEE',
        platformFeeName: `ค่าธรรมเนียม Beam (${t.feeStrategy || 'RATE'})`,
        amount: fee,
        vat,
        externalItemId: t.sourceId ?? null,
        occurredAt: at,
        lineKey: `${t.transactionId}:fee`,
      });
    } else if (isRefund(t)) {
      buckets.adjustment += gross;
      // net ของรายการคืนเงินอาจมาเป็นลบอยู่แล้วหรือเป็นบวก — ยึด "เงินออกจากร้าน" เสมอ
      net -= Math.abs(txNet || gross);
      lines.push({
        bucket: 'adjustment',
        platformFeeCode: 'BEAM_REFUND',
        platformFeeName: 'คืนเงินลูกค้าผ่าน Beam',
        amount: gross,
        externalItemId: t.sourceId ?? null,
        occurredAt: at,
        lineKey: `${t.transactionId}:refund`,
      });
    }
  }
  if (!lines.length) return null;

  return {
    buckets,
    netPayout: Math.round(net * 100) / 100,
    buyerPaid: buckets.gross_sales,
    lines,
    currency: txs[0]?.currency || 'THB',
    settledAt: latest,
    paidStatus: 'PAID',
    externalOrderId: sourceId,
    raw: { transactions: txs },
  };
}

/**
 * เก็บค่าธรรมเนียมของออเดอร์นี้ — ถาม Beam ทุกธุรกรรมของ referenceId แล้ว upsert 1 แถว
 * `extra` = ธุรกรรมจาก webhook ที่เพิ่งมา (เผื่อ list ของ Beam ยังไม่ทันมีให้)
 */
export async function saveBeamSettlementForOrder(
  gw: BeamGateway,
  orderId: string,
  extra?: BeamTransaction | null,
): Promise<{ saved: boolean; transactions: number }> {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .eq('company_id', gw.companyId)
    .maybeSingle();
  if (!order) return { saved: false, transactions: 0 };

  const listed = await listBeamTransactionsForOrder(gw, orderId);
  const byId = new Map(listed.map(t => [t.transactionId, t]));
  if (extra?.transactionId && !byId.has(extra.transactionId)) byId.set(extra.transactionId, extra);
  const txs = [...byId.values()].filter(t => t.referenceId === orderId);

  const normalized = normalizeBeamTransactions(txs);
  if (!normalized) return { saved: false, transactions: txs.length };

  const result = await saveSettlement({
    companyId: gw.companyId,
    orderId,
    platform: 'beam',
    marketplaceAccountId: null,
    normalized,
  });
  return { saved: !!result, transactions: txs.length };
}

/**
 * ตามเก็บย้อนหลัง — แถว gateway ที่ Beam ตัดเงินแล้วแต่ยังไม่มี settlement
 * (ออเดอร์ก่อนมีฟีเจอร์นี้ · webhook พลาด · settle ผ่านแล้วแต่ตอนนั้น Beam ยังไม่ออกธุรกรรม)
 */
export async function backfillBeamSettlements(opts: { limit?: number } = {}): Promise<{ checked: number; saved: number }> {
  const { data: rows } = await supabaseAdmin
    .from('payment_records')
    .select('order_id, company_id')
    .eq('gateway_provider', 'beam')
    .in('gateway_status', ['PAID', 'REFUNDED'])
    .order('updated_at', { ascending: false })
    .limit(opts.limit ?? 100);
  if (!rows?.length) return { checked: 0, saved: 0 };

  const orderIds = [...new Set(rows.map(r => r.order_id as string))];
  const { data: existing } = await supabaseAdmin
    .from('marketplace_settlements')
    .select('order_id')
    .in('order_id', orderIds);
  const has = new Set((existing || []).map(e => e.order_id as string));
  const missing = rows.filter(r => !has.has(r.order_id as string));
  if (!missing.length) return { checked: orderIds.length, saved: 0 };

  const gateways = new Map<string, BeamGateway | null>();
  let saved = 0;
  const done = new Set<string>();
  for (const r of missing) {
    const orderId = r.order_id as string;
    if (done.has(orderId)) continue;
    done.add(orderId);
    const companyId = r.company_id as string;
    if (!gateways.has(companyId)) {
      const [gw] = await loadBeamGateways({ companyId });
      gateways.set(companyId, gw || null);
    }
    const gw = gateways.get(companyId);
    if (!gw) continue;
    const result = await saveBeamSettlementForOrder(gw, orderId);
    if (result.saved) saved++;
  }
  return { checked: orderIds.length, saved };
}

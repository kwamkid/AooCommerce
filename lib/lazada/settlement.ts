// แปลง ledger การเงินของ Lazada → ช่องกลาง (server-only)
//
// Lazada ต่างจาก Shopee/TikTok ตรงที่**ไม่มียอดสรุปต่อออเดอร์ให้เลย** — ได้มาเป็น
// สมุดบัญชีรายบรรทัด หนึ่งแถว = หนึ่งค่าธรรมเนียม ต่อหนึ่ง order item ต้องประกอบเอง
//   ออเดอร์ 3 ชิ้น → ค่าคอม 3 แถวเท่ากันเป๊ะ (ห้าม dedupe เพราะเห็นว่าซ้ำ ยอดจะหาย 2 ใน 3)
//   เงินเข้าจริงของออเดอร์ = ผลรวม amount ทุกแถวของ order_no นั้น
//
// รหัส fee_type สำรวจจากข้อมูลจริง 180 แถว/30 วัน ของร้าน ABC the Baby (2026-08-29)
// เอกสารทางการไม่ระบุฟิลด์ใด ๆ เลย — ดู memo/settlement-analysis.md §4

import {
  emptyBuckets, parseAmount,
  type FeeBucket, type NormalizedSettlement, type SettlementLine,
} from '@/lib/marketplace/fee-types';

/** หนึ่งแถวจาก /finance/transaction/details/get */
export interface LazadaTransactionRow {
  order_no?: string | null;
  orderItem_no?: string | null;
  transaction_number?: string | null;
  transaction_date?: string | null;
  transaction_type?: string | null;
  fee_name?: string | null;
  fee_type?: string | null;
  amount?: string | number | null;
  VAT_in_amount?: string | number | null;
  WHT_amount?: string | number | null;
  statement?: string | null;
  paid_status?: string | null;
  seller_sku?: string | null;
  details?: string | null;
}

/**
 * fee_type → ช่องกลาง · **ใช้รหัสตัวเลขเป็นคีย์ ไม่ใช่ fee_name**
 * (รหัสนิ่ง ส่วนชื่อเป็นข้อความที่ Lazada เปลี่ยนคำได้)
 */
const FEE_TYPE_TO_BUCKET: Record<string, FeeBucket> = {
  '13': 'gross_sales',        // Item Price Credit — เงินค่าสินค้าที่เข้าเรา
  '16': 'commission',         // Commission
  '3': 'payment_fee',         // Payment Fee
  '5202': 'ads',              // Premium Package — แพ็กเกจโฆษณาที่หักจากยอดขาย
  '306': 'seller_discount',   // LazCoins Discount — ส่วนลดที่ร้านรับภาระ
  '5028': 'campaign_fee',     // LazCoins Discount Promotion Fee — ค่าเข้าร่วมโปรแกรม
  '118': 'seller_discount',   // Promotional Charges Vouchers
  '239': 'affiliate',         // Sponsored Affiliates (ปกติไม่ผูกออเดอร์ → account charge)
  '801': 'service_fee',       // Strategic Seller Program Participation Fee
  '1028': 'shipping_cost',    // Shipping Fee Subsidy (By Seller)
  '1027': 'shipping_cost',    // Wrong Shipping Fee Adjustment
  '1128': 'shipping_cost',    // Customer Return Delivery Fee
  '520': 'shipping_cost',     // Shipping Fee Voucher Refund to Laz

  // กลับรายการ — ไปช่องปรับยอดทั้งหมด ไม่หักกลบกับค่าธรรมเนียมเดิม
  // เพราะออเดอร์เดียวถูกปรับข้ามงวดได้ ต้องเห็นว่าเกิดอะไรขึ้นบ้าง
  '14': 'adjustment',         // Reversal Item Price
  '15': 'adjustment',         // Reversal Commission
  '5203': 'adjustment',       // Reverse - Premium Package
  '5029': 'adjustment',       // Reversal of LazCoins Discount Promotion Fee
  '307': 'adjustment',        // Reversal of LazCoins Discount
};

/**
 * เดาช่องจาก transaction_type เมื่อเจอ fee_type ที่ยังไม่รู้จัก
 * รูปแบบชื่อคือ `{กลุ่มธุรกรรม}-{หมวด}` เช่น `Orders-Lazada Fees`
 */
function fallbackBucket(transactionType: string | null | undefined): FeeBucket {
  const t = (transactionType || '').toLowerCase();
  if (t.startsWith('refunds')) return 'adjustment';
  if (t.includes('logistics')) return 'shipping_cost';
  if (t.includes('sales')) return 'gross_sales';
  return 'other_fee';
}

export interface LazadaSettlementGroup {
  orderNo: string;
  normalized: NormalizedSettlement;
}

export interface LazadaAccountCharge {
  chargeType: string;
  description: string;
  amount: number;
  occurredAt: string | null;
  externalRef: string | null;
  raw: Record<string, unknown>;
}

/**
 * ประกอบ ledger เป็นยอดต่อออเดอร์ + แยกค่าใช้จ่ายที่ไม่ผูกออเดอร์ออกมา
 *
 * แถวที่ไม่มี `order_no` (Sponsored Affiliates, ค่าโปรแกรมสมาชิก) ไม่ใช่ของออเดอร์ไหน
 * ต้องเก็บที่ระดับบัญชี ไม่งั้นยอดรวมจะไม่มีวันตรงกับเงินเข้าธนาคาร
 */
export function normalizeLazadaTransactions(rows: LazadaTransactionRow[]): {
  orders: LazadaSettlementGroup[];
  accountCharges: LazadaAccountCharge[];
} {
  const byOrder = new Map<string, LazadaTransactionRow[]>();
  const accountCharges: LazadaAccountCharge[] = [];

  for (const row of rows) {
    const orderNo = row.order_no ? String(row.order_no).trim() : '';
    if (orderNo) {
      const list = byOrder.get(orderNo) || [];
      list.push(row);
      byOrder.set(orderNo, list);
      continue;
    }
    const amount = parseAmount(row.amount);
    if (!amount) continue;
    accountCharges.push({
      chargeType: chargeTypeOf(row),
      description: row.fee_name || row.transaction_type || 'Lazada charge',
      amount: Math.abs(amount),
      occurredAt: parseLazadaDate(row.transaction_date),
      externalRef: row.transaction_number ? String(row.transaction_number) : null,
      raw: row as unknown as Record<string, unknown>,
    });
  }

  const orders: LazadaSettlementGroup[] = [];
  for (const [orderNo, list] of byOrder) {
    const buckets = emptyBuckets();
    const lines: SettlementLine[] = [];
    let net = 0;
    let latest: string | null = null;
    let statement: string | null = null;
    let paidStatus: string | null = null;

    for (const row of list) {
      // ⚠️ ต้องผ่าน parseAmount — Lazada ส่ง "3,490.00" ที่ Number() แปลงไม่ได้
      const amount = parseAmount(row.amount);
      net += amount;

      const feeType = row.fee_type ? String(row.fee_type) : '';
      const bucket = FEE_TYPE_TO_BUCKET[feeType] || fallbackBucket(row.transaction_type);
      if (amount) buckets[bucket] += Math.abs(amount);

      const occurredAt = parseLazadaDate(row.transaction_date);
      if (occurredAt && (!latest || occurredAt > latest)) latest = occurredAt;
      if (!statement && row.statement) statement = row.statement;
      if (!paidStatus && row.paid_status) paidStatus = row.paid_status;

      if (amount) {
        lines.push({
          bucket,
          platformFeeCode: feeType || 'unknown',
          platformFeeName: row.fee_name || row.transaction_type || 'unknown',
          amount: Math.abs(amount),
          externalItemId: row.orderItem_no ? String(row.orderItem_no) : null,
          vat: Math.abs(parseAmount(row.VAT_in_amount)),
          wht: Math.abs(parseAmount(row.WHT_amount)),
          occurredAt,
          // ต้องนิ่งข้ามรอบ sync และไม่ชนกันเองภายในออเดอร์เดียว
          // (ออเดอร์หลายชิ้นมีค่าคอมหลายแถว ต่างกันแค่ orderItem_no)
          lineKey: `lazada:${row.transaction_number || row.orderItem_no || 'na'}:${feeType}`,
        });
      }
    }

    orders.push({
      orderNo,
      normalized: {
        buckets,
        netPayout: Math.round(net * 100) / 100,
        // Lazada ไม่บอกยอดที่ลูกค้าจ่าย — ปล่อย null อย่าเดาเป็น 0
        buyerPaid: null,
        lines,
        currency: 'THB',
        statementPeriod: statement,
        settledAt: latest,
        paidStatus,
        externalOrderId: orderNo,
        raw: { transactions: list } as unknown as Record<string, unknown>,
      },
    });
  }

  return { orders, accountCharges };
}

function chargeTypeOf(row: LazadaTransactionRow): string {
  const feeType = row.fee_type ? String(row.fee_type) : '';
  const bucket = FEE_TYPE_TO_BUCKET[feeType];
  if (bucket === 'affiliate') return 'affiliate';
  if (bucket === 'ads') return 'ads';
  if (bucket === 'service_fee') return 'service';
  return 'other';
}

/** Lazada ส่งวันที่มาเป็น "28 Aug 2026" — Date() อ่านได้ แต่ต้องกัน string แปลก ๆ */
function parseLazadaDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

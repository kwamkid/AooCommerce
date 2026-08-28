// แปลง escrow ของ Shopee → ช่องกลาง (server-only)
//
// Shopee คืนค่าธรรมเนียมเป็นก้อนเดียวต่อออเดอร์ใน `order_income` — ไม่ใช่รายบรรทัดแบบ Lazada
// เราจึงแตกเป็น "หนึ่งบรรทัดต่อหนึ่งฟิลด์ที่มีค่า" เอง เพื่อให้ทั้งสาม platform มีหลักฐาน
// ย้อนกลับหน้าตาเดียวกัน (drill จากยอดรวมลงไปดูได้ว่า Shopee เรียกค่านี้ว่าอะไร)
//
// ที่มาของการแมป: memo/settlement-analysis.md §3 + สำรวจข้อมูลจริง 400 ออเดอร์ไทย

import {
  emptyBuckets, parseAmount,
  type BucketAmounts, type FeeBucket, type NormalizedSettlement, type SettlementLine,
} from '@/lib/marketplace/fee-types';

/**
 * ฟิลด์ของ Shopee → ช่องกลาง
 *
 * เรียงตามที่เจอจริงในข้อมูลไทย 400 ออเดอร์ · ฟิลด์ที่ไม่อยู่ในนี้ (ภาษี SST มาเลเซีย,
 * ICMS/PIX บราซิล, withholding ฟิลิปปินส์/อินโดฯ ฯลฯ) ไม่ได้หายไปไหน — อยู่ครบใน `raw`
 *
 * ⚠️ ห้ามใส่ `cost_of_goods_sold` / `original_cost_of_goods_sold` ลงในนี้เด็ดขาด
 *    Shopee ใช้คำว่า COGS หมายถึง "ราคาสินค้าที่ลูกค้าจ่าย" ไม่ใช่ต้นทุนของผู้ขาย
 *    (ยืนยันจากข้อมูลจริง: ค่าเท่ากับ order_original_price ทุกแถว) — ต้นทุนจริงของเรา
 *    มาจาก order_items.unit_cost เท่านั้น
 */
const FIELD_TO_BUCKET: Record<string, FeeBucket> = {
  // รายรับ
  order_original_price: 'gross_sales',

  // ส่วนลดที่ร้านออกเอง
  seller_discount: 'seller_discount',
  voucher_from_seller: 'seller_discount',
  seller_shipping_discount: 'seller_discount',

  // ส่วนลดที่ Shopee ออกให้ (ไม่ใช่ต้นทุนเรา แต่ทำให้ยอดที่ลูกค้าจ่ายต่างจากราคาขาย)
  shopee_discount: 'platform_discount',
  voucher_from_shopee: 'platform_discount',
  voucher_from_external_party: 'platform_discount',
  coins: 'platform_discount',
  payment_promotion: 'platform_discount',
  credit_card_promotion: 'platform_discount',

  // ค่าธรรมเนียมหลัก
  commission_fee: 'commission',
  service_fee: 'service_fee',
  seller_order_processing_fee: 'service_fee',
  // ⚠️ credit_card_transaction_fee = buyer_transaction_fee + seller_transaction_fee
  //    ฝั่งที่ "ร้านจ่าย" คือ seller_transaction_fee เท่านั้น — เอาตัวรวมมาใส่จะนับซ้ำ
  seller_transaction_fee: 'payment_fee',

  // ค่าส่ง — ตัวที่ร้านรับจริงคำนวณแยกข้างล่าง ตรงนี้เก็บเฉพาะส่วนเสริม
  shipping_seller_protection_fee_amount: 'shipping_cost',
  delivery_seller_protection_fee_premium_amount: 'shipping_cost',
  reverse_shipping_fee: 'shipping_cost',
  final_return_to_seller_shipping_fee: 'shipping_cost',

  // การตลาด
  order_ams_commission_fee: 'affiliate',
  ads_escrow_top_up_fee_or_technical_support_fee: 'ads',
  campaign_fee: 'campaign_fee',

  // ภาษีที่ Shopee หักไว้
  escrow_tax: 'tax_withheld',
  withholding_tax: 'tax_withheld',
  th_import_duty: 'tax_withheld',

  // ปรับยอด / คืนของ
  seller_return_refund: 'adjustment',
  drc_adjustable_refund: 'adjustment',
  total_adjustment_amount: 'adjustment',
  seller_lost_compensation: 'adjustment',
  rsf_seller_protection_fee_claim_amount: 'adjustment',
  fsf_seller_protection_fee_claim_amount: 'adjustment',
};

/** ฟิลด์ที่ประกอบเป็น shipping_cost แบบคำนวณ — ไม่ได้แมปตรง ๆ ทีละตัว */
const SHIPPING_FORMULA_FIELDS = [
  'actual_shipping_fee',
  'buyer_paid_shipping_fee',
  'shopee_shipping_rebate',
] as const;

export function normalizeShopeeEscrow(
  escrow: Record<string, unknown>,
  opts: { orderSn?: string | null } = {}
): NormalizedSettlement {
  const income = (escrow.order_income as Record<string, unknown>) || escrow;
  const buckets = emptyBuckets();
  const lines: SettlementLine[] = [];

  const num = (field: string) => parseAmount(income[field]);
  const push = (bucket: FeeBucket, code: string, amount: number, name?: string) => {
    if (!amount) return;
    buckets[bucket] += Math.abs(amount);
    lines.push({
      bucket,
      platformFeeCode: code,
      platformFeeName: name || code,
      amount: Math.abs(amount),
      lineKey: `shopee:${code}`,
    });
  };

  for (const [field, bucket] of Object.entries(FIELD_TO_BUCKET)) {
    push(bucket, field, num(field));
  }

  // ค่าส่งที่ร้านรับจริง = ค่าส่งจริง − ที่ลูกค้าจ่าย − ที่ Shopee ช่วย
  // ติดลบได้ (Shopee ช่วยมากกว่าที่จ่ายจริง) → กรณีนั้นไม่ใช่ต้นทุน ไม่นับเข้า shipping_cost
  const shippingBorne =
    num('actual_shipping_fee') - num('buyer_paid_shipping_fee') - num('shopee_shipping_rebate');
  if (shippingBorne > 0) {
    buckets.shipping_cost += shippingBorne;
    lines.push({
      bucket: 'shipping_cost',
      platformFeeCode: 'actual_shipping_fee_borne',
      platformFeeName: 'ค่าส่งส่วนที่ร้านรับ (actual − buyer_paid − rebate)',
      amount: shippingBorne,
      lineKey: 'shopee:actual_shipping_fee_borne',
    });
  }

  // เงินเข้าจริง: ใช้ยอดหลังปรับเสมอถ้ามี (คืนของ/ชดเชยจะสะท้อนอยู่ในตัวนี้)
  const afterAdj = parseAmount(income.escrow_amount_after_adjustment);
  const base = parseAmount(income.escrow_amount);
  const netPayout = income.escrow_amount_after_adjustment != null && afterAdj !== 0 ? afterAdj : base;

  return {
    buckets,
    netPayout,
    lines,
    currency: (income.currency as string) || 'THB',
    externalOrderId: opts.orderSn ?? ((escrow.order_sn as string) || null),
    paidStatus: null,
    settledAt: null,
    statementPeriod: null,
    raw: escrow,
  };
}

/** ฟิลด์ที่ mapper รู้จักแล้ว — ใช้เช็คว่ามีฟิลด์เงินตัวใหม่โผล่มาที่ยังไม่ได้แมป */
export function knownShopeeFields(): string[] {
  return [
    ...Object.keys(FIELD_TO_BUCKET),
    ...SHIPPING_FORMULA_FIELDS,
    'escrow_amount',
    'escrow_amount_after_adjustment',
  ];
}

export type { BucketAmounts };

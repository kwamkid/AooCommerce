// แปลง statement ของ TikTok Shop → ช่องกลาง (server-only)
//
// TikTok ให้ข้อมูลละเอียดที่สุดในสามเจ้า — ยอดต่อออเดอร์พร้อม breakdown ~100 ฟิลด์
// และแยกถึงระดับ SKU (`sku_transactions`) · endpoint: /finance/202501/orders/{id}/statement_transactions
//
// ⚠️ **การแมปนี้เขียนจากสเปค OAS ยังไม่ได้ยืนยันกับข้อมูลจริงของร้านไทย**
//    (ต่างจาก Shopee/Lazada ที่สำรวจข้อมูลจริงแล้ว) — ตอนดึงชุดแรกให้เทียบว่า
//    ผลรวมช่องกลางกับ settlement_amount ตรงกันไหม ถ้าไม่ตรงแปลว่ามีฟิลด์ที่ยังไม่ได้แมป
//    ใช้ `unmappedTikTokFields()` ช่วยหา

import {
  emptyBuckets, parseAmount,
  type FeeBucket, type NormalizedSettlement, type SettlementLine,
} from '@/lib/marketplace/fee-types';

/**
 * ฟิลด์ของ TikTok → ช่องกลาง
 * ฟิลด์ภาษีเฉพาะประเทศอื่น (ISR/IVA เม็กซิโก, SST มาเลเซีย, VN infrastructure) รวมไว้
 * ในช่องภาษีเหมือนกัน — ร้านไทยจะได้ค่า 0 ไปเอง ไม่ต้องแยกโค้ดต่อประเทศ
 */
const FIELD_TO_BUCKET: Record<string, FeeBucket> = {
  // รายรับ
  subtotal_before_discount_amount: 'gross_sales',

  // ส่วนลดที่ร้านออกเอง
  seller_discount_amount: 'seller_discount',

  // ค่าคอมมิชชั่น
  platform_commission_amount: 'commission',
  referral_fee_amount: 'commission',
  dynamic_commission_amount: 'commission',
  tsp_commission_amount: 'commission',

  // ค่าธรรมเนียมรับชำระเงิน
  transaction_fee_amount: 'payment_fee',
  credit_card_handling_fee_amount: 'payment_fee',
  seller_paylater_handling_fee_amount: 'payment_fee',
  cod_service_fee_amount: 'payment_fee',
  dt_handling_fee_amount: 'payment_fee',

  // ค่าบริการ / โปรแกรมร้าน
  sfp_service_fee_amount: 'service_fee',
  mall_service_fee_amount: 'service_fee',
  live_specials_fee_amount: 'service_fee',
  flash_sales_service_fee_amount: 'service_fee',
  voucher_xtra_service_fee_amount: 'service_fee',
  bonus_cashback_service_fee_amount: 'service_fee',
  pre_order_service_fee_amount: 'service_fee',
  epr_pob_service_fee_amount: 'service_fee',
  fee_per_item_sold_amount: 'service_fee',
  seller_self_shipping_service_fee_amount: 'service_fee',
  installation_service_fee: 'service_fee',
  shipping_fee_guarantee_service_fee: 'service_fee',

  // ค่าส่งฝั่งที่ร้านรับ
  actual_shipping_fee_amount: 'shipping_cost',
  shipping_cost_amount: 'shipping_cost',
  return_shipping_fee_amount: 'shipping_cost',
  return_shipping_label_fee_amount: 'shipping_cost',
  exchange_shipping_fee_amount: 'shipping_cost',
  replacement_shipping_fee_amount: 'shipping_cost',
  shipping_insurance_fee_amount: 'shipping_cost',
  signature_confirmation_fee_amount: 'shipping_cost',
  fbt_shipping_cost_amount: 'shipping_cost',
  fbm_shipping_cost_amount: 'shipping_cost',
  fbt_fulfillment_fee_amount: 'shipping_cost',

  // เงินที่ TikTok ช่วยจ่าย
  customer_paid_shipping_fee_amount: 'platform_subsidy',
  shipping_fee_subsidy_amount: 'platform_subsidy',
  platform_shipping_fee_discount_amount: 'platform_subsidy',
  promo_shipping_incentive_amount: 'platform_subsidy',
  shipping_fee_guarantee_reimbursement: 'platform_subsidy',
  failed_delivery_subsidy_amount: 'platform_subsidy',
  free_return_subsidy_amount: 'platform_subsidy',
  return_refund_subsidy_amount: 'platform_subsidy',
  fbt_fulfillment_fee_reimbursement_amount: 'platform_subsidy',
  fbt_free_shipping_fee_amount: 'platform_subsidy',
  customer_shipping_fee_offset_amount: 'platform_subsidy',

  // ส่วนแบ่งนักขาย / ครีเอเตอร์
  affiliate_commission_amount: 'affiliate',
  affiliate_partner_commission_amount: 'affiliate',
  external_affiliate_marketing_fee_amount: 'affiliate',
  cofunded_creator_bonus_amount: 'affiliate',

  // โฆษณา
  affiliate_ads_commission_amount: 'ads',
  tap_shop_ads_commission: 'ads',

  // แคมเปญ
  campaign_resource_fee: 'campaign_fee',
  cofunded_promotion_service_fee_amount: 'campaign_fee',

  // ภาษี
  vat_amount: 'tax_withheld',
  pit_amount: 'tax_withheld',
  gst_amount: 'tax_withheld',
  sst_amount: 'tax_withheld',
  local_vat_amount: 'tax_withheld',
  import_vat_amount: 'tax_withheld',
  isr_amount: 'tax_withheld',
  iva_amount: 'tax_withheld',
  anti_dumping_duty_amount: 'tax_withheld',
  customs_duty_amount: 'tax_withheld',
  customs_clearance_amount: 'tax_withheld',
  fee_tax_amount: 'tax_withheld',
  fee_and_tax_amount: 'tax_withheld',
  vn_fix_infrastructure_fee: 'other_fee',

  // คืนของ / ปรับยอด
  refund_subtotal_before_discount_amount: 'adjustment',
  seller_discount_refund_amount: 'adjustment',
  refund_administration_fee_amount: 'adjustment',
  refund_cod_service_fee_amount: 'adjustment',
  refunded_customer_shipping_fee_amount: 'adjustment',
  return_shipping_fee_paid_buyer_amount: 'adjustment',
};

/** ฟิลด์ที่ไม่ใช่ค่าธรรมเนียม — ข้ามไป ไม่ต้องเตือนว่ายังไม่ได้แมป */
const NON_FEE_FIELDS = new Set([
  'settlement_amount', 'revenue_amount', 'revenue_breakdown', 'currency',
  'order_id', 'order_create_time', 'statement_id', 'sku_id', 'sku_name',
  'product_name', 'quantity', 'sku_transactions', 'shipping_cost_breakdown',
  'fee_tax_breakdown', 'supplementary_component', 'total_count', 'affiliate_commission_amount_before_pit',
  'affiliate_commission_deposit', 'affiliate_commission_release',
]);

export function normalizeTikTokStatement(
  statement: Record<string, unknown>,
  opts: { orderId?: string | null } = {}
): NormalizedSettlement {
  const buckets = emptyBuckets();
  const lines: SettlementLine[] = [];

  for (const [field, bucket] of Object.entries(FIELD_TO_BUCKET)) {
    const amount = parseAmount(statement[field]);
    if (!amount) continue;
    buckets[bucket] += Math.abs(amount);
    lines.push({
      bucket,
      platformFeeCode: field,
      platformFeeName: field,
      amount: Math.abs(amount),
      lineKey: `tiktok:${field}`,
    });
  }

  const netPayout = parseAmount(statement.settlement_amount);

  return {
    buckets,
    netPayout,
    // TikTok ไม่ได้ให้ยอดที่ลูกค้าจ่ายใน statement — ปล่อย null อย่าเดา
    buyerPaid: null,
    lines,
    currency: (statement.currency as string) || 'THB',
    statementPeriod: statement.statement_id ? String(statement.statement_id) : null,
    settledAt: null,
    paidStatus: null,
    externalOrderId: opts.orderId ?? (statement.order_id ? String(statement.order_id) : null),
    raw: statement,
  };
}

/**
 * ฟิลด์ตัวเลขที่ยังไม่ได้แมป — ใช้ตอนดึงข้อมูลจริงชุดแรกเพื่อหาว่าตกอะไรไป
 * (TikTok เพิ่มฟิลด์ใหม่บ่อยตามโปรแกรมที่เปิดใหม่)
 */
export function unmappedTikTokFields(statement: Record<string, unknown>): string[] {
  return Object.keys(statement).filter(k => {
    if (FIELD_TO_BUCKET[k] || NON_FEE_FIELDS.has(k)) return false;
    const v = statement[k];
    return (typeof v === 'number' || typeof v === 'string') && parseAmount(v) !== 0;
  });
}

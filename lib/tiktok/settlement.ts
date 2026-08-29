// แปลง statement ของ TikTok Shop → ช่องกลาง (server-only)
//
// endpoint: /finance/202501/orders/{id}/statement_transactions
//
// ⚠️ **ค่าธรรมเนียมไม่ได้อยู่ระดับบนสุด** — ระดับบนมีแค่ยอดรวม 4 ตัว
// (revenue_amount / fee_and_tax_amount / shipping_cost_amount / settlement_amount)
// ของจริงซ้อนอยู่ใน `sku_transactions[]` แล้วแตกอีก 3 กลุ่ม:
//
//   sku_transactions[].revenue_breakdown        → ยอดขาย + ส่วนลดร้าน
//   sku_transactions[].fee_tax_breakdown.fee    → ค่าธรรมเนียมทุกชนิด (~50 ฟิลด์)
//   sku_transactions[].fee_tax_breakdown.tax    → ภาษี (~13 ฟิลด์)
//   sku_transactions[].shipping_cost_breakdown  → ค่าส่ง + เงินอุดหนุนค่าส่ง
//
// ยืนยันกับข้อมูลจริงของร้านไทยแล้ว (2026-08-29):
//   699 − 45 − 20.99 − 52.52 − 62.98 − 78.48 − 38 + 38 = 439.03 = settlement_amount ✓

import {
  emptyBuckets, parseAmount,
  type FeeBucket, type NormalizedSettlement, type SettlementLine,
} from '@/lib/marketplace/fee-types';

/** ค่าธรรมเนียมใน fee_tax_breakdown.fee → ช่องกลาง (ตัวที่ไม่อยู่ในนี้ตกไป other_fee) */
const FEE_TO_BUCKET: Record<string, FeeBucket> = {
  // ค่าคอมมิชชั่น
  platform_commission_amount: 'commission',
  dynamic_commission_amount: 'commission',
  referral_fee_amount: 'commission',
  tsp_commission_amount: 'commission',
  platform_semi_managed_commission_fee: 'commission',
  platform_semi_managed_commission_fee_tax: 'commission',

  // ค่าธรรมเนียมรับชำระเงิน
  transaction_fee_amount: 'payment_fee',
  credit_card_handling_fee_amount: 'payment_fee',
  seller_paylater_handling_fee_amount: 'payment_fee',
  dt_handling_fee_amount: 'payment_fee',

  // ส่วนแบ่งนักขาย / ครีเอเตอร์
  affiliate_commission_amount: 'affiliate',
  affiliate_partner_commission_amount: 'affiliate',
  external_affiliate_marketing_fee_amount: 'affiliate',
  cofunded_creator_bonus_amount: 'affiliate',

  // โฆษณา
  affiliate_ads_commission_amount: 'ads',
  tap_shop_ads_commission: 'ads',
  cps_shop_ads_commission_tax_amount: 'ads',
  gmv_max_ad_fee_amount: 'ads',
  gmv_max_coupon_fee: 'ads',
  brand_amplification_program_commission: 'ads',
  brand_amplification_program_fee_tax: 'ads',

  // แคมเปญ
  brand_campaign_fee: 'campaign_fee',
  brand_campaign_fee_tax: 'campaign_fee',
  category_led_campaign_fee_amount: 'campaign_fee',
  category_led_campaign_fee_tax_amount: 'campaign_fee',
  campaign_period_fee_sp_amount: 'campaign_fee',
  campaign_period_fee_sp_tax_amount: 'campaign_fee',
  campaign_period_fee_cfp_amount: 'campaign_fee',
  campaign_period_fee_cfp_tax_amount: 'campaign_fee',
  flash_sales_service_fee_amount: 'campaign_fee',
  smart_promotion_fee_amount: 'campaign_fee',
  cofunded_promotion_service_fee_amount: 'campaign_fee',
  voucher_xtra_service_fee_amount: 'campaign_fee',
  bonus_cashback_service_fee_amount: 'campaign_fee',
  live_specials_fee_amount: 'campaign_fee',

  // ค่าบริการ / โปรแกรมร้าน
  sfp_service_fee_amount: 'service_fee',
  mall_service_fee_amount: 'service_fee',
  fee_per_item_sold_amount: 'service_fee',
  installation_service_fee: 'service_fee',
  seller_growth_fee_amount: 'service_fee',
  epr_pob_service_fee_amount: 'service_fee',
  pre_order_service_fee_amount: 'service_fee',
  platform_special_service_fee_amount: 'service_fee',
  shipping_fee_guarantee_service_fee: 'service_fee',
  vn_fix_infrastructure_fee: 'service_fee',
  insurance_fee: 'service_fee',
  shipping_insurance_fee_tax_amount: 'service_fee',

  // ค่าส่งที่โผล่ในกลุ่ม fee
  failed_delivery_shipping_fee: 'shipping_cost',
  buyer_fault_return_shipping_fee: 'shipping_cost',

  // คืนของ / ปรับยอด
  refund_administration_fee_amount: 'adjustment',
};

/** revenue_breakdown → ช่องกลาง */
const REVENUE_TO_BUCKET: Record<string, FeeBucket> = {
  subtotal_before_discount_amount: 'gross_sales',
  seller_discount_amount: 'seller_discount',
  cod_service_fee_amount: 'payment_fee',
  refund_cod_service_fee_amount: 'adjustment',
  seller_discount_refund_amount: 'adjustment',
  refund_subtotal_before_discount_amount: 'adjustment',
  distant_item_fee_amount: 'other_fee',
};

/** shipping_cost_breakdown → ช่องกลาง (ค่าบวก = แพลตฟอร์มช่วยจ่าย) */
const SHIPPING_TO_BUCKET: Record<string, FeeBucket> = {
  actual_shipping_fee_amount: 'shipping_cost',
  return_shipping_fee_amount: 'shipping_cost',
  return_shipping_label_fee_amount: 'shipping_cost',
  exchange_shipping_fee_amount: 'shipping_cost',
  replacement_shipping_fee_amount: 'shipping_cost',
  distant_shipping_fee_amount: 'shipping_cost',
  shipping_insurance_fee_amount: 'shipping_cost',
  signature_confirmation_fee_amount: 'shipping_cost',
  seller_self_shipping_service_fee_amount: 'shipping_cost',
  shipping_app_service_fee_amount: 'shipping_cost',
  logistics_service_fee: 'shipping_cost',
  return_shipping_fee_paid_buyer_amount: 'shipping_cost',

  shipping_fee_discount_amount: 'platform_subsidy',
  customer_paid_shipping_fee_amount: 'platform_subsidy',
  free_return_subsidy_amount: 'platform_subsidy',
  failed_delivery_subsidy_amount: 'platform_subsidy',
  tiktok_shop_shipping_incentive_amount: 'platform_subsidy',
  fbt_free_shipping_fee_amount: 'platform_subsidy',
  fbt_key_merchant_subsidy: 'platform_subsidy',
  fbt_overall_merchant_subsidy: 'platform_subsidy',
  fbt_fulfillment_fee_reimbursement_amount: 'platform_subsidy',

  fbm_shipping_cost_amount: 'shipping_cost',
  fbt_shipping_cost_amount: 'shipping_cost',
  fbt_fulfillment_fee_amount: 'shipping_cost',

  refunded_customer_shipping_fee_amount: 'adjustment',
};

/**
 * ฟิลด์ที่ต้องข้าม — **เป็นยอดย่อยของฟิลด์อื่น ถ้านับจะซ้ำ**
 *
 * - `supplementary_component` = การแตกยอดของ shipping_fee_discount_amount อีกชั้น
 *   (ข้อมูลจริง: discount 38 = platform_shipping_fee_discount_amount 38 ตัวเดียวกัน)
 * - `*_before_pit` / `_deposit` / `_release` = มุมมองอื่นของ affiliate_commission_amount
 */
const SKIP_FIELDS = new Set([
  'supplementary_component',
  'affiliate_commission_amount_before_pit',
  'affiliate_commission_deposit',
  'affiliate_commission_release',
]);

export function normalizeTikTokStatement(
  statement: Record<string, unknown>,
  opts: { orderId?: string | null } = {}
): NormalizedSettlement {
  const buckets = emptyBuckets();
  const lines: SettlementLine[] = [];

  const skus = Array.isArray(statement.sku_transactions)
    ? (statement.sku_transactions as Record<string, unknown>[])
    : [];

  const add = (
    group: Record<string, unknown> | undefined,
    map: Record<string, FeeBucket>,
    fallback: FeeBucket,
    skuId: string | null,
    prefix: string,
    rowIndex: number
  ) => {
    if (!group) return;
    for (const [field, value] of Object.entries(group)) {
      if (SKIP_FIELDS.has(field)) continue;
      if (typeof value === 'object') continue;   // ชั้นย่อยอื่นที่ไม่ได้ตั้งใจอ่าน
      const amount = parseAmount(value);
      if (!amount) continue;
      const bucket = map[field] || fallback;
      buckets[bucket] += Math.abs(amount);
      lines.push({
        bucket,
        platformFeeCode: field,
        platformFeeName: field,
        amount: Math.abs(amount),
        externalItemId: skuId,
        // ต้องมีลำดับแถวด้วย — statement เดียวมี sku_transactions ที่ sku_id ซ้ำกันได้
        // (ขายกับคืนของอยู่คนละแถว) ถ้า key ซ้ำ upsert ทั้ง batch จะถูก Postgres ปฏิเสธ
        // แล้ว error ถูกกลืนไปกับ console.error → บรรทัดค่าธรรมเนียมหายเงียบทั้งออเดอร์
        lineKey: `tiktok:${rowIndex}:${skuId || 'order'}:${prefix}:${field}`,
      });
    }
  };

  skus.forEach((sku, idx) => {
    const skuId = sku.sku_id ? String(sku.sku_id) : null;
    const feeTax = (sku.fee_tax_breakdown as Record<string, unknown>) || {};

    add(sku.revenue_breakdown as Record<string, unknown>, REVENUE_TO_BUCKET, 'other_fee', skuId, 'rev', idx);
    add(feeTax.fee as Record<string, unknown>, FEE_TO_BUCKET, 'other_fee', skuId, 'fee', idx);
    add(feeTax.tax as Record<string, unknown>, {}, 'tax_withheld', skuId, 'tax', idx);
    add(sku.shipping_cost_breakdown as Record<string, unknown>, SHIPPING_TO_BUCKET, 'shipping_cost', skuId, 'ship', idx);
  });

  // statement ที่ไม่มี sku_transactions เลย — เก็บยอดรวมระดับบนไว้ ดีกว่าปล่อยเป็นศูนย์เงียบ ๆ
  // (getOrderStatement เผื่อ wrapper ไว้ 2 ชั้นอยู่แล้ว = รูปร่างไม่นิ่ง)
  if (skus.length === 0) {
    const feeTotal = Math.abs(parseAmount(statement.fee_and_tax_amount));
    const shipTotal = Math.abs(parseAmount(statement.shipping_cost_amount));
    const revenue = Math.abs(parseAmount(statement.revenue_amount));
    if (revenue) { buckets.gross_sales += revenue; lines.push({ bucket: 'gross_sales', platformFeeCode: 'revenue_amount', platformFeeName: 'revenue_amount', amount: revenue, lineKey: 'tiktok:top:revenue_amount' }); }
    if (feeTotal) { buckets.other_fee += feeTotal; lines.push({ bucket: 'other_fee', platformFeeCode: 'fee_and_tax_amount', platformFeeName: 'fee_and_tax_amount (ยอดรวม ไม่มีรายละเอียด)', amount: feeTotal, lineKey: 'tiktok:top:fee_and_tax_amount' }); }
    if (shipTotal) { buckets.shipping_cost += shipTotal; lines.push({ bucket: 'shipping_cost', platformFeeCode: 'shipping_cost_amount', platformFeeName: 'shipping_cost_amount', amount: shipTotal, lineKey: 'tiktok:top:shipping_cost_amount' }); }
    console.warn(`[TikTok Settlement] ${opts.orderId || statement.order_id}: ไม่มี sku_transactions — เก็บได้แค่ยอดรวม ไม่มีรายละเอียดค่าธรรมเนียม`);
  }

  return {
    buckets,
    netPayout: parseAmount(statement.settlement_amount),
    // TikTok ไม่ได้บอกยอดที่ลูกค้าจ่าย — ปล่อย null อย่าเดา
    buyerPaid: null,
    lines,
    currency: (statement.currency as string) || 'THB',
    statementPeriod: skus[0]?.statement_id ? String(skus[0].statement_id) : null,
    settledAt: null,
    paidStatus: null,
    externalOrderId: opts.orderId ?? (statement.order_id ? String(statement.order_id) : null),
    raw: statement,
  };
}

/**
 * ฟิลด์ที่ยังไม่ได้แมป — ไล่เข้าไปในชั้นย่อยด้วย
 * TikTok เพิ่มค่าธรรมเนียมใหม่บ่อยตามโปรแกรมที่เปิดใหม่ ตัวใหม่จะตกไป other_fee
 * แล้วโผล่ในนี้ให้เห็นว่าต้องมาแมปเพิ่ม
 */
export function unmappedTikTokFields(statement: Record<string, unknown>): string[] {
  const out = new Set<string>();
  const skus = Array.isArray(statement.sku_transactions)
    ? (statement.sku_transactions as Record<string, unknown>[])
    : [];
  const scan = (group: Record<string, unknown> | undefined, map: Record<string, FeeBucket>) => {
    if (!group) return;
    for (const [field, value] of Object.entries(group)) {
      if (SKIP_FIELDS.has(field) || typeof value === 'object') continue;
      if (!map[field] && parseAmount(value) !== 0) out.add(field);
    }
  };
  for (const sku of skus) {
    const feeTax = (sku.fee_tax_breakdown as Record<string, unknown>) || {};
    scan(sku.revenue_breakdown as Record<string, unknown>, REVENUE_TO_BUCKET);
    scan(feeTax.fee as Record<string, unknown>, FEE_TO_BUCKET);
    scan(sku.shipping_cost_breakdown as Record<string, unknown>, SHIPPING_TO_BUCKET);
  }
  return [...out];
}

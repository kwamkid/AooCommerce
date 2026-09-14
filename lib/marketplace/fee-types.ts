// ช่องกลางของค่าธรรมเนียม marketplace — taxonomy เดียวที่ทุก platform แปลงเข้ามา
// (client-safe: ห้าม import อะไรที่เป็น server-only — หน้ารายงานก็อ่านไฟล์นี้)
//
// ที่มา: memo/settlement-analysis.md — สำรวจฟิลด์จริงของทั้ง 3 เจ้าก่อนออกแบบ
// (Shopee 110 ฟิลด์ · TikTok ~100 ฟิลด์ · Lazada ยิงของจริง 180 แถว/30 วัน)
//
// ══════════════════════════════════════════════════════════════════════════
//  ➕ เพิ่ม marketplace ใหม่ / เจอค่าธรรมเนียมชนิดใหม่
// ══════════════════════════════════════════════════════════════════════════
//  1. หา bucket ที่ความหมายตรงที่สุดจาก 14 ตัวข้างล่าง — **อย่าเพิ่ม bucket ใหม่ก่อน**
//     ทั้งสามเจ้ามีค่าธรรมเนียมรวมกันเป็นร้อยชนิด ถ้าเพิ่ม bucket ตามชื่อที่ platform
//     เรียก รายงานจะมีคอลัมน์เป็นร้อยและเทียบข้าม platform ไม่ได้เลย
//  2. ชื่อจริงที่ platform เรียกไม่หาย — มันถูกเก็บใน marketplace_settlement_lines
//     ทุกบรรทัด (platform_fee_code + platform_fee_name) ใช้ drill ลงไปดูได้เสมอ
//  3. จะเพิ่ม bucket จริง ๆ ต่อเมื่อมันตอบคำถามธุรกิจคนละข้อกับ 14 ตัวนี้
//
//  ⚠️ `ads` ของ Shopee = `ads_escrow_top_up_fee_or_technical_support_fee` ซึ่งส่วนใหญ่คือ
//     **การเติมเครดิตโฆษณาจากยอดโอน ไม่ใช่ค่าธรรมเนียมที่หายไป** (เงินย้ายไปกระเป๋าโฆษณาของร้าน
//     ตามสัดส่วนที่ร้านตั้งไว้ · ยืนยันจากข้อมูลจริง: หักทุกใบในอัตราคงที่ต่อร้าน เปิด/ปิดเป็นช่วง)
//     ⇒ ถ้าจะดึง "ค่าแอดที่ใช้จริง" เข้ามาทีหลัง (Shopee AMS / marketplace_account_charges)
//        **ห้ามนับรวมกับช่องนี้** จะกลายเป็นนับต้นทุนโฆษณาสองรอบ
// ══════════════════════════════════════════════════════════════════════════

export const FEE_BUCKETS = [
  'gross_sales',
  'seller_discount',
  'platform_discount',
  'platform_subsidy',
  'commission',
  'payment_fee',
  'service_fee',
  'shipping_cost',
  'affiliate',
  'ads',
  'campaign_fee',
  'tax_withheld',
  'other_fee',
  'adjustment',
] as const;
export type FeeBucket = typeof FEE_BUCKETS[number];

/** ทิศของแต่ละช่องเมื่อคิดเป็นเงินเข้ากระเป๋าเรา — เก็บค่าเป็น "บวกเสมอ" ทุกช่อง */
export const BUCKET_SIGN: Record<FeeBucket, '+' | '-' | '±'> = {
  gross_sales: '+',
  seller_discount: '-',
  platform_discount: '±',
  platform_subsidy: '+',
  commission: '-',
  payment_fee: '-',
  service_fee: '-',
  shipping_cost: '-',
  affiliate: '-',
  ads: '-',
  campaign_fee: '-',
  tax_withheld: '-',
  other_fee: '-',
  adjustment: '±',
};

/**
 * กลุ่มของช่องค่าธรรมเนียม — มุม "ตั้งราคา": อะไรโดนเก็บทุกออเดอร์ · อะไรจ่ายเฉพาะที่ร้านเลือกใช้
 * · `platform`  = เก็บทุกใบ ตามหมวด/วิธีจ่าย → ต้องเผื่อในราคาเสมอ
 * · `marketing` = affiliate/โฆษณา/แคมเปญ → จ่ายเฉพาะออเดอร์ที่มาจากช่องนั้น
 * · `shipping`  = ค่าส่งที่ร้านรับ หักเงินที่แพลตฟอร์มช่วยจ่าย (เป็นบาทต่อกล่อง ไม่ใช่ % ของราคา)
 * · `other`     = ค่าธรรมเนียมอื่น / ปรับยอด
 * ส่วนลด (`seller_discount` · `platform_discount`) ไม่อยู่ในกลุ่มไหน — ไม่ใช่เงินที่แพลตฟอร์มเก็บจากเรา
 */
export const FEE_GROUPS: { key: string; label: string; hint: string; buckets: FeeBucket[] }[] = [
  {
    key: 'platform',
    label: 'ค่าธรรมเนียมแพลตฟอร์ม (เก็บทุกออเดอร์)',
    hint: 'ค่าคอมตามหมวด + ค่าธรรมเนียมชำระเงิน + ค่าบริการ + ภาษีหัก ณ ที่จ่าย — โดนทุกใบ ใช้ % นี้เผื่อในราคาขายเสมอ',
    buckets: ['commission', 'payment_fee', 'service_fee', 'tax_withheld'],
  },
  {
    key: 'marketing',
    label: 'การตลาดที่ร้านเลือกใช้',
    hint: 'ส่วนแบ่งนักขาย · โฆษณา · ค่าแคมเปญ — จ่ายเฉพาะออเดอร์ที่มาจากช่องทางนั้น ถ้าไม่เข้าร่วมก็ไม่โดน · ช่องโฆษณาของ Shopee เป็นการเติมเครดิตโฆษณา (เงินยังอยู่กับร้าน) ไม่ใช่ค่าธรรมเนียมที่แพลตฟอร์มกิน',
    buckets: ['affiliate', 'ads', 'campaign_fee'],
  },
  {
    key: 'shipping',
    label: 'ค่าส่งสุทธิ',
    hint: 'ค่าส่งที่ร้านรับผิดชอบ หักเงินที่แพลตฟอร์มช่วยจ่าย — คิดเป็นบาทต่อกล่อง ไม่ผูกกับราคาสินค้า',
    buckets: ['shipping_cost', 'platform_subsidy'],
  },
  {
    key: 'other',
    label: 'อื่น ๆ / ปรับยอด',
    hint: 'ค่าธรรมเนียมที่จัดกลุ่มไม่ได้ และรายการปรับยอด/คืนของ',
    buckets: ['other_fee', 'adjustment'],
  },
];

/**
 * กลุ่มพิเศษของ platform ที่ตั้ง `adsIsWalletTopUp` (ดู `MARKETPLACE_PLATFORMS`)
 * — ยอดนี้หักจากเงินโอนจริง (net_payout ลดลงจริง) แต่ **ไม่ใช่เงินที่แพลตฟอร์มเก็บไป**
 *   จึงต้องแยกออกจากยอด "แพลตฟอร์มเก็บไปทั้งหมด" ไม่งั้นต้นทุนจะดูสูงเกินจริงตอนตั้งราคา
 */
export const ADS_TOPUP_GROUP = {
  key: 'ads_topup',
  label: 'เติมเครดิตโฆษณา',
  hint: 'ร้านตั้งให้หักจากยอดขายไปเติมกระเป๋าโฆษณาอัตโนมัติ · เงินยังเป็นของร้าน (อยู่ในเครดิตโฆษณา) ยังไม่ถูกใช้จนกว่าจะยิงแอดจริง จึงไม่นับเป็นเงินที่แพลตฟอร์มเก็บไป',
  buckets: ['ads'] as FeeBucket[],
};

export const BUCKET_LABELS: Record<FeeBucket | 'net_payout' | 'cogs' | 'gross_profit', string> = {
  gross_sales: 'ยอดขาย',
  seller_discount: 'ส่วนลดร้าน',
  platform_discount: 'ส่วนลดที่แพลตฟอร์มออกให้',
  platform_subsidy: 'เงินที่แพลตฟอร์มช่วยจ่าย',
  commission: 'ค่าคอมมิชชั่น',
  payment_fee: 'ค่าธรรมเนียมชำระเงิน',
  service_fee: 'ค่าบริการ',
  shipping_cost: 'ค่าส่งที่ร้านรับ',
  affiliate: 'ส่วนแบ่งนักขาย (affiliate)',
  ads: 'ค่าโฆษณา',
  campaign_fee: 'ค่าแคมเปญ',
  tax_withheld: 'ภาษีหัก ณ ที่จ่าย',
  other_fee: 'ค่าธรรมเนียมอื่น',
  adjustment: 'ปรับยอด / คืนของ',
  net_payout: 'เงินเข้าจริง',
  cogs: 'ต้นทุนสินค้า',
  gross_profit: 'กำไรขั้นต้น',
};

/** คำอธิบายสำหรับ tooltip ในหน้ารายงาน — เขียนจากมุมคนขาย ไม่ใช่มุมโครงสร้างข้อมูล */
export const BUCKET_HINTS: Record<FeeBucket, string> = {
  gross_sales: 'ราคาสินค้ารวมก่อนหักส่วนลดและค่าธรรมเนียมใด ๆ',
  seller_discount: 'ส่วนลดและโค้ดที่ร้านออกค่าใช้จ่ายเอง',
  platform_discount: 'ส่วนลดที่แพลตฟอร์มออกค่าใช้จ่ายให้ลูกค้า แล้วคืนเงินส่วนนั้นให้เรา — ลูกค้าจ่ายน้อยลงแต่เราได้เต็ม',
  platform_subsidy: 'เงินที่แพลตฟอร์มจ่ายให้เราตรง ๆ เช่น ช่วยออกค่าส่ง เงินชดเชยของหาย เคลมประกันพัสดุ',
  commission: 'ค่าคอมมิชชั่นตามหมวดสินค้าที่แพลตฟอร์มเก็บ',
  payment_fee: 'ค่าธรรมเนียมรับชำระเงิน / บัตรเครดิต',
  service_fee: 'ค่าบริการ ค่าดำเนินการ และโปรแกรมสมาชิกร้าน',
  shipping_cost: 'ค่าส่งส่วนที่ร้านต้องรับ หลังหักที่ลูกค้าจ่าย — ยังไม่หักเงินที่แพลตฟอร์มช่วย (ดูช่องเงินที่แพลตฟอร์มช่วยจ่าย)',
  affiliate: 'ส่วนแบ่งที่จ่ายให้คนช่วยขายผ่านระบบ affiliate ของแพลตฟอร์ม',
  ads: 'ยอดที่ถูกกันจากเงินโอนไปเป็นค่าโฆษณา · กรณี Shopee ที่ตั้ง "เติมเงินโฆษณาอัตโนมัติจากยอดขาย" เงินก้อนนี้ยังเป็นของร้าน (ย้ายไปอยู่ในเครดิตโฆษณา) ยังไม่ถูกใช้จนกว่าจะยิงแอดจริง · Lazada/TikTok คือค่าแอดที่ใช้ไปแล้วจริง',
  campaign_fee: 'ค่าเข้าร่วมแคมเปญและโปรโมชั่นของแพลตฟอร์ม',
  tax_withheld: 'ภาษีที่แพลตฟอร์มหักไว้ก่อนโอนเงิน',
  other_fee: 'ค่าธรรมเนียมเบ็ดเตล็ดที่ยังไม่มีหมวดเฉพาะ ดูชื่อจริงได้ที่รายการย่อย',
  adjustment: 'การคืนเงิน ชดเชย และการปรับยอดย้อนหลัง',
};

/**
 * ความน่าเชื่อของต้นทุนที่ใช้คิดกำไร (`marketplace_settlements.cogs_basis`)
 * — เขียนจากมุมคนขาย ใช้ในทุก UI ที่โชว์กำไรขั้นต้น (ห้าม map คำพวกนี้ซ้ำในหน้า)
 */
export const COGS_BASIS_HINTS: Record<'snapshot' | 'mixed' | 'wac', string> = {
  snapshot: 'คิดจากราคาทุนที่บันทึกไว้ตอนขายทุกชิ้น — แม่นที่สุด',
  mixed: 'บางชิ้นไม่มีราคาทุนตอนขาย จึงใช้ต้นทุนเฉลี่ยปัจจุบันแทน',
  wac: 'ไม่มีราคาทุนตอนขายเลย ใช้ต้นทุนเฉลี่ยปัจจุบันทั้งหมด — ต้นทุนอาจเปลี่ยนไปแล้วตั้งแต่วันขาย',
};

/** ยอดตามช่องกลาง — ทุกค่าเป็นบวก */
export type BucketAmounts = Record<FeeBucket, number>;

/** หนึ่งบรรทัดค่าธรรมเนียมตามที่ platform ส่งมา (เก็บดิบไว้เป็นหลักฐานย้อนกลับ) */
export interface SettlementLine {
  bucket: FeeBucket;
  /** รหัสค่าธรรมเนียมของ platform — ใช้รหัสตัวเลขถ้ามี (นิ่งกว่าชื่อที่เป็นข้อความ) */
  platformFeeCode: string;
  /** ชื่อตามตัวอักษรที่ platform ส่งมา */
  platformFeeName: string;
  amount: number;
  externalItemId?: string | null;
  vat?: number;
  wht?: number;
  occurredAt?: string | null;
  /** คีย์กันซ้ำตอน sync รอบใหม่ — ต้องนิ่งข้ามรอบ */
  lineKey: string;
}

/** ผลลัพธ์การแปลง escrow/statement ของ platform หนึ่งใบ */
export interface NormalizedSettlement {
  buckets: BucketAmounts;
  netPayout: number;
  /**
   * เงินที่ลูกค้าจ่ายจริงตอน checkout — **ไม่เท่ากับราคาที่เราตั้ง** เพราะแพลตฟอร์ม
   * ออกคูปองแทนลูกค้า · undefined = แพลตฟอร์มนั้นไม่ได้บอก (เก็บเป็น null อย่าเดาเป็น 0)
   */
  buyerPaid?: number | null;
  lines: SettlementLine[];
  currency: string;
  statementPeriod?: string | null;
  settledAt?: string | null;
  paidStatus?: string | null;
  externalOrderId?: string | null;
  raw: Record<string, unknown>;
}

export function emptyBuckets(): BucketAmounts {
  return FEE_BUCKETS.reduce((acc, b) => { acc[b] = 0; return acc; }, {} as BucketAmounts);
}

/**
 * แปลงตัวเลขจาก platform ให้เป็น number ที่เชื่อถือได้
 *
 * **Lazada ส่ง amount เป็นข้อความที่มีคอมมาคั่นหลัก** เช่น "3,490.00" → Number() ได้ NaN
 * เจอ 10 จาก 180 แถว และเป็นแถวยอดใหญ่ทั้งหมด — ถ้าไม่ล้างก่อนจะทิ้งรายการแพงที่สุด
 * ไปเงียบ ๆ แล้วรายงานยอดต่ำกว่าจริง (memo/settlement-analysis.md ข้อ 1)
 */
export function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const n = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

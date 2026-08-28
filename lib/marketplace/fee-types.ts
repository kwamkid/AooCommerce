// ช่องกลางของค่าธรรมเนียม marketplace — taxonomy เดียวที่ทุก platform แปลงเข้ามา
// (client-safe: ห้าม import อะไรที่เป็น server-only — หน้ารายงานก็อ่านไฟล์นี้)
//
// ที่มา: memo/settlement-analysis.md — สำรวจฟิลด์จริงของทั้ง 3 เจ้าก่อนออกแบบ
// (Shopee 110 ฟิลด์ · TikTok ~100 ฟิลด์ · Lazada ยิงของจริง 180 แถว/30 วัน)
//
// ══════════════════════════════════════════════════════════════════════════
//  ➕ เพิ่ม marketplace ใหม่ / เจอค่าธรรมเนียมชนิดใหม่
// ══════════════════════════════════════════════════════════════════════════
//  1. หา bucket ที่ความหมายตรงที่สุดจาก 13 ตัวข้างล่าง — **อย่าเพิ่ม bucket ใหม่ก่อน**
//     ทั้งสามเจ้ามีค่าธรรมเนียมรวมกันเป็นร้อยชนิด ถ้าเพิ่ม bucket ตามชื่อที่ platform
//     เรียก รายงานจะมีคอลัมน์เป็นร้อยและเทียบข้าม platform ไม่ได้เลย
//  2. ชื่อจริงที่ platform เรียกไม่หาย — มันถูกเก็บใน marketplace_settlement_lines
//     ทุกบรรทัด (platform_fee_code + platform_fee_name) ใช้ drill ลงไปดูได้เสมอ
//  3. จะเพิ่ม bucket จริง ๆ ต่อเมื่อมันตอบคำถามธุรกิจคนละข้อกับ 13 ตัวนี้
// ══════════════════════════════════════════════════════════════════════════

export const FEE_BUCKETS = [
  'gross_sales',
  'seller_discount',
  'platform_discount',
  'commission',
  'payment_fee',
  'service_fee',
  'shipping_cost',
  'affiliate',
  'ads',
  'campaign_fee',
  'tax_withheld',
  'adjustment',
] as const;
export type FeeBucket = typeof FEE_BUCKETS[number];

/** ทิศของแต่ละช่องเมื่อคิดเป็นเงินเข้ากระเป๋าเรา — เก็บค่าเป็น "บวกเสมอ" ทุกช่อง */
export const BUCKET_SIGN: Record<FeeBucket, '+' | '-' | '±'> = {
  gross_sales: '+',
  seller_discount: '-',
  platform_discount: '±',
  commission: '-',
  payment_fee: '-',
  service_fee: '-',
  shipping_cost: '-',
  affiliate: '-',
  ads: '-',
  campaign_fee: '-',
  tax_withheld: '-',
  adjustment: '±',
};

export const BUCKET_LABELS: Record<FeeBucket | 'net_payout' | 'cogs' | 'gross_profit', string> = {
  gross_sales: 'ยอดขาย',
  seller_discount: 'ส่วนลดร้าน',
  platform_discount: 'ส่วนลดแพลตฟอร์ม',
  commission: 'ค่าคอมมิชชั่น',
  payment_fee: 'ค่าธรรมเนียมชำระเงิน',
  service_fee: 'ค่าบริการ',
  shipping_cost: 'ค่าส่งที่ร้านรับ',
  affiliate: 'ส่วนแบ่งนักขาย (affiliate)',
  ads: 'ค่าโฆษณา',
  campaign_fee: 'ค่าแคมเปญ',
  tax_withheld: 'ภาษีหัก ณ ที่จ่าย',
  adjustment: 'ปรับยอด / คืนของ',
  net_payout: 'เงินเข้าจริง',
  cogs: 'ต้นทุนสินค้า',
  gross_profit: 'กำไรขั้นต้น',
};

/** คำอธิบายสำหรับ tooltip ในหน้ารายงาน — เขียนจากมุมคนขาย ไม่ใช่มุมโครงสร้างข้อมูล */
export const BUCKET_HINTS: Record<FeeBucket, string> = {
  gross_sales: 'ราคาสินค้ารวมก่อนหักส่วนลดและค่าธรรมเนียมใด ๆ',
  seller_discount: 'ส่วนลดและโค้ดที่ร้านออกค่าใช้จ่ายเอง',
  platform_discount: 'ส่วนลดที่แพลตฟอร์มออกให้ลูกค้า ไม่ได้หักจากเงินเรา แต่ทำให้ยอดที่ลูกค้าจ่ายต่างจากราคาขาย',
  commission: 'ค่าคอมมิชชั่นตามหมวดสินค้าที่แพลตฟอร์มเก็บ',
  payment_fee: 'ค่าธรรมเนียมรับชำระเงิน / บัตรเครดิต',
  service_fee: 'ค่าบริการ ค่าดำเนินการ และโปรแกรมสมาชิกร้าน',
  shipping_cost: 'ค่าส่งเฉพาะส่วนที่ร้านรับเอง หลังหักที่ลูกค้าจ่ายและที่แพลตฟอร์มช่วย',
  affiliate: 'ส่วนแบ่งที่จ่ายให้คนช่วยขายผ่านระบบ affiliate ของแพลตฟอร์ม',
  ads: 'ค่าโฆษณาที่ถูกหักจากยอดขายโดยตรง',
  campaign_fee: 'ค่าเข้าร่วมแคมเปญและโปรโมชั่นของแพลตฟอร์ม',
  tax_withheld: 'ภาษีที่แพลตฟอร์มหักไว้ก่อนโอนเงิน',
  adjustment: 'การคืนเงิน ชดเชย และการปรับยอดย้อนหลัง',
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

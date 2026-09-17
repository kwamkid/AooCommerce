// ─────────────────────────────────────────────────────────────────────────────
// รอบวางบิล — "วางบิลทุกวันที่ N ของเดือน" ที่ร้านค้ากับห้างใช้กันจริง
//
// **ปัญหาเดิม**: ระบบไม่มีแนวคิด "วันวางบิล" เลย มีแต่ *จำนวนวัน* สองตัว
// (`consignment_report_due_days` = ส่งยอดภายในกี่วัน · `credit_days` /
// `consignment_payment_terms` = ชำระภายในกี่วัน) แล้ววันครบกำหนดคิดจาก
// **วันที่กดยืนยัน + จำนวนวัน** — กดช้าไปวันเดียว วันครบกำหนดก็เลื่อนตาม
// ทั้งที่ห้างกำหนดไว้ตายตัวว่าวางบิลวันที่ 25 ครบกำหนดสิ้นเดือนถัดไป
//
// และใบวางบิลของสายเครดิตออก **1 ใบต่อ 1 ออเดอร์** (ผูกกันด้วยการยัดข้อความ
// `order:<uuid>` ไว้ในช่อง notes) ตัวแทนสั่ง 20 ครั้งจึงได้ใบวางบิล 20 ใบ
// ทั้งที่ควรได้ใบเดียวต่อรอบ
//
// ไฟล์นี้ถือกติกาของรอบไว้ที่เดียว — ทั้งการหาวันวางบิล การคำนวณช่วงของรอบ
// และการรวบยอดที่ยังไม่ได้วางบิล ให้ทั้ง API และงานตั้งเวลาใช้ร่วมกัน
// ─────────────────────────────────────────────────────────────────────────────
import { supabaseAdmin } from '@/lib/supabase-admin';

/** วันวางบิลตั้งต้นเมื่อไม่ได้ตั้งทั้งที่บริษัทและที่ลูกค้า — สิ้นเดือน */
export const DEFAULT_STATEMENT_DAY = 31;

/** เครดิตตั้งต้นเมื่อไม่ได้ตั้งที่ไหนเลย */
export const DEFAULT_CREDIT_DAYS = 30;

export interface BillingPeriod {
  /** วันแรกของรอบ (รวม) */
  start: string;
  /** วันวางบิล = วันสุดท้ายของรอบ (รวม) และเป็นวันที่บนใบวางบิล */
  end: string;
  dueDate: string;
  /** ปี/เดือนที่ใช้เก็บลง statements.period_* — ยึดตามวันปิดรอบ */
  periodYear: number;
  periodMonth: number;
}

/** `YYYY-MM-DD` ตามเวลาไทย (ปฏิทินของผู้ใช้ ไม่ใช่ UTC) */
function thaiDateString(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/**
 * วันวางบิลของเดือนหนึ่ง ๆ — วันที่ 29-31 ถูกร่นมาเป็นวันสุดท้ายของเดือนที่สั้นกว่า
 * (ตั้ง 31 ไว้ = "สิ้นเดือน" ไม่ใช่ "ข้ามเดือนกุมภาพันธ์")
 */
function statementDateOf(year: number, month1: number, day: number): string {
  const d = Math.min(Math.max(day, 1), daysInMonth(year, month1));
  return `${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().split('T')[0];
}

/**
 * รอบที่ "ปิดล่าสุด" เมื่อเทียบกับวันที่ `asOf`
 *
 * รอบของวันวางบิลวันที่ N เดือน M = ยอดที่เกิดตั้งแต่ **วันถัดจากวันวางบิลเดือนก่อน**
 * จนถึง **วันวางบิลเดือน M** — ยอดที่เกิดหลังจากนั้นเป็นของรอบถัดไป
 *
 * @param statementDay วันวางบิล 1-31
 * @param creditDays   จำนวนวันเครดิตหลังวางบิล
 * @param asOf         วันที่อ้างอิง (ไม่ใส่ = วันนี้ตามเวลาไทย)
 */
export function billingPeriodFor(
  statementDay: number,
  creditDays: number,
  asOf?: Date,
): BillingPeriod {
  const today = thaiDateString(asOf ?? new Date());
  const [y, m, d] = today.split('-').map(Number);

  // ยังไม่ถึงวันวางบิลของเดือนนี้ → รอบที่ปิดล่าสุดคือของเดือนก่อน
  const thisMonthEnd = statementDateOf(y, m, statementDay);
  const closedThisMonth = d >= Number(thisMonthEnd.split('-')[2]);

  const endYear = closedThisMonth ? y : (m === 1 ? y - 1 : y);
  const endMonth = closedThisMonth ? m : (m === 1 ? 12 : m - 1);
  const end = statementDateOf(endYear, endMonth, statementDay);

  const prevYear = endMonth === 1 ? endYear - 1 : endYear;
  const prevMonth = endMonth === 1 ? 12 : endMonth - 1;
  const start = addDays(statementDateOf(prevYear, prevMonth, statementDay), 1);

  return {
    start,
    end,
    dueDate: addDays(end, creditDays),
    periodYear: endYear,
    periodMonth: endMonth,
  };
}

/**
 * รอบที่ **ยังเปิดอยู่** — ยอดที่เกิดวันนี้จะถูกวางบิลในรอบนี้
 *
 * ต่างจาก `billingPeriodFor` ที่คืนรอบที่ปิดไปแล้ว ตัวนี้ใช้ตอน "ขายวันนี้ แล้วใบนี้
 * ไปโผล่ที่ใบวางบิลใบไหน" — ถ้าวันนี้ยังไม่ถึงวันวางบิลก็เป็นรอบของเดือนนี้
 * ถ้าเลยมาแล้วก็เป็นรอบของเดือนหน้า
 */
export function openBillingPeriodFor(
  statementDay: number,
  creditDays: number,
  asOf?: Date,
): BillingPeriod {
  const today = thaiDateString(asOf ?? new Date());
  const [y, m, d] = today.split('-').map(Number);

  const thisMonthEnd = statementDateOf(y, m, statementDay);
  const stillOpen = d <= Number(thisMonthEnd.split('-')[2]);

  const endYear = stillOpen ? y : (m === 12 ? y + 1 : y);
  const endMonth = stillOpen ? m : (m === 12 ? 1 : m + 1);
  const end = statementDateOf(endYear, endMonth, statementDay);

  const prevYear = endMonth === 1 ? endYear - 1 : endYear;
  const prevMonth = endMonth === 1 ? 12 : endMonth - 1;
  const start = addDays(statementDateOf(prevYear, prevMonth, statementDay), 1);

  return { start, end, dueDate: addDays(end, creditDays), periodYear: endYear, periodMonth: endMonth };
}

export interface CustomerBillingTerms {
  statementDay: number;
  creditDays: number;
}

/** กลุ่มลูกค้าธุรกิจ — แต่ละกลุ่มมีรอบวางบิลตั้งต้นของตัวเอง */
export type BusinessCustomerScope = 'consignment' | 'department_store';

/** ลูกค้ารายนี้อยู่กลุ่มไหน — ตัดสินจาก `customer_type` */
export function scopeOfCustomerType(customerType: string | null | undefined): BusinessCustomerScope {
  return customerType === 'department_store' || customerType === 'wholesale_department'
    ? 'department_store'
    : 'consignment';
}

/**
 * วันวางบิล + เครดิตของลูกค้ารายหนึ่ง
 *
 * **ค่าตั้งต้นแยกตามกลุ่ม** — ตัวแทนกับห้างวางบิลคนละรอบกันจริงในธุรกิจ
 * (ห้างมักวางบิลกลางเดือน ตัวแทนมักสิ้นเดือน) จึงเก็บแยกที่
 * `settings.consignment.*` กับ `settings.department_store.*`
 *
 * แต่ **ของจริงยังต่างกันรายลูกค้าอยู่ดี** — ห้างแต่ละเจ้ากำหนดไม่เหมือนกัน
 * ค่าที่หน้าตั้งค่าจึงเป็นแค่ค่าตั้งต้นให้ไม่ต้องไล่กรอกทีละราย
 *
 * ลำดับ: ลูกค้า → ค่าตั้งต้นของกลุ่ม → (ค่าเดิมที่เคยเก็บรวม) → ค่าตั้งต้นระบบ
 */
export async function billingTermsFor(
  companyId: string,
  customerId: string,
  isConsignment = false,
): Promise<CustomerBillingTerms> {
  const [{ data: company }, { data: customer }] = await Promise.all([
    supabaseAdmin.from('companies').select('settings').eq('id', companyId).single(),
    supabaseAdmin
      .from('customers')
      .select('customer_type, statement_day, credit_days, consignment_payment_terms')
      .eq('id', customerId)
      .single(),
  ]);

  interface ScopeDefaults {
    statement_day?: number;
    credit_days?: number;
    /** ช่องเดิมของสายฝากขาย ก่อนแยกเป็น credit_days */
    default_payment_terms?: number;
  }

  const settings = (company?.settings ?? {}) as {
    consignment?: ScopeDefaults;
    department_store?: ScopeDefaults;
    /** ก้อนรวมที่เคยใช้ช่วงสั้น ๆ ก่อนแยกตามกลุ่ม — อ่านเป็นทางถอยเท่านั้น */
    billing?: { statement_day?: number; credit_days?: number };
  };

  const scope = scopeOfCustomerType(customer?.customer_type);
  const scopeDefaults = settings[scope] ?? {};

  const statementDay = customer?.statement_day
    || Number(scopeDefaults.statement_day)
    || Number(settings.billing?.statement_day)
    || DEFAULT_STATEMENT_DAY;

  /**
   * ฝากขายมีช่องของตัวเอง (`consignment_payment_terms`) เพราะสัญญาฝากขายกำหนดแยก
   * จากเครดิตการค้าปกติ — ตั้งไว้ก็ใช้อันนั้นก่อน
   */
  const creditDays = (isConsignment ? customer?.consignment_payment_terms : null)
    ?? customer?.credit_days
    ?? Number(scopeDefaults.credit_days)
    ?? Number(scopeDefaults.default_payment_terms)
    ?? Number(settings.billing?.credit_days)
    ?? DEFAULT_CREDIT_DAYS;

  return { statementDay, creditDays: Number(creditDays) || 0 };
}

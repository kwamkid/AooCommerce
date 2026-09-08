// Path: lib/status-labels.ts
// ทะเบียนกลางของ "สถานะ" ทั้งระบบ — คำเรียก + สี ของทุกโดเมน อยู่ที่นี่ที่เดียว
// (client-safe, ไม่มี dependency — PDF/เซิร์ฟเวอร์เรียกได้ด้วย)
//
// ┌─ ทำไมต้องแยกเป็น "โดเมน" ไม่ใช่ map แบนใบเดียว ────────────────────────┐
// │ status key เดียวกันคนละตารางแปลว่าคนละเรื่อง — ใช้ map ใบเดียวไม่ได้:   │
// │   draft    = "แบบร่าง" (ใบวางบิล)  แต่ = "ที่ต้องจัดส่ง" (ออเดอร์ห้าง)  │
// │   pending  = "ที่ต้องจัดส่ง" (ใบเติมของ) แต่ = "รอชำระ" (การชำระเงิน)   │
// │   received = "รับครบแล้ว" (ใบเติมของ) แต่ = "รับแล้ว" (รายงานฝากขาย)    │
// │   sent     = "รอชำระ" (ใบวางบิล)   แต่ = "แจ้ง Sup แล้ว" (ใบสั่งซื้อ)   │
// └────────────────────────────────────────────────────────────────────────┘
//
// ⚠️ สีเก็บเป็น "ชื่อความหมาย" (StatusColor) ไม่ใช่คลาส Tailwind — ค่าสีจริงอยู่ที่
//    ตัวแปร --st-* ใน globals.css (คลาส `.badge-st-*`) ⇒ เปลี่ยนสีทั้งระบบแก้ที่นั่นที่เดียว
// ⚠️ ไอคอนอยู่ที่ components/ui/StatusBadge.tsx (ตระกูลละหนึ่งตัว)
// ⛔ ห้ามประกาศ map คำเรียก/สีสถานะในหน้าใด ๆ — เพิ่มโดเมนใหม่ที่ไฟล์นี้แทน

/** ชื่อสีเชิงความหมาย — ค่าจริงอยู่ที่ตัวแปร --st-{name} ใน globals.css */
export type StatusColor =
  | 'new'       // น้ำเงิน — เพิ่งเข้ามา / ร่าง
  | 'wait'      // terracotta — ถึงคิวที่คนต้องลงมือ (สีเดียวกับแถบขั้นตอน)
  | 'progress'  // ม่วงคราม — กำลังดำเนินการ
  | 'moving'    // ฟ้าคราม — ของกำลังเดินทาง
  | 'done'      // เขียว — จบแล้ว / ได้เงินแล้ว / รับครบ
  | 'invoiced'  // ม่วง — ออกเอกสารเรียกเก็บแล้ว
  | 'billed'    // คราม — วางบิลแล้ว
  | 'partial'   // อำพัน — ได้บางส่วน
  | 'late'      // แดง — เกินกำหนด / ผิดพลาด
  | 'off'       // เทา — ยกเลิก / ปิด
  | 'unpaid'    // ส้ม — ยังไม่ได้เงิน (คนละสีกับ progress โดยตั้งใจ)
  | 'verify';   // ม่วง — รอตรวจสอบ

/** ทุกสีที่มี — เรียงตามลำดับที่เล่าเรื่องได้ (เข้ามา → กำลังทำ → จบ → มีปัญหา) */
export const STATUS_COLORS: StatusColor[] = [
  'new', 'wait', 'progress', 'moving', 'done',
  'invoiced', 'billed', 'partial', 'unpaid', 'verify', 'late', 'off',
];

export interface StatusMeta { label: string; color: StatusColor }
type Domain = Record<string, StatusMeta>;

const s = (label: string, color: StatusColor): StatusMeta => ({ label, color });

/**
 * ออเดอร์ที่พนักงานเห็น (r_retail + ค่าเริ่มต้นของทุก flow)
 * 'expired' ไม่ใช่ค่าใน DB — เป็น cancelled ที่ cancellation_reason='expired'
 * แยกออกมาเพราะ "ลูกค้าไม่จ่ายจนบิลตาย" ต้องต่างจาก "ร้านกดยกเลิกเอง"
 */
const order: Domain = {
  new:           s('ใหม่', 'new'),
  ready_to_ship: s('รอกดรับ', 'wait'),
  processing:    s('ที่ต้องจัดส่ง', 'progress'),
  shipping:      s('กำลังส่ง', 'moving'),
  completed:     s('สำเร็จ', 'done'),
  cancelled:     s('ยกเลิก', 'off'),
  expired:       s('หมดอายุ', 'late'),
};

/**
 * ตัวแทน/ห้าง (w_cash, w_credit) — คนละงานจริง ไม่ใช่ความไม่สม่ำเสมอ:
 * ปลีก "รอกดรับ" = รอพนักงานกดรับออเดอร์ · ตัวแทน "รอคอนเฟิร์ม" = รอยืนยันกับตัวแทนก่อนตัดสต็อก
 */
const orderDealer: Domain = {
  ...order,
  ready_to_ship: s('รอคอนเฟิร์ม', 'wait'),
  shipping:      s('จัดส่งแล้ว', 'moving'),
  completed:     s('เสร็จสิ้น', 'done'),
};

const payment: Domain = {
  pending:   s('รอชำระ', 'unpaid'),
  verifying: s('รอตรวจสอบ', 'verify'),
  paid:      s('ชำระแล้ว', 'done'),
  cancelled: s('ยกเลิก', 'off'),
};

/**
 * ── ฝั่งลูกค้า ── หน้าที่ลูกค้าเปิดเอง (บิลออนไลน์ · หน้าร้าน)
 * ลูกค้าไม่รู้จักงานหลังบ้าน "รอกดรับ" ของเรา = "ได้รับคำสั่งซื้อแล้ว" ของเขา
 * ⚠️ ห้ามเอาคำฝั่งพนักงานไปโชว์ลูกค้า และห้ามเอาคำฝั่งลูกค้ามาโชว์พนักงาน
 */
const customerOrder: Domain = {
  new:           s('รับคำสั่งซื้อแล้ว', 'new'),
  ready_to_ship: s('รับคำสั่งซื้อแล้ว', 'new'),
  processing:    s('กำลังเตรียมของ', 'progress'),
  shipping:      s('กำลังจัดส่ง', 'moving'),
  completed:     s('ส่งสำเร็จ', 'done'),
  cancelled:     s('ยกเลิกแล้ว', 'off'),
  expired:       s('บิลหมดอายุ', 'late'),
};

const customerPayment: Domain = {
  pending:   s('รอชำระเงิน', 'unpaid'),
  verifying: s('รอตรวจสลิป', 'verify'),
  paid:      s('ชำระเงินแล้ว', 'done'),
  cancelled: s('ยกเลิก', 'off'),
};

/** ใบวางบิล (statements) */
const statement: Domain = {
  draft:          s('แบบร่าง', 'new'),
  sent:           s('รอชำระ', 'unpaid'),
  partially_paid: s('ชำระบางส่วน', 'partial'),
  paid:           s('ชำระแล้ว', 'done'),
  overdue:        s('เกินกำหนด', 'late'),
  cancelled:      s('ยกเลิก', 'off'),
};

/**
 * ใบเติมของตัวแทน (replenishments) **และออเดอร์ห้าง (department_orders)**
 * — สองตารางนี้เป็นงานเดียวกัน (ส่งของไปให้ปลายทาง แล้วปลายทางกดรับ) จึงใช้ชุดสถานะเดียวกัน
 * เดิมออเดอร์ห้างเรียกสถานะแรกว่า 'draft' ทั้งที่ไม่มีขั้นยืนยัน = "รอจัดส่ง" อยู่แล้ว
 * (ค่าตกค้างจากดีไซน์เก่า draft→confirmed→shipped→invoiced→paid ที่เลิกใช้) — ย้ายเป็น
 * 'pending' ให้ตรงกันทั้งคู่แล้ว ดู fix-bug.md 2026-09-08
 */
const replenishment: Domain = {
  pending:          s('ที่ต้องจัดส่ง', 'progress'),
  shipped:          s('กำลังส่ง', 'moving'),
  pending_confirm:  s('รอยืนยัน', 'wait'),
  received:         s('รับครบแล้ว', 'done'),
  partial_received: s('รับไม่ครบ', 'partial'),
  cancelled:        s('ยกเลิก', 'off'),
};


/** รายงานฝากขาย + รายงานห้าง — ใช้ชุดเดียวกัน (วงจรเอกสารเหมือนกันเป๊ะ) */
const report: Domain = {
  draft:     s('ร่าง', 'new'),
  received:  s('รับแล้ว', 'new'),
  invoiced:  s('ออกใบแจ้งหนี้แล้ว', 'invoiced'),
  billed:    s('วางบิลแล้ว', 'billed'),
  paid:      s('ชำระแล้ว', 'done'),
  overdue:   s('เกินกำหนด', 'late'),
  cancelled: s('ยกเลิก', 'off'),
};

/** ใบลดหนี้ + ใบรับคืน — เอกสารที่ออกแล้วมีแค่ "ออกแล้ว/ยกเลิก" */
const issuedDoc: Domain = {
  issued:    s('ออกแล้ว', 'done'),
  cancelled: s('ยกเลิก', 'off'),
};

/** ประเภทใบลดหนี้ (ไม่ใช่สถานะ แต่เป็นป้ายชุดเดียวกันบนหน้าเดียวกัน) */
const creditNoteType: Domain = {
  void:     s('ยกเลิกบิล', 'late'),
  refund:   s('คืนสินค้า', 'unpaid'),
  exchange: s('เปลี่ยนสินค้า', 'new'),
};

/**
 * เอกสารภาษี (ใบกำกับเต็ม/ย่อ) — ยกเลิกแล้วเรียก "ยกเลิก" ให้ตรงกับเอกสารอื่น
 * ⚠️ ใช้สีเทาเหมือนเอกสารที่ยกเลิกทุกชนิด — ถ้าอยากให้ VOID ของงานบัญชีเด่นเป็นแดง
 *    เปลี่ยน 'off' เป็น 'late' บรรทัดเดียว แล้วเปลี่ยนทั้งระบบพร้อมกัน
 */
const taxDoc: Domain = {
  active: s('ปกติ', 'done'),
  voided: s('ยกเลิก', 'off'),
};

const promotion: Domain = {
  active:    s('ใช้งาน', 'done'),
  inactive:  s('ปิดใช้งาน', 'off'),
  scheduled: s('รอเริ่ม', 'new'),
  expired:   s('หมดอายุ', 'late'),
};

/** โอนย้ายคลัง */
const transfer: Domain = {
  pending:         s('ที่ต้องจัดส่ง', 'progress'),
  shipping:        s('กำลังส่ง', 'moving'),
  pending_confirm: s('รอยืนยัน', 'wait'),
  received:        s('รับสินค้าแล้ว', 'done'),
  cancelled:       s('ยกเลิก', 'off'),
};

/** ระดับสต็อกของสินค้าในคลัง (ไม่ใช่สถานะของเอกสาร แต่เป็นป้ายบอกสภาพที่ผู้ใช้อ่านทุกวัน) */
const stockLevel: Domain = {
  none:     s('ยังไม่มี', 'off'),
  out:      s('หมด', 'late'),
  low:      s('ต่ำ', 'partial'),
  near_low: s('ใกล้หมด', 'partial'),
  ok:       s('ปกติ', 'done'),
};

/** ใบรับเข้า / ใบเบิกออก — จบในตัว ไม่มีขั้นกลาง */
const stockDoc: Domain = {
  completed: s('สำเร็จ', 'done'),
  cancelled: s('ยกเลิก', 'off'),
};

/** ใบสั่งซื้อ — ฝั่งเรา */
const purchaseOrder: Domain = {
  draft:             s('ร่าง', 'new'),
  sent:              s('แจ้ง Sup แล้ว', 'moving'),
  partial_received:  s('รับบางส่วน', 'partial'),
  received:          s('รับครบ', 'done'),
  received_mismatch: s('รับไม่ตรง', 'unpaid'),
  closed:            s('ปิด', 'off'),
  cancelled:         s('ยกเลิก', 'off'),
};

/** ใบสั่งซื้อ — ฝั่งซัพพลายเออร์ (เขาไม่ได้ "ถูกแจ้ง" เขา "ได้รับ") */
const purchaseOrderSupplier: Domain = {
  ...purchaseOrder,
  draft: s('ยังไม่ส่ง', 'new'),
  sent:  s('ส่งแล้ว', 'moving'),
};

const broadcast: Domain = {
  draft:     s('แบบร่าง', 'new'),
  pending:   s('กำลังส่ง', 'partial'),
  sending:   s('กำลังส่ง', 'partial'),
  sent:      s('ส่งแล้ว', 'done'),
  partial:   s('ส่งไม่ครบ', 'unpaid'),
  failed:    s('ล้มเหลว', 'late'),
  cancelled: s('ยกเลิก', 'off'),
};

/** ใบเสร็จ POS — คำว่า "Void" เป็นศัพท์ใบเสร็จที่แคชเชียร์/บัญชีใช้จริง ไม่แทนด้วย "ยกเลิก" */
const posOrder: Domain = {
  completed: s('สำเร็จ', 'done'),
  cancelled: s('Void', 'off'),
};

/** รายงานซัพพลายเออร์ (สรุปยอดส่งให้ supplier) */
const supplierReport: Domain = {
  draft:     s('ร่าง', 'new'),
  confirmed: s('ยืนยัน', 'done'),
  sent:      s('ส่งแล้ว', 'moving'),
};

/** ประเภทซัพพลายเออร์ (ไม่ใช่สถานะ แต่เป็นป้ายชุดเดียวกันบนหน้าเดียวกัน) */
const supplierType: Domain = {
  cash:        s('เงินสด', 'done'),
  credit:      s('เครดิต', 'new'),
  consignment: s('ฝากขาย', 'partial'),
};

export const STATUS_DOMAINS = {
  order, orderDealer, payment,
  customerOrder, customerPayment,
  statement, replenishment, report,
  creditNote: issuedDoc, returnNote: issuedDoc, creditNoteType, taxDoc,
  promotion, transfer, stockDoc, stockLevel, posOrder, supplierReport, supplierType,
  purchaseOrder, purchaseOrderSupplier, broadcast,
} satisfies Record<string, Domain>;

export type StatusDomain = keyof typeof STATUS_DOMAINS;

/** ไม่รู้จักสถานะ = โชว์ key ดิบบนพื้นเทา ดีกว่าเดาผิดหรือหายไปเงียบ ๆ */
const UNKNOWN = (status: string): StatusMeta => ({ label: status, color: 'off' });

export function statusMeta(domain: StatusDomain, status: string | null | undefined): StatusMeta {
  const key = status || '';
  return (STATUS_DOMAINS[domain] as Domain)[key] || UNKNOWN(key);
}

export function statusLabel(domain: StatusDomain, status: string | null | undefined): string {
  return statusMeta(domain, status).label;
}

/** ชื่อคลาส CSS ของสีสถานะ — ค่าสีจริงอยู่ที่ `.badge-st-*` ใน globals.css */
export function statusColorClass(domain: StatusDomain, status: string | null | undefined): string {
  return `badge-st-${statusMeta(domain, status).color}`;
}

interface OrderLabelOptions {
  /** ออเดอร์ตัวแทน/ห้าง (w_cash, w_credit) */
  dealer?: boolean;
  /** ยกเลิกเพราะบิลหมดอายุ — คนละเรื่องกับร้านกดยกเลิกเอง */
  expired?: boolean;
  /** หน้าที่ลูกค้าเปิดเอง — คนละชุดคำกับฝั่งพนักงาน */
  audience?: 'staff' | 'customer';
}

/** คำเรียกสถานะออเดอร์ (สำหรับข้อความ/PDF ที่ไม่ได้ใช้ badge) */
export function orderStatusLabel(status: string, opts: OrderLabelOptions = {}): string {
  const domain: StatusDomain = opts.audience === 'customer' ? 'customerOrder'
    : opts.dealer ? 'orderDealer' : 'order';
  const key = opts.expired && status === 'cancelled' ? 'expired' : status;
  return statusLabel(domain, key);
}

/** คำเรียกสถานะการชำระเงิน (สำหรับข้อความ/PDF ที่ไม่ได้ใช้ badge) */
export function paymentStatusLabel(status: string, opts: Pick<OrderLabelOptions, 'audience'> = {}): string {
  return statusLabel(opts.audience === 'customer' ? 'customerPayment' : 'payment', status);
}

/** ลำดับสถานะถัดไปของ r_retail flow — single source of truth (เคย copy 3 ไฟล์แล้ว drift) */
export const ORDER_STATUS_FLOW: Record<string, string> = {
  new: 'ready_to_ship',
  ready_to_ship: 'processing',
  processing: 'shipping',
  shipping: 'completed',
};

export function getNextOrderStatus(status: string): string | null {
  return ORDER_STATUS_FLOW[status] ?? null;
}

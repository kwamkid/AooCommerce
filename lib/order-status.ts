// Path: lib/order-status.ts
// คำเรียกสถานะออเดอร์ — แหล่งเดียวของทั้งระบบ (client-safe, ไม่มี dependency)
//
// ก่อนหน้านี้แต่ละหน้านิยามคำเอง สถานะเดียวกันจึงเรียกไม่เหมือนกัน:
//   ready_to_ship = "รอกดรับ" (หน้ารายการ) / "รอกดรับออเดอร์" (หน้า detail)
//                 / "พร้อมส่ง" (demo) / "รอคอนเฟิร์ม" (ตัวแทน)
// พนักงานคุยกันคนละคำทั้งที่มองข้อมูลตัวเดียวกัน
//
// ⚠️ สี ไม่ได้อยู่ที่นี่ — อยู่ที่ lib/status-tab-colors.ts (getTabColor/getBadgeColor)
// ไฟล์นี้ตอบแค่ "เรียกว่าอะไร" เท่านั้น
//
// ⚠️ หน้าลูกค้า (หน้าร้าน/บิลออนไลน์) ห้ามใช้แผนที่นี้ตรง ๆ — ลูกค้าต้องเห็น
// "สถานะเดียว" ที่รวมเรื่องเงินกับการส่งเข้าด้วยกันแล้ว ใช้ getOrderHeadline()
// จาก lib/order-progress.ts แทน

/** สถานะออเดอร์ที่พนักงานเห็น (r_retail + ค่าเริ่มต้นของทุก flow) */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  new: 'ใหม่',
  ready_to_ship: 'รอกดรับ',
  processing: 'ที่ต้องจัดส่ง',
  shipping: 'กำลังส่ง',
  completed: 'สำเร็จ',
  cancelled: 'ยกเลิก',
};

/**
 * ตัวแทน/ห้าง (w_cash, w_credit) ใช้คำต่างกันบางขั้น — ไม่ใช่ความไม่สม่ำเสมอ
 * แต่เป็นคนละงานจริง: ปลีก "รอกดรับ" = รอพนักงานกดรับออเดอร์,
 * ตัวแทน "รอคอนเฟิร์ม" = รอยืนยันออเดอร์กับตัวแทนก่อนตัดสต็อก
 */
export const DEALER_ORDER_STATUS_LABEL: Record<string, string> = {
  ...ORDER_STATUS_LABEL,
  ready_to_ship: 'รอคอนเฟิร์ม',
  shipping: 'จัดส่งแล้ว',
  completed: 'เสร็จสิ้น',
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: 'รอชำระ',
  verifying: 'รอตรวจสอบ',
  paid: 'ชำระแล้ว',
  cancelled: 'ยกเลิก',
};

interface LabelOptions {
  /** ออเดอร์ตัวแทน/ห้าง (w_cash, w_credit) */
  dealer?: boolean;
  /** ยกเลิกเพราะหมดอายุ — คนละเรื่องกับร้านกดยกเลิกเอง */
  expired?: boolean;
}

export function orderStatusLabel(status: string, opts: LabelOptions = {}): string {
  if (opts.expired && status === 'cancelled') return 'หมดอายุ';
  const map = opts.dealer ? DEALER_ORDER_STATUS_LABEL : ORDER_STATUS_LABEL;
  return map[status] || status;
}

export function paymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABEL[status] || status;
}

/**
 * ร่างบิลที่กรอกค้างไว้ — เก็บใน localStorage ของเครื่องคนกรอก
 *
 * ใช้กับ **บิลใหม่เท่านั้น** (โหมดแก้ไขไม่มีร่าง — ของจริงอยู่ใน DB แล้ว) · ตอนนี้มีที่ใช้
 * ที่เดียวคือแผงเปิดบิลในหน้าแชท ซึ่งปิดได้ด้วยหลายเหตุ (กด X · สลับห้อง · รีเฟรช) แล้ว
 * สิ่งที่พนักงานพิมพ์ไว้หายทั้งหมด
 *
 * key = `chat-order-draft:${companyId}:${contactId}` — ผูกกับห้องแชท ไม่ใช่ผูกกับแท็บ
 * จึงกลับมาเปิดห้องเดิมแล้วเจอของเดิมเสมอ · **ห้ามให้ OrderForm แตะ storage เอง** ให้ผ่าน
 * ไฟล์นี้ที่เดียว (Safari โหมดส่วนตัว throw ทุกการเขียน — ห่อ try/catch ไว้ให้แล้ว)
 */

/** ร่างที่เก่ากว่านี้ถือว่าไม่เกี่ยวกับงานตรงหน้าแล้ว — อ่านเจอเมื่อไหร่ลบทิ้ง */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const VERSION = 1;

/** สิ่งที่ผู้ใช้ "กรอก" เท่านั้น — ห้ามใส่ผลค้นหา/รายการอ้างอิง/สถานะโหลด/สต็อก
 *  (สต็อกต้องสดเสมอ ไม่งั้นกู้ร่างเก่ามาแล้วขายเกินจำนวนที่มีจริง) */
export interface OrderDraftSnapshot {
  // ลูกค้า — เก็บแค่ id แล้วไปดึงตัวจริงตอนกู้ ข้อมูลลูกค้าจะได้ไม่ค้างเป็นของเก่า
  customerId?: string;
  newCustomerMode?: boolean;
  newCustomerName?: string;
  selectedSalesChannelId?: string;

  // รายการสินค้า + ค่าส่ง + หมายเหตุจัดส่งของกล่อง (ทั้งก้อน)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  branchOrders?: any[];

  // ผู้รับ / ที่อยู่จัดส่ง (มาจาก useCustomerPrefill)
  selectedAddressId?: string;
  deliveryName?: string;
  deliveryPhone?: string;
  deliveryEmail?: string;
  deliveryAddress?: string;
  deliveryDistrict?: string;
  deliveryAmphoe?: string;
  deliveryProvince?: string;
  deliveryPostalCode?: string;

  // ข้อมูลภาษี (มาจาก useCustomerPrefill)
  taxInvoiceRequested?: boolean;
  taxType?: 'personal' | 'corporate';
  taxName?: string;
  taxTaxId?: string;
  taxBranch?: string;
  taxAddress?: string;

  // ส่งให้คนอื่น / การ์ดอวยพร
  shipToOther?: boolean;
  giftCardOn?: boolean;
  giftMessage?: string;
  giftTo?: string;
  giftFrom?: string;
  giftHidePrice?: boolean;

  // ส่งเอกสารทางไปรษณีย์
  documentByPost?: boolean;
  documentRecipientName?: string;
  documentRecipientPhone?: string;
  documentAddress?: string;
  documentAddressId?: string;

  // กำหนดส่ง — เก็บเป็น 'YYYY-MM-DD' (Date ผ่าน JSON แล้วกลายเป็นสตริงอยู่ดี)
  deliveryDate?: string | null;
  selectedSlotId?: string;
  zoneOverrideId?: string;

  // ท้ายบิล
  notes?: string;
  internalNotes?: string;
  orderDiscount?: number;
  orderDiscountType?: 'percent' | 'amount';
  expiryMode?: 'days' | 'none';
  expiryDays?: number;

  // บริบทของฟอร์ม
  selectedWarehouseId?: string;
  /** ขั้นของ wizard (จอแคบ) — กลับมาแล้วอยู่ขั้นเดิม */
  step?: number;
}

interface StoredDraft {
  v: number;
  saved_at: string;
  data: OrderDraftSnapshot;
}

/** ร่างเปล่า = ยังไม่ได้กรอกอะไรที่ควรจำ — ไม่เขียน ไม่กู้ ไม่ขึ้น Alert
 *  (ค่า default ของฟอร์มอย่าง expiryDays/giftHidePrice ไม่นับว่า "กรอก") */
export function isDraftEmpty(d: OrderDraftSnapshot | null | undefined): boolean {
  if (!d) return true;
  const hasItems = (d.branchOrders || []).some(b => (b?.products?.length || 0) > 0);
  if (hasItems) return false;
  if (d.customerId || d.newCustomerName?.trim()) return false;
  const texts = [
    d.deliveryName, d.deliveryPhone, d.deliveryEmail, d.deliveryAddress,
    d.notes, d.internalNotes, d.giftMessage, d.giftTo, d.giftFrom,
    d.documentRecipientName, d.documentRecipientPhone, d.documentAddress,
    d.taxName, d.taxTaxId, d.taxAddress,
  ];
  if (texts.some(t => !!t?.trim())) return false;
  if (d.orderDiscount) return false;
  if (d.deliveryDate || d.selectedSlotId || d.zoneOverrideId) return false;
  if (d.shipToOther || d.giftCardOn || d.documentByPost || d.taxInvoiceRequested) return false;
  return true;
}

/** คืน null เมื่อไม่มีร่าง / อ่านไม่ได้ / เก่าเกิน 24 ชม. / เป็นร่างเปล่า (ลบทิ้งให้ด้วย) */
export function readOrderDraft(key: string): { data: OrderDraftSnapshot; savedAt: Date } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft;
    if (!parsed || parsed.v !== VERSION || !parsed.data) { clearOrderDraft(key); return null; }
    const savedAt = new Date(parsed.saved_at);
    if (!Number.isFinite(savedAt.getTime()) || Date.now() - savedAt.getTime() > MAX_AGE_MS) {
      clearOrderDraft(key);
      return null;
    }
    if (isDraftEmpty(parsed.data)) { clearOrderDraft(key); return null; }
    return { data: parsed.data, savedAt };
  } catch {
    return null;
  }
}

/** ร่างเปล่า = ลบทิ้งแทนการเขียน (กันร่างเปล่าไปทับของที่กรอกไว้จริง) */
export function writeOrderDraft(key: string, data: OrderDraftSnapshot): void {
  if (typeof window === 'undefined') return;
  if (isDraftEmpty(data)) { clearOrderDraft(key); return; }
  try {
    const payload: StoredDraft = { v: VERSION, saved_at: new Date().toISOString(), data };
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // โควตาเต็ม / โหมดส่วนตัวของ Safari — ร่างเป็นของแถม ห้ามทำให้ฟอร์มพัง
  }
}

export function clearOrderDraft(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // เงียบไว้ด้วยเหตุผลเดียวกับ writeOrderDraft
  }
}

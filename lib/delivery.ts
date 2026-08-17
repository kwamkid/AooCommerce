// Delivery zones + slots — shared pure logic (client-safe, no supabase import)
// Used by: backend OrderForm, /settings/delivery, and (later) storefront checkout.
//
// Zone = จุดส่ง/โซนค่าส่ง: answers "ส่งถึงไหม + ค่าส่งเท่าไร + ต้องสั่งล่วงหน้าแค่ไหน"
//   fee_type 'fixed'    → fee comes from the zone row (free when subtotal >= free_over)
//   fee_type 'lalamove' → fee is quoted from Lalamove at order time (zone.fee unused);
//                         resolveDeliveryFee returns needsQuote=true and the caller
//                         must obtain/enter the quoted amount.
// Slot = ช่วงเวลาส่ง (2-3 ชม.) — ลูกค้าเลือกได้แค่ "ช่วง" ห้ามมี time picker เลือกนาที
//
// Fee/labels are SNAPSHOTTED onto orders at save time (delivery_zone_label,
// delivery_slot_label/start/end, shipping_fee) — editing a zone/slot later must
// never change what an existing order displays.

export interface DeliveryZone {
  id: string;
  name: string;
  provinces: string[];
  districts: string[];
  postcodes: string[];
  fee_type: 'fixed' | 'lalamove';
  fee: number;
  free_over: number | null;
  lead_minutes: number;
  is_active: boolean;
  sort_order: number;
  /** slot ids allowed for this zone — empty = all slots allowed */
  slot_ids?: string[];
}

export interface DeliverySlot {
  id: string;
  name: string;
  start_time: string;   // 'HH:mm' or 'HH:mm:ss' from Postgres TIME
  end_time: string;
  days_of_week: number[];  // 0=อาทิตย์ … 6=เสาร์
  capacity: number | null;
  cutoff_minutes: number;
  is_active: boolean;
  sort_order: number;
  /** จำนวนออเดอร์ที่จองช่วงนี้แล้วในวันที่ query (จาก API ?date=) */
  booked_count?: number;
}

export interface ZoneMatchInput {
  province?: string | null;
  amphoe?: string | null;    // อำเภอ/เขต — matches zone.districts
  postal_code?: string | null;
}

/**
 * Resolve which zone serves an address. Zones are checked in sort_order;
 * the FIRST active zone that matches wins (narrow zones must be sorted
 * above broad ones — e.g. 'กทม ชั้นใน' by postcode above 'กทม' by province).
 * A zone matches when ANY of its lists contains the address value.
 * Returns null = ไม่รับส่งพื้นที่นั้น — caller must show a clear message,
 * never fail silently.
 */
export function resolveZone(address: ZoneMatchInput, zones: DeliveryZone[]): DeliveryZone | null {
  const postcode = address.postal_code?.trim() || '';
  const district = address.amphoe?.trim() || '';
  const province = address.province?.trim() || '';
  if (!postcode && !district && !province) return null;

  const sorted = [...zones].filter(z => z.is_active).sort((a, b) => a.sort_order - b.sort_order);
  for (const zone of sorted) {
    if (postcode && zone.postcodes.includes(postcode)) return zone;
    if (district && zone.districts.includes(district)) return zone;
    if (province && zone.provinces.includes(province)) return zone;
  }
  return null;
}

export interface DeliveryFeeResult {
  /** ค่าส่งที่คิดได้ — null เมื่อต้องรอ quote (lalamove) */
  fee: number | null;
  /** true = fee ต้องได้จาก Lalamove quote / กรอกเอง */
  needsQuote: boolean;
  /** true = เข้าเงื่อนไขส่งฟรี (fee = 0 เพราะยอดถึง free_over) */
  freeApplied: boolean;
}

export function resolveDeliveryFee(zone: DeliveryZone, subtotal: number): DeliveryFeeResult {
  if (zone.free_over != null && subtotal >= zone.free_over) {
    return { fee: 0, needsQuote: false, freeApplied: true };
  }
  if (zone.fee_type === 'lalamove') {
    return { fee: null, needsQuote: true, freeApplied: false };
  }
  return { fee: zone.fee, needsQuote: false, freeApplied: false };
}

export type SlotUnavailableReason = 'day_off' | 'cutoff' | 'lead' | 'full' | 'zone_excluded' | null;

export interface SlotAvailability {
  available: boolean;
  reason: SlotUnavailableReason;
}

/** 'HH:mm:ss' | 'HH:mm' → minutes since midnight */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Is this slot selectable for the given date? All conditions must pass:
 * 1. วันที่เลือกตรงกับ days_of_week
 * 2. now + zone.lead_minutes < slot END on that date (ส่งทันภายในรอบ)
 * 3. capacity null หรือ booked_count < capacity
 * 4. slot อยู่ใน zone.slot_ids (ว่าง = ใช้ได้ทุก slot)
 *
 * ⚠️ ช่วงที่ไม่ available ต้องแสดงแบบจาง + บอกเหตุผล (เต็มแล้ว/ปิดรับแล้ว)
 * — ห้ามซ่อนหายเงียบๆ
 *
 * @param dateStr วันที่ส่ง 'YYYY-MM-DD' (เวลาไทย)
 * @param now     ปกติ new Date() — parameterized เพื่อ test ได้
 */
export function getSlotAvailability(
  slot: DeliverySlot,
  dateStr: string,
  zone: DeliveryZone | null,
  now: Date = new Date(),
): SlotAvailability {
  // 4) zone restriction (empty slot_ids = all allowed)
  if (zone && zone.slot_ids && zone.slot_ids.length > 0 && !zone.slot_ids.includes(slot.id)) {
    return { available: false, reason: 'zone_excluded' };
  }

  // 1) day of week — construct in local time (both server & users are TH)
  const date = new Date(`${dateStr}T00:00:00`);
  if (!slot.days_of_week.includes(date.getDay())) {
    return { available: false, reason: 'day_off' };
  }

  // 2) เกณฑ์เวลา — ถามว่า "ส่งทันภายในรอบนี้ไหม" ไม่ใช่ "ทันก่อนรอบเริ่มไหม"
  //
  //    ของถึงลูกค้าเร็วสุด = ตอนนี้ + เวลาเตรียม+จัดส่งของโซน (lead_minutes)
  //    ถ้าเวลานั้นยังไม่เลย "เวลาปิดรอบ" ก็ยังส่งทัน เลือกได้
  //
  //    เช่น กทม. lead 2 ชม. · ตอนนี้ 08:00 · รอบ 09:00-12:00
  //         → ของถึง 10:00 ซึ่งอยู่ในรอบ → เลือกได้ (ไม่ต้องรอรอบถัดไป)
  //
  //    lead หน่วยเป็นนาที จึงคุมข้ามวันได้ในค่าเดียว — ต่างจังหวัด 1440 นาที
  //    ทำให้รอบของวันนี้ตกไปเองทั้งหมด เหลือรอบพรุ่งนี้เป็นต้นไป
  const leadMinutes = zone?.lead_minutes || 0;
  const slotEnd = new Date(date);
  slotEnd.setMinutes(timeToMinutes(slot.end_time));
  const arrival = now.getTime() + leadMinutes * 60_000;
  if (arrival >= slotEnd.getTime()) {
    // ไม่มี lead = รอบนี้ผ่านไปแล้วเฉย ๆ · มี lead = ส่งไม่ทันรอบนี้
    return { available: false, reason: leadMinutes > 0 ? 'lead' : 'cutoff' };
  }

  // 3) capacity
  if (slot.capacity != null && (slot.booked_count ?? 0) >= slot.capacity) {
    return { available: false, reason: 'full' };
  }

  return { available: true, reason: null };
}

export const SLOT_UNAVAILABLE_LABELS: Record<Exclude<SlotUnavailableReason, null>, string> = {
  day_off: 'ไม่มีรอบวันนี้',
  cutoff: 'หมดเวลารอบนี้',
  lead: 'ส่งไม่ทันรอบนี้',
  full: 'เต็มแล้ว',
  zone_excluded: 'ไม่มีรอบนี้ในพื้นที่',
};

/** 300 → '5 ชม.' · 1440 → '1 วัน' · 90 → '90 นาที' */
export function formatLeadTime(minutes: number): string {
  if (minutes <= 0) return '';
  if (minutes % 1440 === 0) return `${minutes / 1440} วัน`;
  if (minutes % 60 === 0) return `${minutes / 60} ชม.`;
  return `${minutes} นาที`;
}

/**
 * ข้อความบอกเหตุผลที่เลือกรอบนี้ไม่ได้ — กรณี lead ใส่ระยะเวลาจริงของโซนไปด้วย
 * เพราะ "ส่งไม่ทันรอบนี้" เฉย ๆ ไม่บอกว่าใช้เวลาเท่าไร
 */
export function slotUnavailableLabel(
  reason: SlotUnavailableReason,
  zone?: Pick<DeliveryZone, 'lead_minutes'> | null,
): string | null {
  if (!reason) return null;
  if (reason === 'lead' && zone?.lead_minutes) {
    return `ส่งไม่ทันรอบนี้ (ใช้เวลา ${formatLeadTime(zone.lead_minutes)})`;
  }
  return SLOT_UNAVAILABLE_LABELS[reason];
}

export interface SlotWindow {
  /** เวลาเริ่มที่ส่งได้จริง 'HH:mm' */
  start: string;
  end: string;
  /** true = ถูกหั่นให้สั้นลงเพราะสั่งช้ากว่าเวลาเริ่มรอบ */
  narrowed: boolean;
}

/** ปัดขึ้นเป็นช่วง 30 นาที — ปัดขึ้นเสมอ เพื่อไม่สัญญาเร็วกว่าที่ทำได้จริง */
function ceilToHalfHour(d: Date): Date {
  const out = new Date(d);
  out.setSeconds(0, 0);
  const m = out.getMinutes();
  out.setMinutes(m % 30 === 0 ? m : Math.ceil(m / 30) * 30);
  return out;
}

function toHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * ช่วงเวลาที่ "ส่งได้จริง" ของรอบนี้ = ตัดส่วนที่ผ่านไปแล้วออก
 *
 * รอบ 09:00-12:00 · โซนใช้เวลา 2 ชม. · ตอนนี้ 08:00 → ของถึงเร็วสุด 10:00
 * จึงแสดงเป็น 10:00-12:00 ไม่ใช่ 09:00-12:00 ซึ่งเป็นคำสัญญาที่ทำไม่ได้แล้ว
 *
 * ถ้าสั่งล่วงหน้า (ของถึงก่อนรอบเริ่ม) จะได้ช่วงเต็มตามเดิม narrowed=false
 */
export function getSlotWindow(
  slot: Pick<DeliverySlot, 'start_time' | 'end_time'>,
  dateStr: string,
  zone: Pick<DeliveryZone, 'lead_minutes'> | null,
  now: Date = new Date(),
): SlotWindow {
  const base = new Date(`${dateStr}T00:00:00`);
  const start = new Date(base); start.setMinutes(timeToMinutes(slot.start_time));
  const end = new Date(base); end.setMinutes(timeToMinutes(slot.end_time));

  const arrival = new Date(now.getTime() + (zone?.lead_minutes || 0) * 60_000);
  if (arrival <= start) {
    return { start: formatSlotTime(slot.start_time), end: formatSlotTime(slot.end_time), narrowed: false };
  }
  const rounded = ceilToHalfHour(arrival);
  const effective = rounded < end ? rounded : arrival;   // กันปัดขึ้นจนเลยเวลาปิดรอบ
  return { start: toHHmm(effective), end: formatSlotTime(slot.end_time), narrowed: true };
}

/** '15:00:00' → '15:00' */
export function formatSlotTime(t: string): string {
  return t.slice(0, 5);
}

/** Snapshot label เก็บลง orders.delivery_slot_label เช่น '15:00-18:00 น.' */
export function buildSlotLabel(slot: Pick<DeliverySlot, 'start_time' | 'end_time'>): string {
  return `${formatSlotTime(slot.start_time)}-${formatSlotTime(slot.end_time)} น.`;
}

/** label จากช่วงที่ส่งได้จริง — ใช้ทั้งตอนแสดงและตอน snapshot ลงออเดอร์ */
export function buildWindowLabel(w: SlotWindow): string {
  return `${w.start}-${w.end} น.`;
}

export const DAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;

/** days_of_week → 'ทุกวัน' | 'จ-ศ' style summary for list rows */
export function formatDays(days: number[]): string {
  if (days.length === 7) return 'ทุกวัน';
  if (days.length === 0) return '—';
  return [...days].sort((a, b) => a - b).map(d => DAY_LABELS[d]).join(' ');
}

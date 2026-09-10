// ที่อยู่ + รอบเวลาให้ขนส่งมารับของ Shopee — ตัวแปลล้วน ๆ ไม่แตะ DB ไม่ยิง API
//
// ══════════════════════════════════════════════════════════════════════════
//  ทำไมต้องมีไฟล์นี้: `get_shipping_parameter` คืน **รายการที่อยู่ทั้งหมดของร้าน**
//  (ABC the Baby มี 10 ที่) แต่ของเดิมหยิบ `address_list[0]` ตายตัวแล้วให้พนักงาน
//  เลือกได้แค่รอบเวลา ⇒ **รถไปจอดผิดที่** โดยเฉพาะขนส่งด่วนที่มารับทันที
//
//  กติกาที่ห้ามพัง:
//   • ข้อความที่คนอ่าน (วันนี้/พรุ่งนี้/ช่วงเวลา) **ประกอบที่เบราว์เซอร์เท่านั้น**
//     — Vercel รันเป็น UTC ประกอบที่นี่จะได้วันเพี้ยน จึงส่งแค่ตัวเลขดิบออกไป
//   • ที่อยู่/รอบที่ผู้ใช้เลือกมาต้อง **ตรวจกับรายการจริงเสมอ** ของอาจถูกลบไปแล้ว
//     ระหว่างที่จอเปิดค้าง — ยิงต่อโดยไม่ตรวจ = Shopee ปฏิเสธแบบอ่านไม่ออก
import { pickDefaultAddress } from '@/lib/marketplace/handover';

export { pickDefaultAddress };

export interface ShopeeRawSlot {
  pickup_time_id: string;
  date: number;
  time_text?: string;
  flags?: string[];
}

export interface ShopeeRawAddress {
  address_id: number;
  region?: string;
  state?: string;
  city?: string;
  district?: string;
  town?: string;
  address?: string;
  zipcode?: string;
  address_flag?: string[];
  time_slot_list?: ShopeeRawSlot[] | null;
}

export interface ShopeeShippingParams {
  info_needed?: { pickup?: string[]; dropoff?: string[]; non_integrated?: string[] };
  pickup?: { address_list?: ShopeeRawAddress[] | null };
  dropoff?: { branch_list?: Array<{ branch_id: number }> | null };
}

/** รอบเวลาในรูปที่ส่งให้ client — ข้อความที่คนอ่านประกอบฝั่งเบราว์เซอร์ (เขตเวลาผู้ใช้) */
export interface PickupSlotRow {
  pickup_time_id: string;
  date: number;
  time_text?: string;
  recommended: boolean;
}

export interface PickupAddressRow {
  address_id: number;
  label: string;
  detail: string;
  flags: string[];
  last_used: boolean;
  time_slots: PickupSlotRow[];
}

/**
 * ที่อยู่หนึ่งใบ → 2 บรรทัดที่คนอ่านแล้วแยกออกว่าคนละที่
 * บรรทัดแรกคือที่อยู่ตามที่ร้านพิมพ์ไว้ · บรรทัดรองเติมเฉพาะส่วนที่ยังไม่ได้อยู่ในบรรทัดแรก
 * (ไม่งั้นจะได้ "…แขวงแสมดำ แขวงแสมดำ เขตบางขุนเทียน" ซ้ำกันจนอ่านยาก)
 */
export function formatShopeeAddress(a: ShopeeRawAddress): { label: string; detail: string } {
  const parts = [a.district, a.city, a.state, a.zipcode].map(p => (p || '').trim()).filter(Boolean);
  const written = (a.address || '').trim();
  const label = written
    || [a.district, a.city].map(p => (p || '').trim()).filter(Boolean).join(' ')
    || `ที่อยู่ #${a.address_id}`;
  const detail = parts.filter(p => !label.includes(p)).join(' ');
  return { label, detail };
}

export function toPickupAddressRows(
  list: ShopeeRawAddress[],
  rememberedAddressId?: number | null,
): PickupAddressRow[] {
  return (list || []).map(a => {
    const { label, detail } = formatShopeeAddress(a);
    return {
      address_id: a.address_id,
      label,
      detail,
      flags: a.address_flag || [],
      last_used: rememberedAddressId != null && a.address_id === rememberedAddressId,
      time_slots: (a.time_slot_list || []).map(s => ({
        pickup_time_id: String(s.pickup_time_id),
        date: s.date,
        recommended: !!s.flags?.includes('recommended'),
        ...(s.time_text ? { time_text: s.time_text } : {}),
      })),
    };
  });
}

/** รอบที่ Shopee แนะนำ (ของออกเร็วสุด) → ไม่มีก็เอารอบแรก */
export function pickDefaultSlot(slots: PickupSlotRow[]): PickupSlotRow | undefined {
  return slots.find(s => s.recommended) || slots[0];
}

export type PickupChoice =
  | { kind: 'ready'; address_id: number; pickup_time_id: string }
  | { kind: 'needs_choice' }
  | { kind: 'invalid'; error: string };

/**
 * ตัดสินว่าออเดอร์ใบนี้ยิงได้เลย / ต้องให้คนเลือกก่อน / เลือกมาแล้วแต่ใช้ไม่ได้
 *
 * ⚠️ **มีที่อยู่มากกว่า 1 = ต้องถามเสมอ** แม้ทุกที่จะมีรอบเดียวกัน — เพราะ "ที่ไหน"
 * เป็นคำถามที่เดาแทนคนไม่ได้ (ที่อยู่ค่าเริ่มต้นของ Shopee ไม่ใช่ที่ที่ของอยู่จริงเสมอไป)
 */
export function resolvePickupChoice(
  list: ShopeeRawAddress[],
  opts: {
    selection?: { address_id?: number; pickup_time_id?: string } | null;
    rememberedAddressId?: number | null;
  },
): PickupChoice {
  if (!list || list.length === 0) {
    return { kind: 'invalid', error: 'ไม่พบที่อยู่รับพัสดุ กรุณาตั้งค่าใน Shopee Seller Center' };
  }

  const rows = toPickupAddressRows(list, opts.rememberedAddressId);
  const selection = opts.selection;

  // ผู้ใช้ระบุที่อยู่มา — ต้องยังอยู่ในรายการจริง
  if (selection && typeof selection.address_id === 'number') {
    const row = rows.find(r => r.address_id === selection.address_id);
    if (!row) {
      return { kind: 'invalid', error: 'ที่อยู่รับพัสดุที่เลือกไม่อยู่ในรายการของร้านแล้ว กรุณาเลือกใหม่' };
    }
    if (row.time_slots.length === 0) {
      // ช่องทางนี้ไม่มีรอบให้เลือก — Shopee จัดให้เอง
      return { kind: 'ready', address_id: row.address_id, pickup_time_id: '' };
    }
    const slot = row.time_slots.find(s => s.pickup_time_id === (selection.pickup_time_id || ''));
    if (!slot) return { kind: 'invalid', error: 'รอบเวลาที่เลือกไม่มีแล้ว กรุณาเลือกใหม่' };
    return { kind: 'ready', address_id: row.address_id, pickup_time_id: slot.pickup_time_id };
  }

  const fallback = pickDefaultAddress(rows)!;

  // ระบุมาแต่รอบเวลา (ไม่ได้บอกที่อยู่) — ใช้ที่อยู่ตั้งต้น แล้วรอบต้องมีจริง
  if (selection && selection.pickup_time_id) {
    const slot = fallback.time_slots.find(s => s.pickup_time_id === selection.pickup_time_id);
    if (!slot) return { kind: 'invalid', error: 'รอบเวลาที่เลือกไม่มีแล้ว กรุณาเลือกใหม่' };
    return { kind: 'ready', address_id: fallback.address_id, pickup_time_id: slot.pickup_time_id };
  }

  // ไม่ได้เลือกอะไรมาเลย
  if (list.length > 1 || fallback.time_slots.length > 1) return { kind: 'needs_choice' };

  return {
    kind: 'ready',
    address_id: fallback.address_id,
    pickup_time_id: pickDefaultSlot(fallback.time_slots)?.pickup_time_id || '',
  };
}

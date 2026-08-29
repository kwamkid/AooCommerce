// การส่งมอบของให้ขนส่ง — ภาษากลางของทุก marketplace (client-safe)
//
// ══════════════════════════════════════════════════════════════════════════
//  หลักการ: **อย่าถามตามแพลตฟอร์ม ให้ถามตามคำถาม**
// ══════════════════════════════════════════════════════════════════════════
//  พนักงานไม่ควรต้องรู้ว่าออเดอร์นี้มาจากที่ไหนถึงจะกดรับเป็น — สิ่งเดียวที่เขาต้องตอบคือ
//  "ของออกจากร้านยังไง" ซึ่งมีแค่ 2 คำตอบที่คนทำงานเข้าใจ:
//    • ขนส่งมารับที่ร้าน  → บางเจ้าต้องเลือกรอบเวลาด้วย
//    • เอาไปส่งเองที่จุดรับ → ไม่ต้องตอบอะไรเพิ่ม
//
//  ของจริงหลังบ้านต่างกันมาก:
//    Shopee — PICKUP (ต้องเลือกรอบ) / DROPOFF (เลือกสาขาให้เอง) / NON_INTEGRATED (กรอกเลขพัสดุ)
//    TikTok — PICKUP (ต้องเลือกรอบ) / DROP_OFF (ไม่ต้องตอบ)
//    Lazada — dropship อย่างเดียว ไม่มีอะไรให้เลือก
//  ความต่างพวกนี้ **ต้องไม่โผล่ไปถึงหน้าจอ** — แปลงให้จบตรงนี้

/** สิ่งที่ออเดอร์นี้ยังขาดก่อนจะส่งได้ — ถ้าเป็น 'none' คือกดส่งได้เลย ไม่ต้องถามใคร */
export type HandoverNeed = 'pickup_slot' | 'none';

/**
 * รอบเวลาให้ขนส่งมารับ ในรูปแบบที่ TimeSlotPickerPanel ใช้
 * (รูปนี้มาจาก Shopee ก่อน — เจ้าอื่นแปลงเข้ามาให้ตรง จะได้ใช้จอเดียวกัน)
 */
export interface HandoverSlot {
  pickup_time_id: string;
  date: number;
  display: string;
  recommended: boolean;
}

/**
 * TikTok บอกรอบเวลาเป็นช่วง unix (start/end) ไม่มี id ให้
 * → ประกอบ id เองจากช่วงเวลา แล้วถอดกลับตอนจะส่งจริง
 * รูปแบบ: `<start>:<end>` — ทั้งคู่เป็นวินาที
 */
export function encodeTikTokSlotId(startTime: number, endTime: number): string {
  return `${startTime}:${endTime}`;
}

export function decodeTikTokSlotId(id: string): { start_time: number; end_time: number } | null {
  const [a, b] = id.split(':');
  const start = Number(a);
  const end = Number(b);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start_time: start, end_time: end };
}

/** "จ. 1 ก.ย. 09:00–12:00" — อ่านแล้วรู้เลยว่าต้องอยู่รอของตอนไหน */
export function formatSlotRange(startSec: number, endSec: number): string {
  const start = new Date(startSec * 1000);
  const end = new Date(endSec * 1000);
  const day = start.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  const t = (d: Date) => d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${t(start)}–${t(end)}`;
}

/** แปลงรอบเวลาของ TikTok ให้อยู่ในรูปที่จอเดียวกันใช้ได้ */
export function toHandoverSlots(
  slots: { start_time: number; end_time: number }[]
): HandoverSlot[] {
  return slots.map((s, i) => ({
    pickup_time_id: encodeTikTokSlotId(s.start_time, s.end_time),
    date: s.start_time,
    display: formatSlotRange(s.start_time, s.end_time),
    // รอบแรกสุดคือรอบที่ของออกเร็วที่สุด — แนะนำตัวนั้น (Shopee ก็ใช้เกณฑ์นี้)
    recommended: i === 0,
  }));
}

/** ปลายทางที่ต้องยิงเมื่อกดรับออเดอร์ของแต่ละที่ */
export const ACCEPT_ENDPOINTS: Record<string, string> = {
  shopee: '/api/shopee/orders/bulk-ship',
  tiktok: '/api/tiktok/orders/ship',
  lazada: '/api/lazada/orders/ship',
};

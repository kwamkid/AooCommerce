// Path: app/marketing/broadcast/new/components/types.ts
//
// ชนิดข้อมูลที่หน้าสร้างบรอดแคสต์กับการ์ดย่อยใช้ร่วมกัน — **หน้าเป็นเจ้าของ state ทั้งหมด**
// การ์ดย่อยรับค่าเข้ามาแล้วคืนค่าที่ผู้ใช้เปลี่ยนกลับไป ไม่เก็บ state ของตัวเอง
// (ยกเว้นเรื่องที่เป็นแค่การแสดงผล เช่นกางเหตุผลของช่องทางที่ยังส่งไม่ได้)

import type { BroadcastPlatform } from '@/lib/broadcast/platforms';

/** บัญชีต้นทางหนึ่งใบ — LINE/FB/IG มาจาก chat_accounts ส่วน marketplace มาจากร้าน */
export interface BroadcastAccount {
  id: string;
  platform: BroadcastPlatform;
  name: string;
  /** รูปโปรไฟล์ของช่องทาง (รูป OA / รูปเพจ / โลโก้ร้าน) — ไม่มีก็ตกไปใช้ไอคอนแพลตฟอร์ม */
  picture_url: string | null;
}

export interface TagRow { id: string; name: string; color: string }

/** ผู้ติดต่อที่เลือกเอง — `name` ว่างได้เมื่อคัดลอกใบเก่ามา (รู้แค่ id) */
export interface PickedContact { id: string; name: string }

export interface QuotaInfo {
  type: 'none' | 'limited' | 'unknown';
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface FollowerStats {
  /** คนที่ยิงถึงได้จริง — ตรงกับเลข "เพื่อน" ใน LINE OA Manager */
  reachable: number | null;
  /** ยอดสะสมที่เคยกดแอด (ไม่ลดเมื่อบล็อก) */
  total_adds: number | null;
  blocks: number | null;
}

export interface PreviewInfo {
  recipient_count: number;
  known_contact_count: number;
  quota: QuotaInfo | null;
  follower_stats: FollowerStats | null;
  window_days: number | null;
  /** ผู้ติดต่อทั้งหมด / ที่ผูกกับข้อมูลลูกค้าแล้ว — บอกว่าเรารู้ประวัติการซื้อของกี่คน */
  contact_total?: number;
  contact_linked?: number;
}

export interface PerAccountPreview {
  account: BroadcastAccount;
  info: PreviewInfo;
}

/** จำนวนคนของแต่ละกลุ่มผู้รับ — ค่า null = ตอบไม่ได้ (โชว์ '—' ห้ามเดาเป็น 0) */
export interface AudienceCounts {
  counts: Record<string, number | null>;
  /** null = ช่องทางนี้ไม่มีแนวคิด "ผู้ติดต่อ" (marketplace) — ตกไปใช้ค่าจาก /preview แทน */
  contact_total?: number | null;
  contact_linked?: number | null;
  days?: number;
}

// Path: app/marketing/broadcast/new/components/types.ts
//
// ชนิดข้อมูลที่หน้าสร้างบรอดแคสต์กับการ์ดย่อยใช้ร่วมกัน — **หน้าเป็นเจ้าของ state ทั้งหมด**
// การ์ดย่อยรับค่าเข้ามาแล้วคืนค่าที่ผู้ใช้เปลี่ยนกลับไป ไม่เก็บ state ของตัวเอง
// (ยกเว้นเรื่องที่เป็นแค่การแสดงผล เช่นกางเหตุผลของช่องทางที่ยังส่งไม่ได้)

import type { BroadcastPlatform } from '@/lib/broadcast/platforms';

// ย้ายไปอยู่ที่ทะเบียนกลุ่มผู้รับกลาง — หน้ากลุ่มเป้าหมายโฆษณาใช้ชุดเดียวกัน จึงต้องไม่ผูก
// อยู่กับโฟลเดอร์ของหน้าสร้างบรอดแคสต์ (re-export ไว้ให้การ์ดย่อยที่ import จากที่นี่ใช้ได้เหมือนเดิม)
export type { TagRow, PickedContact, AudienceCounts } from '@/lib/broadcast/audience';

/** บัญชีต้นทางหนึ่งใบ — LINE/FB/IG มาจาก chat_accounts ส่วน marketplace มาจากร้าน */
export interface BroadcastAccount {
  id: string;
  platform: BroadcastPlatform;
  name: string;
  /** รูปโปรไฟล์ของช่องทาง (รูป OA / รูปเพจ / โลโก้ร้าน) — ไม่มีก็ตกไปใช้ไอคอนแพลตฟอร์ม */
  picture_url: string | null;
}

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

// Path: app/marketing/audiences/components/types.ts
//
// ชนิดข้อมูลของหน้า "กลุ่มเป้าหมาย" — **สำเนาฝั่ง client ของรูปที่ API ตอบ**
//
// ⛔ ห้าม import จาก `lib/audiences/resolve.ts` — ไฟล์นั้นแตะ supabaseAdmin (service role)
//    ลากเข้า client bundle เมื่อไหร่ = คีย์หลุดออกไปอยู่ในหน้าเว็บ · ที่นี่จึงประกาศซ้ำ
//    ให้ตรงกับ `AudienceView` / `AudienceSyncView` / `AudienceSourceView` ของฝั่งเซิร์ฟเวอร์
//
// หน้าเป็นเจ้าของ state ทั้งหมด การ์ดย่อยรับค่าเข้ามาแล้วคืนกลับ (แบบเดียวกับหน้าสร้างบรอดแคสต์)

import type { StoredAudienceFilter } from '@/lib/broadcast/audience';

/** ช่องทางแชทที่ดึงผู้ติดต่อมาทำกลุ่มเป้าหมายได้ — ตรงกับ validateAudienceDefinition */
export type AudienceChatPlatform = 'line' | 'facebook';

export type AudienceSource =
  | { kind: 'chat'; platform: AudienceChatPlatform; chat_account_id: string }
  | { kind: 'customers' };

export interface AudienceDefinition {
  audience_type: string;
  audience_filter: StoredAudienceFilter;
  sources: AudienceSource[];
}

export interface AudienceSourceView {
  kind: 'chat' | 'customers';
  platform?: AudienceChatPlatform;
  chat_account_id?: string;
  name: string;
  picture_url?: string | null;
}

/** สถานะการซิงก์ที่ API ส่งมา — ค่าอื่นที่ไม่รู้จักให้ตกไปเป็น "รอ sync" ห้ามพัง */
export type AudienceSyncStatus = 'pending' | 'syncing' | 'synced' | 'error' | 'tos_required';

/** ตัวเลขรอบล่าสุด — ทุกช่องอาจไม่มี (รอบแรกยังไม่เคยรัน) ห้ามเดาเป็น 0 ตอนแสดงผล */
export interface AudienceSyncCounts {
  total?: number;
  with_phone?: number;
  with_email?: number;
  with_psid?: number;
  not_syncable?: number;
  uploaded?: number;
  removed?: number;
  psid_failed?: number;
}

export interface AudienceSyncView {
  id: string;
  ad_account_id: string;
  ad_account_name: string | null;
  external_audience_id: string | null;
  status: AudienceSyncStatus | string;
  auto_sync: boolean;
  last_sync_at: string | null;
  next_sync_at: string | null;
  last_counts: AudienceSyncCounts;
  /** ขนาดที่ Meta ประเมิน — เป็นช่วงเสมอ (Meta ไม่บอกเลขเป๊ะ) */
  approx_size_lower: number | null;
  approx_size_upper: number | null;
  error: string | null;
}

export interface AudienceView {
  id: string;
  name: string;
  description: string | null;
  definition: AudienceDefinition;
  member_count: number | null;
  member_count_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  sources: AudienceSourceView[];
  syncs: AudienceSyncView[];
}

/** ผลของ POST /api/audiences/preview-count */
export interface AudiencePreview {
  total: number;
  /** จับคู่ได้กี่คน แยกตามตัวจับคู่ — `any` คือตัวที่ตัดสินว่ากลุ่มนี้ยิงโฆษณาได้จริงไหม */
  reachable: { phone: number; email: number; psid: number; any: number };
  not_syncable: number;
  /** ชนเพดาน 50,000 คน — ต้องทำให้แคบลงก่อน */
  capped: boolean;
  by_source?: {
    kind: 'chat' | 'customers';
    /** จัดกลุ่มต่อแพลตฟอร์ม (เพจ Facebook 3 เพจ = แถวเดียว) — ไม่มีเมื่อ kind = customers */
    platform?: string;
    label: string;
    total: number;
    syncable: number;
  }[];
}

/** บัญชีแชทหนึ่งใบที่ใช้เป็นแหล่งที่มาได้ (มาจาก /api/chat-accounts — เฉพาะ line/facebook ที่เปิดอยู่) */
export interface ChatSourceAccount {
  id: string;
  platform: AudienceChatPlatform;
  name: string;
  picture_url: string | null;
}

/** คีย์ของแหล่ง "ลูกค้าในระบบ" ในรายการติ๊กเลือก — ไม่ใช่ id ของแถวไหน จึงต้องมีค่าคงที่ */
export const CUSTOMERS_SOURCE_KEY = 'customers';

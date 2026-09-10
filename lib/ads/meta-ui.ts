// Path: lib/ads/meta-ui.ts
// ชนิดข้อมูล + ป้ายชื่อ + ลิงก์ของหน้า "บัญชีโฆษณา" — **client-safe เท่านั้น**
// (ไม่มี token ไม่มี supabaseAdmin ไม่ยิง Graph API — import จาก component ได้)
//
// ⚠️ อย่าสับสนกับ `lib/meta/ads.ts` ซึ่งเป็นตัวคุย Marketing API ฝั่งเซิร์ฟเวอร์
// ไฟล์นี้คือ "สิ่งที่หน้าจอต้องรู้" เท่านั้น — รูปร่างที่ API ตอบกลับมา และคำที่ผู้ใช้เห็น

/** สิทธิ์ที่ต้องขอตอนล็อกอิน Facebook เพื่อจัดการบัญชีโฆษณา — ขาดตัวใดตัวหนึ่ง sync กลุ่มเป้าหมายไม่ได้ */
export const META_ADS_SCOPES = 'ads_management,ads_read,business_management';

export const META_EVENTS_MANAGER_URL = 'https://business.facebook.com/events_manager2';
export const META_ADS_MANAGER_URL = 'https://adsmanager.facebook.com';

/** ที่มาของ token — บอกผู้ใช้ว่าต่ออายุยังไง (login ใหม่ vs ไปสร้าง token ใบใหม่เอง) */
export const TOKEN_SOURCE_LABEL: Record<'oauth' | 'manual', string> = {
  oauth: 'Login Facebook',
  manual: 'token ที่กรอกเอง',
};

/** หน้ายอมรับข้อกำหนด Custom Audience ของบัญชีโฆษณานั้น — Meta บังคับก่อนสร้างกลุ่มแรก */
export function customAudienceTosUrl(externalId: string): string {
  return `https://business.facebook.com/ads/manage/customaudiences/tos/?act=${stripActPrefix(externalId)}`;
}

/** 'act_123' → '123' — ผู้ใช้คัดลอกมาจาก Ads Manager ได้ทั้งสองแบบ ต้องรับให้ทั้งคู่ */
export function stripActPrefix(v: string): string {
  return v.trim().replace(/^act_/i, '');
}

// ─── รูปร่างที่ API ตอบ (app/api/ads/**) ────────────────────────────────

export interface AdAccountView {
  id: string;
  platform: 'meta';
  external_id: string;
  name: string | null;
  business_id: string | null;
  business_name: string | null;
  currency: string | null;
  dataset_id: string | null;
  dataset_name: string | null;
  token_source: 'oauth' | 'manual';
  token_expires_at: string | null;
  status: 'active' | 'token_expired' | 'error';
  last_error: string | null;
  last_checked_at: string | null;
  /** ตรวจครั้งล่าสุดที่ยิง event ได้จริง — null = ยังไม่เคยตรวจ (ห้ามอ่านว่า "พัง") */
  capi_ok_at: string | null;
  audiences_ok_at: string | null;
  metadata: {
    include_flow_types?: string[];
    test_event_code?: string | null;
    /** dataset เดียวกับที่เพจ Messenger ใช้ — Meta ตัด event ซ้ำด้วย event_id ให้เอง */
    same_as_page_dataset?: boolean;
    audiences_error?: string | null;
    tos_required?: boolean;
    token_debug?: 'unavailable' | null;
    scopes?: string[];
  };
  is_active: boolean;
  created_at: string;
  access_token_masked: string | null;
  events_7d: { sent: number; failed: number };
}

/** ผลตรวจการเชื่อมต่อ — 3 ข้อแยกกัน เพราะ token บางใบส่ง event ได้แต่ sync กลุ่มไม่ได้ */
export interface AdAccountProbe {
  token_ok: boolean;
  capi_ok: boolean;
  audiences_ok: boolean;
  tos_required: boolean;
  dataset: { id: string; name: string | null } | null;
  errors: string[];
  checked_at: string;
}

/** บัญชีโฆษณาที่ Facebook คืนมาหลังล็อกอิน — ยังไม่ได้บันทึกลงระบบ */
export interface MetaOauthAccount {
  account_id: string;
  name: string;
  currency: string | null;
  account_status: number | null;
  business: { id: string; name: string } | null;
  datasets: { id: string; name: string }[];
  already_connected: boolean;
}

export interface AdEventRow {
  id: string;
  event_name: string;
  destination: 'page_dataset' | 'ad_dataset';
  destination_id: string;
  destination_name: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  event_time: string;
  sent_at: string | null;
  error: string | null;
  order_id: string | null;
  order_number: string | null;
  contact_platform: string | null;
  contact_id: string | null;
}

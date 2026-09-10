// Path: lib/ads/types.ts
//
// ชนิดข้อมูลกลางของสาย "ส่ง conversion ขึ้นแพลตฟอร์มโฆษณา" — **ไม่มี import ฝั่ง node**
// (นอกจาก type ของ capi.ts ซึ่ง pure ทั้งไฟล์) เพื่อให้ทั้ง adapter · ledger · dispatch
// พูดภาษาเดียวกันโดยไม่มีใครต้อง import ตัวจริงของอีกฝั่ง
//
// แนวคิด: **subject = "เหตุการณ์หนึ่งใบที่ยังไม่ผูกกับปลายทาง"** — ประกอบครั้งเดียวจากออเดอร์
// แล้วส่งให้ทุกบัญชีโฆษณาของบริษัทนั้นยิงต่อ · ปลายทางแต่ละเจ้าแปลงเป็นรูปของตัวเองใน adapter
// ⇒ เพิ่มแพลตฟอร์มใหม่ (TikTok Events API ฯลฯ) = เขียน adapter ใหม่ตัวเดียว ไม่ต้องแตะสายหลัก

import type { CapiActionSource } from '@/lib/meta/capi';

/** event ที่ระบบนี้รู้จัก — Purchase ใช้จริงแล้ว อีกสองตัวเป็นของ Phase 3 */
export type ConversionEventName = 'Purchase' | 'InitiateCheckout' | 'QualifiedLead';

/** แถวใน `ad_accounts` — token อยู่ในนี้ **ห้ามส่งออกทาง API ตรง ๆ** (ใช้ toAdAccountView) */
export interface AdAccountRow {
  id: string;
  company_id: string;
  platform: 'meta';
  /** ad account id ตัวเลข ไม่มี 'act_' */
  external_id: string;
  name: string | null;
  business_id: string | null;
  business_name: string | null;
  currency: string | null;
  dataset_id: string | null;
  dataset_name: string | null;
  access_token: string | null;
  token_source: 'oauth' | 'manual';
  token_expires_at: string | null;
  status: 'active' | 'token_expired' | 'error';
  last_error: string | null;
  last_checked_at: string | null;
  capi_ok_at: string | null;
  audiences_ok_at: string | null;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

/** คอลัมน์ของ `orders` เท่าที่สายนี้ต้องใช้ — อ่านครั้งเดียวแล้วส่งต่อทุกที่ */
export interface OrderForConversion {
  id: string;
  company_id: string;
  order_number: string | null;
  customer_id: string | null;
  total_amount: number | string | null;
  payment_status: string | null;
  order_status: string | null;
  source: string | null;
  marketplace_account_id: string | null;
  flow_type: string | null;
  chat_platform: string | null;
  chat_contact_id: string | null;
  chat_account_id: string | null;
  updated_at: string | null;
}

/**
 * เหตุการณ์หนึ่งใบที่พร้อมส่ง — ยังไม่รู้ว่าจะไปปลายทางไหน
 * (`contact` ใส่เฉพาะสายที่ยิงเข้า dataset ของเพจ ซึ่งต้องมี PSID · สายบัญชีโฆษณาไม่ใช้)
 */
export interface ConversionSubject {
  companyId: string;
  eventName: ConversionEventName;
  /** Meta dedupe ด้วยค่านี้ — ใส่ order id ไปเลย ยิงซ้ำก็นับครั้งเดียว */
  eventId: string;
  /** unix **วินาที** */
  eventTime: number;
  actionSource: CapiActionSource;
  order: OrderForConversion | null;
  customer: { id: string; phone: string | null; email: string | null } | null;
  contact: {
    platform: 'facebook';
    contactId: string;
    psid: string;
    pageId: string;
    chatAccountId: string;
  } | null;
  customData: Record<string, unknown>;
}

/** ผลของการยิงหนึ่งใบไปหนึ่งปลายทาง — `skipped` = ตั้งใจไม่ยิง ไม่ใช่ล้มเหลว */
export type AdSendStatus = 'sent' | 'failed' | 'skipped';

export interface AdSendOutcome {
  status: AdSendStatus;
  httpStatus?: number;
  error?: string;
  response?: unknown;
  /** เหตุผลที่ข้าม — โผล่ในผลลัพธ์ของ dispatch ให้คนอ่านออกว่าทำไมเงียบ */
  reason?: string;
}

/**
 * ตัวแปลง subject → คำขอของแพลตฟอร์มนั้น — **ห้าม throw** คืน outcome เสมอ
 * (ผู้เรียกอยู่หลังการบันทึกเงินสำเร็จแล้ว งานนี้ล้มต้องไม่ลากอะไรล้มตาม)
 */
export interface AdPlatformAdapter {
  platform: 'meta';
  send(subject: ConversionSubject, account: AdAccountRow): Promise<AdSendOutcome>;
}

export interface SweepCounts {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

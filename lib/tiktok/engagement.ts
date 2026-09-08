// Customer Engagement API ของ TikTok Shop — "ส่งข้อความการตลาดหาลูกค้าเก่าเป็นชุด"
//
// คนละเรื่องกับ customer_service (แชทตอบทีละห้อง) — ตัวนี้ TikTok ทำมาเพื่องานการตลาด
// โดยเฉพาะ: สร้าง "task" (แคมเปญ) หนึ่งใบ แล้วยิงข้อความของ task นั้นหาผู้ซื้อทีละชุด
// และถามยอดอ่าน/ยอดสั่งซื้อกลับได้
//
// ⚠️ **ส่งได้เฉพาะผู้ซื้อที่มีออเดอร์กับร้านภายใน 365 วัน** และระบุตัวผู้รับด้วย
// `buyer_email` ซึ่งเป็น **อีเมลนิรนามของ TikTok** (`...@scs2.tiktok.com`) ที่ติดมากับ
// ออเดอร์ ไม่ใช่อีเมลจริงของลูกค้า — เราเก็บไว้ที่ `orders.external_data->>'buyer_email'`
//
// ⚠️ **มีสองด่านที่ต้องผ่าน ไม่ใช่ด่านเดียว**
//   1. **app** ต้องได้ scope Customer Engagement ใน Partner Center แล้ว re-authorize ร้าน
//      (ไม่มี = ทุก endpoint ตอบ 105005 access denied ตั้งแต่ตัวแรก)
//   2. **ร้าน** ต้องได้สิทธิ์ฟีเจอร์จาก TikTok — `getEngagementPermissions()` คืน
//      `FUNDAMENTAL` (เงื่อนไขตั้งต้นของทุกอย่าง) กับ `CUSTOM_MSG` (เขียนข้อความเอง)
//      ไม่มี CUSTOM_MSG = ส่งได้เฉพาะข้อความสำเร็จรูปจาก `message_templates`
// เช็คทั้งสองด่านได้ด้วย `node scripts/check-tiktok-engagement.mjs`

import { tiktokApiRequest, type TikTokCredentials } from './api';

/** ฟีเจอร์ที่ร้านได้รับสิทธิ์ — ชื่อตามที่ TikTok ส่งกลับมา */
export interface TikTokEngagementPermissions {
  /** ใช้ API กลุ่มนี้ได้เลยไหม (เงื่อนไขตั้งต้นของทุกฟีเจอร์) */
  fundamental: boolean;
  /** เขียนข้อความเองได้ไหม (ไม่ได้ = ต้องใช้ข้อความสำเร็จรูปของ TikTok) */
  customMsg: boolean;
  /** ชื่อฟีเจอร์ทั้งหมดที่ตอบกลับมา เผื่อ TikTok เพิ่มตัวใหม่ */
  raw: { name: string; is_authorized: boolean }[];
}

export async function getEngagementPermissions(
  creds: TikTokCredentials,
): Promise<{ permissions: TikTokEngagementPermissions | null; error?: string }> {
  const res = await tiktokApiRequest(creds, 'GET', '/customer_engagement/202502/permissions');
  if (res.error) return { permissions: null, error: res.error };

  const features = ((res.data as { features?: { name: string; is_authorized: boolean }[] })?.features) || [];
  const on = (name: string) => features.some(f => f.name === name && f.is_authorized);
  return {
    permissions: { fundamental: on('FUNDAMENTAL'), customMsg: on('CUSTOM_MSG'), raw: features },
  };
}

export interface CreateEngagementTaskInput {
  /** uuid v4 — **ต้องจดลง DB ก่อนยิง** กดซ้ำแล้วจะได้ task เดิมไม่ใช่ใบใหม่ */
  idempotencyKey: string;
  taskName: string;
  title: string;
  body: string;
  /** วินาที (unix) — task หมดอายุแล้วส่งข้อความเพิ่มไม่ได้ TikTok บังคับให้ใส่ */
  endTime: number;
  /** การ์ดสินค้าในข้อความ (สูงสุด 4) — id ของฝั่ง TikTok ไม่ใช่ของเรา */
  productIds?: string[];
  /** คูปอง (สูงสุด 1) */
  couponIds?: string[];
}

export async function createCustomEngagementTask(
  creds: TikTokCredentials,
  input: CreateEngagementTaskInput,
): Promise<{ taskId: string | null; error?: string; rateLimited?: boolean }> {
  const body: Record<string, unknown> = {
    channel: 'TIKTOK_IM', // ค่าเดียวที่ TikTok รองรับตอนนี้
    task_name: input.taskName,
    custom_message: { title: input.title, body: input.body },
    end_time: input.endTime,
  };
  if (input.productIds?.length) body.product_ids = input.productIds;
  if (input.couponIds?.length) body.coupon_ids = input.couponIds;

  const res = await tiktokApiRequest(
    creds,
    'POST',
    '/customer_engagement/202502/engagement_tasks/custom',
    { idempotency_key: input.idempotencyKey },
    body,
  );
  if (res.error) return { taskId: null, error: res.error, rateLimited: res.rate_limited };

  const taskId = (res.data as { task_id?: string })?.task_id || null;
  if (!taskId) return { taskId: null, error: 'TikTok ไม่ได้คืน task_id กลับมา' };
  return { taskId };
}

export interface SendEngagementResult {
  /** อีเมลที่ TikTok ปฏิเสธ พร้อมเหตุผล — ที่ไม่อยู่ในนี้ถือว่าส่งสำเร็จ */
  failed: { email: string; message: string }[];
  error?: string;
  rateLimited?: boolean;
}

/**
 * ยิงข้อความของ task หนึ่งใบให้ผู้ซื้อชุดหนึ่ง
 *
 * ⚠️ **ไม่มี idempotency key ระดับข้อความ** (ต่างจาก LINE ที่มี X-Line-Retry-Key) —
 * ถ้าฟังก์ชันตายหลังยิงสำเร็จแต่ก่อนบันทึกสถานะล็อต การกด "ส่งต่อ" จะส่งล็อตนั้นซ้ำ
 * จึงต้อง **ล็อตเล็ก + บันทึกสถานะทันทีที่ยิงเสร็จ** เพื่อบีบช่องนั้นให้แคบที่สุด
 */
export async function sendEngagementMessages(
  creds: TikTokCredentials,
  taskId: string,
  buyerEmails: string[],
): Promise<SendEngagementResult> {
  const res = await tiktokApiRequest(
    creds,
    'POST',
    '/customer_engagement/202412/messages',
    {},
    { task_id: taskId, buyer_emails: buyerEmails },
  );
  if (res.error) return { failed: [], error: res.error, rateLimited: res.rate_limited };

  const errors = ((res.data as {
    errors?: { code?: number; message?: string; detail?: { buyer_email?: string } }[];
  })?.errors) || [];

  return {
    failed: errors
      .map(e => ({ email: e.detail?.buyer_email || '', message: e.message || `error ${e.code}` }))
      .filter(e => e.email),
  };
}

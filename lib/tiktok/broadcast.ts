// ตัวส่งบรอดแคสต์ฝั่ง TikTok Shop — Customer Engagement API
//
// โครงเดียวกับ [lib/line/broadcast.ts](../line/broadcast.ts): หั่นผู้รับเป็นล็อต จดแผนล็อต
// ลง DB ก่อนยิงใบแรก แล้วเดินจากสถานะที่บันทึกไว้ — **กด "ส่งต่อ" ซ้ำได้เสมอ**
//
// ต่างจาก LINE 3 อย่างที่ต้องรู้:
//  1. ผู้รับคือ **`buyer_email` จากออเดอร์** ไม่ใช่ผู้ติดตาม — ส่งได้เฉพาะคนที่เคยสั่งใน 365 วัน
//  2. ต้องสร้าง **task (แคมเปญ)** ก่อนหนึ่งใบ แล้วทุกล็อตยิงอ้าง `task_id` เดียวกัน
//  3. **ไม่มี idempotency key ระดับข้อความ** — ดูหมายเหตุที่ `sendEngagementMessages()`
//     จึงใช้ล็อตเล็กและบันทึกสถานะทันทีที่ยิงเสร็จ เพื่อบีบช่องส่งซ้ำให้แคบที่สุด
//
// ไม่มีสำเนาลงห้องแชทเหมือน LINE — ข้อความไปโผล่ในแชท TikTok ของผู้ซื้อฝั่งแอป TikTok
// ซึ่งเราไม่มีห้องนั้นในระบบ (คนละสายกับ customer_service ที่ต้องมีคนทักมาก่อน)

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logIntegrationNow } from '@/lib/integration-logger';
import { fetchAllRows } from '@/lib/supabase-paging';
import { ensureValidToken, isChatAppConfigured, type TikTokAccountRow, type TikTokCredentials } from './api';
import { createCustomEngagementTask, sendEngagementMessages } from './engagement';
import type { BroadcastAudienceFilter, BroadcastStatus } from '@/lib/line/broadcast';

/** กรอบเวลาที่ TikTok ยอมให้ทักผู้ซื้อ */
export const TIKTOK_BUYER_WINDOW_DAYS = 365;

/**
 * จำนวนอีเมลต่อการยิงหนึ่งครั้ง
 * ⚠️ TikTok ไม่ได้ระบุเพดานไว้ในเอกสาร — ตั้งไว้ต่ำเพื่อความปลอดภัย 2 ชั้น: ถ้าเพดานจริง
 * ต่ำกว่านี้จะได้ไม่ล้มทั้งงาน และช่วงที่อาจส่งซ้ำ (ไม่มี idempotency key) ก็แคบลงด้วย
 * ยืนยันเพดานจริงตอนส่งใบแรกแล้วค่อยปรับขึ้น
 */
export const TIKTOK_ENGAGEMENT_BATCH_SIZE = 50;

/** อายุของ task — ต้องเผื่อให้กด "ส่งต่อ" ทีหลังได้ (task หมดอายุ = ยิงเพิ่มไม่ได้) */
const TASK_TTL_DAYS = 7;

export interface TikTokBroadcastRecipient {
  buyer_email: string;
  customer_id: string | null;
}

export interface TikTokBroadcastBatch {
  index: number;
  buyer_emails: string[];
  status: 'pending' | 'sent' | 'failed';
  /** อีเมลที่ TikTok ปฏิเสธในล็อตนี้ (ล็อตยัง sent ได้ถ้าที่เหลือผ่าน) */
  rejected?: number;
  error?: string | null;
}

/** ข้อความที่เก็บใน `broadcasts.messages` ของฝั่ง TikTok */
export interface TikTokBroadcastMessage {
  title: string;
  body: string;
  product_ids?: string[];
  coupon_ids?: string[];
}

// ─── ผู้รับ ────────────────────────────────────────────────────────────

/**
 * ผู้ซื้อที่ทักได้ของร้านหนึ่ง — distinct `buyer_email` จากออเดอร์ภายใน 365 วัน
 *
 * `buyer_email` เป็นอีเมลนิรนามของ TikTok ที่ติดมากับ Get Order Details และเราเก็บดิบไว้
 * ที่ `orders.external_data` อยู่แล้ว จึงไม่ต้องยิง API ถามใหม่
 */
export async function resolveTikTokRecipients(
  companyId: string,
  marketplaceAccountId: string,
  audienceType: string,
  filter?: BroadcastAudienceFilter | null,
): Promise<TikTokBroadcastRecipient[]> {
  const tagIds = audienceType === 'tags' ? (filter?.tag_ids || []).filter(Boolean) : [];
  // เลือก "ตามแท็ก" แต่ไม่ได้ติ๊กแท็กไหนเลย = ไม่มีผู้รับ (ไม่ใช่ทุกคน)
  if (audienceType === 'tags' && tagIds.length === 0) return [];

  let allowedCustomerIds: Set<string> | null = null;
  if (audienceType === 'tags') {
    // กันแท็กข้ามบริษัท — เอาเฉพาะ tag_id ที่เป็นของบริษัทนี้จริง
    const { data: ownTags } = await supabaseAdmin
      .from('customer_tags').select('id').eq('company_id', companyId).in('id', tagIds);
    const ownTagIds = (ownTags || []).map(t => t.id as string);
    if (ownTagIds.length === 0) return [];

    const { rows: links } = await fetchAllRows<{ customer_id: string }>((from, to) =>
      supabaseAdmin
        .from('customer_tag_links')
        .select('customer_id', { count: 'exact' })
        .in('tag_id', ownTagIds)
        .range(from, to),
    );
    allowedCustomerIds = new Set(links.map(l => l.customer_id));
    if (allowedCustomerIds.size === 0) return [];
  }

  const since = new Date(Date.now() - TIKTOK_BUYER_WINDOW_DAYS * 86_400_000).toISOString();

  // ⚠️ ต้องผ่าน fetchAllRows — Supabase ตัดที่ 1,000 แถวเงียบ ๆ ร้านที่ขายดีมีออเดอร์
  //    เกินพันใบใน 365 วันแน่นอน ถ้าไม่แบ่งหน้าจะหายไปทั้งกลุ่ม
  const { rows } = await fetchAllRows<{ customer_id: string | null; buyer_email: string | null }>(
    (from, to) =>
      supabaseAdmin
        .from('orders')
        .select('customer_id, buyer_email:external_data->>buyer_email', { count: 'exact' })
        .eq('company_id', companyId)
        .eq('marketplace_account_id', marketplaceAccountId)
        .gte('created_at', since)
        .range(from, to),
  );

  // ผู้ซื้อคนเดียวสั่งหลายใบได้ — ส่งครั้งเดียว (นับซ้ำ = กินสิทธิ์ฟรี + ลูกค้ารำคาญ)
  const seen = new Set<string>();
  const out: TikTokBroadcastRecipient[] = [];
  for (const r of rows) {
    const email = (r.buyer_email || '').trim();
    if (!email || seen.has(email)) continue;
    if (allowedCustomerIds && !(r.customer_id && allowedCustomerIds.has(r.customer_id))) continue;
    seen.add(email);
    out.push({ buyer_email: email, customer_id: r.customer_id });
  }
  return out;
}

export function planTikTokBatches(recipients: TikTokBroadcastRecipient[]): TikTokBroadcastBatch[] {
  const batches: TikTokBroadcastBatch[] = [];
  for (let i = 0; i < recipients.length; i += TIKTOK_ENGAGEMENT_BATCH_SIZE) {
    batches.push({
      index: batches.length,
      buyer_emails: recipients.slice(i, i + TIKTOK_ENGAGEMENT_BATCH_SIZE).map(r => r.buyer_email),
      status: 'pending',
    });
  }
  return batches;
}

// ─── ตัวส่ง ───────────────────────────────────────────────────────────

interface TikTokBroadcastRow {
  id: string;
  company_id: string;
  marketplace_account_id: string | null;
  audience_type: string;
  audience_filter: BroadcastAudienceFilter | null;
  messages: TikTokBroadcastMessage;
  preview: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: BroadcastStatus;
  batches: TikTokBroadcastBatch[] | null;
  platform_data: { task_id?: string; idempotency_key?: string } | null;
  started_at: string | null;
}

/**
 * creds ของ Customer Engagement — **มี token ของ app Chat ก็ใช้ตัวนั้นก่อน**
 *
 * ทำไมถึงเลือกแบบนี้ (สำรวจ Partner Center จริง 8 ก.ย. 2026): **ไม่มี scope ชื่อ Customer
 * Engagement ให้ขอเลย** และหมวดของ app มีแค่ 4 หมวด (Customer Service · eCommerce
 * Management · Finance · Shipping & Fulfillment) ไม่มีหมวดการตลาด ⇒ ความเป็นไปได้เดียว
 * ที่เหลือคือ API กลุ่มนี้แฝงอยู่ใน `seller.customer_service` ซึ่งเป็นของ **app หมวด
 * Customer Support** (ของเรา = AooCommerce-Chat) จึงลอง token ของ app นั้นก่อน
 *
 * ไม่มี token ของ app Chat ก็ตกไปใช้ app ออเดอร์ตามเดิม — ทั้งสองทางยังตอบ 105005 อยู่
 * จนกว่าจะรู้คำตอบจริง (`node scripts/check-tiktok-engagement.mjs` ลองให้ทั้งคู่)
 */
export function getEngagementCreds(account: TikTokAccountRow): Promise<TikTokCredentials> {
  const useChatApp = !!account.chat_access_token && isChatAppConfigured();
  return ensureValidToken(account, useChatApp ? 'chat' : 'order');
}

/**
 * ส่งบรอดแคสต์ TikTok ใบหนึ่งจนจบ — **เรียกซ้ำได้เสมอ**
 *
 * task สร้างครั้งเดียว (`platform_data.task_id`) · ล็อตที่ `sent` แล้วข้าม ·
 * หมดงบเวลาก่อนจบก็คงสถานะไว้ให้กด "ส่งต่อ"
 */
export async function runTikTokBroadcast(
  broadcastId: string,
  opts: { timeBudgetMs?: number } = {},
): Promise<void> {
  const timeBudgetMs = opts.timeBudgetMs ?? 240_000;
  const startedAt = Date.now();

  const patch = (values: Record<string, unknown>) =>
    supabaseAdmin.from('broadcasts').update(values).eq('id', broadcastId);

  const { data } = await supabaseAdmin.from('broadcasts').select('*').eq('id', broadcastId).single();
  const row = data as TikTokBroadcastRow | null;
  if (!row) {
    console.error('[TikTokBroadcast] not found:', broadcastId);
    return;
  }
  if (row.status === 'sent') return;

  const fail = async (message: string) => {
    await patch({ status: 'failed', error: message, finished_at: new Date().toISOString() });
  };

  try {
    if (!row.marketplace_account_id) return void (await fail('บรอดแคสต์ใบนี้ไม่มีร้านต้นทาง'));

    const { data: account } = await supabaseAdmin
      .from('marketplace_accounts').select('*').eq('id', row.marketplace_account_id).single();
    if (!account) return void (await fail('ไม่พบร้าน TikTok ต้นทาง'));

    let creds: TikTokCredentials;
    try {
      creds = await getEngagementCreds(account as TikTokAccountRow);
    } catch (e) {
      return void (await fail(e instanceof Error ? e.message : 'token ของร้านใช้ไม่ได้'));
    }

    await patch({ status: 'sending', started_at: row.started_at || new Date().toISOString() });

    const msg = row.messages || ({ title: '', body: '' } as TikTokBroadcastMessage);
    const platformData = row.platform_data || {};

    // ── 1. task (แคมเปญ) — สร้างครั้งเดียวต่อบรอดแคสต์ ──────────────────
    let taskId = platformData.task_id || null;
    if (!taskId) {
      // จด idempotency key **ก่อน** ยิง — ตายกลางทางแล้วเรียกใหม่จะได้ task เดิม ไม่ใช่ใบใหม่
      const idempotencyKey = platformData.idempotency_key || crypto.randomUUID();
      if (!platformData.idempotency_key) {
        await patch({ platform_data: { ...platformData, idempotency_key: idempotencyKey } });
      }

      const created = await createCustomEngagementTask(creds, {
        idempotencyKey,
        taskName: (msg.title || row.preview || 'บรอดแคสต์').slice(0, 60),
        title: msg.title,
        body: msg.body,
        endTime: Math.floor((Date.now() + TASK_TTL_DAYS * 86_400_000) / 1000),
        productIds: msg.product_ids,
        couponIds: msg.coupon_ids,
      });

      if (!created.taskId) {
        await logIntegrationNow({
          company_id: row.company_id,
          integration: 'tiktok',
          account_id: row.marketplace_account_id,
          direction: 'outgoing',
          action: 'broadcast',
          method: 'POST',
          api_path: '/customer_engagement/202502/engagement_tasks/custom',
          status: 'error',
          error_message: created.error,
          reference_type: 'broadcast',
          reference_id: broadcastId,
        });
        return void (await fail(created.error || 'สร้างแคมเปญที่ TikTok ไม่สำเร็จ'));
      }
      taskId = created.taskId;
      await patch({ platform_data: { ...platformData, idempotency_key: idempotencyKey, task_id: taskId } });
    }

    // ── 2. ล็อตผู้รับ — วางแผนครั้งเดียวแล้วเดินจากที่จดไว้ ──────────────
    let batches: TikTokBroadcastBatch[] = Array.isArray(row.batches) ? row.batches : [];
    if (batches.length === 0) {
      // ⚠️ ต้องส่ง audience_filter ของแถวไปด้วย — ไม่งั้น "ตามแท็ก" จะกลายเป็นส่งหาทุกคน
      const recipients = await resolveTikTokRecipients(
        row.company_id, row.marketplace_account_id, row.audience_type, row.audience_filter,
      );
      if (recipients.length === 0) return void (await fail('ไม่มีผู้รับที่ตรงเงื่อนไข'));
      batches = planTikTokBatches(recipients);
      await patch({ batches, recipient_count: recipients.length });
    }

    const tally = (status: TikTokBroadcastBatch['status']) =>
      batches.filter(b => b.status === status).reduce((n, b) => n + b.buyer_emails.length, 0);

    let sentCount = tally('sent');
    let failedCount = tally('failed');

    for (const batch of batches) {
      if (batch.status === 'sent') continue;

      // หมดงบเวลา — คงสถานะไว้ให้กด "ส่งต่อ" (ล็อตที่เหลือยัง pending)
      if (Date.now() - startedAt > timeBudgetMs) {
        await patch({
          batches, sent_count: sentCount, failed_count: failedCount,
          status: 'partial', error: 'หมดเวลาของรอบนี้ — กด "ส่งต่อ" เพื่อส่งส่วนที่เหลือ',
        });
        return;
      }

      const res = await sendEngagementMessages(creds, taskId, batch.buyer_emails);

      if (!res.error) {
        // TikTok ตอบสำเร็จเป็นก้อน แล้วบอกรายอีเมลที่ตกใน errors[] — ที่ไม่อยู่ในนั้นถือว่าถึง
        batch.status = 'sent';
        batch.rejected = res.failed.length;
        batch.error = res.failed.length ? `TikTok ปฏิเสธ ${res.failed.length} ราย` : null;
        sentCount = tally('sent');
        failedCount = tally('failed');
        await patch({ batches, sent_count: sentCount, failed_count: failedCount });
      } else if (res.rateLimited) {
        // โดนหน่วง — ล็อตนี้ยัง pending หยุดรอบไว้ก่อน กด "ส่งต่อ" ทีหลังได้
        batch.status = 'pending';
        batch.error = res.error;
        await logIntegrationNow({
          company_id: row.company_id,
          integration: 'tiktok',
          account_id: row.marketplace_account_id,
          direction: 'outgoing',
          action: 'broadcast',
          method: 'POST',
          api_path: '/customer_engagement/202412/messages',
          status: 'error',
          error_message: res.error,
          reference_type: 'broadcast',
          reference_id: broadcastId,
        });
        await patch({
          batches, sent_count: sentCount, failed_count: failedCount,
          status: 'partial',
          error: 'TikTok จำกัดอัตราการส่งชั่วคราว — กด "ส่งต่อ" อีกครั้งภายหลัง',
        });
        return;
      } else {
        batch.status = 'failed';
        batch.error = res.error;
        failedCount = tally('failed');
        await logIntegrationNow({
          company_id: row.company_id,
          integration: 'tiktok',
          account_id: row.marketplace_account_id,
          direction: 'outgoing',
          action: 'broadcast',
          method: 'POST',
          api_path: '/customer_engagement/202412/messages',
          status: 'error',
          error_message: res.error,
          reference_type: 'broadcast',
          reference_id: broadcastId,
        });
        await patch({ batches, failed_count: failedCount, error: res.error });
      }

      // เว้นจังหวะระหว่างล็อต — ยิงรัวเป็นชุดคือทางลัดไปหา 429
      await new Promise(r => setTimeout(r, 200));
    }

    const anySent = batches.some(b => b.status === 'sent');
    const anyNotSent = batches.some(b => b.status !== 'sent');
    // ไม่มีล็อตไหนออกไปได้เลย = ล้มเหลว (ไม่ใช่ "ส่งไม่ครบ") — คนอ่านต้องแยกสองเคสนี้ออก
    const finalStatus: BroadcastStatus = !anySent ? 'failed' : anyNotSent ? 'partial' : 'sent';
    const rejected = batches.reduce((n, b) => n + (b.rejected || 0), 0);

    await patch({
      batches,
      sent_count: tally('sent') - rejected,
      failed_count: tally('failed') + rejected,
      status: finalStatus,
      finished_at: new Date().toISOString(),
      error: rejected ? `TikTok ปฏิเสธผู้รับ ${rejected} ราย (มักเป็นผู้ซื้อที่เลยกรอบ 365 วัน)` : null,
    });
  } catch (e) {
    console.error('[TikTokBroadcast] error:', e);
    await fail(e instanceof Error ? e.message : 'ส่งบรอดแคสต์ไม่สำเร็จ');
  }
}

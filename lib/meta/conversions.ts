/**
 * Meta Conversions API สำหรับ Business Messaging — ส่ง event `Purchase` เข้า dataset ของเพจ
 *
 * ทำไมต้องมี: โฆษณา Click-to-Messenger จะ optimize หา "คนที่ซื้อจริง" ได้ก็ต่อเมื่อเราบอก Meta
 * ว่าบทสนทนาไหนจบด้วยการซื้อ — Meta มองไม่เห็นออเดอร์ในระบบเรา
 *
 * กติกาของไฟล์นี้:
 * - **ห้าม throw** — ทุกจุดที่เรียกอยู่หลังการบันทึกเงินสำเร็จแล้ว งานนี้ล้มต้องไม่ลากอะไรล้มตาม
 * - ยิงครั้งเดียวต่อออเดอร์ (`orders.meta_purchase_sent_at` — จองสิทธิ์ก่อนยิง ดู `claimOrder()`)
 * - Graph API call ทั้งหมดอยู่ในไฟล์นี้ที่เดียว
 *
 * TODO (ยังไม่ทำ): Instagram — ใช้ `{IG_USER_ID}/dataset` + `messaging_channel: 'instagram'`
 *   ต้องหา ig user id ของเพจก่อน (ตอนนี้ `fb_contacts.source='instagram'` ถูกข้ามทั้งหมด)
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logIntegrationNow } from '@/lib/integration-logger';
import { fetchAllRows } from '@/lib/supabase-paging';
import { GRAPH_BASE } from './graph';
import {
  buildCapiEvent,
  buildCapiRequest,
  isEventTimeAcceptable,
  MAX_EVENT_AGE_SEC,
  MAX_EVENT_FUTURE_SEC,
} from './capi';
import { claimAdEvent, finishAdEvent, recordPageDatasetMirror } from '@/lib/ads/ledger';
import { resolvePaidAt } from '@/lib/ads/subject';
import type { ConversionEventName } from '@/lib/ads/types';

const INTEGRATION = 'meta_capi';
const ACTION = 'purchase_event';

/** บัญชีเพจที่ถือ token — มาจาก chat_accounts (platform 'facebook') */
interface PageAccount {
  id: string;
  company_id: string;
  account_name: string | null;
  credentials: Record<string, unknown>;
}

interface OrderRow {
  id: string;
  company_id: string;
  order_number: string | null;
  customer_id: string | null;
  total_amount: number | string | null;
  payment_status: string | null;
  meta_purchase_sent_at: string | null;
  /** ห้องแชทที่บิลใบนี้ถูกเปิดจากมันจริง ๆ (บิลที่เปิดจากหน้าแชท) */
  chat_platform: string | null;
  chat_contact_id: string | null;
}

/** เนื้อ body ที่ยิงเข้า /{dataset}/events — แยกออกมาเพื่อทดสอบรูปร่างได้โดยไม่ต้องยิงจริง */
export interface PurchaseEventInput {
  pageId: string;
  psid: string;
  /** event_id — ใช้ order id เพื่อให้ Meta dedupe ให้เองถ้าเผลอยิงซ้ำ */
  eventId: string;
  value: number;
  orderNumber: string | null;
  /** unix seconds */
  eventTime?: number;
}

/**
 * ประกอบ body ตามสเปค Conversions API for Business Messaging
 * (แยกเป็น pure function เพื่อ unit test — ห้ามใส่ side effect)
 */
export function buildPurchaseEventBody(input: PurchaseEventInput): Record<string, unknown> {
  return buildCapiRequest([
    buildCapiEvent({
      eventName: 'Purchase',
      eventId: input.eventId,
      eventTime: input.eventTime ?? Math.floor(Date.now() / 1000),
      actionSource: 'business_messaging',
      messagingChannel: 'messenger',
      userData: {
        page_id: input.pageId,
        page_scoped_user_id: input.psid,
      },
      customData: {
        currency: 'THB',
        value: input.value,
        order_id: input.orderNumber ?? input.eventId,
      },
    }),
  ]) as unknown as Record<string, unknown>;
}

function credString(creds: Record<string, unknown>, key: string): string | null {
  const v = creds?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * token ของเพจไม่มีสิทธิ์ `page_events` — Meta ตอบ `(#200) App does not have page_events permission on the Page`
 *
 * ⚠️ token ทุกใบที่ออกก่อน 9 ก.ย. 2026 เป็นแบบนี้ทั้งหมด (ตอนขอ scope ยังไม่มี `page_events`)
 * ลองต่อไม่มีประโยชน์ — ต้องให้เจ้าของกดเชื่อมต่อเพจใหม่เพื่อออก token ใบใหม่
 */
const PAGE_EVENTS_FIX_MESSAGE =
  'เพจนี้ยังไม่ได้ให้สิทธิ์ page_events — ไปที่ ตั้งค่า › ช่องทางแชท กดเมนูบนการ์ดเพจ › "เชื่อมต่อใหม่ (ขอสิทธิ์ใหม่)" แล้วอนุญาตทุกเพจในหน้าต่างของ Facebook';

function isPageEventsPermissionError(body: unknown): boolean {
  const err = (body as { error?: { code?: number; message?: string } } | null)?.error;
  if (!err) return false;
  if (typeof err.message === 'string' && err.message.includes('page_events')) return true;
  // code 200 = permission error ของ Graph API (ที่นี่มีสาเหตุเดียวคือ page_events)
  return err.code === 200;
}

async function logError(
  account: PageAccount | null,
  companyId: string,
  message: string,
  extra: {
    api_path?: string;
    http_status?: number;
    request_body?: unknown;
    response_body?: unknown;
    reference_id?: string;
    /** ไม่ส่ง = 'purchase_event' (ค่าเดิม) — event ชนิดอื่นส่งชื่อของตัวเองมา */
    action?: string;
    /** ไม่ส่ง = 'order' (ค่าเดิม) — QualifiedLead ผูกกับห้องแชท ไม่ใช่บิล */
    reference_type?: string;
    reference_label?: string | null;
  } = {},
): Promise<void> {
  try {
    await logIntegrationNow({
      company_id: companyId,
      integration: INTEGRATION,
      account_id: account?.id ?? null,
      account_name: account?.account_name ?? null,
      direction: 'outgoing',
      action: ACTION,
      method: 'POST',
      status: 'error',
      error_message: message,
      reference_type: 'order',
      ...extra,
      reference_label: extra.reference_label ?? undefined,
    });
  } catch {
    // log ล้มก็ปล่อย — ห้ามให้การจดบันทึกทำให้สายหลักพัง
  }
}

/** ไม่มี token/page_id ให้ยิงเลย — เกิดได้เมื่อแถวถูกสร้างแบบกรอกมือแล้วกรอกไม่ครบ */
const MISSING_TOKEN_MESSAGE =
  'เพจนี้ไม่มี Page ID หรือ Page Access Token ในระบบ — กด "เชื่อมต่อใหม่ (ขอสิทธิ์ใหม่)" ที่เมนูของการ์ดเพจ';

/**
 * merge ค่าลง `chat_accounts.credentials` ของบัญชีหนึ่ง
 *
 * **อ่านค่าล่าสุดจาก DB ก่อน merge เสมอ** — ก้อน credentials ที่ผู้เรียกถืออยู่อาจเก่าไปแล้ว
 * (route ทดสอบเชื่อมต่อเพิ่งเขียนชื่อ/รูปเพจทับไปเมื่อครู่) เขียนจากก้อนเก่า = ลบของคนอื่นทิ้ง
 *
 * ส่งค่าเป็น `undefined` = ลบคีย์นั้นออก
 */
async function mergeCredentials(accountId: string, patch: Record<string, unknown>): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('chat_accounts')
      .select('credentials')
      .eq('id', accountId)
      .single<{ credentials: Record<string, unknown> | null }>();

    const next: Record<string, unknown> = { ...((data?.credentials || {}) as Record<string, unknown>) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) delete next[key];
      else next[key] = value;
    }

    await supabaseAdmin
      .from('chat_accounts')
      .update({ credentials: next, updated_at: new Date().toISOString() })
      .eq('id', accountId);
  } catch {
    // จดไม่ได้ก็แค่ป้ายบนการ์ดไม่อัปเดต — ห้ามให้การจดบันทึกทำให้สายหลักพัง
  }
}

/** จดว่าเพจนี้ยิง CAPI ได้จริง — ลบเหตุผลที่เคยล้มทิ้ง ไม่งั้นป้ายจะค้างสีเหลืองตลอด */
async function markCapiOk(accountId: string, datasetId?: string | null): Promise<void> {
  await mergeCredentials(accountId, {
    ...(datasetId ? { meta_dataset_id: datasetId } : {}),
    meta_capi_checked_at: new Date().toISOString(),
    meta_capi_error: undefined,
  });
}

/**
 * จดเหตุผลที่ยิงไม่ได้ไว้บนบัญชี — หน้า ตั้งค่า › ช่องทางแชท อ่านค่านี้ไปขึ้นป้าย
 * **ไม่แตะ `meta_dataset_id`** เพราะ dataset ยังอยู่ ปัญหาอยู่ที่ token
 */
async function markCapiError(accountId: string, message: string): Promise<void> {
  await mergeCredentials(accountId, {
    meta_capi_error: message,
    meta_capi_checked_at: new Date().toISOString(),
  });
}

/**
 * หา dataset ของเพจ (Meta เรียก "dataset ที่เชื่อมกับเพจ")
 * — อ่านจาก credentials.meta_dataset_id ก่อน ไม่มีค่อยถาม Graph API แล้วจำไว้
 *
 * @param opts.force ข้ามค่าที่จำไว้ แล้วถาม Meta ใหม่เสมอ — ใช้ตอนผู้ใช้กด "ทดสอบเชื่อมต่อ"
 *   (คำตอบต้องมาจากของจริง ไม่ใช่ค่าที่จำไว้ตั้งแต่ก่อน token จะหมดสิทธิ์)
 * @returns dataset id หรือ null เมื่อหา/สร้างไม่ได้
 */
export async function getOrCreateDatasetId(
  account: PageAccount,
  opts: { force?: boolean } = {},
): Promise<string | null> {
  const creds = (account.credentials || {}) as Record<string, unknown>;
  const cached = credString(creds, 'meta_dataset_id');
  if (cached && !opts.force) return cached;

  const pageId = credString(creds, 'page_id');
  const token = credString(creds, 'page_access_token');
  if (!pageId || !token) {
    await markCapiError(account.id, MISSING_TOKEN_MESSAGE);
    return null;
  }

  const path = `/${pageId}/dataset`;
  let datasetId: string | null = null;

  try {
    // 1) มี dataset ผูกกับเพจอยู่แล้วไหม
    // รูปคำตอบจริง (ตรวจ 10 ก.ย. 2026): มี = `{"data":[{"id":"…"}]}` · ยังไม่มี = `{"data":[]}` (200 ทั้งคู่)
    // ไม่ใช่ `{"id":…}` อย่างที่เขียนไว้ตอนแรก — อ่านผิดรูปแล้วจะตกไป POST ทุกครั้งโดยไม่รู้ตัว
    const getRes = await fetch(`${GRAPH_BASE}${path}?access_token=${encodeURIComponent(token)}`);
    const getBody = (await getRes.json().catch(() => null)) as
      { id?: string; data?: Array<{ id?: string }>; error?: unknown } | null;
    const existingId = getBody?.id ?? getBody?.data?.[0]?.id ?? null;
    if (getRes.ok && existingId) {
      datasetId = String(existingId);
    } else if (!getRes.ok) {
      if (isPageEventsPermissionError(getBody)) {
        // สิทธิ์ไม่ถึง — POST สร้าง dataset ก็จะล้มด้วยเหตุเดียวกัน อย่ายิงเพิ่มให้เปลือง
        // ทั้งรอบนี้จึงเป็น "1 Graph call + 1 log" เท่านั้น
        await logError(account, account.company_id, PAGE_EVENTS_FIX_MESSAGE, {
          api_path: path,
          http_status: getRes.status,
          response_body: getBody,
        });
        await markCapiError(account.id, PAGE_EVENTS_FIX_MESSAGE);
        return null;
      }
      // GET ล้มด้วยเหตุอื่นไม่ใช่จุดจบ — ลอง POST สร้าง (Meta คืน id เดิมถ้ามีอยู่แล้ว)
      await logError(account, account.company_id, 'ขอ dataset ของเพจไม่สำเร็จ (GET)', {
        api_path: path,
        http_status: getRes.status,
        response_body: getBody,
      });
    }

    // 2) ยังไม่มี → สร้างให้เพจ (idempotent ฝั่ง Meta: มีอยู่แล้วจะคืน id เดิม)
    if (!datasetId) {
      const postRes = await fetch(`${GRAPH_BASE}${path}?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
      });
      const postBody = (await postRes.json().catch(() => null)) as { id?: string } | null;
      if (postRes.ok && postBody?.id) {
        datasetId = String(postBody.id);
      } else {
        const why = isPageEventsPermissionError(postBody) ? PAGE_EVENTS_FIX_MESSAGE : 'สร้าง dataset ให้เพจไม่สำเร็จ';
        await logError(account, account.company_id, why, {
          api_path: path,
          http_status: postRes.status,
          response_body: postBody,
        });
        await markCapiError(account.id, why);
        return null;
      }
    }
  } catch (err) {
    const why = `เรียก Graph API หา dataset ไม่ได้: ${errText(err)}`;
    await logError(account, account.company_id, why, {
      api_path: path,
    });
    await markCapiError(account.id, why);
    return null;
  }

  // จำไว้ใน credentials — merge เท่านั้น ห้ามเขียนทับทั้งก้อน (page_access_token อยู่ในนั้น)
  await markCapiOk(account.id, datasetId);

  return datasetId;
}

/**
 * ตรวจว่าเพจนี้ยิง Conversions API ได้จริงไหม **ตอนนี้** แล้วจดผลไว้บนบัญชี
 * (ถาม Meta ใหม่เสมอ — ไม่เชื่อค่าที่จำไว้ เพราะ token เปลี่ยนได้ทุกเมื่อ)
 *
 * ใช้จากปุ่ม "ทดสอบเชื่อมต่อ" และหลังเชื่อม/อัปเดตสิทธิ์เพจ — **ห้าม throw**
 */
export async function probeCapiReadiness(
  accountId: string,
  companyId: string,
): Promise<{ ready: boolean; dataset_id: string | null; error: string | null }> {
  try {
    const { data: account } = await supabaseAdmin
      .from('chat_accounts')
      .select('id, company_id, account_name, credentials')
      .eq('id', accountId)
      .eq('company_id', companyId)
      .eq('platform', 'facebook')
      .single<PageAccount>();

    if (!account) return { ready: false, dataset_id: null, error: 'ไม่พบเพจนี้ในระบบ' };

    await getOrCreateDatasetId(account, { force: true });

    // อ่านผลจากแถวจริง — getOrCreateDatasetId จดทั้งขาสำเร็จและขาล้มไว้แล้ว
    const { data: fresh } = await supabaseAdmin
      .from('chat_accounts')
      .select('credentials')
      .eq('id', accountId)
      .single<{ credentials: Record<string, unknown> | null }>();

    const creds = (fresh?.credentials || {}) as Record<string, unknown>;
    const datasetId = credString(creds, 'meta_dataset_id');
    const error = credString(creds, 'meta_capi_error');
    return { ready: !error && !!datasetId, dataset_id: datasetId, error };
  } catch (err) {
    return { ready: false, dataset_id: null, error: `ตรวจ CAPI ไม่สำเร็จ: ${errText(err)}` };
  }
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * จองสิทธิ์ยิงของออเดอร์นี้ — UPDATE แบบมีเงื่อนไข กันสองสายที่ทำให้ออเดอร์ paid พร้อมกันยิงซ้ำ
 * @returns true เมื่อจองได้ (แถวถูกอัปเดตจริง)
 */
async function claimOrder(orderId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ meta_purchase_sent_at: new Date().toISOString() })
    .eq('id', orderId)
    .is('meta_purchase_sent_at', null)
    .select('id');
  if (error) return false;
  return Array.isArray(data) && data.length > 0;
}

/** คืนสิทธิ์เมื่อยิงไม่สำเร็จ — ครั้งหน้าที่ออเดอร์กลายเป็น paid จะได้ลองใหม่ */
async function releaseOrder(orderId: string): Promise<void> {
  try {
    await supabaseAdmin.from('orders').update({ meta_purchase_sent_at: null }).eq('id', orderId);
  } catch {
    /* ปล่อย — อย่างมากคือไม่ได้ retry */
  }
}

/**
 * ผลของการยิงหนึ่งใบ — ตัวกวาดย้อนหลังนับสามกองนี้
 * (ผู้เรียกเดิมไม่สนค่าที่คืน `await`/`.catch()` เหมือนเดิมได้)
 */
export type PurchaseSendResult = 'sent' | 'skipped' | 'failed';

interface FbContactRow {
  id: string;
  fb_psid: string | null;
  fb_page_id: string | null;
  chat_account_id: string | null;
}

/** เพจของผู้ติดต่อรายนี้ที่ยังเปิดใช้อยู่ และ page_id ตรงกับที่คุยกันจริง */
async function usablePageAccount(
  companyId: string,
  chatAccountId: string,
  contactPageId: string | null,
): Promise<PageAccount | null> {
  const { data: acc } = await supabaseAdmin
    .from('chat_accounts')
    .select('id, company_id, account_name, credentials')
    .eq('id', chatAccountId)
    .eq('company_id', companyId)
    .eq('platform', 'facebook')
    .eq('is_active', true)
    .maybeSingle<PageAccount>();
  if (!acc) return null;

  const pageId = credString((acc.credentials || {}) as Record<string, unknown>, 'page_id');
  // ไม่มี page_id = ยิงไม่ได้อยู่ดี (user_data ของ business_messaging บังคับใช้)
  if (!pageId) return null;
  if (contactPageId && String(contactPageId) !== pageId) return null;
  return acc;
}

/**
 * หาห้อง Messenger ของออเดอร์ + เพจที่ยังเปิดใช้อยู่
 *
 * แยกออกมาเพราะทั้งสายยิงทันทีและสายกวาดย้อนหลังต้องใช้ตรรกะเดียวกันเป๊ะ
 * — เขียนสองที่เมื่อไหร่ ตัวกวาดจะเลือกเพจคนละใบกับตอนยิงจริงโดยไม่มีใครรู้
 */
async function resolveMessengerTarget(
  order: Pick<OrderRow, 'company_id' | 'customer_id' | 'chat_platform' | 'chat_contact_id'>,
): Promise<{ account: PageAccount; psid: string; contactId: string | null } | null> {
  // 1) ห้องที่บิลใบนี้ถูกเปิดจากมันจริง ๆ — แม่นกว่าการเดาจากลูกค้าเสมอ
  //    (ลูกค้าคนเดียวทักมาหลายเพจได้ · ลูกค้าที่ยังไม่ผูก customer_id ก็ยังยิงได้)
  if (order.chat_platform === 'facebook' && order.chat_contact_id) {
    const { data: pinned } = await supabaseAdmin
      .from('fb_contacts')
      .select('id, fb_psid, fb_page_id, chat_account_id')
      .eq('id', order.chat_contact_id)
      .eq('company_id', order.company_id)
      .eq('source', 'facebook')
      .maybeSingle<FbContactRow>();

    if (pinned?.fb_psid && pinned.chat_account_id) {
      const acc = await usablePageAccount(order.company_id, pinned.chat_account_id, pinned.fb_page_id);
      if (acc) return { account: acc, psid: String(pinned.fb_psid), contactId: pinned.id };
    }
  }

  if (!order.customer_id) return null;

  // 2) ทางถอย: ลูกค้าคนนี้ผูกกับห้องแชท Messenger ไหน — เอาห้องที่คุยล่าสุด (IG ยังไม่รองรับ)
  const { data: contacts } = await supabaseAdmin
    .from('fb_contacts')
    .select('id, fb_psid, fb_page_id, chat_account_id, last_message_at')
    .eq('customer_id', order.customer_id)
    .eq('company_id', order.company_id)
    .eq('source', 'facebook')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(5);

  const candidates = ((contacts || []) as FbContactRow[]).filter((c) => c.fb_psid && c.chat_account_id);
  if (candidates.length === 0) return null;

  // หาเพจที่ยังเปิดใช้อยู่ + page_id ตรงกับที่ผู้ติดต่อคุยด้วย
  for (const contact of candidates) {
    const acc = await usablePageAccount(order.company_id, contact.chat_account_id as string, contact.fb_page_id);
    if (!acc) continue;
    return { account: acc, psid: String(contact.fb_psid), contactId: contact.id };
  }

  return null;
}

/**
 * ส่ง Purchase event ของออเดอร์ที่ชำระเงินแล้ว — เรียกได้จากทุกจุดที่ทำให้ออเดอร์เป็น paid
 *
 * เงียบ (ไม่ทำอะไร ไม่ log) เมื่อ: ออเดอร์ยังไม่ paid · ยิงไปแล้ว · ไม่มีลูกค้า ·
 * ลูกค้าไม่ได้ผูกกับผู้ติดต่อ Messenger · เพจไม่ได้เปิดใช้อยู่
 *
 * @param opts.eventTime เวลาที่เงินเข้าจริง (unix seconds) — ใส่เมื่อยิงย้อนหลัง
 *   ไม่ใส่ = ตอนนี้ · เกิน 7 วันไปแล้ว = ข้าม (ห้ามปลอมเวลาให้ใหม่ขึ้นเพื่อให้ Meta รับ)
 * @param opts.skipIfPageNotReady เพจที่ยังมี `meta_capi_error` ค้างอยู่ให้ข้ามไปเลย
 *   ไม่ต้องยิง Graph — ตัวกวาดใช้ค่านี้ จะได้ไม่ไปรบกวน Meta ทุก 15 นาทีกับเพจที่เจ้าของยังไม่แก้
 */
export async function sendPurchaseEventForOrder(
  orderId: string,
  opts: { eventTime?: number; skipIfPageNotReady?: boolean } = {},
): Promise<PurchaseSendResult> {
  try {
    // เช็คอายุ event **ก่อนแตะอะไรทั้งนั้น** — โดยเฉพาะก่อนจองสิทธิ์
    // (จองแล้วพบว่าเวลาเกิน = ออเดอร์ถูกปิดตายทั้งที่ไม่เคยยิงสำเร็จ)
    if (opts.eventTime != null) {
      const nowSec = Math.floor(Date.now() / 1000);
      if (nowSec - opts.eventTime > MAX_EVENT_AGE_SEC) return 'skipped';
      if (opts.eventTime - nowSec > MAX_EVENT_FUTURE_SEC) return 'skipped';
    }

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, company_id, order_number, customer_id, total_amount, payment_status, meta_purchase_sent_at, chat_platform, chat_contact_id')
      .eq('id', orderId)
      .single<OrderRow>();

    if (!order) return 'skipped';
    if (order.payment_status !== 'paid') return 'skipped';
    if (order.meta_purchase_sent_at) return 'skipped';
    // ไม่มีทั้งลูกค้าและห้องแชทที่ผูกไว้ = ไม่มีทางหาเพจ/PSID ได้ ไม่ต้องเสียเวลา query
    if (!order.customer_id && !order.chat_contact_id) return 'skipped';

    const target = await resolveMessengerTarget(order);
    if (!target) return 'skipped';
    const { account, psid, contactId } = target;

    const creds = (account.credentials || {}) as Record<string, unknown>;

    // เพจที่รู้อยู่แล้วว่ายิงไม่ได้ (สิทธิ์ไม่ถึง/token พัง) — ตัวกวาดข้ามเงียบ ๆ
    // เจ้าของแก้เมื่อไหร่ ป้ายบนการ์ดจะถูกล้าง แล้วรอบถัดไปก็กวาดต่อได้เอง
    if (opts.skipIfPageNotReady && credString(creds, 'meta_capi_error')) return 'skipped';

    const pageId = credString(creds, 'page_id');
    const token = credString(creds, 'page_access_token');
    if (!pageId || !token) return 'skipped';

    const datasetId = await getOrCreateDatasetId(account);
    if (!datasetId) return 'skipped'; // getOrCreateDatasetId log ให้แล้วเมื่อเป็น error จริง

    const value = Number(order.total_amount) || 0;

    // จองสิทธิ์ "ก่อน" ยิง — สองสายที่ทำให้ paid พร้อมกันจะมีแค่สายเดียวที่ผ่านตรงนี้
    const claimed = await claimOrder(order.id);
    if (!claimed) return 'skipped';

    const body = buildPurchaseEventBody({
      pageId,
      psid,
      eventId: order.id,
      value,
      orderNumber: order.order_number,
      eventTime: opts.eventTime,
    });
    const apiPath = `/${datasetId}/events`;
    const startedAt = Date.now();

    // จดลงสมุดกลาง (`ad_events`) ด้วย — หน้าจอจะได้เห็นสองปลายทาง (dataset เพจ / dataset บัญชีโฆษณา)
    // ในเล่มเดียวกัน · **ไม่ใช่การจองสิทธิ์** สายนี้จองด้วย orders.meta_purchase_sent_at ไปแล้ว
    const eventTimeIso = new Date((opts.eventTime ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
    const mirror = (
      status: 'sent' | 'failed',
      extra: { http_status?: number | null; error?: string | null; response?: unknown } = {},
    ) =>
      recordPageDatasetMirror({
        company_id: order.company_id,
        platform: 'meta',
        destination: 'page_dataset',
        destination_id: datasetId,
        event_name: 'Purchase',
        event_id: order.id,
        order_id: order.id,
        customer_id: order.customer_id,
        contact_platform: 'facebook',
        contact_id: contactId,
        action_source: 'business_messaging',
        event_time: eventTimeIso,
        status,
        ...extra,
      });

    let httpStatus = 0;
    let responseBody: unknown = null;
    try {
      const res = await fetch(`${GRAPH_BASE}${apiPath}?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      httpStatus = res.status;
      responseBody = await res.json().catch(() => null);

      if (!res.ok) {
        // คืนสิทธิ์เสมอ → ออเดอร์ใบถัดไปที่ชำระจะได้ลองใหม่ (1 call + 1 log ต่อครั้ง ไม่วนซ้ำในรอบเดียว)
        await releaseOrder(order.id);
        const permissionDenied = isPageEventsPermissionError(responseBody);
        const why = permissionDenied
          ? PAGE_EVENTS_FIX_MESSAGE
          : `ส่ง Purchase event ไม่สำเร็จ (HTTP ${res.status})`;
        // สิทธิ์ไม่ถึง = เรื่องของ token ไม่ใช่ของออเดอร์ใบนี้ → ขึ้นป้ายบนการ์ดเพจให้เจ้าของเห็น
        if (permissionDenied) await markCapiError(account.id, why);
        await mirror('failed', { http_status: httpStatus, error: why, response: responseBody });
        await logError(account, order.company_id, why, {
          api_path: apiPath,
          http_status: httpStatus,
          request_body: body,
          response_body: responseBody,
          reference_id: order.id,
          reference_label: order.order_number,
        });
        return 'failed';
      }
    } catch (err) {
      await releaseOrder(order.id);
      await mirror('failed', { error: `ยิง Purchase event ไม่ถึง Meta: ${errText(err)}` });
      await logError(account, order.company_id, `ยิง Purchase event ไม่ถึง Meta: ${errText(err)}`, {
        api_path: apiPath,
        request_body: body,
        reference_id: order.id,
        reference_label: order.order_number,
      });
      return 'failed';
    }

    // ยิงผ่านจริง = ป้ายบนการ์ดต้องเขียว (ล้างเหตุผลเก่าที่แก้ไปแล้วทิ้ง)
    await markCapiOk(account.id);
    await mirror('sent', { http_status: httpStatus, response: responseBody });

    await logIntegrationNow({
      company_id: order.company_id,
      integration: INTEGRATION,
      account_id: account.id,
      account_name: account.account_name,
      direction: 'outgoing',
      action: ACTION,
      method: 'POST',
      api_path: apiPath,
      request_body: body,
      response_body: responseBody,
      http_status: httpStatus,
      status: 'success',
      reference_type: 'order',
      reference_id: order.id,
      reference_label: order.order_number || undefined,
      duration_ms: Date.now() - startedAt,
    }).catch(() => null);

    return 'sent';
  } catch (err) {
    // กันเหนียวชั้นนอกสุด — ฟังก์ชันนี้ห้าม throw ไม่ว่าเกิดอะไร
    console.error('[MetaCAPI] sendPurchaseEventForOrder failed:', errText(err));
    return 'failed';
  }
}

/** ผู้ติดต่อ Messenger เท่าที่สาย "ยิง event ของห้องแชท" ต้องใช้ */
interface FbContactForEvent {
  id: string;
  company_id: string;
  fb_psid: string | null;
  fb_page_id: string | null;
  chat_account_id: string | null;
  customer_id: string | null;
  source: string | null;
}

/**
 * ส่ง event ของ **ห้องแชท Messenger หนึ่งห้อง** เข้า dataset ของเพจ
 * (InitiateCheckout = เปิดบิลให้จากห้องนี้ · QualifiedLead = คุยจนได้คุณภาพ · Purchase ก็ส่งได้)
 *
 * ต่างจาก `sendPurchaseEventForOrder` ตรงตัวกันซ้ำ: ตัวนั้นจองที่ `orders.meta_purchase_sent_at`
 * (มีปลายทางเดียวต่อออเดอร์) ส่วนตัวนี้จองที่สมุด `ad_events` เพราะห้องเดียวส่งได้หลาย event
 * ⇒ **ห้ามเอาการจองสิทธิ์ของสองสายมารวมกัน** ตัวเลข event คนละชนิดกันไม่ได้ด้วยธงใบเดียว
 *
 * เงียบ (คืน 'skipped' ไม่ log) เมื่อ: ไม่ใช่ห้อง Facebook (IG ยังไม่รองรับ) · ไม่มี PSID ·
 * เพจปิดใช้อยู่ · หา dataset ไม่ได้ · มีใบนี้ในสมุดแล้ว · เวลาเกินกรอบที่ Meta รับ
 *
 * **ห้าม throw** — ผู้เรียกทุกรายอยู่ใน after() หลังบันทึกของจริงสำเร็จแล้ว
 */
export async function sendMessagingEventForContact(input: {
  companyId: string;
  /** `fb_contacts.id` — ต้องเป็นแถว source 'facebook' เท่านั้น */
  contactId: string;
  eventName: ConversionEventName;
  /** Meta dedupe ด้วยค่านี้ — 'ic:{order}' / 'ql:{contact}' / order id ของ Purchase */
  eventId: string;
  /** unix **วินาที** — ไม่ใส่ = ตอนนี้ */
  eventTime?: number;
  customData?: Record<string, unknown>;
  orderId?: string | null;
  customerId?: string | null;
  /** เพจที่ยังมี `meta_capi_error` ค้างอยู่ให้ข้ามไปเลย (ใช้ตอนกวาด) */
  skipIfPageNotReady?: boolean;
}): Promise<PurchaseSendResult> {
  const { companyId, contactId, eventName, eventId } = input;
  try {
    const eventTime = input.eventTime ?? Math.floor(Date.now() / 1000);
    // เช็คอายุ **ก่อนจองสิทธิ์** — จองแล้วพบว่าเวลาเกิน = ใบนั้นถูกปิดตายทั้งที่ไม่เคยยิง
    if (!isEventTimeAcceptable(eventTime, 'business_messaging')) return 'skipped';

    const { data: contact } = await supabaseAdmin
      .from('fb_contacts')
      .select('id, company_id, fb_psid, fb_page_id, chat_account_id, customer_id, source')
      .eq('id', contactId)
      .eq('company_id', companyId)
      .maybeSingle<FbContactForEvent>();

    // IG ยิงเข้า dataset ของเพจแบบนี้ไม่ได้ (ต้องใช้ ig user id + messaging_channel instagram)
    if (!contact || contact.source !== 'facebook') return 'skipped';
    if (!contact.fb_psid || !contact.chat_account_id) return 'skipped';

    const account = await usablePageAccount(companyId, contact.chat_account_id, contact.fb_page_id);
    if (!account) return 'skipped';

    const creds = (account.credentials || {}) as Record<string, unknown>;
    if (input.skipIfPageNotReady && credString(creds, 'meta_capi_error')) return 'skipped';

    const pageId = credString(creds, 'page_id');
    const token = credString(creds, 'page_access_token');
    if (!pageId || !token) return 'skipped';

    const datasetId = await getOrCreateDatasetId(account);
    if (!datasetId) return 'skipped'; // getOrCreateDatasetId log ให้แล้วเมื่อเป็น error จริง

    // จองสิทธิ์ "ก่อน" ยิง — สองสายที่ทริกเกอร์พร้อมกัน (ลูกค้าพิมพ์ครบ 3 ใบ + แอดมินติดแท็ก)
    // จะมีแค่สายเดียวที่ผ่านตรงนี้
    const claim = await claimAdEvent({
      company_id: companyId,
      platform: 'meta',
      destination: 'page_dataset',
      destination_id: datasetId,
      event_name: eventName,
      event_id: eventId,
      order_id: input.orderId ?? null,
      customer_id: input.customerId ?? contact.customer_id ?? null,
      contact_platform: 'facebook',
      contact_id: contact.id,
      action_source: 'business_messaging',
      event_time: new Date(eventTime * 1000).toISOString(),
    });
    if (!claim) return 'skipped';

    const body = buildCapiRequest([
      buildCapiEvent({
        eventName,
        eventId,
        eventTime,
        actionSource: 'business_messaging',
        messagingChannel: 'messenger',
        userData: { page_id: pageId, page_scoped_user_id: String(contact.fb_psid) },
        ...(input.customData ? { customData: input.customData } : {}),
      }),
    ]);

    const apiPath = `/${datasetId}/events`;
    const action = `${eventName.toLowerCase()}_event`;
    const reference = input.orderId
      ? { reference_type: 'order', reference_id: input.orderId }
      : { reference_type: 'chat_contact', reference_id: contact.id };
    const startedAt = Date.now();

    let httpStatus = 0;
    let responseBody: unknown = null;
    try {
      const res = await fetch(`${GRAPH_BASE}${apiPath}?access_token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      httpStatus = res.status;
      responseBody = await res.json().catch(() => null);

      if (!res.ok) {
        const permissionDenied = isPageEventsPermissionError(responseBody);
        const why = permissionDenied
          ? PAGE_EVENTS_FIX_MESSAGE
          : `ส่ง ${eventName} event ไม่สำเร็จ (HTTP ${res.status})`;
        // สิทธิ์ไม่ถึง = เรื่องของ token ไม่ใช่ของ event ใบนี้ → ขึ้นป้ายบนการ์ดเพจให้เจ้าของเห็น
        if (permissionDenied) await markCapiError(account.id, why);
        // ปิดใบเป็น failed — รอบกวาด/ทริกเกอร์ครั้งหน้ายึดคืนมาลองใหม่ได้ (ดู claimAdEvent)
        await finishAdEvent(claim.id, {
          status: 'failed',
          httpStatus,
          error: why,
          response: responseBody,
        });
        await logError(account, companyId, why, {
          api_path: apiPath,
          http_status: httpStatus,
          request_body: body,
          response_body: responseBody,
          action,
          ...reference,
        });
        return 'failed';
      }
    } catch (err) {
      const why = `ยิง ${eventName} event ไม่ถึง Meta: ${errText(err)}`;
      await finishAdEvent(claim.id, { status: 'failed', error: why });
      await logError(account, companyId, why, { api_path: apiPath, request_body: body, action, ...reference });
      return 'failed';
    }

    // ยิงผ่านจริง = ป้ายบนการ์ดต้องเขียว (ล้างเหตุผลเก่าที่แก้ไปแล้วทิ้ง)
    await markCapiOk(account.id);
    await finishAdEvent(claim.id, { status: 'sent', httpStatus, response: responseBody });

    await logIntegrationNow({
      company_id: companyId,
      integration: INTEGRATION,
      account_id: account.id,
      account_name: account.account_name,
      direction: 'outgoing',
      action,
      method: 'POST',
      api_path: apiPath,
      request_body: body,
      response_body: responseBody,
      http_status: httpStatus,
      status: 'success',
      ...reference,
      duration_ms: Date.now() - startedAt,
    }).catch(() => null);

    return 'sent';
  } catch (err) {
    // กันเหนียวชั้นนอกสุด — ฟังก์ชันนี้ห้าม throw ไม่ว่าเกิดอะไร
    console.error('[MetaCAPI] sendMessagingEventForContact failed:', errText(err));
    return 'failed';
  }
}

/** จำนวนลูกค้าต่อ 1 query `orders` — กัน URL ของ PostgREST ยาวเกิน */
const ORDER_LOOKUP_CHUNK = 200;
/** เพดานรายชื่อลูกค้าที่ผูกห้องแชท — มากกว่านี้แปลว่าต้องคิดใหม่ ไม่ใช่ดึงเพิ่ม */
const LINKED_CUSTOMER_CAP = 2000;

interface SweepCounts {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * กวาดออเดอร์ที่ชำระแล้วแต่ **ไม่เคยยิง Purchase event** ให้ครบย้อนหลัง
 *
 * ทำไมต้องมี: `sendPurchaseEventForOrder()` ยิงครั้งเดียวตอนออเดอร์กลายเป็น paid
 * ถ้ารอบนั้นล้มก็คืนสิทธิ์ทิ้งไว้เฉย ๆ **ไม่มีใครกลับมาลองใหม่** — ของจริงล้มได้ 3 แบบ:
 *   1. token ของเพจยังไม่มีสิทธิ์ `page_events` (ทุกเพจเป็นแบบนี้จนถึง 9 ก.ย. 2026)
 *   2. Meta ล่ม / เน็ตสะดุดตอนนั้นพอดี
 *   3. token หมดอายุอยู่ ณ ตอนที่ออเดอร์ชำระ แล้วเจ้าของมาเชื่อมใหม่ทีหลัง
 * ทั้งสามแบบ "หายเงียบ" เหมือนกันหมด — โฆษณาจะ optimize ผิดโดยไม่มีใครรู้
 *
 * ⏳ **Meta รับย้อนหลังได้แค่ 7 วัน** — พลาดในกรอบนี้เยียวยาได้เอง เกินกว่านั้นคือหายจริง
 * (จึงต้องเกาะไปกับ cron ตัวเฝ้าที่วิ่งทุก 15 นาที ไม่ใช่ปุ่มให้คนมากดเอง)
 *
 * เริ่มจาก **ลูกค้าที่ผูกห้องแชท Messenger อยู่แล้ว** ไม่ใช่จากออเดอร์ที่ paid ทั้งหมด —
 * ร้านหนึ่งมีออเดอร์ marketplace พันกว่าใบต่อเดือนที่ไม่มีทางผูกกับ Messenger ได้เลย
 * กวาดจากฝั่งนั้นหน้าละ 100 ใบจะเต็มไปด้วยของที่ยังไงก็ข้าม แล้วใบที่ควรยิงไม่เคยถึงคิว
 *
 * **ห้าม throw** — ล้มตรงไหนก็คืนยอดเท่าที่ทำได้ (ผู้เรียกคือ cron ที่มีงานอื่นต่อ)
 */
export async function sweepUnsentPurchaseEvents(
  opts: {
    /** ย้อนหลังกี่วัน (บีบไว้ที่ 1..7 ตามเพดานของ Meta) */
    days?: number;
    /** ยิงได้มากสุดกี่ใบในรอบนี้ */
    limit?: number;
    /** epoch ms — เลยเวลานี้แล้วหยุด (ปล่อยที่เหลือไว้รอบหน้า) */
    deadlineAt?: number;
    /** จำกัดบริษัทเดียว (สายที่ผู้ใช้กดเอง) */
    companyId?: string;
  } = {},
): Promise<SweepCounts> {
  const counts: SweepCounts = { scanned: 0, sent: 0, skipped: 0, failed: 0 };
  const days = Math.min(7, Math.max(1, Math.floor(opts.days ?? 7)));
  const limit = Math.max(1, Math.floor(opts.limit ?? 100));
  const deadlineAt = opts.deadlineAt ?? Date.now() + 20_000;

  // สรุปรายบริษัท — log แยกใบต่อบริษัท เจ้าของร้านจะได้เห็นเฉพาะของตัวเอง
  const perCompany = new Map<string, { sent: number; failed: number; scanned: number; skipped: number }>();
  const bump = (companyId: string, key: 'sent' | 'failed' | 'scanned' | 'skipped') => {
    const row = perCompany.get(companyId) || { sent: 0, failed: 0, scanned: 0, skipped: 0 };
    row[key] += 1;
    perCompany.set(companyId, row);
  };

  try {
    // 1) บริษัทที่มีเพจ Facebook เปิดใช้อยู่ — ที่เหลือไม่มีทางยิง CAPI ได้อยู่แล้ว
    let accountQuery = supabaseAdmin
      .from('chat_accounts')
      .select('company_id')
      .eq('platform', 'facebook')
      .eq('is_active', true);
    if (opts.companyId) accountQuery = accountQuery.eq('company_id', opts.companyId);

    const { data: accountRows } = await accountQuery;
    const companyIds = [
      ...new Set(((accountRows || []) as Array<{ company_id: string | null }>)
        .map((a) => a.company_id)
        .filter((id): id is string => !!id)),
    ];
    if (companyIds.length === 0) return counts;

    // 2) ลูกค้าที่ผูกกับห้องแชท Messenger จริง ๆ — จุดตั้งต้นของการกวาด
    const { rows: contactRows } = await fetchAllRows<{ customer_id: string | null }>(
      (from, to) =>
        supabaseAdmin
          .from('fb_contacts')
          .select('customer_id', { count: 'exact' })
          .in('company_id', companyIds)
          .eq('source', 'facebook')
          .not('chat_account_id', 'is', null)
          .not('customer_id', 'is', null)
          .range(from, to),
      { to: LINKED_CUSTOMER_CAP - 1 },
    );

    const customerIds = [
      ...new Set(contactRows.map((c) => c.customer_id).filter((id): id is string => !!id)),
    ];
    if (customerIds.length === 0) return counts;

    // 3) ออเดอร์ที่ชำระแล้วแต่ยังไม่เคยยิง — `updated_at` เป็นตะแกรงหยาบ ๆ พอ
    //    (เวลาจ่ายเงินจริงมาจาก payment_records ในขั้นถัดไป)
    const since = new Date(Date.now() - days * 86400_000).toISOString();
    type CandidateRow = {
      id: string;
      company_id: string;
      customer_id: string | null;
      order_number: string | null;
      updated_at: string | null;
    };
    let candidates: CandidateRow[] = [];

    for (let i = 0; i < customerIds.length; i += ORDER_LOOKUP_CHUNK) {
      const chunk = customerIds.slice(i, i + ORDER_LOOKUP_CHUNK);
      const { data: orders } = await supabaseAdmin
        .from('orders')
        .select('id, company_id, customer_id, order_number, updated_at')
        .in('customer_id', chunk)
        .eq('payment_status', 'paid')
        .neq('order_status', 'cancelled')
        .is('meta_purchase_sent_at', null)
        .gte('updated_at', since)
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (orders?.length) candidates = candidates.concat(orders as CandidateRow[]);
    }

    // เรียงรวมอีกรอบแล้วค่อยตัด — ใบใหม่สุดของทั้งร้านต้องได้คิวก่อน ไม่ใช่ใบใหม่สุดของ chunk แรก
    candidates.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    candidates = candidates.slice(0, limit);
    counts.scanned = candidates.length;
    if (candidates.length === 0) return counts;
    for (const order of candidates) bump(order.company_id, 'scanned');

    // 4) เวลาที่เงินเข้าจริง — `orders` ไม่มีคอลัมน์นี้ ต้องอ่านจาก payment_records
    //    (ยิงด้วยเวลา "ตอนนี้" ของออเดอร์เมื่อ 5 วันก่อน = สถิติของ Meta เพี้ยนทั้งแคมเปญ)
    //    สูตรเดียวกับที่ตัวกวาดของบัญชีโฆษณาใช้ → [lib/ads/subject.ts](../ads/subject.ts)
    const candidateIds = candidates.map((o) => o.id);
    const paidAtByOrder = await resolvePaidAt(candidateIds);

    // 5) ยิงทีละใบ — หมดงบเวลาก็หยุด ที่เหลือรออีก 15 นาที (ยังอยู่ในกรอบ 7 วัน)
    for (const order of candidates) {
      if (Date.now() > deadlineAt) break;

      const paidAtMs = paidAtByOrder.get(order.id) ?? (order.updated_at ? Date.parse(order.updated_at) : NaN);
      const eventTime = Number.isFinite(paidAtMs) ? Math.floor(paidAtMs / 1000) : undefined;

      const result = await sendPurchaseEventForOrder(order.id, {
        eventTime,
        skipIfPageNotReady: true,
      });
      counts[result === 'sent' ? 'sent' : result === 'failed' ? 'failed' : 'skipped'] += 1;
      bump(order.company_id, result === 'sent' ? 'sent' : result === 'failed' ? 'failed' : 'skipped');
    }

    // 6) จดสรุป **เฉพาะรอบที่มีอะไรเกิดขึ้นจริง** — ไม่งั้นได้ log เปล่าทุก 15 นาทีตลอดปี
    if (counts.sent > 0 || counts.failed > 0) {
      for (const [companyId, row] of perCompany) {
        if (row.sent === 0 && row.failed === 0) continue;
        const status: 'success' | 'error' = row.failed > 0 && row.sent === 0 ? 'error' : 'success';
        await logIntegrationNow({
          company_id: companyId,
          integration: INTEGRATION,
          direction: 'outgoing',
          action: 'sweep',
          method: 'JOB',
          status,
          response_body: row,
          error_message: status === 'error' ? 'กวาดส่ง Purchase event ย้อนหลังไม่สำเร็จทุกใบในรอบนี้' : undefined,
        }).catch(() => null);
      }
    }

    return counts;
  } catch (err) {
    console.error('[MetaCAPI] sweepUnsentPurchaseEvents failed:', errText(err));
    return counts;
  }
}

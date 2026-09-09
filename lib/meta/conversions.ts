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

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
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
  return {
    data: [
      {
        event_name: 'Purchase',
        event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        action_source: 'business_messaging',
        messaging_channel: 'messenger',
        user_data: {
          page_id: input.pageId,
          page_scoped_user_id: input.psid,
        },
        custom_data: {
          currency: 'THB',
          value: input.value,
          order_id: input.orderNumber ?? input.eventId,
        },
      },
    ],
    partner_agent: 'aoocommerce',
  };
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
  'เพจนี้ยังไม่ได้ให้สิทธิ์ page_events — ไปที่ ตั้งค่า › ช่องทางแชท แล้วกด "เชื่อมต่อ Facebook" ใหม่ให้เพจนี้ (token เดิมขอ scope ไม่ครบ)';

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
    const getRes = await fetch(`${GRAPH_BASE}${path}?access_token=${encodeURIComponent(token)}`);
    const getBody = (await getRes.json().catch(() => null)) as { id?: string; error?: unknown } | null;
    if (getRes.ok && getBody?.id) {
      datasetId = String(getBody.id);
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
 * ส่ง Purchase event ของออเดอร์ที่เพิ่งชำระเงิน — เรียกได้จากทุกจุดที่ทำให้ออเดอร์เป็น paid
 *
 * เงียบ (ไม่ทำอะไร ไม่ log) เมื่อ: ออเดอร์ยังไม่ paid · ยิงไปแล้ว · ไม่มีลูกค้า ·
 * ลูกค้าไม่ได้ผูกกับผู้ติดต่อ Messenger · เพจไม่ได้เปิดใช้อยู่
 */
export async function sendPurchaseEventForOrder(orderId: string): Promise<void> {
  try {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, company_id, order_number, customer_id, total_amount, payment_status, meta_purchase_sent_at')
      .eq('id', orderId)
      .single<OrderRow>();

    if (!order) return;
    if (order.payment_status !== 'paid') return;
    if (order.meta_purchase_sent_at) return;
    if (!order.customer_id) return;

    // ลูกค้าคนนี้ผูกกับห้องแชท Messenger ไหน — เอาห้องที่คุยล่าสุด (IG ยังไม่รองรับ)
    const { data: contacts } = await supabaseAdmin
      .from('fb_contacts')
      .select('fb_psid, fb_page_id, chat_account_id, last_message_at')
      .eq('customer_id', order.customer_id)
      .eq('company_id', order.company_id)
      .eq('source', 'facebook')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(5);

    const candidates = (contacts || []).filter((c) => c.fb_psid && c.chat_account_id);
    if (candidates.length === 0) return;

    // หาเพจที่ยังเปิดใช้อยู่ + page_id ตรงกับที่ผู้ติดต่อคุยด้วย
    let account: PageAccount | null = null;
    let psid: string | null = null;

    for (const contact of candidates) {
      const { data: acc } = await supabaseAdmin
        .from('chat_accounts')
        .select('id, company_id, account_name, credentials')
        .eq('id', contact.chat_account_id)
        .eq('company_id', order.company_id)
        .eq('platform', 'facebook')
        .eq('is_active', true)
        .single<PageAccount>();
      if (!acc) continue;

      const pageId = credString((acc.credentials || {}) as Record<string, unknown>, 'page_id');
      // ผู้ติดต่อบางแถวไม่มี fb_page_id — ถือว่าใช้เพจของ chat_account นั้นได้
      if (!pageId) continue;
      if (contact.fb_page_id && String(contact.fb_page_id) !== pageId) continue;

      account = acc;
      psid = String(contact.fb_psid);
      break;
    }

    if (!account || !psid) return;

    const creds = (account.credentials || {}) as Record<string, unknown>;
    const pageId = credString(creds, 'page_id');
    const token = credString(creds, 'page_access_token');
    if (!pageId || !token) return;

    const datasetId = await getOrCreateDatasetId(account);
    if (!datasetId) return; // getOrCreateDatasetId log ให้แล้วเมื่อเป็น error จริง

    const value = Number(order.total_amount) || 0;

    // จองสิทธิ์ "ก่อน" ยิง — สองสายที่ทำให้ paid พร้อมกันจะมีแค่สายเดียวที่ผ่านตรงนี้
    const claimed = await claimOrder(order.id);
    if (!claimed) return;

    const body = buildPurchaseEventBody({
      pageId,
      psid,
      eventId: order.id,
      value,
      orderNumber: order.order_number,
    });
    const apiPath = `/${datasetId}/events`;
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
        // คืนสิทธิ์เสมอ → ออเดอร์ใบถัดไปที่ชำระจะได้ลองใหม่ (1 call + 1 log ต่อครั้ง ไม่วนซ้ำในรอบเดียว)
        await releaseOrder(order.id);
        const permissionDenied = isPageEventsPermissionError(responseBody);
        const why = permissionDenied
          ? PAGE_EVENTS_FIX_MESSAGE
          : `ส่ง Purchase event ไม่สำเร็จ (HTTP ${res.status})`;
        // สิทธิ์ไม่ถึง = เรื่องของ token ไม่ใช่ของออเดอร์ใบนี้ → ขึ้นป้ายบนการ์ดเพจให้เจ้าของเห็น
        if (permissionDenied) await markCapiError(account.id, why);
        await logError(account, order.company_id, why, {
          api_path: apiPath,
          http_status: httpStatus,
          request_body: body,
          response_body: responseBody,
          reference_id: order.id,
          reference_label: order.order_number,
        });
        return;
      }
    } catch (err) {
      await releaseOrder(order.id);
      await logError(account, order.company_id, `ยิง Purchase event ไม่ถึง Meta: ${errText(err)}`, {
        api_path: apiPath,
        request_body: body,
        reference_id: order.id,
        reference_label: order.order_number,
      });
      return;
    }

    // ยิงผ่านจริง = ป้ายบนการ์ดต้องเขียว (ล้างเหตุผลเก่าที่แก้ไปแล้วทิ้ง)
    await markCapiOk(account.id);

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
  } catch (err) {
    // กันเหนียวชั้นนอกสุด — ฟังก์ชันนี้ห้าม throw ไม่ว่าเกิดอะไร
    console.error('[MetaCAPI] sendPurchaseEventForOrder failed:', errText(err));
  }
}

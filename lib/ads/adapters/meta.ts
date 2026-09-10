// Path: lib/ads/adapters/meta.ts
//
// แปลง subject → คำขอของ Meta Conversions API แล้วยิงเข้า **dataset ของบัญชีโฆษณา**
//
// ต่างจากสายเดิม (`lib/meta/conversions.ts` ที่ยิงเข้า dataset ของ**เพจ**) ตรงตัวจับคู่:
//   • dataset เพจ  → `page_id` + `page_scoped_user_id` ⇒ ยิงได้เฉพาะบิลที่ผูกห้อง Messenger
//   • dataset โฆษณา → **เบอร์/อีเมลที่ hash แล้ว** ⇒ บิล POS · หน้าร้าน · บิลมือ · LINE ก็ยิงได้
// ⇒ ออเดอร์ใบเดียวไปได้ทั้งสองปลายทาง Meta ตัดซ้ำให้เองด้วย `event_id` (= order id)
//
// **ห้าม throw** — คืน outcome เสมอ ผู้เรียกเป็นคนจดลงสมุด (ledger)

import { logIntegrationNow } from '@/lib/integration-logger';
import { graphErrorText, isPermissionError, isTokenError } from '@/lib/meta/graph';
import { sendCapiEvents } from '@/lib/meta/ads';
import { buildCapiEvent, buildCapiRequest } from '@/lib/meta/capi';
import { buildHashedUserData, hasMatchableIdentity } from '@/lib/meta/hashing';
import { markAdAccount, AD_ACCOUNT_FIX } from '../accounts';
import type { AdAccountRow, AdPlatformAdapter, AdSendOutcome, ConversionSubject } from '../types';

const INTEGRATION = 'meta_ads';
const ACTION = 'capi_event';

function skipped(reason: string): AdSendOutcome {
  return { status: 'skipped', reason };
}

async function send(subject: ConversionSubject, account: AdAccountRow): Promise<AdSendOutcome> {
  // บัญชีที่รู้อยู่แล้วว่าใช้ไม่ได้ — ไม่ต้องเสียคำขอไปให้โดนปฏิเสธ
  if (!account.is_active || account.status === 'token_expired' || !account.dataset_id || !account.access_token) {
    return skipped('account_not_ready');
  }

  // Meta จับคู่คนด้วยเบอร์/อีเมลที่ hash แล้ว — external_id/country อย่างเดียวจับคู่ไม่ได้
  // (ยิงไปก็ได้แต่ event ที่ไม่มีใครรับ แถมลดคะแนนคุณภาพการจับคู่ของ dataset)
  const userData = buildHashedUserData({
    phone: subject.customer?.phone,
    email: subject.customer?.email,
    externalId: subject.customer?.id,
  });
  if (!hasMatchableIdentity(userData)) return skipped('no_identity');

  const body = buildCapiRequest([
    buildCapiEvent({
      eventName: subject.eventName,
      eventId: subject.eventId,
      eventTime: subject.eventTime,
      actionSource: subject.actionSource,
      userData: { ...userData },
      customData: subject.customData,
    }),
  ]);

  const testEventCode = (account.metadata?.test_event_code as string | undefined) || undefined;
  const result = await sendCapiEvents(account.dataset_id, account.access_token, body, { testEventCode });

  if (result.ok) {
    // ยิงผ่านจริง = ล้างเหตุผลเก่าที่แก้ไปแล้วทิ้ง ไม่งั้นป้ายบนการ์ดค้างสีเหลืองตลอด
    await markAdAccount(account.id, {
      capi_ok_at: new Date().toISOString(),
      last_error: null,
      status: 'active',
    });
    return { status: 'sent', httpStatus: result.status, response: result.body };
  }

  // ล้มแล้วต้องแยกให้ออกว่าเป็นเรื่องของ token / สิทธิ์ / เรื่องชั่วคราว — คนละวิธีแก้กัน
  const graphText = graphErrorText(result);
  let message: string;
  if (isTokenError(result.error, result.status)) {
    message = AD_ACCOUNT_FIX.token_expired;
    await markAdAccount(account.id, { status: 'token_expired', last_error: message, last_checked_at: new Date().toISOString() });
  } else if (isPermissionError(result.error)) {
    message = AD_ACCOUNT_FIX.permission;
    await markAdAccount(account.id, { status: 'error', last_error: message, last_checked_at: new Date().toISOString() });
  } else {
    // เรื่องชั่วคราว (Meta ล่ม/เน็ตสะดุด/จำกัดอัตรา) — จดไว้แต่ไม่เปลี่ยนสถานะบัญชี
    // รอบกวาดถัดไปหยิบใบที่ failed มาลองใหม่เอง
    message = `ส่ง ${subject.eventName} เข้า dataset ไม่สำเร็จ (${graphText}) — ระบบจะลองใหม่ในรอบกวาดถัดไป ถ้ายังไม่หายให้กด "ทดสอบการเชื่อมต่อ" ที่ ตั้งค่า › บัญชีโฆษณา`;
    await markAdAccount(account.id, { last_error: message, last_checked_at: new Date().toISOString() });
  }

  await logIntegrationNow({
    company_id: subject.companyId,
    integration: INTEGRATION,
    account_id: account.id,
    account_name: account.name,
    direction: 'outgoing',
    action: ACTION,
    method: 'POST',
    api_path: `/${account.dataset_id}/events`,
    request_body: body,
    response_body: result.body,
    http_status: result.status,
    status: 'error',
    error_message: message,
    reference_type: 'order',
    reference_id: subject.order?.id,
    reference_label: subject.order?.order_number || undefined,
    duration_ms: result.durationMs,
  }).catch(() => null);

  return { status: 'failed', httpStatus: result.status, error: `${graphText} · ${message}`, response: result.body };
}

/**
 * ⚠️ **จด log เฉพาะขาล้ม** — ขาสำเร็จมีทุกใบอยู่ในตาราง `ad_events` แล้ว
 * (ร้านที่ขายวันละ 300 บิล × บัญชีโฆษณา 2 ใบ = 600 log/วันที่ไม่มีใครอ่าน แล้วไปเบียดแคชของ DB)
 */
export const metaAdapter: AdPlatformAdapter = {
  platform: 'meta',
  send: async (subject, account) => {
    try {
      return await send(subject, account);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ads/meta] send threw:', message);
      return { status: 'failed', error: message };
    }
  },
};

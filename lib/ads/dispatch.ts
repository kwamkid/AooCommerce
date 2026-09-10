// Path: lib/ads/dispatch.ts
//
// **ทางเข้าเดียว** ของ "เกิดเรื่องที่โฆษณาควรรู้ บอกแพลตฟอร์มโฆษณาที" — ทุกจุดที่ทำให้บิล
// เป็น paid · เปิดบิลจากห้องแชท · ห้องแชทกลายเป็นลูกค้าคุณภาพ เรียกตัวนี้ตัวเดียว
// (ของเดิมเรียก `sendPurchaseEventForOrder` ตรง ๆ ซึ่งไปได้แค่ dataset ของเพจ)
//
// ใบเดียวไป **สองสาย** พร้อมกัน:
//   1. dataset ของเพจ (business_messaging + PSID) — จับคู่ด้วยห้องแชท
//   2. dataset ของบัญชีโฆษณา (เบอร์/อีเมล hash) — จับคู่ด้วยตัวคน
// สองสายกันซ้ำแยกกันโดยตั้งใจ (คนละ `destination` ในสมุด `ad_events` · Purchase สายเพจ
// ยังจองที่ `orders.meta_purchase_sent_at` ตามเดิม) ⇒ ยิงทั้งคู่ได้โดยไม่นับซ้ำ
// เพราะ `event_id` เป็นใบเดียวกัน Meta ตัดซ้ำให้เอง
//
// **ห้าม throw** — ผู้เรียกอยู่ใน after() หลังบันทึกของจริงสำเร็จแล้ว

import {
  sendMessagingEventForContact,
  sendPurchaseEventForOrder,
  type PurchaseSendResult,
} from '@/lib/meta/conversions';
import { isEventTimeAcceptable } from '@/lib/meta/capi';
import { buildHashedUserData, hasMatchableIdentity } from '@/lib/meta/hashing';
import { listActiveAdAccounts } from './accounts';
import { metaAdapter } from './adapters/meta';
import { claimAdEvent, finishAdEvent } from './ledger';
import {
  buildInitiateCheckoutSubject,
  buildPurchaseSubject,
  buildQualifiedLeadSubject,
  isConversionEligible,
  isPurchaseEligible,
  type EligibilityResult,
} from './subject';
import type { AdAccountRow, AdSendStatus, ConversionSubject } from './types';

export type DispatchInput =
  | { event: 'Purchase'; orderId: string; eventTime?: number; skipIfAccountNotReady?: boolean }
  | { event: 'InitiateCheckout'; orderId: string }
  | { event: 'QualifiedLead'; companyId: string; contactPlatform: 'facebook'; contactId: string; trigger: 'messages' | 'tag' };

export interface DispatchResult {
  /** ผลของสาย dataset เพจ — null = ไม่ได้เรียกสายนี้ (บิลที่ไม่ได้ผูกห้อง Messenger) */
  messaging: PurchaseSendResult | null;
  ads: Array<{ ad_account_id: string; status: AdSendStatus; reason?: string }>;
}

/**
 * สายที่ 2: ยิงเข้า dataset ของ**ทุกบัญชีโฆษณา**ที่บริษัทนี้เปิดใช้อยู่
 *
 * แยกออกมาเพราะทั้งสาม event เดินทางเดียวกันเป๊ะ ต่างกันแค่ "ใบแบบไหนนับ" (`eligible`)
 * — copy ลูปไปอีกชุดเมื่อไหร่ การจองสิทธิ์/เช็คอายุ event จะเดินหนีกันโดยไม่มีใครรู้
 */
async function sendToAdAccounts(
  subject: ConversionSubject,
  result: DispatchResult,
  opts: {
    /** ไม่ส่ง = ทุกบัญชีนับหมด (QualifiedLead ไม่ได้ผูกกับบิล จึงไม่มีกติกาต่อบัญชี) */
    eligible?: (account: AdAccountRow) => EligibilityResult;
    skipIfAccountNotReady?: boolean;
  } = {},
): Promise<void> {
  const accounts = await listActiveAdAccounts(subject.companyId);
  const eventTimeIso = new Date(subject.eventTime * 1000).toISOString();

  for (const account of accounts) {
    const eligible = opts.eligible ? opts.eligible(account) : { ok: true };
    if (!eligible.ok) {
      result.ads.push({ ad_account_id: account.id, status: 'skipped', reason: eligible.reason });
      continue;
    }
    if (!account.dataset_id) {
      result.ads.push({ ad_account_id: account.id, status: 'skipped', reason: 'no_dataset' });
      continue;
    }
    // ตัวกวาดข้ามบัญชีที่เจ้าของยังไม่แก้ — จะได้ไม่ไปรบกวน Meta ทุก 15 นาทีเปล่า ๆ
    if (opts.skipIfAccountNotReady && account.status !== 'active') {
      result.ads.push({ ad_account_id: account.id, status: 'skipped', reason: 'account_not_ready' });
      continue;
    }
    // เช็คอายุ event **ก่อนจองสิทธิ์** — จองแล้วพบว่าเวลาเกิน = ใบนั้นถูกปิดตายทั้งที่ไม่เคยยิง
    if (!isEventTimeAcceptable(subject.eventTime, subject.actionSource)) {
      result.ads.push({ ad_account_id: account.id, status: 'skipped', reason: 'event_too_old' });
      continue;
    }

    const claim = await claimAdEvent({
      company_id: subject.companyId,
      platform: 'meta',
      destination: 'ad_dataset',
      destination_id: account.dataset_id,
      ad_account_id: account.id,
      event_name: subject.eventName,
      event_id: subject.eventId,
      order_id: subject.order?.id ?? null,
      customer_id: subject.customer?.id ?? null,
      contact_platform: subject.contact?.platform ?? null,
      contact_id: subject.contact?.contactId ?? null,
      action_source: subject.actionSource,
      event_time: eventTimeIso,
    });
    if (!claim) {
      // มีใบนี้อยู่แล้ว (ยิงไปแล้ว/สายอื่นจองไปพอดี) — ตัวกวาดจะเป็นคนหยิบใบที่ล้มมาลองใหม่
      result.ads.push({ ad_account_id: account.id, status: 'skipped', reason: 'already_claimed' });
      continue;
    }

    const outcome = await metaAdapter.send(subject, account);
    await finishAdEvent(claim.id, outcome);
    result.ads.push({ ad_account_id: account.id, status: outcome.status, reason: outcome.reason });
  }
}

export async function dispatchConversion(input: DispatchInput): Promise<DispatchResult> {
  const result: DispatchResult = { messaging: null, ads: [] };

  try {
    // ─── เปิดบิลให้จากห้องแชท (ยังไม่จ่าย) ────────────────────────────
    if (input.event === 'InitiateCheckout') {
      const subject = await buildInitiateCheckoutSubject(input.orderId);
      if ('skip' in subject) return result;
      const order = subject.order;

      // 1) dataset ของเพจ — เฉพาะบิลที่เปิดจากห้อง Messenger จริง
      if (order?.chat_platform === 'facebook' && order.chat_contact_id) {
        result.messaging = await sendMessagingEventForContact({
          companyId: subject.companyId,
          contactId: order.chat_contact_id,
          eventName: subject.eventName,
          eventId: subject.eventId,
          eventTime: subject.eventTime,
          customData: subject.customData,
          orderId: order.id,
          customerId: order.customer_id,
        }).catch(() => 'failed' as PurchaseSendResult);
      }

      // 2) dataset ของบัญชีโฆษณา — กติกาเดียวกับ Purchase **ยกเว้นข้อ "จ่ายแล้ว"**
      await sendToAdAccounts(subject, result, {
        eligible: (account) => isConversionEligible(subject.order, account),
      });
      return result;
    }

    // ─── ห้องแชทที่คุยจนได้คุณภาพ ─────────────────────────────────────
    if (input.event === 'QualifiedLead') {
      const subject = await buildQualifiedLeadSubject({
        companyId: input.companyId,
        contactId: input.contactId,
      });
      if ('skip' in subject) return result;

      // 1) dataset ของเพจ — สายหลักของ event นี้ (จับคู่ด้วย PSID ไม่ต้องรู้จักตัวคน)
      result.messaging = await sendMessagingEventForContact({
        companyId: subject.companyId,
        contactId: input.contactId,
        eventName: subject.eventName,
        eventId: subject.eventId,
        eventTime: subject.eventTime,
        customerId: subject.customer?.id ?? null,
      }).catch(() => 'failed' as PurchaseSendResult);

      // 2) dataset ของบัญชีโฆษณา — จับคู่ด้วยเบอร์/อีเมลเท่านั้น ห้องที่ยังไม่ผูกลูกค้า
      //    จึงไม่มีอะไรให้ Meta จับคู่ (ยิงไปก็ได้แต่ event ที่ไม่มีใครรับ + ลดคะแนน dataset)
      const identity = buildHashedUserData({
        phone: subject.customer?.phone,
        email: subject.customer?.email,
        externalId: subject.customer?.id,
      });
      if (hasMatchableIdentity(identity)) await sendToAdAccounts(subject, result);
      return result;
    }

    // ─── บิลที่เงินเข้าแล้ว ───────────────────────────────────────────
    const { orderId, eventTime, skipIfAccountNotReady } = input;

    // 1) สายเดิม: dataset ของเพจ (ยิงได้เฉพาะบิลที่ผูกห้อง Messenger — ที่เหลือเงียบไปเอง)
    result.messaging = await sendPurchaseEventForOrder(orderId, {
      eventTime,
      skipIfPageNotReady: !!skipIfAccountNotReady,
    }).catch(() => 'failed' as PurchaseSendResult);

    // 2) สายใหม่: dataset ของบัญชีโฆษณา
    const subject = await buildPurchaseSubject(orderId, { eventTime });
    if ('skip' in subject) return result;

    await sendToAdAccounts(subject, result, {
      // เกณฑ์ว่าบิลแบบไหนนับ ตั้งได้ต่อบัญชี (บางร้านอยากนับบิลขายส่งด้วย)
      eligible: (account) => isPurchaseEligible(subject.order, account),
      skipIfAccountNotReady,
    });

    return result;
  } catch (err) {
    console.error('[ads/dispatch] failed:', err instanceof Error ? err.message : err);
    return result;
  }
}

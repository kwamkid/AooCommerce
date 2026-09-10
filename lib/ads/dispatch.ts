// Path: lib/ads/dispatch.ts
//
// **ทางเข้าเดียว** ของ "ออเดอร์ใบนี้ชำระแล้ว บอกแพลตฟอร์มโฆษณาที" — ทุกจุดที่ทำให้บิลเป็น paid
// เรียกตัวนี้ตัวเดียว (ของเดิมเรียก `sendPurchaseEventForOrder` ตรง ๆ ซึ่งไปได้แค่ dataset ของเพจ)
//
// ใบเดียวไป **สองสาย** พร้อมกัน:
//   1. dataset ของเพจ (business_messaging + PSID) — สายเดิม กันซ้ำที่ `orders.meta_purchase_sent_at`
//   2. dataset ของบัญชีโฆษณา (เบอร์/อีเมล hash) — สายใหม่ กันซ้ำที่ unique index ของ `ad_events`
// สองสายกันซ้ำคนละกลไกโดยตั้งใจ: สายแรกมีปลายทางเดียวต่อออเดอร์ · สายหลังมีได้หลายบัญชี
// ⇒ ยิงทั้งคู่ได้โดยไม่นับซ้ำ เพราะ `event_id` เป็น order id เดียวกัน Meta ตัดซ้ำให้เอง
//
// **ห้าม throw** — ผู้เรียกอยู่ใน after() หลังบันทึกเงินสำเร็จแล้ว

import { sendPurchaseEventForOrder, type PurchaseSendResult } from '@/lib/meta/conversions';
import { isEventTimeAcceptable } from '@/lib/meta/capi';
import { listActiveAdAccounts } from './accounts';
import { metaAdapter } from './adapters/meta';
import { claimAdEvent, finishAdEvent } from './ledger';
import { buildPurchaseSubject, isPurchaseEligible } from './subject';
import type { AdSendStatus } from './types';

export type DispatchInput =
  | { event: 'Purchase'; orderId: string; eventTime?: number; skipIfAccountNotReady?: boolean }
  | { event: 'InitiateCheckout'; orderId: string }
  | { event: 'QualifiedLead'; companyId: string; contactPlatform: 'facebook'; contactId: string; trigger: 'messages' | 'tag' };

export interface DispatchResult {
  /** ผลของสาย dataset เพจ — null = ไม่ได้เรียกสายนี้ (event ที่ไม่ใช่ Purchase) */
  messaging: PurchaseSendResult | null;
  ads: Array<{ ad_account_id: string; status: AdSendStatus; reason?: string }>;
}

export async function dispatchConversion(input: DispatchInput): Promise<DispatchResult> {
  const result: DispatchResult = { messaging: null, ads: [] };

  try {
    // TODO (Phase 3): InitiateCheckout = ตอนสร้างบิลจากห้องแชท · QualifiedLead = ห้องที่คุยจนได้คุณภาพ
    // ทั้งคู่ยังไม่มีจุดเรียกจริง — คืนผลว่างไปก่อน ดีกว่าปล่อยให้ผู้เรียกเดาว่าทำอะไรไปแล้วบ้าง
    if (input.event !== 'Purchase') return result;

    const { orderId, eventTime, skipIfAccountNotReady } = input;

    // 1) สายเดิม: dataset ของเพจ (ยิงได้เฉพาะบิลที่ผูกห้อง Messenger — ที่เหลือเงียบไปเอง)
    result.messaging = await sendPurchaseEventForOrder(orderId, {
      eventTime,
      skipIfPageNotReady: !!skipIfAccountNotReady,
    }).catch(() => 'failed' as PurchaseSendResult);

    // 2) สายใหม่: dataset ของบัญชีโฆษณา
    const subject = await buildPurchaseSubject(orderId, { eventTime });
    if ('skip' in subject) return result;

    const accounts = await listActiveAdAccounts(subject.companyId);
    const eventTimeIso = new Date(subject.eventTime * 1000).toISOString();

    for (const account of accounts) {
      // เกณฑ์ว่าบิลแบบไหนนับ ตั้งได้ต่อบัญชี (บางร้านอยากนับบิลขายส่งด้วย)
      const eligible = isPurchaseEligible(subject.order, account);
      if (!eligible.ok) {
        result.ads.push({ ad_account_id: account.id, status: 'skipped', reason: eligible.reason });
        continue;
      }
      if (!account.dataset_id) {
        result.ads.push({ ad_account_id: account.id, status: 'skipped', reason: 'no_dataset' });
        continue;
      }
      // ตัวกวาดข้ามบัญชีที่เจ้าของยังไม่แก้ — จะได้ไม่ไปรบกวน Meta ทุก 15 นาทีเปล่า ๆ
      if (skipIfAccountNotReady && account.status !== 'active') {
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
        event_name: 'Purchase',
        event_id: subject.eventId,
        order_id: subject.order?.id ?? null,
        customer_id: subject.customer?.id ?? null,
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

    return result;
  } catch (err) {
    console.error('[ads/dispatch] failed:', err instanceof Error ? err.message : err);
    return result;
  }
}

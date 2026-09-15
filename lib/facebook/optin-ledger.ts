// Path: lib/facebook/optin-ledger.ts
//
// สมุดบันทึกคำชวนรับข่าวสาร (`fb_optin_invites`) — **ห้าม throw ทุกฟังก์ชัน**
//
// หัวใจอยู่ที่ **การจองสิทธิ์ด้วยการ insert ก่อนส่ง** (claimOptinInvite):
// unique index `(fb_contact_id, trigger, dedupe_key)` คือคนตัดสินว่าใครได้ส่ง ไม่ใช่ if ในโค้ด
//   • บิลใบเดียวถูก hook ได้ 4 จุด (กดบันทึกชำระ · รับสลิปเป็นชุด · เครดิตเปลี่ยนสินค้า · Beam)
//     ⇒ dedupe_key = `order:<id>` ทำให้มีสายเดียวที่ insert ผ่าน
//   • cron ทุก 10 นาที ทับหน้าต่างเงียบ 30 นาที = ห้องเดียวเข้าเกณฑ์ 3 รอบ
//     ⇒ dedupe_key = `quiet:<last_incoming_at>` ทำให้รอบ 2-3 ถูก index ปฏิเสธเอง
//
// ⚠️ ห้ามเปลี่ยนเป็น "เช็คก่อนว่ามีแถวไหม แล้วค่อย insert" — ระหว่างเช็คกับ insert อีกสายแทรกได้เสมอ
// (โครงเดียวกับ lib/ads/ledger.ts · ที่นั่นอธิบายกับดักนี้ไว้ละเอียด)

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { OptinTrigger } from '@/lib/broadcast/optin';

export type OptinInviteStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface OptinInviteKey {
  company_id: string;
  chat_account_id: string | null;
  fb_contact_id: string;
  trigger: OptinTrigger;
  /** "เหตุผลที่ควรถามครั้งนี้" ไม่ใช่เวลาที่กด — ดูหัวไฟล์ */
  dedupe_key: string;
  title?: string | null;
  frequency?: string | null;
  order_id?: string | null;
  requested_by?: string | null;
}

export interface OptinInviteOutcome {
  status: Exclude<OptinInviteStatus, 'pending'>;
  fb_message_id?: string | null;
  http_status?: number | null;
  error?: string | null;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * จองสิทธิ์ส่งคำชวนใบนี้ — **insert ก่อน ส่งทีหลัง**
 *
 * @returns แถวที่จองได้ · `null` = มีคนถืออยู่/ส่งสำเร็จไปแล้ว ⇒ **ห้ามส่ง**
 *
 * ชนกับใบเดิม → ยึดคืนได้เฉพาะใบ `failed` (Meta ล่มตอนนั้นพอดี ไม่ใช่ความผิดของผู้รับ)
 * ⚠️ ถ้าไม่ยึดคืน ใบที่ล้มจะถูกล็อกถาวรด้วย unique index = ห้องนั้นไม่มีวันถูกชวนอีกเลย
 */
export async function claimOptinInvite(row: OptinInviteKey): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('fb_optin_invites')
      .upsert(
        {
          ...row,
          title: row.title ?? null,
          frequency: row.frequency ?? null,
          order_id: row.order_id ?? null,
          requested_by: row.requested_by ?? null,
          status: 'pending' as const,
          attempts: 1,
        },
        { onConflict: 'fb_contact_id,trigger,dedupe_key', ignoreDuplicates: true },
      )
      .select('id');

    if (error) {
      console.error('[optin/ledger] claim failed:', error.message);
      return null;
    }
    const id = (data as { id: string }[] | null)?.[0]?.id;
    if (id) return { id };

    const { data: existing } = await supabaseAdmin
      .from('fb_optin_invites')
      .select('id, status')
      .eq('fb_contact_id', row.fb_contact_id)
      .eq('trigger', row.trigger)
      .eq('dedupe_key', row.dedupe_key)
      .maybeSingle<{ id: string; status: OptinInviteStatus }>();
    if (existing?.status !== 'failed') return null;
    return (await reclaimFailedOptinInvite(existing.id)) ? { id: existing.id } : null;
  } catch (err) {
    console.error('[optin/ledger] claim threw:', errText(err));
    return null;
  }
}

/** ขอจองใบที่เคยล้มอีกครั้ง — UPDATE แบบมีเงื่อนไข (สองรอบที่ทับกันจะได้ไปแค่รอบเดียว) */
export async function reclaimFailedOptinInvite(id: string): Promise<boolean> {
  try {
    const { data: current } = await supabaseAdmin
      .from('fb_optin_invites')
      .select('attempts')
      .eq('id', id)
      .maybeSingle<{ attempts: number | null }>();

    const { data, error } = await supabaseAdmin
      .from('fb_optin_invites')
      .update({ status: 'pending', attempts: (current?.attempts ?? 0) + 1 })
      .eq('id', id)
      .eq('status', 'failed')
      .select('id');

    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/** ปิดใบ — เขียนผลจริงลงแถวที่จองไว้ */
export async function finishOptinInvite(id: string, outcome: OptinInviteOutcome): Promise<void> {
  try {
    await supabaseAdmin
      .from('fb_optin_invites')
      .update({
        status: outcome.status,
        sent_at: outcome.status === 'sent' ? new Date().toISOString() : null,
        fb_message_id: outcome.fb_message_id ?? null,
        http_status: outcome.http_status ?? null,
        error: outcome.error ?? null,
      })
      .eq('id', id);
  } catch (err) {
    // ปิดใบไม่ได้ = ใบค้าง pending → รอบถัดไปจะไม่หยิบ (หยิบเฉพาะ failed)
    // ยอมรับได้: ของจริงส่งไปแล้ว การจดผลพลาดต้องไม่ทำให้ส่งซ้ำใส่ลูกค้า
    console.error('[optin/ledger] finish failed:', errText(err));
  }
}

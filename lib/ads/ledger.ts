// Path: lib/ads/ledger.ts
//
// สมุดบันทึก event ที่ยิงขึ้น Conversions API (`ad_events`) — **ห้าม throw ทุกฟังก์ชัน**
//
// หัวใจอยู่ที่ **การจองสิทธิ์ด้วยการ insert ก่อนยิง** (`claimAdEvent`):
// unique index `(platform, destination, destination_id, event_name, event_id)` คือคนตัดสิน
// ว่าใครได้ยิง — สองสายที่ทำให้ออเดอร์เป็น paid พร้อมกัน (webhook Beam + คนกดบันทึกชำระ)
// จะมีแค่สายเดียวที่ insert ผ่าน อีกสายได้ผลลัพธ์ "มีคนจองไปแล้ว" แล้วเงียบไป
//
// ⚠️ ห้ามเปลี่ยนเป็น "เช็คก่อนว่ามีแถวไหม แล้วค่อย insert" — ระหว่างเช็คกับ insert
// อีกสายแทรกได้เสมอ (ของเดิมกันซ้ำด้วย `orders.meta_purchase_sent_at` ซึ่งเป็น UPDATE
// แบบมีเงื่อนไข = การจองสิทธิ์เหมือนกัน แต่ผูกกับออเดอร์จึงมีได้ปลายทางเดียว)

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { AdSendOutcome } from './types';

/** response ที่เก็บลงแถว — ใหญ่เกินนี้ตัดทิ้ง (สมุดบันทึกไม่ใช่ที่เก็บ payload) */
const MAX_RESPONSE_BYTES = 10 * 1024;

export type AdEventDestination = 'page_dataset' | 'ad_dataset';
export type AdEventStatus = 'pending' | 'sent' | 'failed' | 'skipped';

/** คีย์ + บริบทของ event หนึ่งใบ (ยังไม่มีผลลัพธ์) */
export interface AdEventKey {
  company_id: string;
  platform: 'meta';
  destination: AdEventDestination;
  destination_id: string;
  ad_account_id?: string | null;
  event_name: string;
  event_id: string;
  order_id?: string | null;
  customer_id?: string | null;
  contact_platform?: string | null;
  contact_id?: string | null;
  action_source?: string | null;
  /** ISO string */
  event_time: string;
}

export interface AdEventRecord extends AdEventKey {
  id: string;
  status: AdEventStatus;
  sent_at: string | null;
  http_status: number | null;
  error: string | null;
  response: unknown;
  attempts: number;
  created_at: string;
}

function truncateResponse(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  try {
    const str = JSON.stringify(value);
    if (str.length <= MAX_RESPONSE_BYTES) return value;
    return { _truncated: true, _size: str.length, _preview: str.slice(0, MAX_RESPONSE_BYTES) };
  } catch {
    return { _unserializable: true };
  }
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * จองสิทธิ์ยิง event ใบนี้ — **insert ก่อน ยิงทีหลัง**
 *
 * ชนกับใบที่มีอยู่แล้ว → **ยึดคืนได้เฉพาะใบที่ `status='failed'`** (ผ่าน reclaimFailedAdEvent
 * ซึ่งเป็น UPDATE แบบมีเงื่อนไข = การจองสิทธิ์เหมือนกัน) · ใบที่ pending/sent/skipped = null
 *
 * ⚠️ ถ้าไม่ยึดคืนใบที่ล้ม ใบนั้นจะ **ถูกล็อกถาวร**: unique index กัน insert ใหม่ไปตลอด
 * แปลว่ายิงพลาดครั้งเดียว (Meta ล่มตอนนั้นพอดี) = ออเดอร์ใบนั้นหายจากสถิติโฆษณาตลอดกาล
 * ยิงซ้ำไม่อันตราย — `event_id` เดิม Meta นับครั้งเดียวอยู่แล้ว
 *
 * @returns แถวที่จองได้ · `null` = มีคนถืออยู่/ยิงสำเร็จไปแล้ว ⇒ **ห้ามยิง**
 */
export async function claimAdEvent(row: AdEventKey): Promise<{ id: string } | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ad_events')
      .upsert(
        {
          ...row,
          ad_account_id: row.ad_account_id ?? null,
          order_id: row.order_id ?? null,
          customer_id: row.customer_id ?? null,
          contact_platform: row.contact_platform ?? null,
          contact_id: row.contact_id ?? null,
          action_source: row.action_source ?? null,
          status: 'pending' as const,
          attempts: 1,
        },
        { onConflict: 'platform,destination,destination_id,event_name,event_id', ignoreDuplicates: true },
      )
      .select('id');

    if (error) {
      console.error('[ads/ledger] claim failed:', error.message);
      return null;
    }
    // แถวว่าง = ชนกับใบที่มีอยู่แล้ว — ไม่ใช่ error · ใบที่เคยล้มถือว่ายังไม่มีใครยิงสำเร็จ ยึดคืนมาลองใหม่ได้
    const id = (data as { id: string }[] | null)?.[0]?.id;
    if (id) return { id };

    const { data: existing } = await supabaseAdmin
      .from('ad_events')
      .select('id, status')
      .eq('platform', row.platform)
      .eq('destination', row.destination)
      .eq('destination_id', row.destination_id)
      .eq('event_name', row.event_name)
      .eq('event_id', row.event_id)
      .maybeSingle<{ id: string; status: AdEventStatus }>();
    if (existing?.status !== 'failed') return null;
    return (await reclaimFailedAdEvent(existing.id)) ? { id: existing.id } : null;
  } catch (err) {
    console.error('[ads/ledger] claim threw:', errText(err));
    return null;
  }
}

/**
 * ขอจองใบที่เคย **ล้มเหลว** อีกครั้ง — UPDATE แบบมีเงื่อนไข `status='failed'`
 * (สองรอบกวาดที่ทับกันจะมีแค่รอบเดียวที่ได้ใบนี้ไป)
 */
export async function reclaimFailedAdEvent(id: string): Promise<boolean> {
  try {
    const { data: current } = await supabaseAdmin
      .from('ad_events')
      .select('attempts')
      .eq('id', id)
      .maybeSingle<{ attempts: number | null }>();

    const { data, error } = await supabaseAdmin
      .from('ad_events')
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

/** ปิดใบ — เขียนผลลัพธ์จริงลงแถวที่จองไว้ */
export async function finishAdEvent(id: string, outcome: AdSendOutcome): Promise<void> {
  try {
    await supabaseAdmin
      .from('ad_events')
      .update({
        status: outcome.status,
        sent_at: outcome.status === 'sent' ? new Date().toISOString() : null,
        http_status: outcome.httpStatus ?? null,
        error: outcome.error ?? outcome.reason ?? null,
        response: truncateResponse(outcome.response),
      })
      .eq('id', id);
  } catch (err) {
    // ปิดใบไม่ได้ = ใบค้าง pending → รอบกวาดถัดไปจะไม่หยิบ (หยิบเฉพาะ failed)
    // ยอมรับได้: ของจริงยิงไปแล้ว การจดผลพลาดต้องไม่ทำให้ยิงซ้ำ
    console.error('[ads/ledger] finish failed:', errText(err));
  }
}

/**
 * จดว่าเกิดอะไรขึ้นกับ event ที่ยิงเข้า **dataset ของเพจ** (สายเดิมใน lib/meta/conversions.ts)
 *
 * ⚠️ **ไม่ใช่การจองสิทธิ์** — สายนั้นจองด้วย `orders.meta_purchase_sent_at` อยู่แล้ว
 * ที่นี่แค่บันทึกเพื่อให้หน้าจอเห็นสองปลายทางในสมุดเล่มเดียวกัน (ชนกันก็ปล่อยผ่านเงียบ ๆ)
 */
export async function recordPageDatasetMirror(
  row: AdEventKey & {
    status: 'sent' | 'failed' | 'skipped';
    sent_at?: string | null;
    http_status?: number | null;
    error?: string | null;
    response?: unknown;
  },
): Promise<void> {
  try {
    const { status, sent_at, http_status, error, response, ...key } = row;
    await supabaseAdmin
      .from('ad_events')
      .upsert(
        {
          ...key,
          ad_account_id: key.ad_account_id ?? null,
          order_id: key.order_id ?? null,
          customer_id: key.customer_id ?? null,
          contact_platform: key.contact_platform ?? null,
          contact_id: key.contact_id ?? null,
          action_source: key.action_source ?? null,
          status,
          sent_at: sent_at ?? (status === 'sent' ? new Date().toISOString() : null),
          http_status: http_status ?? null,
          error: error ?? null,
          response: truncateResponse(response),
          attempts: 1,
        },
        { onConflict: 'platform,destination,destination_id,event_name,event_id', ignoreDuplicates: true },
      )
      .select('id');
  } catch (err) {
    console.error('[ads/ledger] mirror failed:', errText(err));
  }
}

/** เคยยิงสำเร็จไปแล้วไหม (ปลายทางไหนก็นับ) — ใช้ตอนกวาด จะได้ไม่ยิงซ้ำโดยไม่จำเป็น */
export async function hasSentAdEvent(platform: string, eventName: string, eventId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from('ad_events')
      .select('id')
      .eq('platform', platform)
      .eq('event_name', eventName)
      .eq('event_id', eventId)
      .eq('status', 'sent')
      .limit(1);
    return !!data?.length;
  } catch {
    return false;
  }
}

const EVENT_COLUMNS =
  'id, company_id, platform, destination, destination_id, ad_account_id, event_name, event_id, ' +
  'order_id, customer_id, contact_platform, contact_id, action_source, status, event_time, sent_at, ' +
  'http_status, error, response, attempts, created_at';

/** ทุกใบของออเดอร์นี้ — หน้าออเดอร์เอาไปโชว์ว่า "บอก Meta แล้วหรือยัง" */
export async function listAdEventsForOrder(orderId: string): Promise<AdEventRecord[]> {
  try {
    const { data } = await supabaseAdmin
      .from('ad_events')
      .select(EVENT_COLUMNS)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    return (data || []) as unknown as AdEventRecord[];
  } catch {
    return [];
  }
}

export async function listAdEvents(opts: {
  companyId: string;
  adAccountId?: string;
  contactId?: string;
  status?: AdEventStatus;
  limit?: number;
}): Promise<AdEventRecord[]> {
  try {
    let q = supabaseAdmin
      .from('ad_events')
      .select(EVENT_COLUMNS)
      .eq('company_id', opts.companyId)
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(500, opts.limit ?? 50)));
    if (opts.adAccountId) q = q.eq('ad_account_id', opts.adAccountId);
    if (opts.contactId) q = q.eq('contact_id', opts.contactId);
    if (opts.status) q = q.eq('status', opts.status);
    const { data } = await q;
    return (data || []) as unknown as AdEventRecord[];
  } catch {
    return [];
  }
}

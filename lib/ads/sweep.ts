// Path: lib/ads/sweep.ts
//
// ตาข่ายรับของสาย conversion — กวาดออเดอร์ที่ชำระแล้วแต่ **ไม่เคยไปถึง dataset ของบัญชีโฆษณา**
//
// ทำไมต้องมี: `dispatchConversion()` ยิงตอนออเดอร์กลายเป็น paid ครั้งเดียว รอบนั้นล้มก็จบ
// ของจริงล้มได้หลายแบบและ **หายเงียบเหมือนกันหมด**: token หมดอายุอยู่พอดี · Meta ล่ม ·
// ฟังก์ชันถูก freeze กลางทาง · บัญชีโฆษณาเพิ่งถูกเชื่อมทีหลังออเดอร์
//
// ⏳ **Meta รับย้อนหลังได้ 7 วัน** (ขายหน้าร้าน 62 วัน) — พลาดในกรอบนี้เยียวยาได้เอง
// เกินกว่านั้นคือหายจริง ⇒ ต้องเกาะ cron ที่วิ่งบ่อย ไม่ใช่ปุ่มให้คนมากดเอง
//
// **ห้าม throw** — ล้มตรงไหนก็คืนยอดเท่าที่ทำได้ (ผู้เรียกคือ cron ที่มีงานอื่นต่อ)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { logIntegrationNow } from '@/lib/integration-logger';
import { MARKETPLACE_SOURCES } from '@/lib/meta/capi';
import { dispatchConversion } from './dispatch';
import { resolvePaidAt } from './subject';
import type { SweepCounts } from './types';

const INTEGRATION = 'meta_ads';
/** ล้มเกินเท่านี้ = ไม่ใช่เรื่องชั่วคราวแล้ว หยุดลองแล้วรอให้คนไปแก้ (ป้ายบนการ์ดบอกไว้แล้ว) */
const MAX_ATTEMPTS = 5;

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function sweepUnsentAdConversions(
  opts: {
    /** ย้อนหลังกี่วัน (บีบไว้ที่ 1..7 ตามเพดานของ Meta) */
    days?: number;
    /** ดูออเดอร์ได้มากสุดกี่ใบต่อบริษัทในรอบนี้ */
    limit?: number;
    /** epoch ms — เลยเวลานี้แล้วหยุด (ปล่อยที่เหลือไว้รอบหน้า) */
    deadlineAt?: number;
    /** จำกัดบริษัทเดียว (สายที่ผู้ใช้กดเอง) */
    companyId?: string;
  } = {},
): Promise<SweepCounts> {
  const counts: SweepCounts = { scanned: 0, sent: 0, skipped: 0, failed: 0 };
  const days = Math.min(7, Math.max(1, Math.floor(opts.days ?? 7)));
  const limit = Math.max(1, Math.min(500, Math.floor(opts.limit ?? 200)));
  const deadlineAt = opts.deadlineAt ?? Date.now() + 30_000;
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  try {
    // 1) บริษัทที่มีบัญชีโฆษณาเปิดใช้อยู่ — ที่เหลือไม่มีปลายทางให้ยิง
    let accQuery = supabaseAdmin
      .from('ad_accounts')
      .select('id, company_id, dataset_id')
      .eq('is_active', true);
    if (opts.companyId) accQuery = accQuery.eq('company_id', opts.companyId);
    const { data: accountRows } = await accQuery;

    const datasetsByCompany = new Map<string, Set<string>>();
    for (const a of (accountRows || []) as { company_id: string; dataset_id: string | null }[]) {
      if (!a.company_id || !a.dataset_id) continue;
      const set = datasetsByCompany.get(a.company_id) || new Set<string>();
      set.add(a.dataset_id);
      datasetsByCompany.set(a.company_id, set);
    }
    if (datasetsByCompany.size === 0) return counts;

    for (const [companyId, datasets] of datasetsByCompany) {
      if (Date.now() > deadlineAt) break;
      const perCompany = { sent: 0, failed: 0, skipped: 0, scanned: 0 };

      // 2) ออเดอร์ที่ชำระแล้วในกรอบเวลา — ตัด marketplace ออกตั้งแต่ที่ SQL
      //    (ร้านหนึ่งมีออเดอร์ marketplace พันกว่าใบต่อเดือนที่ยังไงก็ข้าม ลากมาเต็มหน้าแล้ว
      //     ใบที่ควรยิงจะไม่เคยถึงคิว) · เกณฑ์ที่เหลือ (flow_type/ยอด) เช็คใน isPurchaseEligible
      const { data: candidates } = await supabaseAdmin
        .from('orders')
        .select('id, updated_at')
        .eq('company_id', companyId)
        .eq('payment_status', 'paid')
        .neq('order_status', 'cancelled')
        .is('marketplace_account_id', null)
        .not('source', 'in', `(${[...MARKETPLACE_SOURCES].join(',')})`)
        .gte('updated_at', since)
        .order('updated_at', { ascending: false })
        .limit(limit);

      const candidateIds = ((candidates || []) as { id: string }[]).map((o) => o.id);

      // 3) ใบที่ยิงสำเร็จไปแล้ว — ครบทุก dataset ถึงจะข้าม (บัญชีที่เพิ่งเพิ่มยังไม่มีของใบเก่า)
      const sentDatasets = new Map<string, Set<string>>();
      if (candidateIds.length > 0) {
        const { data: doneRows } = await supabaseAdmin
          .from('ad_events')
          .select('order_id, destination_id')
          .eq('company_id', companyId)
          .eq('destination', 'ad_dataset')
          .eq('event_name', 'Purchase')
          .eq('status', 'sent')
          .in('order_id', candidateIds);
        for (const r of (doneRows || []) as { order_id: string | null; destination_id: string }[]) {
          if (!r.order_id) continue;
          const set = sentDatasets.get(r.order_id) || new Set<string>();
          set.add(r.destination_id);
          sentDatasets.set(r.order_id, set);
        }
      }

      const todo: string[] = candidateIds.filter((id) => {
        const done = sentDatasets.get(id);
        if (!done) return true;
        for (const ds of datasets) if (!done.has(ds)) return true;
        return false;
      });

      // 4) ใบที่เคยล้ม — ยังไม่ครบโควตาลองใหม่ · claimAdEvent จะยึดใบที่ failed คืนให้เอง
      //    (ออเดอร์เก่าที่ `updated_at` เลื่อนออกนอกกรอบไปแล้วจะกลับเข้าคิวทางนี้)
      const { data: failedRows } = await supabaseAdmin
        .from('ad_events')
        .select('order_id')
        .eq('company_id', companyId)
        .eq('destination', 'ad_dataset')
        .eq('event_name', 'Purchase')
        .eq('status', 'failed')
        .lt('attempts', MAX_ATTEMPTS)
        .gte('event_time', since)
        .limit(limit);
      for (const r of (failedRows || []) as { order_id: string | null }[]) {
        if (r.order_id && !todo.includes(r.order_id)) todo.push(r.order_id);
      }

      if (todo.length === 0) continue;
      counts.scanned += todo.length;
      perCompany.scanned = todo.length;

      // 5) เวลาที่เงินเข้าจริง — ยิงด้วยเวลา "ตอนนี้" ของออเดอร์เมื่อ 5 วันก่อน = สถิติเพี้ยนทั้งแคมเปญ
      const paidAt = await resolvePaidAt(todo);
      const updatedAt = new Map(
        ((candidates || []) as { id: string; updated_at: string | null }[]).map((o) => [o.id, o.updated_at]),
      );

      for (const orderId of todo) {
        if (Date.now() > deadlineAt) break;

        const ms = paidAt.get(orderId) ?? Date.parse(updatedAt.get(orderId) || '');
        const eventTime = Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;

        const result = await dispatchConversion({
          event: 'Purchase',
          orderId,
          eventTime,
          skipIfAccountNotReady: true,
        });

        const anySent = result.ads.some((a) => a.status === 'sent');
        const anyFailed = result.ads.some((a) => a.status === 'failed');
        const bucket: keyof SweepCounts = anySent ? 'sent' : anyFailed ? 'failed' : 'skipped';
        counts[bucket] += 1;
        perCompany[bucket] += 1;
      }

      // 6) จดสรุป **เฉพาะรอบที่มีอะไรเกิดขึ้นจริง** — ไม่งั้นได้ log เปล่าทุก 15 นาทีตลอดปี
      if (perCompany.sent > 0 || perCompany.failed > 0) {
        const status: 'success' | 'error' = perCompany.failed > 0 && perCompany.sent === 0 ? 'error' : 'success';
        await logIntegrationNow({
          company_id: companyId,
          integration: INTEGRATION,
          direction: 'outgoing',
          action: 'sweep',
          method: 'JOB',
          status,
          response_body: perCompany,
          error_message:
            status === 'error' ? 'กวาดส่ง Purchase เข้าบัญชีโฆษณาย้อนหลังไม่สำเร็จทุกใบในรอบนี้' : undefined,
        }).catch(() => null);
      }
    }

    return counts;
  } catch (err) {
    console.error('[ads/sweep] failed:', errText(err));
    return counts;
  }
}

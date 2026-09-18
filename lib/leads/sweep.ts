// Path: lib/leads/sweep.ts
//
// งานอัตโนมัติรายวันของระบบติดตาม — **ไม่มี cron ใบใหม่** ลากไปกับตัวเฝ้า
// (`/api/marketplace/watchdog` ทุก 15 นาที) เหมือน `pruneOldLogs()` · ตัวมันเองคุมให้ทำจริงวันละครั้ง
//
// ทำ 2 อย่าง:
//   1) **ชวนคุยหลังการขาย** — ซื้อแล้วครบ N วันและไม่มีนัดค้าง → ตั้งนัดให้เอง
//      (ยึดวันที่กลายเป็น "ซื้อแล้ว" ไม่ใช่วันส่งของ เพราะออเดอร์ marketplace หลายเจ้าไม่มี
//       เวลาส่งสำเร็จที่เชื่อได้ — วันจ่ายเงินมีเสมอและคลาดกันไม่กี่วัน)
//   2) **รอโอนนานเกินไป** — ส่งบิลไปแล้วเกิน N วันโดยยังไม่จ่าย → ดันเข้าคิววันนี้ให้คนตัดสินใจ
//      (ปิดบิล หรือย้ายกลับ "สนใจ" ไว้ตามยาว) — ระบบไม่ตัดสินใจแทน
//
// ⚠️ ไม่เปลี่ยนสถานะให้เองในสองงานนี้ — แตะแค่ "นัด" เพราะการปิดดีลเป็นการตัดสินใจของคน

import { supabaseAdmin } from '@/lib/supabase-admin';
import { FOLLOW_UP_HOUR } from './followup-presets';
import {
  DEFAULT_AFTER_SALE_DAYS, QUOTE_DECISION_DAYS, logLeadEvent, type LeadRow,
} from './service';
import { QUOTED_STAGE_KEY, WON_STAGE_KEY } from './stages';

const FLAG_KEY = 'leads_sweep_last_run';
/** กันงานใหญ่เกินรอบเดียว — เหลือให้รอบหน้าเก็บต่อ */
const MAX_PER_RUN = 200;

function at10(d: Date): string {
  const x = new Date(d);
  x.setHours(FOLLOW_UP_HOUR, 0, 0, 0);
  return x.toISOString();
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

/** วันนี้ทำไปหรือยัง — เก็บสถานะไว้ที่ `app_flags` เหมือนงานดูแลรายวันตัวอื่น */
async function alreadyRanToday(): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('app_flags')
    .select('value')
    .eq('key', FLAG_KEY)
    .maybeSingle();

  const last = (data?.value as { at?: string } | null)?.at;
  if (!last) return false;
  const lastDay = new Date(last).toDateString();
  return lastDay === new Date().toDateString();
}

async function stampRun() {
  await supabaseAdmin.from('app_flags').upsert({
    key: FLAG_KEY,
    value: { at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });
}

export interface LeadSweepResult {
  ran: boolean;
  afterSale: number;
  waitingTooLong: number;
}

export async function sweepLeadAutomations(opts: { force?: boolean } = {}): Promise<LeadSweepResult> {
  if (!opts.force && await alreadyRanToday()) {
    return { ran: false, afterSale: 0, waitingTooLong: 0 };
  }

  const afterSale = await scheduleAfterSaleFollowUps();
  const waitingTooLong = await flagStaleQuotes();
  await stampRun();

  return { ran: true, afterSale, waitingTooLong };
}

/** ซื้อแล้วครบ N วัน ยังไม่มีนัด → ชวนคุยอีกที */
async function scheduleAfterSaleFollowUps(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('leads')
    .select('id, company_id, stage, stage_changed_at, follow_up_note')
    .eq('stage', WON_STAGE_KEY)
    .is('follow_up_at', null)
    .lte('stage_changed_at', daysAgo(DEFAULT_AFTER_SALE_DAYS))
    // เก่ากว่านี้ = ลูกค้าเก่าที่ระบบเพิ่งเริ่มเก็บ ไม่ต้องไล่ทวงย้อนหลังทั้งฐาน
    .gte('stage_changed_at', daysAgo(DEFAULT_AFTER_SALE_DAYS + 7))
    .limit(MAX_PER_RUN);

  const rows = (data || []) as unknown as LeadRow[];
  for (const lead of rows) {
    const when = at10(new Date());
    await supabaseAdmin
      .from('leads')
      .update({ follow_up_at: when, follow_up_note: lead.follow_up_note || 'ครบเดือนหลังซื้อ — ชวนคุยอีกที' })
      .eq('id', lead.id);
    await logLeadEvent({
      companyId: lead.company_id, leadId: lead.id, type: 'follow_up_set',
      followUpAt: when, source: 'system', meta: { reason: 'after_sale' },
    });
  }
  return rows.length;
}

/** ส่งบิลไปแล้วเกิน N วันยังไม่จ่าย → ดันเข้าคิววันนี้ ให้คนตัดสินใจ */
async function flagStaleQuotes(): Promise<number> {
  const { data } = await supabaseAdmin
    .from('leads')
    .select('id, company_id, stage, quote_sent_at, follow_up_at, follow_up_note')
    .eq('stage', QUOTED_STAGE_KEY)
    .lte('quote_sent_at', daysAgo(QUOTE_DECISION_DAYS))
    .limit(MAX_PER_RUN);

  const rows = (data || []) as unknown as LeadRow[];
  let touched = 0;
  for (const lead of rows) {
    // มีนัดในอนาคตอยู่แล้ว = คนดูแลอยู่ ไม่ต้องไปยุ่ง
    if (lead.follow_up_at && new Date(lead.follow_up_at).getTime() > Date.now()) continue;
    const when = at10(new Date());
    await supabaseAdmin
      .from('leads')
      .update({ follow_up_at: when, follow_up_note: `รอโอนเกิน ${QUOTE_DECISION_DAYS} วัน — ปิดบิลหรือตามยาว?` })
      .eq('id', lead.id);
    await logLeadEvent({
      companyId: lead.company_id, leadId: lead.id, type: 'follow_up_set',
      followUpAt: when, source: 'system', meta: { reason: 'quote_stale' },
    });
    touched++;
  }
  return touched;
}

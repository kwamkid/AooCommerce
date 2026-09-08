// Path: lib/broadcast/scheduler.ts
//
// ตัวส่ง "บรอดแคสต์ที่ตั้งเวลาไว้" — cron เรียกทุก 5 นาที
//
// ใบที่ตั้งเวลาไม่ถูกส่งจาก after() ของ POST (ฟังก์ชันตายไปนานแล้วกว่าจะถึงเวลา)
// จึงต้องมีคนมาหยิบ · **จองใบก่อนส่งเสมอ** ด้วย UPDATE แบบมีเงื่อนไข (scheduled → pending)
// ไม่งั้น cron สองรอบซ้อน หรือสอง instance ที่วิ่งพร้อมกัน จะหยิบใบเดียวกันแล้วลูกค้า
// ได้ข้อความสองรอบ (retry key ของ LINE กันซ้ำได้เฉพาะล็อตที่วางแผนไว้แล้ว —
// ใบที่ยังไม่มีแผนล็อตจะวางแผนใหม่คนละชุด คีย์คนละใบ กันไม่ได้)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { isBroadcastPlatform } from './platforms';
import { runBroadcast } from './run';

/** งบเวลาของรอบหนึ่ง — ต่ำกว่า maxDuration ของ route (300 วิ) เผื่อเวลาปิดงาน */
const DEFAULT_TIME_BUDGET_MS = 240_000;

export interface ScheduledRunResult {
  /** จำนวนใบที่จองมาส่งในรอบนี้ */
  ran: number;
  /** ใบที่ถึงเวลาแล้วแต่ยังไม่ได้ส่ง (หมดงบเวลา) — รอบหน้าเก็บต่อ */
  remaining: number;
  ids: string[];
}

/** จำนวนใบที่ถึงเวลาแล้วแต่ยังไม่มีใครหยิบ — route ใช้ตัดสินว่าต้องปลุกตัวส่งไหม */
export async function countDueScheduledBroadcasts(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('broadcasts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString());
  return count ?? 0;
}

export async function runScheduledBroadcasts(
  opts: { timeBudgetMs?: number } = {},
): Promise<ScheduledRunResult> {
  const startedAtMs = Date.now();
  const timeBudgetMs = opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const ids: string[] = [];

  for (;;) {
    if (Date.now() - startedAtMs > timeBudgetMs) break;

    const { data: due, error } = await supabaseAdmin
      .from('broadcasts')
      .select('id, platform')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error('[broadcast-scheduler] fetch due failed:', error.message);
      break;
    }
    if (!due) break;

    // จองแบบมีเงื่อนไข — ไม่ได้แถวกลับ = คนอื่นชิงไปแล้ว ไปหาใบถัดไป
    const { data: claimed } = await supabaseAdmin
      .from('broadcasts')
      .update({ status: 'pending', started_at: null })
      .eq('id', due.id)
      .eq('status', 'scheduled')
      .select('id');
    if (!claimed || claimed.length === 0) continue;

    ids.push(due.id);

    if (!isBroadcastPlatform(due.platform)) {
      // ไม่ควรเกิด (route กันตอนสร้างแล้ว) — แต่ต้องปิดใบให้จบ ไม่ปล่อยค้าง pending
      await supabaseAdmin
        .from('broadcasts')
        .update({
          status: 'failed',
          error: 'ช่องทางของบรอดแคสต์นี้ส่งไม่ได้',
          finished_at: new Date().toISOString(),
        })
        .eq('id', due.id);
      continue;
    }

    // ใบหนึ่งพังต้องไม่ทำให้ใบที่เหลือในคิวไม่ได้ส่ง
    // (ตัวส่งบันทึกความล้มลงแถวเองอยู่แล้ว ที่นี่แค่กันไม่ให้ throw ทะลุออกไป)
    try {
      await runBroadcast(due.id, due.platform);
    } catch (e) {
      console.error('[broadcast-scheduler] run failed', due.id, e instanceof Error ? e.message : e);
    }
  }

  return { ran: ids.length, remaining: await countDueScheduledBroadcasts(), ids };
}

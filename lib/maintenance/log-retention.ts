// ลบ log เก่าอัตโนมัติ (server-only)
//
// ทำไมต้องมี: ตาราง log ไม่เคยถูกลบเลยตั้งแต่ 21 เม.ย. 2026 จนโตเป็น **114MB จากฐานข้อมูล
// 257MB** (integration_logs 84 + webhook 17 + sync 13) — กินแคชของอินสแตนซ์ (224MB) จนตาราง
// ที่หน้าเว็บใช้จริงไม่ค้างอยู่ในแคช · ล้างครั้งแรก 8 ก.ย. 2026 (188,277 แถว) ฐานข้อมูลเหลือ
// 160MB แล้ววัดได้: หน้าออเดอร์ 257ms → 52ms · หน้าคลัง 207ms → 43ms (ดู fix-bug.md 2026-09-08)
// **ถ้าไม่มีตัวนี้มันจะโตกลับไปที่เดิมภายในไม่กี่เดือน**
import { supabaseAdmin } from '@/lib/supabase-admin';

const LAST_RUN_KEY = 'log_retention_last_run';
/** เว้นระยะอย่างน้อยเท่านี้ระหว่างรอบ — ตัวเรียกคือ cron ตัวเฝ้าที่วิ่งทุก 15 นาที */
const MIN_GAP_MS = 20 * 3_600_000;
/** เพดานต่อตารางต่อรอบ — วันละรอบพอกับ log ที่เกิดใหม่วันละหลักพัน กันรอบเดียวกินเวลาทั้ง function */
const BATCH = 5_000;

/**
 * ตารางที่ตัดของเก่าทิ้งได้ + อายุที่เก็บ
 *
 * - integration_logs 60 วัน: หน้า API Monitor ย้อนได้สูงสุด 30 วัน · ตัวเฝ้าอ่าน 7 วัน
 *   เผื่ออีกเท่าตัวไว้ให้คนย้อนดูตอนสืบปัญหา
 * - อีกสองตัว 30 วัน: retry worker หยิบงานภายใน 7 วัน · dead letter บนหน้า monitor 7 วัน
 */
const RETENTION: { table: string; days: number }[] = [
  { table: 'integration_logs', days: 60 },
  { table: 'marketplace_sync_log', days: 30 },
  { table: 'marketplace_webhook_log', days: 30 },
  // ad_events 90 วัน: ตัวกวาดมองย้อนแค่ 7 วัน (เพดานของ Meta) ที่เหลือเก็บไว้ตอบคำถามว่า
  // "ออเดอร์ใบนี้ถูกส่งเข้า Meta หรือยัง" ย้อนได้ประมาณหนึ่งไตรมาส
  { table: 'ad_events', days: 90 },
];

export interface LogRetentionResult {
  ran: boolean;
  reason?: string;
  deleted?: Record<string, number>;
}

/** ลบ log ที่เกินอายุ — เรียกถี่แค่ไหนก็ได้ ตัวมันเองคุมให้ทำจริงวันละครั้ง */
export async function pruneOldLogs(opts: { force?: boolean } = {}): Promise<LogRetentionResult> {
  if (!opts.force) {
    const { data } = await supabaseAdmin
      .from('app_flags').select('value').eq('key', LAST_RUN_KEY).maybeSingle();
    const at = (data?.value as { at?: string } | null)?.at;
    if (at && Date.now() - new Date(at).getTime() < MIN_GAP_MS) {
      return { ran: false, reason: 'ยังไม่ถึงรอบ (วันละครั้ง)' };
    }
  }

  const deleted: Record<string, number> = {};
  for (const { table, days } of RETENTION) {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    try {
      // เลือก id ก่อนแล้วค่อยลบ — PostgREST ไม่มี LIMIT ใน DELETE จึงจำกัดจำนวนต่อรอบแบบนี้
      const { data: rows, error: selErr } = await supabaseAdmin
        .from(table).select('id').lt('created_at', cutoff).limit(BATCH);
      if (selErr) throw new Error(selErr.message);
      if (!rows?.length) { deleted[table] = 0; continue; }

      const { error: delErr } = await supabaseAdmin
        .from(table).delete().in('id', rows.map(r => r.id));
      if (delErr) throw new Error(delErr.message);
      deleted[table] = rows.length;
    } catch (err) {
      // ตารางหนึ่งพังต้องไม่ทำให้ตารางอื่นไม่ถูกล้าง
      console.error(`[log-retention] ${table} ล้มเหลว:`, err instanceof Error ? err.message : err);
      deleted[table] = -1;
    }
  }

  await supabaseAdmin.from('app_flags').upsert({
    key: LAST_RUN_KEY,
    value: { at: new Date().toISOString(), deleted },
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' });

  console.log('[log-retention] ล้าง log เก่าแล้ว', deleted);
  return { ran: true, deleted };
}

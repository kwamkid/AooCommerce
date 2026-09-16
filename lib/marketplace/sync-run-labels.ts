// ป้ายภาษาไทยของ "รอบการทำงาน" ซิงค์ marketplace — **client-safe**
//
// ทำไมต้องแยกไฟล์: `sync-runs.ts` และ `sync-revert.ts` import `supabaseAdmin`
// (service role) จึงเป็น server-only ทั้งคู่ — หน้าจอ import เข้าไปเมื่อไหร่ก็พังทันที
// ⇒ ค่าคงที่ที่ "จอ" ต้องใช้ (โค้ด → ข้อความไทย) อยู่ที่นี่ที่เดียว
//
// ⛔ ไฟล์นี้ **ห้าม import อะไรที่เป็นฝั่ง server** — ได้เฉพาะ `import type` (ถูกลบทิ้งตอน compile)
//    กติกาเดียวกับที่ทำให้โค้ด `reason` เป็น snake_case อังกฤษ: API คืน "โค้ด" เสมอ
//    (เทียบ/ค้น/log ได้) ส่วนข้อความที่คนอ่านมาจากตารางนี้ที่เดียว ไม่ใช่ hardcode ในจอ

import { STATUS_DOMAINS } from '@/lib/status-labels';
import type { StockPlan, SyncRunJob, SyncRunStatus } from '@/lib/marketplace/sync-runs';

/**
 * สถานะของรอบ (`marketplace_sync_runs.status`)
 *
 * ⚠️ **เจ้าของคำเรียก + สีคือทะเบียนกลาง** `lib/status-labels.ts` โดเมน `syncRun`
 *    (badge บนจอใช้ `<StatusBadge domain="syncRun">` ซึ่งอ่านจากที่นั่น) — ตารางนี้เป็น
 *    แค่มุมมอง "โค้ด → ข้อความ" สำหรับฝั่ง server ที่ประกอบข้อความเอง ไม่ใช่แหล่งที่สอง
 */
export const SYNC_RUN_STATUS_LABELS = Object.fromEntries(
  Object.entries(STATUS_DOMAINS.syncRun).map(([key, meta]) => [key, meta.label]),
) as Record<SyncRunStatus, string>;

/** ประเภทงานของรอบ */
export const SYNC_RUN_JOB_LABELS: Record<SyncRunJob, string> = {
  pull_stock: 'ดึงสต็อกจากร้าน',
  push_stock: 'ส่งสต็อกขึ้นร้าน',
  import_products: 'นำเข้าสินค้า',
  export_products: 'ส่งออกสินค้า',
};

/**
 * แผนที่ "ลงมือจริง" — ที่เหลือคือแถวที่โชว์ให้ดูเฉย ๆ (ติ๊กไม่ได้)
 *
 * อยู่ในไฟล์ client-safe เพราะ **ตารางพรีวิวบนจอต้องรู้ว่าติ๊กแถวไหนได้** และ
 * `sync-runs.ts` (server-only) re-export ตัวนี้ต่อ — ค่ามีชุดเดียวทั้งสองฝั่ง
 */
export const ACTIONABLE_STOCK_PLANS: readonly StockPlan[] = [
  'fill', 'overwrite', 'increase', 'decrease', 'to_zero',
];

export function isActionablePlan(plan: StockPlan): boolean {
  return ACTIONABLE_STOCK_PLANS.includes(plan);
}

/** แผนรายตัวเลือก (`marketplace_sync_run_items.plan`) */
export const STOCK_PLAN_LABELS: Record<StockPlan, string> = {
  // คำสั้น — อยู่ในคอลัมน์แคบของตารางพรีวิว (ความหมายเต็มอยู่ใน STOCK_PLAN_HINTS)
  fill: 'เติม',
  overwrite: 'ทับ',
  increase: 'เพิ่ม',
  decrease: 'ลด',
  to_zero: 'เป็น 0',
  unchanged: 'เท่ากัน',
  skip_nonzero: 'ข้าม · มียอดแล้ว',
  skip_zero: 'ข้าม · ร้านเป็น 0',
  sync_disabled: 'ปิดซิงค์',
  no_link: 'ร้านไม่คืนยอด',
};

/** คำอธิบายเต็มของแต่ละแผน — ใช้เป็น tooltip/คำอธิบายเมื่อมีที่พอ */
export const STOCK_PLAN_HINTS: Record<StockPlan, string> = {
  fill: 'คลังเราว่าง เติมยอดจากร้าน',
  overwrite: 'ทับยอดเดิมในคลังด้วยยอดของร้าน',
  increase: 'ยอดปลายทางจะเพิ่มขึ้น',
  decrease: 'ยอดปลายทางจะลดลง',
  to_zero: 'ยอดปลายทางจะกลายเป็น 0',
  unchanged: 'สองฝั่งเท่ากันอยู่แล้ว ไม่ต้องทำอะไร',
  skip_nonzero: 'ข้าม — คลังเรามียอดอยู่แล้ว (โหมดเติมช่องว่างไม่ทับ)',
  skip_zero: 'ข้าม — ยอดบนร้านเป็น 0 ไม่มีอะไรให้เติม',
  sync_disabled: 'link นี้ปิดซิงค์ไว้ — โชว์ให้เห็นแต่ไม่ทำ',
  no_link: 'ร้านไม่คืนยอดของตัวเลือกนี้มา (อาจถูกลบ/ซ่อนบนร้าน)',
};

// ── ฝั่ง "ย้อนรอบ" ───────────────────────────────────────────────────────────

/** เหตุผลที่ย้อนรอบนั้นไม่ได้ — API คืนโค้ดนี้ตรง ๆ ทั้งใน `revertability.reason` และ body ของ 409 */
export type RevertBlockReason =
  | 'job_not_supported'      // งานที่ไม่ใช่ pull_stock / push_stock
  | 'status_not_revertable'  // ยังไม่ได้ลงมือ (previewed/running) หรือล้มทั้งรอบ
  | 'already_reverted'       // ย้อนไปแล้ว (มี reverted_at หรือมี run ที่ reverts_run_id ชี้มา)
  | 'newer_run_exists'       // มีรอบที่ลงมือจริงใหม่กว่านี้ทับไปแล้ว
  | 'too_old'                // เกิน 7 วัน
  | 'nothing_applied'        // ไม่มีแถวไหนลงมือสำเร็จเลย
  | 'run_in_progress';       // มีรอบของร้านนี้กำลังทำอยู่ (ตัวกันกดซ้อนของ route)

export const REVERT_REASON_LABELS: Record<RevertBlockReason, string> = {
  job_not_supported: 'งานประเภทนี้ยังย้อนกลับไม่ได้',
  status_not_revertable: 'รอบนี้ยังไม่ได้ลงมือจริง จึงไม่มีอะไรให้ย้อน',
  already_reverted: 'ย้อนรอบนี้ไปแล้ว',
  newer_run_exists: 'มีรอบใหม่กว่าทำทับไปแล้ว — ย้อนรอบเก่าจะทำให้ยอดเพี้ยน',
  too_old: 'รอบนี้ผ่านมาเกิน 7 วันแล้ว ย้อนไม่ได้',
  nothing_applied: 'รอบนี้ไม่ได้เปลี่ยนยอดอะไรเลย',
  run_in_progress: 'ร้านนี้มีงานซิงค์กำลังทำอยู่ — รอให้จบก่อน',
};

/** คำเตือนที่ยังย้อนได้อยู่ แต่ผู้ใช้ควรรู้ก่อนกด */
export type RevertWarning = 'auto_sync_on' | 'stock_moved_after_run' | 'shop_value_unknown';

export const REVERT_WARNING_LABELS: Record<RevertWarning, string> = {
  auto_sync_on:
    'ร้านนี้เปิดซิงค์สต็อกอัตโนมัติอยู่ — ย้อนแล้วครั้งหน้าที่สต็อกขยับ ระบบจะส่งเลขในระบบขึ้นไปอีก แนะนำปิดสวิตช์ก่อน',
  stock_moved_after_run:
    'มีความเคลื่อนไหวสต็อกหลังรอบนี้ (ขาย/รับเข้า/โอน) — ย้อนแล้วยอดจะไม่เท่าก่อนรอบเป๊ะ แต่ของที่ขายไปจะไม่ถูกกลืนทิ้ง',
  shop_value_unknown:
    'บางตัวเลือกไม่มีบันทึกยอดเดิมบนร้าน — ตัวพวกนั้นจะถูกข้าม ไม่ส่งอะไรขึ้นไป',
};

/** ผลการย้อนรายตัวเลือก (`marketplace_sync_run_items.revert_status`) */
export type RevertItemStatus =
  | 'reverted'               // คืนค่าเดิมได้ครบ
  | 'reverted_with_activity' // คืนได้ แต่ระหว่างนั้นมีความเคลื่อนไหวอื่นด้วย
  | 'oversold'               // คืนไม่ครบเพราะของถูกขายไปแล้ว (ชนพื้น 0)
  | 'changed_on_shop'        // ยอดบนร้านไม่ใช่เลขที่เราส่งไปแล้ว — ไม่กล้าทับ
  | 'skipped'                // ไม่มีค่าเดิมให้คืน
  | 'not_reverted'           // หมดเวลาในรอบนี้ ยังไม่ได้ทำ
  | 'failed';                // ทำแล้วล้ม

export const REVERT_STATUS_LABELS: Record<RevertItemStatus, string> = {
  reverted: 'คืนค่าเดิมแล้ว',
  reverted_with_activity: 'คืนแล้ว (มีความเคลื่อนไหวระหว่างนั้น)',
  oversold: 'คืนไม่ครบ — ขายไปแล้ว',
  changed_on_shop: 'ยอดบนร้านเปลี่ยนไปแล้ว — ไม่ทับ',
  skipped: 'ข้าม — ไม่มีค่าเดิม',
  not_reverted: 'ยังไม่ได้ย้อน (หมดเวลารอบนี้)',
  failed: 'ย้อนไม่สำเร็จ',
};

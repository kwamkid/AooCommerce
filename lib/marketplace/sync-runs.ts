// "รอบการทำงาน" ของงานซิงค์ marketplace — สมุดกลางที่ preview / apply / revert ใช้ร่วมกัน (server-only)
//
// ทำไมต้องมี: เดิมปุ่ม "ดึงสต็อก" / "ส่งสต็อก" ยิงแล้วจบในตัว ไม่มีใครรู้ว่ารอบนั้นแตะอะไรไปบ้าง
// กดพลาดแล้วย้อนไม่ได้ และร้านใหญ่ที่ทำไม่จบใน request เดียวก็ไม่มีที่เก็บว่าทำถึงไหน
// ⇒ ตารางคู่ `marketplace_sync_runs` (หัวรอบ) + `marketplace_sync_run_items` (ทีละตัวเลือก)
//
//   preview → createRun(status 'previewed') + replaceRunItems ทุกแถวพร้อม "แผน" ของมัน
//   apply   → startRun() → …ทำจริง… → markItemsApplied ทีละแถว → finishRun()
//   revert  → run ใหม่ที่ `reverts_run_id` ชี้กลับมาที่รอบเดิม (ก้อน C2)
//
// ⚠️ **`inventory_transactions.reference_id` ของงานซิงค์สต็อก = `run.id`**
//    (เดิมเป็น `account.id` — ไม่มีโค้ดไหนอ่านค่านั้นเลย จึงเปลี่ยนได้) เพื่อให้กดจากหน้า
//    ความเคลื่อนไหวสต็อกแล้วเปิดดูรอบที่ทำให้ยอดเปลี่ยนได้จริง (`/marketplace/sync?run=<id>`)
//
// ⛔ เขียนผ่าน `supabaseAdmin` (service role) ที่นี่ที่เดียว — RLS ของสองตารางนี้เปิดแค่ฝั่งอ่าน
//    ให้สมาชิกบริษัท · ห้าม insert/update จากฝั่ง client

import { supabaseAdmin } from '@/lib/supabase-admin';
import { parallelLimit } from '@/lib/parallel';
// แผนที่ "ลงมือจริง" อยู่ในไฟล์ client-safe (ตารางพรีวิวบนจอต้องใช้ค่าชุดเดียวกัน)
import { ACTIONABLE_STOCK_PLANS, isActionablePlan } from '@/lib/marketplace/sync-run-labels';

// ── Types ────────────────────────────────────────────────────────────────────

export type SyncRunJob = 'pull_stock' | 'push_stock' | 'import_products' | 'export_products';

export type SyncRunStatus =
  | 'previewed'   // พรีวิวแล้ว รอผู้ใช้กดลงมือ
  | 'running'     // กำลังทำ
  | 'done'        // จบครบ
  | 'partial'     // ทำไม่จบ (หมดเวลา — มี cursor ค้าง) หรือบางแถวล้ม
  | 'failed'      // ล้มทั้งรอบ
  | 'reverted'    // ย้อนกลับครบแล้ว
  | 'revert_partial'; // ย้อนได้บางส่วน (ของถูกขายไปแล้วระหว่างนั้น)

export type SyncRunTrigger = 'manual' | 'warehouse_change' | 'onboarding';

/**
 * แผนของแต่ละแถวในรอบสต็อก — ค่าเดียวกับคอลัมน์ `marketplace_sync_run_items.plan`
 * (นิยามอยู่ที่นี่ที่เดียว · `lib/marketplace/stock-push.ts` re-export ต่อให้)
 */
export type StockPlan =
  | 'fill'          // คลังเราว่าง เติมจากร้าน (โหมด fill_blank)
  | 'overwrite'     // ทับยอดเดิม (สำรองไว้ให้ฝั่งที่ไม่แยกทิศทาง)
  | 'increase'      // ยอดปลายทางจะเพิ่ม
  | 'decrease'      // ยอดปลายทางจะลด
  | 'to_zero'       // ยอดปลายทางจะกลายเป็น 0
  | 'unchanged'     // สองฝั่งเท่ากันอยู่แล้ว
  | 'skip_nonzero'  // ข้าม เพราะคลังเรามียอดจริงอยู่แล้ว (fill_blank)
  | 'skip_zero'     // ข้าม เพราะยอดบนร้านเป็น 0 (fill_blank)
  | 'sync_disabled' // link ปิดซิงค์ไว้ — โชว์ให้เห็นแต่ติ๊กไม่ได้
  | 'no_link';      // ไม่มี link / ร้านไม่คืนยอดของตัวนี้

// re-export ต่อให้ผู้เรียกฝั่ง server ทุกตัวเรียกที่เดิมได้เหมือนเดิม (นิยามอยู่ `sync-run-labels.ts`)
export { ACTIONABLE_STOCK_PLANS, isActionablePlan };

/** ตัวเลขสรุปของรอบ — เก็บลง `counts` (jsonb) ทุกคีย์ไม่บังคับ */
export interface SyncRunCounts {
  checked?: number;
  selected?: number;
  changed?: number;
  skipped?: number;
  unchanged?: number;
  failed?: number;
  increased?: number;
  decreased?: number;
  to_zero?: number;
}

export interface SyncRun {
  id: string;
  company_id: string;
  account_id: string;
  platform: string;
  job: SyncRunJob;
  mode: string | null;
  status: SyncRunStatus;
  warehouse_id: string | null;
  trigger: SyncRunTrigger;
  preview_at: string;
  started_at: string | null;
  finished_at: string | null;
  counts: SyncRunCounts;
  quota_used: number;
  errors: string[];
  cursor: number | null;
  reverts_run_id: string | null;
  reverted_at: string | null;
  reverted_by: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SyncRunItem {
  run_id: string;
  variation_id: string;
  product_id: string | null;
  sku: string | null;
  name: string | null;
  /** เติมตอนอ่านจาก API (ไม่ได้เก็บในสแนปช็อตของรอบ) */
  image?: string | null;
  external_item_id: string | null;
  external_model_id: string | null;
  shop_before: number | null;
  ours_qty_before: number | null;
  ours_reserved_before: number | null;
  target: number | null;
  plan: StockPlan;
  selected: boolean;
  applied: boolean;
  after: number | null;
  error: string | null;
  revert_status: string | null;
  revert_note: string | null;
}

export interface CreateRunInput {
  company_id: string;
  account_id: string;
  platform: string;
  job: SyncRunJob;
  mode?: string | null;
  status?: SyncRunStatus;
  warehouse_id?: string | null;
  trigger?: SyncRunTrigger;
  counts?: SyncRunCounts;
  quota_used?: number;
  created_by?: string | null;
  /** รอบที่กำลังย้อน — ใส่เฉพาะ run ของงาน "ย้อน" */
  reverts_run_id?: string | null;
  started_at?: string | null;
}

/** แถวที่ยัดลง run ตอน preview — คีย์ที่ไม่ส่งจะเป็น null ตาม default ของตาราง */
export interface SyncRunItemInput {
  variation_id: string;
  product_id?: string | null;
  sku?: string | null;
  name?: string | null;
  external_item_id?: string | null;
  external_model_id?: string | null;
  shop_before?: number | null;
  ours_qty_before?: number | null;
  ours_reserved_before?: number | null;
  target?: number | null;
  plan: StockPlan;
  selected?: boolean;
}

/** ผลของแต่ละแถวหลังลงมือจริง */
export interface SyncRunItemApply {
  variation_id: string;
  applied: boolean;
  after?: number | null;
  error?: string | null;
  revert_status?: string | null;
  revert_note?: string | null;
}

export interface FinishRunInput {
  status: SyncRunStatus;
  counts?: SyncRunCounts;
  quota_used?: number;
  errors?: string[];
  cursor?: number | null;
  finished_at?: string | null;
}

// ── อ่าน/เขียนหัวรอบ ─────────────────────────────────────────────────────────

const RUN_COLUMNS =
  'id, company_id, account_id, platform, job, mode, status, warehouse_id, trigger, preview_at, ' +
  'started_at, finished_at, counts, quota_used, errors, cursor, reverts_run_id, reverted_at, ' +
  'reverted_by, created_by, created_at';

const ITEM_COLUMNS =
  'run_id, variation_id, product_id, sku, name, external_item_id, external_model_id, shop_before, ' +
  'ours_qty_before, ours_reserved_before, target, plan, selected, applied, after, error, ' +
  'revert_status, revert_note';

/** แถวดิบจาก PostgREST → รูปที่ code ใช้ (jsonb ที่ว่างมาเป็น {} / [] อยู่แล้ว แต่กันไว้) */
function toRun(row: unknown): SyncRun {
  const r = row as Record<string, unknown>;
  return {
    ...(r as unknown as SyncRun),
    counts: (r.counts as SyncRunCounts) || {},
    errors: Array.isArray(r.errors) ? (r.errors as string[]) : [],
  };
}

/**
 * ทิ้งรอบ "พรีวิวแล้วไม่ได้ลงมือ" ของร้าน+งานเดียวกันที่ค้างอยู่
 *
 * เปิดหน้าพรีวิวหนึ่งครั้ง = หนึ่งรอบ · เจ้าของเปิดดู 7 ครั้งก็ได้ 7 แถวทั้งที่ยังไม่ได้
 * ทำอะไรสักครั้ง — ประวัติกลายเป็นขยะและอ่านไม่ออกว่าตกลงทำอะไรไปบ้าง
 * ⇒ ต่อร้าน+งาน เก็บรอบพรีวิวที่ยังไม่ลงมือไว้ได้ใบเดียว (ใบล่าสุดเท่านั้น)
 * รอบที่ลงมือแล้ว (running/done/partial/…) ไม่ถูกแตะ — เป็นประวัติจริง
 */
export async function discardPendingPreviews(accountId: string, job: SyncRunJob): Promise<void> {
  const { error } = await supabaseAdmin
    .from('marketplace_sync_runs')
    .delete()
    .eq('account_id', accountId)
    .eq('job', job)
    .eq('status', 'previewed');
  if (error) console.error('discardPendingPreviews failed:', error.message);
}

export async function createRun(input: CreateRunInput): Promise<SyncRun> {
  const { data, error } = await supabaseAdmin
    .from('marketplace_sync_runs')
    .insert({
      company_id: input.company_id,
      account_id: input.account_id,
      platform: input.platform,
      job: input.job,
      mode: input.mode ?? null,
      status: input.status || 'previewed',
      warehouse_id: input.warehouse_id ?? null,
      trigger: input.trigger || 'manual',
      counts: input.counts || {},
      quota_used: input.quota_used ?? 0,
      created_by: input.created_by ?? null,
      reverts_run_id: input.reverts_run_id ?? null,
      started_at: input.started_at ?? null,
    })
    .select(RUN_COLUMNS)
    .single();

  if (error || !data) throw new Error(`สร้างรอบซิงค์ไม่สำเร็จ: ${error?.message || 'ไม่ทราบสาเหตุ'}`);
  return toRun(data);
}

/** ตั้งรอบเป็น "กำลังทำ" — จุดเดียวที่ปั๊ม `started_at` (ตัวกันรอบซ้อนอ่านค่านี้) */
export async function startRun(runId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('marketplace_sync_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throw new Error(`เริ่มรอบซิงค์ไม่สำเร็จ: ${error.message}`);
}

/** จดว่าทำถึงไหนแล้ว — ร้านใหญ่ทำไม่จบใน request เดียว ต้องมีที่ค้างไว้ให้ทำต่อ */
export async function updateRunCursor(runId: string, cursor: number | null): Promise<void> {
  const { error } = await supabaseAdmin
    .from('marketplace_sync_runs')
    .update({ cursor })
    .eq('id', runId);
  if (error) console.error('[sync-runs] จด cursor ไม่สำเร็จ:', error.message);
}

export async function finishRun(runId: string, input: FinishRunInput): Promise<void> {
  const patch: Record<string, unknown> = {
    status: input.status,
    finished_at: input.finished_at ?? new Date().toISOString(),
  };
  if (input.counts) patch.counts = input.counts;
  if (input.quota_used != null) patch.quota_used = input.quota_used;
  if (input.errors) patch.errors = input.errors;
  if (input.cursor !== undefined) patch.cursor = input.cursor;

  const { error } = await supabaseAdmin
    .from('marketplace_sync_runs')
    .update(patch)
    .eq('id', runId);
  if (error) console.error('[sync-runs] ปิดรอบไม่สำเร็จ:', error.message);
}

/** หัวรอบ + รายการทั้งหมด — `companyId` บังคับเสมอ (service role bypass RLS) */
export async function getRun(
  runId: string,
  companyId: string,
): Promise<{ run: SyncRun; items: SyncRunItem[] } | null> {
  const { data: run } = await supabaseAdmin
    .from('marketplace_sync_runs')
    .select(RUN_COLUMNS)
    .eq('id', runId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!run) return null;

  const { data: items } = await supabaseAdmin
    .from('marketplace_sync_run_items')
    .select(ITEM_COLUMNS)
    .eq('run_id', runId)
    .order('name', { ascending: true });

  return {
    run: toRun(run),
    items: (items || []) as unknown as SyncRunItem[],
  };
}

/** หัวรอบอย่างเดียว (ไม่โหลด items) — ใช้ตอนเช็คสิทธิ์/สถานะก่อนลงมือ */
export async function getRunHead(runId: string, companyId: string): Promise<SyncRun | null> {
  const { data } = await supabaseAdmin
    .from('marketplace_sync_runs')
    .select(RUN_COLUMNS)
    .eq('id', runId)
    .eq('company_id', companyId)
    .maybeSingle();
  return data ? toRun(data) : null;
}

/** ประวัติของร้าน — หัวอย่างเดียว (หน้า list ไม่ต้องการ items) */
export async function listRuns(
  accountId: string,
  companyId: string,
  limit = 20,
): Promise<SyncRun[]> {
  const { data } = await supabaseAdmin
    .from('marketplace_sync_runs')
    .select(RUN_COLUMNS)
    .eq('account_id', accountId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data || []).map(row => toRun(row));
}

/**
 * รอบล่าสุดของร้าน (ต่องานถ้าระบุ)
 *
 * @param opts.appliedOnly ข้ามรอบที่ **ยังไม่เคยลงมือ** (`previewed`) — ตัวตัดสิน "ย้อนได้ไหม"
 *   ต้องใช้ค่านี้ ไม่งั้นแค่เปิดหน้าพรีวิว (ซึ่งสร้างรอบ `previewed` ทุกครั้ง) ก็จะบล็อกปุ่มย้อน
 *   ทั้งที่พรีวิวไม่ได้เปลี่ยนอะไรเลยสักตัว
 */
export async function latestRunForAccount(
  accountId: string,
  job?: SyncRunJob,
  opts: { appliedOnly?: boolean } = {},
): Promise<SyncRun | null> {
  let q = supabaseAdmin
    .from('marketplace_sync_runs')
    .select(RUN_COLUMNS)
    .eq('account_id', accountId);
  if (job) q = q.eq('job', job);
  if (opts.appliedOnly) q = q.neq('status', 'previewed');

  const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data ? toRun(data) : null;
}

/** รอบที่ย้อน `runId` ไปแล้ว (ถ้ามี) — กันกดย้อนซ้ำสองรอบ */
export async function revertRunFor(runId: string): Promise<SyncRun | null> {
  const { data } = await supabaseAdmin
    .from('marketplace_sync_runs')
    .select(RUN_COLUMNS)
    .eq('reverts_run_id', runId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRun(data) : null;
}

/**
 * ประทับที่ **รอบต้นทาง** ว่าถูกย้อนแล้ว (ไม่ใช่ที่รอบย้อน — รอบย้อนปิดด้วย `finishRun` ตามปกติ)
 * `revert_partial` = ย้อนได้ไม่ครบ (ของถูกขายไปแล้ว / ยอดบนร้านเปลี่ยนไปแล้ว)
 */
export async function markRunReverted(
  runId: string,
  input: { status: 'reverted' | 'revert_partial'; revertedBy?: string | null },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('marketplace_sync_runs')
    .update({
      status: input.status,
      reverted_at: new Date().toISOString(),
      reverted_by: input.revertedBy ?? null,
    })
    .eq('id', runId);
  if (error) console.error('[sync-runs] ประทับว่าย้อนแล้วไม่สำเร็จ:', error.message);
}

/**
 * รอบของร้านนี้ที่ยัง "กำลังทำ" อยู่จริง — ตัวกันกดซ้ำซ้อน
 *
 * นับเฉพาะที่ `started_at` อยู่ใน `withinMs` ล่าสุด: รอบที่ function โดน kill กลางทาง
 * จะค้างสถานะ running ตลอดกาล ถ้าไม่มีเพดานเวลาจะบล็อกร้านนั้นถาวร
 */
export async function findRunningRun(
  accountId: string,
  job: SyncRunJob,
  withinMs = 10 * 60_000,
): Promise<SyncRun | null> {
  const since = new Date(Date.now() - withinMs).toISOString();
  const { data } = await supabaseAdmin
    .from('marketplace_sync_runs')
    .select(RUN_COLUMNS)
    .eq('account_id', accountId)
    .eq('job', job)
    .eq('status', 'running')
    .is('finished_at', null)
    .gte('started_at', since)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? toRun(data) : null;
}

// ── รายการในรอบ ──────────────────────────────────────────────────────────────

/**
 * เขียนรายการของรอบใหม่ทั้งชุด (ลบของเดิมก่อน) — preview รอบเดิมซ้ำได้ไม่ต้องสร้าง run ใหม่
 * insert ทีละ ≤500 แถว: PostgREST รับ body ใหญ่มากไม่ไหว และล้มทั้งก้อนถ้าแถวเดียวพัง
 */
export async function replaceRunItems(runId: string, items: SyncRunItemInput[]): Promise<void> {
  const { error: delError } = await supabaseAdmin
    .from('marketplace_sync_run_items')
    .delete()
    .eq('run_id', runId);
  if (delError) throw new Error(`ล้างรายการเดิมของรอบไม่สำเร็จ: ${delError.message}`);
  if (items.length === 0) return;

  const rows = items.map(item => ({
    run_id: runId,
    variation_id: item.variation_id,
    product_id: item.product_id ?? null,
    sku: item.sku ?? null,
    name: item.name ?? null,
    external_item_id: item.external_item_id ?? null,
    external_model_id: item.external_model_id ?? null,
    shop_before: item.shop_before ?? null,
    ours_qty_before: item.ours_qty_before ?? null,
    ours_reserved_before: item.ours_reserved_before ?? null,
    target: item.target ?? null,
    plan: item.plan,
    selected: item.selected ?? false,
  }));

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin
      .from('marketplace_sync_run_items')
      .insert(rows.slice(i, i + 500));
    if (error) throw new Error(`บันทึกรายการของรอบไม่สำเร็จ: ${error.message}`);
  }
}

/**
 * ติ๊กว่าผู้ใช้เลือกแถวไหนบ้าง — ส่ง `variationIds` = null แปลว่า "เลือกทุกแถวที่ลงมือได้"
 * (ล้างของเดิมก่อนเสมอ เพื่อให้ผลลัพธ์ตรงกับสิ่งที่ผู้ใช้เห็นบนจอรอบล่าสุด)
 */
export async function selectRunItems(
  runId: string,
  variationIds: string[] | null,
): Promise<number> {
  const { error: clearError } = await supabaseAdmin
    .from('marketplace_sync_run_items')
    .update({ selected: false })
    .eq('run_id', runId)
    .eq('selected', true);
  if (clearError) throw new Error(`ล้างรายการที่เลือกไว้ไม่สำเร็จ: ${clearError.message}`);

  if (variationIds === null) {
    const { data, error } = await supabaseAdmin
      .from('marketplace_sync_run_items')
      .update({ selected: true })
      .eq('run_id', runId)
      .in('plan', ACTIONABLE_STOCK_PLANS as unknown as string[])
      .select('variation_id');
    if (error) throw new Error(`เลือกรายการไม่สำเร็จ: ${error.message}`);
    return (data || []).length;
  }

  const ids = [...new Set(variationIds.filter(Boolean))];
  let selected = 0;
  // `.in()` ทีละ 150 — URL ที่ยาวเกินลิมิต PostgREST ล้มเงียบ (คืน error ไม่ใช่แถว)
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabaseAdmin
      .from('marketplace_sync_run_items')
      .update({ selected: true })
      .eq('run_id', runId)
      .in('variation_id', ids.slice(i, i + 150))
      .select('variation_id');
    if (error) throw new Error(`เลือกรายการไม่สำเร็จ: ${error.message}`);
    selected += (data || []).length;
  }
  return selected;
}

/** variation ที่ถูกติ๊กไว้ในรอบนี้ */
export async function selectedVariationIds(runId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('marketplace_sync_run_items')
    .select('variation_id')
    .eq('run_id', runId)
    .eq('selected', true);
  return (data || []).map(r => r.variation_id as string);
}

/**
 * บันทึกผลของแต่ละแถวหลังลงมือ
 *
 * ใช้ update ทีละแถว (ไม่ใช่ upsert) เพราะ `plan` เป็น NOT NULL — upsert ที่ไม่มี plan
 * จะล้มทันทีถ้าเผลอชนกิ่ง insert · คุม concurrency ไว้ 8 พอให้เร็วโดยไม่ถล่ม pool
 */
export async function markItemsApplied(
  runId: string,
  updates: SyncRunItemApply[],
): Promise<void> {
  if (updates.length === 0) return;
  await parallelLimit(updates, async (u) => {
    const patch: Record<string, unknown> = { applied: u.applied };
    if (u.after !== undefined) patch.after = u.after;
    if (u.error !== undefined) patch.error = u.error;
    if (u.revert_status !== undefined) patch.revert_status = u.revert_status;
    if (u.revert_note !== undefined) patch.revert_note = u.revert_note;

    const { error } = await supabaseAdmin
      .from('marketplace_sync_run_items')
      .update(patch)
      .eq('run_id', runId)
      .eq('variation_id', u.variation_id);
    if (error) console.error('[sync-runs] บันทึกผลรายแถวไม่สำเร็จ:', error.message);
  }, 8);
}

/** ผลการย้อนของแต่ละแถว — เขียนลง **รายการของรอบต้นทาง** (คนละที่กับ items ของรอบย้อน) */
export interface SyncRunItemRevert {
  variation_id: string;
  revert_status: string;
  revert_note?: string | null;
}

/**
 * จดผลการย้อนทีละแถวที่รอบต้นทาง — หน้ารอบเดิมจึงบอกได้ว่า "ตัวไหนคืนได้ ตัวไหนคืนไม่ได้เพราะอะไร"
 * (ค่าเดียวกันนี้ไม่ได้อยู่ในรอบย้อน เพราะสิ่งที่ผู้ใช้เปิดดูคือรอบที่เขากดพลาด ไม่ใช่รอบแก้)
 */
export async function markItemsReverted(
  runId: string,
  updates: SyncRunItemRevert[],
): Promise<void> {
  if (updates.length === 0) return;
  await parallelLimit(updates, async (u) => {
    const { error } = await supabaseAdmin
      .from('marketplace_sync_run_items')
      .update({ revert_status: u.revert_status, revert_note: u.revert_note ?? null })
      .eq('run_id', runId)
      .eq('variation_id', u.variation_id);
    if (error) console.error('[sync-runs] จดผลการย้อนรายแถวไม่สำเร็จ:', error.message);
  }, 8);
}

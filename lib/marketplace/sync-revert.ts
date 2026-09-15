// "ย้อนรอบ" งานซิงค์สต็อก marketplace (server-only)
//
// ทำไมต้องมี: ปุ่มดึง/ส่งสต็อกเปลี่ยนยอดทีเป็นร้อยตัวเลือกในคลิกเดียว กดผิดโหมด
// (เช่น `overwrite` ทั้งที่ตั้งใจ `fill_blank`) แล้วไล่แก้มือทีละตัวเป็นไปไม่ได้
// ⇒ ทุกรอบมีสมุด (`marketplace_sync_runs`) อยู่แล้ว การย้อนจึงเป็นการ "ทำรอบใหม่ที่ชี้กลับ"
//    (`reverts_run_id`) ไม่ใช่การลบประวัติ — ย้อนแล้วยังเห็นทั้งรอบที่พลาดและรอบที่แก้
//
// ⚠️ หลักที่ห้ามพัง 3 ข้อ
//  1. **ขา pull คืนด้วย "ส่วนต่าง" ไม่ใช่ตั้งยอดปลายทาง** (`offsetStock`) — ระหว่างที่รอย้อน
//     อาจมีคนขายของไปแล้ว ถ้าตั้งยอดกลับตรง ๆ จะกลืนยอดที่ขายไปทิ้ง
//  2. **ขา push ไม่ทับยอดบนร้านที่เปลี่ยนไปแล้ว** — ส่งคืนเฉพาะตัวที่ยอดบนร้านยังเป็นเลข
//     ที่เราส่งไปเป๊ะ ๆ ตัวที่มีคนแก้ทีหลัง = ปล่อยไว้ พร้อมบอกว่าทำไมไม่แตะ
//  3. **เขียนสต็อกผ่าน stock-service เท่านั้น** (DB ปฏิเสธการเขียน `inventory` ตรง ๆ อยู่แล้ว)
//
// ป้ายภาษาไทยของโค้ดทุกตัวในไฟล์นี้อยู่ที่ `lib/marketplace/sync-run-labels.ts` (client-safe)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { offsetStock } from '@/lib/stock-service';
import { parallelLimit } from '@/lib/parallel';
import { readShopStockLevels, pushStockForAccount } from '@/lib/marketplace/stock-push';
import type { StockSyncAccount } from '@/lib/marketplace/stock-adapter';
import {
  createRun,
  finishRun,
  getRun,
  latestRunForAccount,
  markItemsApplied,
  markItemsReverted,
  markRunReverted,
  replaceRunItems,
  revertRunFor,
} from '@/lib/marketplace/sync-runs';
import type {
  StockPlan,
  SyncRun,
  SyncRunItem,
  SyncRunItemInput,
} from '@/lib/marketplace/sync-runs';
import type {
  RevertBlockReason,
  RevertItemStatus,
  RevertWarning,
} from '@/lib/marketplace/sync-run-labels';

/** รอบที่เก่ากว่านี้ไม่ให้ย้อน — ยิ่งนานยิ่งมีของขยับทับจนคืนแล้วไม่ได้อะไรที่ตรงความจริง */
export const REVERT_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

/** งบเวลาของการย้อนขา push (เท่ากับ route push เดิม — หยุดก่อนโดน platform ตัดกลางคัน) */
const PUSH_TIME_BUDGET_MS = 240_000;

/** `reference_type` ของรายการสต็อกที่เกิดจากการย้อน — ป้ายไทยอยู่ที่ `REFERENCE_TYPE_LABELS` */
export const REVERT_REFERENCE_TYPE = 'marketplace_sync_revert';

// ── Types ────────────────────────────────────────────────────────────────────

/** แถว `marketplace_accounts` เท่าที่งานย้อนใช้ */
export interface RevertAccount extends StockSyncAccount {
  auto_sync_stock?: boolean | null;
}

export interface RevertItemState {
  variation_id: string;
  /**
   * `clean`   — หลังรอบนั้นยอดตัวนี้ไม่มีใครแตะเลย คืนได้ตรง ๆ
   * `activity`— มีความเคลื่อนไหวอื่นแทรก (ขาย/รับเข้า/โอน) คืนได้แต่ยอดจะไม่เท่าเดิมเป๊ะ
   * `unknown` — ขา push: รู้ไม่ได้จนกว่าจะอ่านยอดบนร้านใหม่ตอนกดจริง
   */
  state: 'clean' | 'activity' | 'unknown';
  activity_count?: number;
}

export interface Revertability {
  can_revert: boolean;
  reason?: RevertBlockReason;
  /** รอบที่ใหม่กว่าซึ่งทำให้ย้อนรอบนี้ไม่ได้ (คู่กับ `reason: 'newer_run_exists'`) */
  newer_run_id?: string;
  warnings: RevertWarning[];
  items: RevertItemState[];
}

export interface RevertOversold {
  variation_id: string;
  /** จำนวนที่คืนไม่ได้เพราะของถูกขายไปแล้ว */
  missing: number;
  orders: { id: string; order_number: string | null }[];
}

export interface RevertItemResult {
  variation_id: string;
  revert_status: RevertItemStatus;
  revert_note: string | null;
}

export type RevertCounts = Record<RevertItemStatus, number>;

export interface RevertRunResult {
  revert_run_id: string;
  /** สถานะที่ประทับกลับไปที่ "รอบต้นทาง" */
  status: 'reverted' | 'revert_partial';
  counts: RevertCounts;
  oversold: RevertOversold[];
  items: RevertItemResult[];
  errors: string[];
  /**
   * ขา pull เท่านั้น — ยอดคลังเพิ่งถูกแก้ ร้านอื่นที่ผูก variation เดียวกันต้องได้เลขใหม่
   * route เป็นคนเอาไปเรียกใน `after()` (ที่นี่เป็น lib จึงไม่แตะ lifecycle ของ request)
   */
  resync: { variationIds: string[]; warehouseId: string } | null;
}

export interface RevertOptions {
  userId?: string | null;
  /** ส่งมาได้ถ้า route โหลดไว้แล้ว — ไม่ส่งจะไปอ่านเอง */
  items?: SyncRunItem[];
  account?: RevertAccount | null;
}

// ── ตัวช่วย ──────────────────────────────────────────────────────────────────

function emptyCounts(): RevertCounts {
  return {
    reverted: 0,
    reverted_with_activity: 0,
    oversold: 0,
    changed_on_shop: 0,
    skipped: 0,
    not_reverted: 0,
    failed: 0,
  };
}

/** id ย่อไว้ใส่ในหมายเหตุของรายการสต็อก (ฉบับเต็มอยู่ที่ `reference_id` อยู่แล้ว) */
function shortId(id: string): string {
  return id.slice(0, 8);
}

function num(value: number | null | undefined): number | null {
  return value == null ? null : Number(value);
}

export async function loadRevertAccount(accountId: string): Promise<RevertAccount | null> {
  const { data } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle();
  return (data as RevertAccount | null) || null;
}

async function loadRunItems(run: SyncRun): Promise<SyncRunItem[]> {
  const loaded = await getRun(run.id, run.company_id);
  return loaded?.items || [];
}

/**
 * นับความเคลื่อนไหวสต็อกที่เกิด **หลัง** รอบนั้นเริ่ม ต่อ variation
 *
 * กรอง `company_id` + `created_at` ก่อนเสมอ เพื่อให้ลงร่องดัชนี `(company_id, created_at desc)`
 * — กรอง `variation_id` นำจะกวาดทั้งประวัติของตัวนั้นตั้งแต่ยุคก่อน
 * อ่านครั้งเดียวทีละ 150 id แล้วนับใน memory (ยิงทีละตัวคือหลายร้อย round trip)
 */
async function countActivityAfterRun(
  run: SyncRun,
  variationIds: string[],
): Promise<{ counts: Map<string, number>; failed: boolean }> {
  const counts = new Map<string, number>();
  if (!run.warehouse_id || !run.started_at) return { counts, failed: true };

  const ids = [...new Set(variationIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabaseAdmin
      .from('inventory_transactions')
      .select('variation_id, reference_id')
      .eq('company_id', run.company_id)
      .gt('created_at', run.started_at)
      .eq('warehouse_id', run.warehouse_id)
      .in('variation_id', ids.slice(i, i + 150));
    // อ่านไม่ได้ ≠ ไม่มีความเคลื่อนไหว — บอกว่า "ไม่รู้" ดีกว่าบอกว่า "สะอาด" แล้วผู้ใช้เชื่อผิด
    if (error) {
      console.error('[sync-revert] อ่านความเคลื่อนไหวสต็อกไม่สำเร็จ:', error.message);
      return { counts: new Map(), failed: true };
    }
    for (const row of data || []) {
      // รายการของรอบนั้นเองไม่นับเป็น "คนอื่นมาแตะ"
      if (row.reference_id === run.id) continue;
      const key = row.variation_id as string;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return { counts, failed: false };
}

/** ออเดอร์ที่ตัดสต็อกตัวนี้หลังรอบ — ใช้บอกผู้ใช้ว่า "คืนไม่ครบเพราะบิลไหนเอาไป" */
async function findOrdersAfterRun(
  run: SyncRun,
  warehouseId: string,
  variationId: string,
): Promise<{ id: string; order_number: string | null }[]> {
  if (!run.started_at) return [];
  const { data } = await supabaseAdmin
    .from('inventory_transactions')
    .select('reference_id')
    .eq('company_id', run.company_id)
    .gt('created_at', run.started_at)
    .eq('warehouse_id', warehouseId)
    .eq('variation_id', variationId)
    .eq('reference_type', 'order');

  const ids = [...new Set((data || []).map(r => r.reference_id as string | null).filter(Boolean))] as string[];
  if (ids.length === 0) return [];

  const orders: { id: string; order_number: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data: rows } = await supabaseAdmin
      .from('orders')
      .select('id, order_number')
      .in('id', ids.slice(i, i + 150));
    for (const row of rows || []) {
      orders.push({ id: row.id as string, order_number: (row.order_number as string | null) ?? null });
    }
  }
  return orders;
}

/** ทิศของการย้อนแถวหนึ่ง — ใช้เป็น `plan` ของรายการในรอบย้อน (ค่าเดียวกับที่หน้าพรีวิวใช้) */
function planFor(from: number | null, to: number): StockPlan {
  if (from == null) return 'overwrite';
  if (to === from) return 'unchanged';
  if (to === 0) return 'to_zero';
  return to > from ? 'increase' : 'decrease';
}

// ── ย้อนได้ไหม ───────────────────────────────────────────────────────────────

/**
 * ตัดสินว่ารอบนี้ย้อนได้ไหม + เตือนอะไรผู้ใช้บ้าง (อ่านอย่างเดียว ไม่เขียนอะไร)
 *
 * ลำดับเงื่อนไขสำคัญ: เช็ค "ย้อนไปแล้วหรือยัง" ก่อน "มีรอบใหม่กว่าไหม" เสมอ
 * — ไม่งั้นรอบที่เพิ่งย้อนไปจะขึ้นเหตุผลผิดเป็น `newer_run_exists` (รอบย้อนเองคือรอบที่ใหม่กว่า)
 */
export async function assessRevertability(
  run: SyncRun,
  items: SyncRunItem[],
  account?: RevertAccount | null,
): Promise<Revertability> {
  const blocked = (reason: RevertBlockReason, extra: Partial<Revertability> = {}): Revertability => ({
    can_revert: false, reason, warnings: [], items: [], ...extra,
  });

  if (run.job !== 'pull_stock' && run.job !== 'push_stock') return blocked('job_not_supported');
  if (run.status !== 'done' && run.status !== 'partial') return blocked('status_not_revertable');
  if (run.reverted_at) return blocked('already_reverted');
  if (await revertRunFor(run.id)) return blocked('already_reverted');

  // `appliedOnly` = ข้ามรอบ `previewed` — แค่เปิดหน้าพรีวิวก็สร้างรอบใหม่ทุกครั้ง
  // ถ้านับด้วยจะไม่มีใครย้อนอะไรได้เลยหลังกดดูพรีวิวหนึ่งครั้ง
  const latest = await latestRunForAccount(run.account_id, run.job, { appliedOnly: true });
  if (latest && latest.id !== run.id) return blocked('newer_run_exists', { newer_run_id: latest.id });

  const finishedAt = run.finished_at ? new Date(run.finished_at).getTime() : 0;
  if (!finishedAt || Date.now() - finishedAt > REVERT_MAX_AGE_MS) return blocked('too_old');

  const applied = items.filter(i => i.applied);
  if (applied.length === 0) return blocked('nothing_applied');

  const warnings: RevertWarning[] = [];
  let states: RevertItemState[];

  if (run.job === 'pull_stock') {
    const { counts, failed } = await countActivityAfterRun(run, applied.map(i => i.variation_id));
    states = applied.map(item => {
      if (failed) return { variation_id: item.variation_id, state: 'unknown' as const };
      const n = counts.get(item.variation_id) || 0;
      return n > 0
        ? { variation_id: item.variation_id, state: 'activity' as const, activity_count: n }
        : { variation_id: item.variation_id, state: 'clean' as const };
    });
    if (states.some(s => s.state === 'activity')) warnings.push('stock_moved_after_run');
  } else {
    // ขา push บอกล่วงหน้าไม่ได้ว่ายอดบนร้านยังเป็นเลขของเราไหม — รู้ตอนอ่านร้านใหม่เท่านั้น
    states = applied.map(item => ({ variation_id: item.variation_id, state: 'unknown' as const }));
    const acc = account ?? await loadRevertAccount(run.account_id);
    if (!acc || acc.auto_sync_stock !== false) warnings.push('auto_sync_on');
    if (applied.some(i => i.shop_before == null)) warnings.push('shop_value_unknown');
  }

  return { can_revert: true, warnings, items: states };
}

// ── ลงมือย้อน ────────────────────────────────────────────────────────────────

/**
 * ย้อนรอบซิงค์สต็อกหนึ่งรอบ — **ผู้เรียกต้องผ่าน `assessRevertability()` มาก่อนเสมอ**
 * (ฟังก์ชันนี้ไม่ตัดสินสิทธิ์/ความเหมาะสมซ้ำ นอกจากข้อมูลที่ขาดจนทำไม่ได้จริง ๆ)
 */
export async function revertSyncRun(
  run: SyncRun,
  opts: RevertOptions = {},
): Promise<RevertRunResult> {
  const items = opts.items ?? await loadRunItems(run);
  const account = opts.account ?? await loadRevertAccount(run.account_id);
  if (!account) throw new Error('ไม่พบร้านของรอบนี้ — ย้อนไม่ได้');

  return run.job === 'pull_stock'
    ? revertPull(run, items, opts.userId ?? null)
    : revertPush(run, items, account, opts.userId ?? null);
}

/** เปิด "รอบย้อน" — job เดิม ชี้กลับที่รอบต้นทาง คลังเดิม เริ่มทำทันที */
async function openRevertRun(run: SyncRun, userId: string | null, quotaUsed = 0) {
  return createRun({
    company_id: run.company_id,
    account_id: run.account_id,
    platform: run.platform,
    job: run.job,
    mode: run.mode,
    status: 'running',
    warehouse_id: run.warehouse_id,
    trigger: 'manual',
    created_by: userId,
    reverts_run_id: run.id,
    quota_used: quotaUsed,
    started_at: new Date().toISOString(),
  });
}

/** รายการของรอบย้อน — "ก่อน" คือสภาพหลังรอบต้นทาง · "เป้าหมาย" คือค่าที่จะคืนกลับ */
function revertItemInput(
  item: SyncRunItem,
  from: number | null,
  target: number | null,
  selected: boolean,
): SyncRunItemInput {
  return {
    variation_id: item.variation_id,
    product_id: item.product_id,
    sku: item.sku,
    name: item.name,
    external_item_id: item.external_item_id,
    external_model_id: item.external_model_id,
    shop_before: item.shop_before,
    ours_qty_before: from,
    ours_reserved_before: item.ours_reserved_before,
    target,
    plan: target == null ? 'unchanged' : planFor(from, target),
    selected,
  };
}

/** ปิดรอบย้อน + ประทับผลกลับไปที่รอบต้นทาง (ทางออกเดียวของทั้งสองทิศ) */
async function closeRevert(
  run: SyncRun,
  revertRunId: string,
  results: RevertItemResult[],
  errors: string[],
  userId: string | null,
  extra: { quotaUsed?: number; oversold?: RevertOversold[]; resync?: RevertRunResult['resync'] } = {},
): Promise<RevertRunResult> {
  const counts = emptyCounts();
  for (const r of results) counts[r.revert_status]++;

  const clean = counts.reverted + counts.reverted_with_activity;
  const allClean = clean === results.length && results.length > 0;

  await finishRun(revertRunId, {
    status: allClean ? 'done' : (clean > 0 ? 'partial' : 'failed'),
    counts: { checked: results.length, selected: results.length, changed: clean, failed: results.length - clean },
    quota_used: extra.quotaUsed ?? 0,
    errors: errors.slice(0, 20),
  });

  // ผลรายแถวจดที่ **รอบต้นทาง** — สิ่งที่ผู้ใช้เปิดดูคือรอบที่เขากดพลาด ไม่ใช่รอบแก้
  await markItemsReverted(run.id, results.map(r => ({
    variation_id: r.variation_id,
    revert_status: r.revert_status,
    revert_note: r.revert_note,
  })));

  const status = allClean ? 'reverted' as const : 'revert_partial' as const;
  await markRunReverted(run.id, { status, revertedBy: userId });

  return {
    revert_run_id: revertRunId,
    status,
    counts,
    oversold: extra.oversold || [],
    items: results,
    errors,
    resync: extra.resync ?? null,
  };
}

// ── ขา pull: คืนยอดในคลังของเรา ──────────────────────────────────────────────

async function revertPull(
  run: SyncRun,
  items: SyncRunItem[],
  userId: string | null,
): Promise<RevertRunResult> {
  const warehouseId = run.warehouse_id;
  if (!warehouseId) throw new Error('รอบนี้ไม่ได้บันทึกว่าใช้คลังไหน — ย้อนไม่ได้');

  const targets = items.filter(i => i.applied && i.after != null);

  // ต้องนับความเคลื่อนไหว **ก่อน** เปิดรอบย้อน ไม่งั้นรายการที่การย้อนเขียนเองจะถูกนับเป็น
  // "คนอื่นมาแตะ" (created_at ใหม่กว่า started_at ของรอบต้นทางทั้งคู่)
  const { counts: activity } = await countActivityAfterRun(run, targets.map(i => i.variation_id));

  const revertRun = await openRevertRun(run, userId);
  await replaceRunItems(revertRun.id, targets.map(item => {
    const from = num(item.after);
    const target = num(item.ours_qty_before);
    return revertItemInput(item, from, target, target != null);
  }));

  const errors: string[] = [];
  const oversold: RevertOversold[] = [];
  /** ยอดคลังจริงหลังคืน — ลง `after` ของรายการในรอบย้อน (เคส oversold ไม่เท่าเป้าหมาย) */
  const balanceAfter = new Map<string, number>();

  const results = await parallelLimit(targets, async (item): Promise<RevertItemResult> => {
    const after = num(item.after);
    const before = num(item.ours_qty_before);
    const moved = activity.get(item.variation_id) || 0;

    if (after == null || before == null) {
      return { variation_id: item.variation_id, revert_status: 'skipped', revert_note: 'ไม่มียอดคลังก่อนรอบนี้' };
    }

    // delta = ส่วนต่างที่รอบนั้นทำให้เกิด → คืนด้วย −delta (ห้ามตั้งยอดปลายทางตรง ๆ)
    const delta = after - before;
    if (delta === 0) {
      balanceAfter.set(item.variation_id, after);
      return {
        variation_id: item.variation_id,
        revert_status: moved > 0 ? 'reverted_with_activity' : 'reverted',
        revert_note: null,
      };
    }

    try {
      const res = await offsetStock({
        supabase: supabaseAdmin,
        companyId: run.company_id,
        warehouseId,
        variationId: item.variation_id,
        qty: -delta,
        floorAtZero: true,
        referenceType: REVERT_REFERENCE_TYPE,
        referenceId: revertRun.id,
        notes: `ย้อนรอบ ${shortId(run.id)} · คืนส่วนต่าง ${delta > 0 ? '-' : '+'}${Math.abs(delta)} (${after} → ${before})`,
        createdBy: userId,
      });
      balanceAfter.set(item.variation_id, res.balanceAfter);

      const clamped = res.clamped ?? 0;
      if (clamped > 0) {
        // คืนแล้วติดลบ = ของถูกขายไปแล้วระหว่างนั้น — บอกให้ได้ว่าบิลไหนเอาไป
        const orders = await findOrdersAfterRun(run, warehouseId, item.variation_id);
        oversold.push({ variation_id: item.variation_id, missing: clamped, orders });
        const names = orders.map(o => o.order_number).filter(Boolean).join(', ');
        return {
          variation_id: item.variation_id,
          revert_status: 'oversold',
          revert_note: `ขายเกิน ${clamped} ชิ้น${names ? ` · ${names}` : ''}`,
        };
      }

      return {
        variation_id: item.variation_id,
        revert_status: moved > 0 ? 'reverted_with_activity' : 'reverted',
        revert_note: moved > 0 ? `มีความเคลื่อนไหวอื่น ${moved} รายการหลังรอบนี้` : null,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ';
      errors.push(`${item.name || item.variation_id}: ${message}`);
      return { variation_id: item.variation_id, revert_status: 'failed', revert_note: message };
    }
  }, 5);

  // จดผลลงรายการของรอบย้อนด้วย (หน้ารอบย้อนจึงอ่านได้ว่าทำอะไรไปบ้าง)
  await markItemsApplied(revertRun.id, results.map(r => ({
    variation_id: r.variation_id,
    applied: r.revert_status === 'reverted' || r.revert_status === 'reverted_with_activity' || r.revert_status === 'oversold',
    after: balanceAfter.has(r.variation_id) ? balanceAfter.get(r.variation_id)! : null,
    error: r.revert_status === 'failed' ? r.revert_note : null,
  })));

  const touched = results
    .filter(r => r.revert_status !== 'skipped' && r.revert_status !== 'failed')
    .map(r => r.variation_id);

  return closeRevert(run, revertRun.id, results, errors, userId, {
    oversold,
    resync: touched.length > 0 ? { variationIds: touched, warehouseId } : null,
  });
}

// ── ขา push: ส่งเลขเดิมกลับขึ้นร้าน ───────────────────────────────────────────

async function revertPush(
  run: SyncRun,
  items: SyncRunItem[],
  account: RevertAccount,
  userId: string | null,
): Promise<RevertRunResult> {
  const targets = items.filter(i => i.applied && i.after != null);

  // อ่านยอดบนร้าน "ตอนนี้" ก่อนเสมอ — เกณฑ์เดียวที่บอกได้ว่าเลขบนร้านยังเป็นของเราอยู่ไหม
  const shopRead = await readShopStockLevels(account);
  const errors = [...shopRead.errors];

  const revertRun = await openRevertRun(run, userId, shopRead.quotaUsed);

  const decided = new Map<string, RevertItemResult>();
  const quantities = new Map<string, number>();
  const byProduct = new Map<string, string[]>();

  for (const item of targets) {
    const current = shopRead.stock.has(item.variation_id)
      ? Number(shopRead.stock.get(item.variation_id))
      : null;
    const restore = num(item.shop_before);
    const sent = num(item.after);

    if (restore == null) {
      decided.set(item.variation_id, {
        variation_id: item.variation_id, revert_status: 'skipped', revert_note: 'ไม่มีค่าเดิมของร้าน',
      });
      continue;
    }
    if (current == null) {
      decided.set(item.variation_id, {
        variation_id: item.variation_id,
        revert_status: 'changed_on_shop',
        revert_note: 'อ่านยอดบนร้านตอนนี้ไม่ได้ — ไม่ส่งทับ',
      });
      continue;
    }
    if (current !== sent) {
      decided.set(item.variation_id, {
        variation_id: item.variation_id,
        revert_status: 'changed_on_shop',
        revert_note: `บนร้านตอนนี้ = ${current} (มีคนแก้/ระบบส่งทับหลังรอบนี้)`,
      });
      continue;
    }
    if (!item.product_id) {
      decided.set(item.variation_id, {
        variation_id: item.variation_id, revert_status: 'failed', revert_note: 'ไม่รู้ว่าเป็นสินค้าตัวไหน',
      });
      continue;
    }

    quantities.set(item.variation_id, restore);
    const list = byProduct.get(item.product_id) || [];
    list.push(item.variation_id);
    byProduct.set(item.product_id, list);
  }

  await replaceRunItems(revertRun.id, targets.map(item => {
    const current = shopRead.stock.has(item.variation_id)
      ? Number(shopRead.stock.get(item.variation_id))
      : null;
    const queued = quantities.has(item.variation_id);
    return revertItemInput(item, current, queued ? quantities.get(item.variation_id)! : null, queued);
  }));

  // แถวที่ตัดสินไปแล้วว่าไม่ส่ง (ไม่มีค่าเดิม / ยอดบนร้านเปลี่ยนไปแล้ว) จดไว้ที่รอบย้อนด้วย
  // — เปิดหน้ารอบย้อนแล้วต้องอ่านออกว่าทำไมบางตัวถึงไม่ถูกแตะ ไม่ใช่เห็นแค่ช่องว่าง
  if (decided.size > 0) {
    await markItemsApplied(revertRun.id, [...decided.values()].map(r => ({
      variation_id: r.variation_id,
      applied: false,
      after: null,
      error: r.revert_note,
      revert_status: r.revert_status,
      revert_note: r.revert_note,
    })));
  }

  // สินค้าหนึ่งตัว = หนึ่ง call ขึ้นร้าน · concurrency 3 กันชน rate limit (เท่ากับ route push)
  const productIds = [...byProduct.keys()];
  const startMs = Date.now();
  let processed = 0;
  const CHUNK = 15;

  for (let i = 0; i < productIds.length; i += CHUNK) {
    if (Date.now() - startMs > PUSH_TIME_BUDGET_MS) break;
    const chunk = productIds.slice(i, i + CHUNK);
    const rs = await parallelLimit(chunk, (pid) =>
      pushStockForAccount(account, pid, {
        variationIds: byProduct.get(pid),
        runId: revertRun.id,
        quantities,
      }), 3);
    for (const r of rs) errors.push(...r.errors);
    processed += chunk.length;
  }

  // ผลรายตัวเลือกอ่านกลับจากรายการของรอบย้อน — `pushStockForAccount` จดให้แล้วตอนยิงเสร็จ
  // (adapter คืนผลเป็นราย link ที่นี่จึงไม่ต้องเดาซ้ำว่าใบไหนผ่าน)
  const applied = new Map<string, { applied: boolean; error: string | null }>();
  const reloaded = await getRun(revertRun.id, run.company_id);
  for (const row of reloaded?.items || []) {
    applied.set(row.variation_id, { applied: row.applied, error: row.error });
  }

  const unprocessed = new Set(productIds.slice(processed));
  for (const item of targets) {
    if (decided.has(item.variation_id)) continue;
    if (item.product_id && unprocessed.has(item.product_id)) {
      decided.set(item.variation_id, {
        variation_id: item.variation_id,
        revert_status: 'not_reverted',
        revert_note: `หมดเวลาในรอบนี้ — ยังค้างอีก ${unprocessed.size} สินค้า`,
      });
      continue;
    }
    const outcome = applied.get(item.variation_id);
    decided.set(item.variation_id, outcome?.applied
      ? { variation_id: item.variation_id, revert_status: 'reverted', revert_note: null }
      : {
          variation_id: item.variation_id,
          revert_status: 'failed',
          revert_note: outcome?.error || 'ส่งยอดเดิมกลับขึ้นร้านไม่สำเร็จ',
        });
  }

  const results = targets.map(item => decided.get(item.variation_id)!);
  return closeRevert(run, revertRun.id, results, errors, userId, { quotaUsed: shopRead.quotaUsed });
}

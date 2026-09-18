'use client';

// เรียกงานสต็อก/รอบซิงค์ของร้าน marketplace จากฝั่งจอ — ที่เดียวที่รู้วิธีคุยกับ route ชุดนี้
//
// ผู้เรียก: หน้า `/marketplace/sync` (พรีวิว → ลงมือ → ผลลัพธ์ → ย้อน) ·
// การ์ดร้านตอนย้ายคลัง (`MarketplaceConnections`) — เดิมลูป cursor เขียนอยู่ในการ์ดที่เดียว
// พอมีที่เรียกเพิ่ม ถ้า copy ไปจะกลายเป็นหลายลูปที่แก้ไม่พร้อมกัน (ร้านใหญ่ยิงไม่จบใน
// request เดียว route จึงคืน next_cursor มาให้ทำต่อ — พลาดตรงนี้ = ส่งไม่ครบร้านโดยไม่มีใครรู้)
//
// ⛔ ทุกฟังก์ชันคืนรูปเดียวกัน `{ ok, message, data?, code? }` — **ห้าม throw**
//    หน้าจอจะได้ไม่ต้องเขียน try/catch ซ้ำทุกจุด และตัดสินใจต่อจาก **โค้ด** (`code`)
//    ไม่ใช่จากข้อความไทย (ข้อความเปลี่ยนเมื่อไหร่ก็พังเงียบ)

import { apiFetch } from '@/lib/api-client';
import type { StockPlan, SyncRun, SyncRunItem } from '@/lib/marketplace/sync-runs';
import type { Revertability, RevertCounts, RevertOversold } from '@/lib/marketplace/sync-revert';

// ── รูปผลลัพธ์กลาง ───────────────────────────────────────────────────────────

export interface StockActionResult<T = undefined> {
  ok: boolean;
  message: string;
  data?: T;
  /**
   * โค้ดจาก API ที่หน้าจอต้องแยกทางเดิน — `preview_expired` · `run_in_progress` ·
   * `run_already_used` · `quota` · `run_not_found`
   */
  code?: string;
  /** รอบที่เกี่ยวข้องกับ error (409 ทุกตัวส่งมาด้วย) — ใช้ทำปุ่ม "เปิดรอบนั้น" */
  runId?: string;
  /** โควตาเต็มถึงเมื่อไร (429) */
  until?: string;
}

const fail = (message: string, extra: Partial<StockActionResult> = {}): StockActionResult<never> =>
  ({ ok: false, message, ...extra }) as StockActionResult<never>;

/** ยิง POST แบบ JSON แล้วคืน body + สถานะ — ที่เดียวที่รู้ว่า error ของ route ชุดนี้หน้าตายังไง */
async function postJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ res: Response; data: Record<string, unknown> }> {
  const res = await apiFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, data };
}

/** แปลง body ของ error ให้เป็นผลลัพธ์กลาง — 409 พก `run_id` · 429 พก `until` */
function toFailure(res: Response, data: Record<string, unknown>, fallback: string): StockActionResult<never> {
  const code = typeof data.error === 'string' ? data.error : undefined;
  const errors = Array.isArray(data.errors) ? (data.errors as string[]) : [];
  return fail(code || errors[0] || fallback, {
    code,
    runId: typeof data.run_id === 'string' ? data.run_id : undefined,
    until: typeof data.until === 'string' ? data.until : undefined,
    ...(res.status === 429 ? { code: 'quota' } : {}),
  });
}

// ── พรีวิว ("ถ้ากดแล้วจะเกิดอะไร") ────────────────────────────────────────────

export type StockDirection = 'pull' | 'push';
export type PullMode = 'fill_blank' | 'overwrite';

/** แถวหนึ่งของตารางพรีวิว — รูปเดียวกับที่ `/stock-preview` คืนมา */
export interface StockPreviewRow {
  variation_id: string;
  product_id: string;
  sku: string | null;
  name: string | null;
  image: string | null;
  external_item_id: string | null;
  external_model_id: string | null;
  /** ยอดบนร้าน — null = อ่านไม่เจอ (ประกาศหาย / link เสีย) */
  shop: number | null;
  ours_qty: number;
  ours_reserved: number;
  ours_available: number;
  target: number;
  plan: StockPlan;
  has_inventory_row: boolean;
  sync_enabled: boolean;
  selected: boolean;
  /** ขา push: จะส่ง 0 ทับร้านทั้งที่ระบบยังไม่เคยตั้งยอด — ไม่ติ๊กให้ล่วงหน้า */
  risky?: true;
}

export interface StockPreviewCounts {
  checked?: number;
  unchanged?: number;
  skipped?: number;
  increased?: number;
  decreased?: number;
  to_zero?: number;
  selected?: number;
}

export interface StockPreviewData {
  run_id: string;
  preview_at: string;
  expires_at: string;
  direction: StockDirection;
  mode: PullMode | null;
  warehouse_id: string | null;
  rows: StockPreviewRow[];
  counts: StockPreviewCounts;
  quota: { preview_used: number; apply_calls: number };
  errors: string[];
}

/** อ่านยอดสองฝั่งแล้วคืนแผนรายตัวเลือก โดยยังไม่เขียนอะไร (สร้างรอบสถานะ `previewed`) */
export async function previewStockRequest(
  accountId: string,
  direction: StockDirection,
  mode?: PullMode,
): Promise<StockActionResult<StockPreviewData>> {
  try {
    const { res, data } = await postJson('/api/marketplace/products/stock-preview', {
      marketplace_account_id: accountId,
      direction,
      ...(direction === 'pull' ? { mode: mode || 'fill_blank' } : {}),
    });
    if (!res.ok) return toFailure(res, data, 'อ่านยอดจากร้านไม่สำเร็จ');
    return { ok: true, message: 'อ่านยอดจากร้านแล้ว', data: data as unknown as StockPreviewData };
  } catch {
    return fail('อ่านยอดจากร้านไม่สำเร็จ');
  }
}

// ── ลงมือตามที่ติ๊กไว้ ────────────────────────────────────────────────────────

export interface PullApplyData {
  run_id?: string;
  checked?: number;
  filled: number;
  skipped_nonzero: number;
  overwritten: number;
  errors: string[];
}

/** ดึงยอดจากร้านลงคลังตามแถวที่ผู้ใช้ติ๊กไว้ในรอบนั้น */
export async function applyPullRequest(
  accountId: string,
  runId: string,
  variationIds: string[],
): Promise<StockActionResult<PullApplyData>> {
  try {
    const { res, data } = await postJson('/api/marketplace/products/pull-stock', {
      marketplace_account_id: accountId,
      run_id: runId,
      variation_ids: variationIds,
    });
    if (!res.ok) return toFailure(res, data, 'ดึงสต็อกไม่สำเร็จ');
    const result = data as unknown as PullApplyData & { success?: boolean };
    if (result.success === false) {
      return fail(result.errors?.[0] || 'ดึงสต็อกไม่สำเร็จ', { runId: result.run_id });
    }
    return {
      ok: true,
      runId: result.run_id,
      message: `ดึงสต็อกสำเร็จ — เติมให้ ${result.filled} รายการ (ข้าม ${result.skipped_nonzero} รายการที่มียอดอยู่แล้ว)`,
      data: result,
    };
  } catch {
    return fail('ดึงสต็อกไม่สำเร็จ');
  }
}

export interface PushApplyData {
  run_id?: string;
  updated_models: number;
  errors: string[];
}

export interface PushProgress {
  done: number;
  total: number;
  message: string;
}

/** จำนวนรอบสูงสุดที่วน cursor — กันวนไม่รู้จบถ้าฝั่ง route เพี้ยน */
const MAX_PUSH_ROUNDS = 20;

/**
 * ส่งยอดในระบบขึ้นร้านตามแถวที่ติ๊กไว้ — route ทำได้ไม่จบใน request เดียวจึงคืน
 * `next_cursor` มา วนต่อให้จนครบ
 *
 * ⚠️ รอบต่อ ๆ ไป **ห้ามส่ง `variation_ids` ซ้ำ** — route จะติ๊กใหม่ทับของเดิม
 *    (รอบแรกติ๊กไว้แล้ว รอบถัดไปอ่านจากรอบเดิม)
 */
export async function applyPushRequest(
  accountId: string,
  runId: string,
  variationIds: string[],
  onProgress?: (p: PushProgress) => void,
  startCursor?: number,
): Promise<StockActionResult<PushApplyData>> {
  let cursor: number | undefined = startCursor;
  let pushed = 0;
  try {
    for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
      const first = round === 0 && startCursor === undefined;
      const { res, data } = await postJson('/api/marketplace/products/push-stock', {
        marketplace_account_id: accountId,
        run_id: runId,
        ...(first ? { variation_ids: variationIds } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
      });
      if (!res.ok) return toFailure(res, data, 'ส่งสต็อกขึ้นร้านไม่สำเร็จ');

      const result = data as unknown as PushApplyData & {
        success?: boolean; partial?: boolean; next_cursor?: number;
        total?: number; done?: number; message?: string;
      };
      pushed += result.updated_models || 0;

      if (!result.partial) {
        const merged = { ...result, updated_models: pushed };
        return result.success
          ? { ok: true, runId: result.run_id, message: `ส่งยอดขึ้นร้านครบแล้ว (${pushed} ตัวเลือก)`, data: merged }
          : fail(result.errors?.[0] || 'ส่งยอดขึ้นร้านไม่ครบ', { runId: result.run_id });
      }

      cursor = result.next_cursor;
      onProgress?.({
        done: result.done || 0,
        total: result.total || 0,
        message: result.message || `กำลังส่ง... (${result.done}/${result.total})`,
      });
    }
    return fail('ส่งยอดขึ้นร้านไม่ครบ — กด "ทำต่อจากที่ค้าง" ที่หน้าผลลัพธ์', { runId });
  } catch {
    return fail('ส่งสต็อกขึ้นร้านไม่สำเร็จ');
  }
}

/**
 * ส่งยอดในระบบขึ้นร้าน **ทั้งร้านโดยไม่ผ่านพรีวิว** — เหลือผู้เรียกเดียวคือการ์ดร้านตอนย้ายคลัง
 * (ย้ายคลังแล้วยอดทั้งร้านเปลี่ยนชุดทันที ไม่มีอะไรให้ผู้ใช้ตัดสินใจเพิ่ม จึงไม่ต้องมีตาราง)
 */
export async function pushStockAllRequest(
  accountId: string,
  onProgress?: (message: string) => void,
  opts: { trigger?: 'manual' | 'warehouse_change' | 'onboarding' } = {},
): Promise<StockActionResult & { pushed: number }> {
  let cursor: number | undefined;
  let pushed = 0;
  try {
    for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
      const { res, data } = await postJson('/api/marketplace/products/push-stock', {
        marketplace_account_id: accountId,
        cursor,
        ...(opts.trigger ? { trigger: opts.trigger } : {}),
      });
      if (!res.ok) {
        return { ...toFailure(res, data, 'ส่งสต็อกขึ้นร้านไม่สำเร็จ'), pushed };
      }
      const result = data as unknown as {
        success?: boolean; partial?: boolean; next_cursor?: number;
        updated_models?: number; errors?: string[]; done?: number; total?: number; message?: string;
      };
      pushed += result.updated_models || 0;
      if (!result.partial) {
        return result.success
          ? { ok: true, pushed, message: `ส่งยอดขึ้นร้านครบแล้ว (${pushed} รายการ)` }
          : { ok: false, pushed, message: result.errors?.[0] || 'ส่งยอดขึ้นร้านไม่ครบ' };
      }
      cursor = result.next_cursor;
      onProgress?.(result.message || `กำลังส่ง... (${result.done}/${result.total})`);
    }
    return { ok: false, pushed, message: 'ส่งยอดขึ้นร้านไม่ครบ — กดส่งซ้ำเพื่อทำต่อจากที่ค้าง' };
  } catch {
    return { ok: false, pushed, message: 'ส่งสต็อกขึ้นร้านไม่สำเร็จ' };
  }
}

// ── ประวัติรอบ + รายละเอียด ─────────────────────────────────────────────────

/** ประวัติรอบซิงค์ของร้าน (หัวรอบอย่างเดียว) */
export async function fetchRuns(accountId: string, limit = 10): Promise<StockActionResult<SyncRun[]>> {
  try {
    const res = await apiFetch(`/api/marketplace/sync-runs?account_id=${accountId}&limit=${limit}`);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return toFailure(res, data, 'อ่านประวัติรอบซิงค์ไม่สำเร็จ');
    return { ok: true, message: '', data: (data.runs || []) as SyncRun[] };
  } catch {
    return fail('อ่านประวัติรอบซิงค์ไม่สำเร็จ');
  }
}

export interface SyncRunDetail {
  run: SyncRun;
  items: SyncRunItem[];
  revertability: Revertability;
}

/** รอบเดียวพร้อมรายการ + คำตัดสินว่าย้อนได้ไหม */
export async function fetchRun(runId: string): Promise<StockActionResult<SyncRunDetail>> {
  try {
    const res = await apiFetch(`/api/marketplace/sync-runs?id=${runId}`);
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return toFailure(res, data, 'อ่านรอบซิงค์ไม่สำเร็จ');
    return { ok: true, message: '', data: data as unknown as SyncRunDetail };
  } catch {
    return fail('อ่านรอบซิงค์ไม่สำเร็จ');
  }
}

// ── ย้อนรอบ ─────────────────────────────────────────────────────────────────

export interface RevertRunData {
  revert_run_id: string;
  status: 'reverted' | 'revert_partial';
  counts: RevertCounts;
  oversold: RevertOversold[];
  items: { variation_id: string; revert_status: string; revert_note: string | null }[];
  errors: string[];
}

/** ย้อนรอบหนึ่งรอบ — สร้าง "รอบย้อน" ที่ชี้กลับมาที่รอบเดิม ไม่ใช่ลบประวัติ */
export async function revertRunRequest(runId: string): Promise<StockActionResult<RevertRunData>> {
  try {
    const { res, data } = await postJson(`/api/marketplace/sync-runs/${runId}/revert`, {});
    if (!res.ok) return toFailure(res, data, 'ย้อนรอบซิงค์ไม่สำเร็จ');
    const result = data as unknown as RevertRunData;
    return {
      ok: true,
      message: result.status === 'reverted' ? 'ย้อนรอบนี้เรียบร้อยแล้ว' : 'ย้อนได้บางส่วน — ดูรายการด้านล่าง',
      data: result,
    };
  } catch {
    return fail('ย้อนรอบซิงค์ไม่สำเร็จ');
  }
}

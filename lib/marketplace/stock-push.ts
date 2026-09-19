// ชั้นกลางของ "สต็อกวิ่งระหว่างคลังเรา ↔ ร้านบน marketplace" (server-only)
//
// ทำไมต้องมีไฟล์นี้: เดิมทั้งหมดอยู่ใน `lib/shopee/` และ hard-code `platform='shopee'`
// พอ Lazada/TikTok ต้องทำแบบเดียวกัน ทางที่ง่ายคือ copy ไปอีก 2 ชุด ซึ่งแปลว่า
// กติกาที่สำคัญที่สุด (ยอดที่ส่ง = ของคลังไหน · เขียนกลับผ่าน stock-service เท่านั้น ·
// สูตร quantity = platformStock + reserved) จะมี 3 ฉบับที่เพี้ยนกันได้ทีละนิด
//
// ⇒ ตรรกะที่ไม่ขึ้นกับ platform อยู่ที่นี่ที่เดียว · "ยิง API ของเจ้านั้นยังไง" อยู่ใน
//   `lib/<platform>/stock-adapter.ts` ที่ลงทะเบียนไว้ที่ `stock-adapter.ts`
//   **ห้าม `switch (platform)` ในไฟล์นี้** — เพิ่ม platform ใหม่ต้องไม่ต้องแก้ไฟล์นี้เลย
//
// ── พรีวิว + รอบการทำงาน (2026-09-16) ────────────────────────────────────────
// `previewStockSync()` = อ่านสองฝั่งแล้วบอก "ถ้ากดแล้วจะเกิดอะไร" ทีละตัวเลือก โดยยังไม่เขียนอะไร
// แผนของแต่ละแถวคิดจาก `planPullChanges` / `planPushChanges` ซึ่งเป็นฟังก์ชันบริสุทธิ์
// **และเป็นตรรกะชุดเดียวกับตอนลงมือจริง** (`applyPulledStock` เรียก `planPullChanges` ตัวเดียวกัน)
// — ห้ามมีกติกาสองฉบับ ไม่งั้นจอบอกอย่างแล้วระบบทำอีกอย่าง
// สิ่งที่ทำไปในรอบนั้นบันทึกที่ `lib/marketplace/sync-runs.ts` (หัวรอบ + รายแถว) เพื่อให้ย้อนได้

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { resolveAccountWarehouseId } from '@/lib/marketplace/warehouse';
import { getStockConfig } from '@/lib/stock-utils';
import { adjustStock } from '@/lib/stock-service';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import type { QuotaPlatform } from '@/lib/marketplace/platforms';
import { getStockAdapter, stockPlatformLabel, stockSyncReferenceType } from '@/lib/marketplace/stock-adapter';
import type {
  PlatformStockRead,
  PullStockMode,
  PullStockResult,
  PushStockResult,
  StockAdapter,
  StockLink,
  StockSyncAccount,
} from '@/lib/marketplace/stock-adapter';
import {
  createRun,
  finishRun,
  isActionablePlan,
  markItemsApplied,
  replaceRunItems,
} from '@/lib/marketplace/sync-runs';
import type {
  StockPlan,
  SyncRunCounts,
  SyncRunItemApply,
  SyncRunItemInput,
} from '@/lib/marketplace/sync-runs';
import { logIntegrationNow } from '@/lib/integration-logger';
import { parallelLimit } from '@/lib/parallel';
import { productDisplayName } from '@/lib/product-display';

export type {
  PullStockChange,
  PullStockMode,
  PullStockResult,
  PushStockResult,
  StockLink,
  StockSyncAccount,
} from '@/lib/marketplace/stock-adapter';
export { getStockAdapter, stockPlatformLabel } from '@/lib/marketplace/stock-adapter';
// นิยามอยู่ที่ `sync-runs.ts` (ตรงกับคอลัมน์ `plan` ในตาราง) — ที่นี่แค่ส่งต่อให้ call site เดิม
export type { StockPlan } from '@/lib/marketplace/sync-runs';

export const STOCK_DISABLED_MESSAGE = 'แพ็คเกจปัจจุบันยังไม่รองรับระบบคลังสินค้า — ซิงค์สต็อกไม่ได้';

/**
 * แพ็กเกจที่ไม่มีระบบคลัง = ไม่มี "ยอดของเรา" ที่จะส่งขึ้นไปตั้งแต่แรก
 * ยิงไปก็ได้เลข 0 ทับของจริงบนร้าน — อันตรายกว่าไม่ทำ
 */
export async function stockGateError(companyId: string): Promise<string | null> {
  const cfg = await getStockConfig(companyId);
  return cfg.stockEnabled ? null : STOCK_DISABLED_MESSAGE;
}

/** ผลลัพธ์เปล่าของ pull — ให้ทุกทางออกคืนรูปเดียวกัน */
export function emptyPullResult(dryRun: boolean): PullStockResult {
  return {
    success: false, checked: 0, filled: 0, skipped_nonzero: 0,
    overwritten: 0, unchanged: 0, dry_run: dryRun, changes: [], errors: [],
  };
}

// ── ยอดที่จะส่งขึ้นร้าน ───────────────────────────────────────────────────────

/**
 * ยอดที่ต้องส่งขึ้นร้านของแต่ละ variation
 *
 * สต็อกที่ส่งขึ้นร้าน = ของคลังที่ร้านนี้เลือกไว้ (ไม่ได้เลือก = คลัง default)
 * ต้องเป็นคลังเดียวกับที่ออเดอร์ของร้านนี้ตัดสต็อก ไม่งั้นจะส่งยอดของคลังหนึ่ง
 * แต่ตัดอีกคลังหนึ่ง — ดู lib/marketplace/warehouse.ts
 *
 * ตัวที่ยังไม่มีแถว `inventory` ตกไปใช้ `product_variations.stock` (ค่าเก่ายุคก่อนมีคลัง)
 * — พฤติกรรมเดิมของ Shopee ห้ามเปลี่ยน ไม่งั้นร้านที่ยังไม่เคยตั้งคลังจะโดนยิง 0 ทับ
 */
export async function collectPushQuantities(
  account: StockSyncAccount,
  variationIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const ids = [...new Set(variationIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const warehouseId = await resolveAccountWarehouseId({
    id: account.id,
    company_id: account.company_id,
    warehouse_id: account.warehouse_id ?? null,
  });

  if (warehouseId) {
    // อ่านทีละ 150 id — `.in()` ที่ยาวเกินทำ URL ทะลุลิมิตของ PostgREST แล้วล้มเงียบ
    for (let i = 0; i < ids.length; i += 150) {
      const { data: rows } = await supabaseAdmin
        .from('inventory')
        .select('variation_id, quantity, reserved_quantity')
        .eq('warehouse_id', warehouseId)
        .in('variation_id', ids.slice(i, i + 150));
      for (const inv of rows || []) {
        out.set(inv.variation_id as string, (inv.quantity || 0) - (inv.reserved_quantity || 0));
      }
    }
  } else {
    console.warn(`[Stock Push] ร้าน ${account.id} (${account.platform}) ยังไม่มีคลัง — ใช้ product_variations.stock แทน`);
  }

  const missing = ids.filter(id => !out.has(id));
  for (let i = 0; i < missing.length; i += 150) {
    const { data: variations } = await supabaseAdmin
      .from('product_variations')
      .select('id, stock')
      .in('id', missing.slice(i, i + 150));
    for (const v of variations || []) out.set(v.id as string, v.stock ?? 0);
  }

  // ยอดติดลบส่งขึ้นร้านไม่ได้ (และไม่มีความหมายฝั่งผู้ซื้อ)
  for (const [id, qty] of out) out.set(id, Math.max(0, qty));
  for (const id of ids) if (!out.has(id)) out.set(id, 0);
  return out;
}

// ── link ─────────────────────────────────────────────────────────────────────

const LINK_COLUMNS = 'id, external_item_id, external_model_id, variation_id, platform_data';
/** ขาพรีวิว/ขา pull ต้องรู้ด้วยว่าใบนั้นปิดซิงค์ไว้ไหม และเป็นของสินค้าตัวไหน */
const PREVIEW_LINK_COLUMNS = `${LINK_COLUMNS}, product_id, sync_enabled`;

/** แถว link เท่าที่งานพรีวิวใช้ (ซูเปอร์เซ็ตของ `StockLink`) */
export interface StockLinkRow extends StockLink {
  product_id: string;
  sync_enabled: boolean;
}

/**
 * ยุบแถว link ที่หมายถึง SKU เดียวกันบนร้านให้เหลือใบเดียวก่อนยิง
 * (Lazada มี 2 แถวต่อ SKU — ใบจาก import กับใบจาก order sync เก็บ `external_item_id` คนละรูป)
 * คืน `aliases` ไว้ให้ stamp `last_stock_pushed_at` ครบทุกใบที่หมายถึงตัวเดียวกัน
 */
function dedupeLinks(
  links: StockLink[],
  identity?: (link: StockLink) => string,
): { unique: StockLink[]; aliases: Map<string, string[]> } {
  const keyOf = identity || ((l: StockLink) => `${l.external_item_id}:${l.external_model_id}`);
  const byKey = new Map<string, StockLink>();
  const aliases = new Map<string, string[]>();
  for (const link of links) {
    const key = keyOf(link);
    const head = byKey.get(key);
    if (!head) {
      byKey.set(key, link);
      aliases.set(link.id, [link.id]);
    } else {
      aliases.get(head.id)!.push(link.id);
    }
  }
  return { unique: [...byKey.values()], aliases };
}

// ── อ่านสองฝั่ง (ใช้ร่วมกันระหว่างพรีวิวกับตอนลงมือจริง) ─────────────────────

/** ยอดในคลังของเรา ณ คลังของร้านนี้ — อ่านทีละ 150 id (URL ยาวเกิน = PostgREST ล้มเงียบ) */
export async function readInventoryLevels(
  warehouseId: string,
  variationIds: string[],
): Promise<Map<string, { quantity: number; reserved_quantity: number }>> {
  const out = new Map<string, { quantity: number; reserved_quantity: number }>();
  const ids = [...new Set(variationIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await supabaseAdmin
      .from('inventory')
      .select('variation_id, quantity, reserved_quantity')
      .eq('warehouse_id', warehouseId)
      .in('variation_id', ids.slice(i, i + 150));
    // ล้มแล้วต้องโยน ไม่ใช่คืนแมปว่าง — "ไม่มีแถว" กับ "อ่านไม่ได้" ต่างกันคนละเรื่อง
    // (นึกว่าไม่มีแถวแล้วไปเขียนทับของจริง — เคสที่ทำให้ยอดหายทั้งร้าน)
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      out.set(row.variation_id as string, {
        quantity: row.quantity || 0,
        reserved_quantity: row.reserved_quantity || 0,
      });
    }
  }
  return out;
}

/** link ทุกใบของร้าน (รวมใบที่ปิดซิงค์ — พรีวิวต้องโชว์ให้เห็นว่ามีอยู่) */
async function loadAccountLinks(accountId: string): Promise<StockLinkRow[]> {
  // ⚠️ ร้านที่ผูกเกิน 1,000 SKU เคยไม่มีวันได้พุชสต็อกให้ตัวที่เกิน และพรีวิวก็ไม่โชว์
  //    (ทั้งขา pull และขา push อ่านจากฟังก์ชันนี้ตัวเดียว)
  const { rows } = await fetchAllRows((from, to) => supabaseAdmin
    .from('marketplace_product_links')
    .select(PREVIEW_LINK_COLUMNS)
    .eq('account_id', accountId)
    .not('variation_id', 'is', null)
    .order('id')
    .range(from, to));
  return rows as unknown as StockLinkRow[];
}

/**
 * โหลด link แล้วอ่านยอดบนร้าน — **ทางเดียว**ที่ทั้งขา pull และหน้าพรีวิวใช้
 * (สองทางที่อ่านร้านคนละแบบ = พรีวิวบอกเลขหนึ่ง แล้วตอนกดจริงได้อีกเลข)
 */
async function readShopStock(
  account: StockSyncAccount,
  adapter: StockAdapter,
): Promise<{ links: StockLinkRow[]; read: PlatformStockRead }> {
  const links = await loadAccountLinks(account.id);
  if (links.length === 0) return { links, read: { stock: new Map(), errors: [] } };
  return { links, read: await adapter.fetchPlatformStock(account, links) };
}

/**
 * อ่าน "ยอดบนร้านตอนนี้" อย่างเดียว — ไม่แตะคลังเรา ไม่คิดแผน ไม่สร้างรอบ
 *
 * ใช้ตอน **ย้อนรอบขา push**: ก่อนส่งเลขเดิมกลับขึ้นร้าน ต้องรู้ก่อนว่าเลขบนร้านตอนนี้
 * ยังเป็นเลขที่เราส่งไปอยู่ไหม (ถ้ามีคนแก้ทีหลัง ห้ามทับ) — งานนั้นต้องการแค่ยอดร้าน
 * การเรียก `previewStockSync` จะพ่วงอ่าน inventory + คิดยอดที่จะส่งมาด้วยโดยไม่ได้ใช้
 *
 * ⛔ ห้ามให้ route เรียก adapter ตรง — ทางเข้าร้านของทุก platform ผ่าน `readShopStock` ตัวเดียว
 */
export async function readShopStockLevels(
  account: StockSyncAccount,
): Promise<{ stock: Map<string, number>; errors: string[]; quotaUsed: number }> {
  const adapter = getStockAdapter(account.platform);
  if (!adapter) {
    return {
      stock: new Map(),
      errors: [`ยังไม่รองรับซิงค์สต็อกกับ ${stockPlatformLabel(account.platform)}`],
      quotaUsed: 0,
    };
  }
  const { read } = await readShopStock(account, adapter);
  return { stock: read.stock, errors: read.errors, quotaUsed: read.apiCalls ?? 0 };
}

/** ชื่อ/SKU/เลขบนร้าน ต่อ variation — ข้อมูลประกอบที่หน้าพรีวิวและรายการของรอบใช้ */
export interface StockRowMeta {
  product_id: string;
  sku: string | null;
  name: string | null;
  /** รูปของตัวเลือก — ไม่มีก็ใช้รูปสินค้า **เฉพาะสินค้าเดี่ยว** (กติกา image priority) */
  image: string | null;
  external_item_id: string | null;
  external_model_id: string | null;
  sync_enabled: boolean;
}

/**
 * รวม link เป็นรายตัวเลือก + เติมชื่อสินค้า/SKU
 * link ซ้ำที่ชี้ variation เดียวกัน (Lazada มี 2 ใบต่อ SKU) ยุบเหลือใบเดียว
 * โดย **ถ้ามีใบไหนเปิดซิงค์อยู่ ถือว่าตัวเลือกนั้นซิงค์ได้** (ไม่งั้นใบซ้ำที่ปิดไว้จะกลบใบจริง)
 */
export async function loadStockRowMeta(links: StockLinkRow[]): Promise<Map<string, StockRowMeta>> {
  const meta = new Map<string, StockRowMeta>();
  for (const link of links) {
    if (!link.variation_id) continue;
    const prev = meta.get(link.variation_id);
    if (prev) {
      if (link.sync_enabled) prev.sync_enabled = true;
      continue;
    }
    meta.set(link.variation_id, {
      product_id: link.product_id,
      sku: null,
      name: null,
      image: null,
      external_item_id: link.external_item_id ?? null,
      external_model_id: link.external_model_id ?? null,
      sync_enabled: link.sync_enabled !== false,
    });
  }

  const ids = [...meta.keys()];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabaseAdmin
      .from('product_variations')
      .select('id, sku, variation_label, attributes, product_id, products(name, image, variation_label)')
      .in('id', ids.slice(i, i + 150));
    const rows = (data || []) as unknown as {
      id: string;
      sku: string | null;
      variation_label: string | null;
      attributes: Record<string, string> | null;
      product_id: string;
      products:
        | { name: string | null; image: string | null; variation_label: string | null }
        | { name: string | null; image: string | null; variation_label: string | null }[]
        | null;
    }[];
    for (const row of rows) {
      const target = meta.get(row.id);
      if (!target) continue;
      const product = Array.isArray(row.products) ? row.products[0] : row.products;
      target.sku = row.sku ?? null;
      // ชื่อผ่าน helper กลาง — ตัวเลือกที่ป้ายเป็น SKU/บาร์โค้ด/ตัวเลขล้วนจะไม่ถูกต่อท้ายชื่อ
      // (เดิมต่อดื้อ ๆ ได้ "Astro กระเป๋า… · 4891188016268" แล้วบรรทัดล่างโชว์ SKU ซ้ำอีกที)
      target.name = product?.name
        ? productDisplayName({ product_name: product.name, variation_label: row.variation_label, sku: row.sku, attributes: row.attributes })
        : null;
      if (row.product_id) target.product_id = row.product_id;
      // ⛔ สินค้าที่มีตัวเลือก (products.variation_label = null) ห้าม fallback ไปรูปสินค้า
      // ตัวเลือกที่ไม่มีรูปของตัวเองต้องไม่ยืมรูปของสีอื่น — รูปตัวเลือกเติมด้านล่าง
      if (product?.variation_label !== null && product?.image) target.image = product.image;
    }
  }

  // รูปของตัวเลือกเอง (ชนะรูปสินค้าเสมอ) — เอาใบแรกตาม sort_order
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabaseAdmin
      .from('product_images')
      .select('variation_id, image_url, sort_order')
      .in('variation_id', ids.slice(i, i + 150))
      .order('sort_order', { ascending: true });
    for (const row of (data || []) as { variation_id: string | null; image_url: string | null }[]) {
      if (!row.variation_id || !row.image_url) continue;
      const target = meta.get(row.variation_id);
      if (target && !target.image) target.image = row.image_url;
    }
  }
  return meta;
}

// ── แผนของแต่ละแถว (ฟังก์ชันบริสุทธิ์ — ตรรกะชุดเดียวที่พรีวิวกับของจริงใช้ร่วม) ──

/** หนึ่งแถวบนหน้าพรีวิว = หนึ่งตัวเลือกสินค้า พร้อมยอดสองฝั่งและสิ่งที่จะเกิดถ้ากด */
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
  /** ยอดปลายทางหลังทำ (pull = ยอดร้าน · push = ยอดของเรา) */
  target: number;
  plan: StockPlan;
  has_inventory_row: boolean;
  sync_enabled: boolean;
}

function buildPreviewRow(
  variationId: string,
  meta: StockRowMeta | undefined,
  inv: { quantity: number; reserved_quantity: number } | undefined,
  shop: number | null,
  target: number,
  plan: StockPlan,
): StockPreviewRow {
  const quantity = inv?.quantity ?? 0;
  const reserved = inv?.reserved_quantity ?? 0;
  return {
    variation_id: variationId,
    product_id: meta?.product_id || '',
    sku: meta?.sku ?? null,
    name: meta?.name ?? null,
    image: meta?.image ?? null,
    external_item_id: meta?.external_item_id ?? null,
    external_model_id: meta?.external_model_id ?? null,
    shop,
    ours_qty: quantity,
    ours_reserved: reserved,
    ours_available: quantity - reserved,
    target,
    plan,
    has_inventory_row: inv !== undefined,
    sync_enabled: meta?.sync_enabled !== false,
  };
}

/**
 * ขา **ดึงลงคลัง** — ร้านเป็นต้นทาง
 *
 * `fill_blank` : ร้าน ≤ 0 → ข้าม · คลังเรามียอดอยู่แล้ว → ไม่ทับ · ที่เหลือ → เติม
 * `overwrite`  : เท่ากันอยู่แล้ว → ไม่ต้องเขียน · ที่เหลือแยกทิศให้เห็นว่าจะขึ้นหรือลง
 *
 * `target` = ยอดบนร้านเสมอ · **การเขียนจริงยังเป็น `quantity = shop + reserved`**
 * (เพื่อให้ "ยอดขายได้" ของเราเท่าเลขบนร้านเป๊ะ สมมาตรกับขา push ที่ส่ง `quantity − reserved`)
 */
export function planPullChanges(
  shop: Map<string, number>,
  inv: Map<string, { quantity: number; reserved_quantity: number }>,
  mode: PullStockMode,
  meta: Map<string, StockRowMeta>,
): StockPreviewRow[] {
  const rows: StockPreviewRow[] = [];
  for (const [variationId, shopQty] of shop) {
    const invRow = inv.get(variationId);
    const available = (invRow?.quantity ?? 0) - (invRow?.reserved_quantity ?? 0);

    let plan: StockPlan;
    if (mode === 'fill_blank') {
      if (shopQty <= 0) plan = 'skip_zero';
      else if (invRow && invRow.quantity > 0) plan = 'skip_nonzero';
      else plan = 'fill';
    } else if (available === shopQty) plan = 'unchanged';
    else if (shopQty > available) plan = 'increase';
    else if (shopQty === 0) plan = 'to_zero';
    else plan = 'decrease';

    rows.push(buildPreviewRow(variationId, meta.get(variationId), invRow, shopQty, shopQty, plan));
  }
  return rows;
}

/**
 * ขา **ส่งขึ้นร้าน** — คลังเราเป็นต้นทาง (`target` = ยอดที่ขายได้ของเรา)
 *
 * link ที่ปิดซิงค์ยังอยู่ในรายการ (ให้เห็นว่ามี) แต่ติ๊กไม่ได้
 * ยอดบนร้านที่อ่านไม่เจอ (null) ยังวางแผนได้จากยอดของเรา — แค่บอกไม่ได้ว่าจะขึ้นหรือลงเท่าไร
 */
export function planPushChanges(
  shop: Map<string, number | null>,
  ours: Map<string, number>,
  inv: Map<string, { quantity: number; reserved_quantity: number }>,
  meta: Map<string, StockRowMeta>,
): StockPreviewRow[] {
  const rows: StockPreviewRow[] = [];
  for (const [variationId, m] of meta) {
    const target = Math.max(0, ours.get(variationId) ?? 0);
    const shopQty = shop.get(variationId) ?? null;
    const invRow = inv.get(variationId);

    let plan: StockPlan;
    if (m.sync_enabled === false) plan = 'sync_disabled';
    else if (shopQty === null) plan = target === 0 ? 'to_zero' : 'increase';
    else if (target === shopQty) plan = 'unchanged';
    else if (target > shopQty) plan = 'increase';
    else if (target === 0) plan = 'to_zero';
    else plan = 'decrease';

    rows.push(buildPreviewRow(variationId, m, invRow, shopQty, target, plan));
  }
  return rows;
}

/** ตัวเลขสรุปของรอบจากแผนที่คิดได้ — ลง `marketplace_sync_runs.counts` */
export function summarizeStockPlans(rows: { plan: StockPlan }[]): SyncRunCounts {
  const counts: SyncRunCounts = {
    checked: rows.length, unchanged: 0, skipped: 0, increased: 0, decreased: 0, to_zero: 0,
  };
  for (const row of rows) {
    switch (row.plan) {
      case 'unchanged': counts.unchanged!++; break;
      // fill = ช่องว่างที่กำลังจะมียอด — นับรวมกับ "เพิ่มขึ้น"
      case 'fill': case 'increase': case 'overwrite': counts.increased!++; break;
      case 'decrease': counts.decreased!++; break;
      case 'to_zero': counts.to_zero!++; break;
      default: counts.skipped!++;
    }
  }
  return counts;
}

/** แถวพรีวิว → แถวที่เก็บลงรอบ (ค่า "ก่อนทำ" ต้องเป็นค่าที่เห็นตอนวางแผนเท่านั้น) */
export function toRunItemInput(row: StockPreviewRow, selected?: boolean): SyncRunItemInput {
  return {
    variation_id: row.variation_id,
    product_id: row.product_id || null,
    sku: row.sku,
    name: row.name,
    external_item_id: row.external_item_id,
    external_model_id: row.external_model_id,
    shop_before: row.shop,
    ours_qty_before: row.ours_qty,
    ours_reserved_before: row.ours_reserved,
    target: row.target,
    plan: row.plan,
    selected: selected ?? isActionablePlan(row.plan),
  };
}

// ── พรีวิว ───────────────────────────────────────────────────────────────────

export interface StockPreviewResult {
  rows: StockPreviewRow[];
  errors: string[];
  /** จำนวน call ที่ยิงขึ้น platform จริงเท่าที่ adapter นับให้ (ไม่ได้นับ = 0 ไม่เดาแทน) */
  quotaUsed: number;
  warehouseId: string | null;
}

/**
 * "ถ้ากดแล้วจะเกิดอะไร" — อ่านยอดสองฝั่งแล้วคืนแผนรายตัวเลือก โดยยังไม่เขียนอะไรทั้งนั้น
 *
 * ทั้งสองทิศอ่านยอดบนร้านด้วย adapter ขา pull ตัวเดียวกัน (`fetchPlatformStock`)
 * — ขา push ต้องรู้เลขบนร้านด้วย ไม่งั้นบอกไม่ได้ว่าการกดครั้งนี้ทำให้ร้าน "ขึ้น" หรือ "ลง"
 */
export async function previewStockSync(
  account: StockSyncAccount,
  opts: { direction: 'pull' | 'push'; mode?: PullStockMode },
): Promise<StockPreviewResult> {
  const adapter = getStockAdapter(account.platform);
  if (!adapter) {
    return {
      rows: [], quotaUsed: 0, warehouseId: null,
      errors: [`ยังไม่รองรับซิงค์สต็อกกับ ${stockPlatformLabel(account.platform)}`],
    };
  }

  const gate = await stockGateError(account.company_id);
  if (gate) return { rows: [], errors: [gate], quotaUsed: 0, warehouseId: null };

  const warehouseId = await resolveAccountWarehouseId({
    id: account.id,
    company_id: account.company_id,
    warehouse_id: account.warehouse_id ?? null,
  });

  const errors: string[] = [];
  const { links, read } = await readShopStock(account, adapter);
  if (links.length === 0) {
    return { rows: [], errors: ['ร้านนี้ยังไม่มีสินค้าที่ผูก link'], quotaUsed: 0, warehouseId };
  }
  errors.push(...read.errors);

  const quotaUsed = read.apiCalls ?? 0;
  if (!warehouseId) errors.push('ยังไม่มีคลังที่ใช้งานได้ — สร้างคลังก่อน');

  if (opts.direction === 'push') {
    // ขา push เดินผ่าน `buildPushPlan` ตัวเดียวกับที่ route ใช้ตอนไม่มีพรีวิว — ต่างกันแค่
    // ตรงนี้รู้ยอดบนร้านจริงแล้ว จึงบอกได้ว่าการกดครั้งนี้ทำให้ร้าน "ขึ้น" หรือ "ลง"
    const shop = new Map<string, number | null>();
    for (const [variationId, qty] of read.stock) shop.set(variationId, qty);
    const plan = await buildPushPlan(account, { links, shop });
    return { rows: plan.rows, errors: [...errors, ...plan.errors], quotaUsed, warehouseId };
  }

  const meta = await loadStockRowMeta(links);
  let inv = new Map<string, { quantity: number; reserved_quantity: number }>();
  if (warehouseId) {
    try {
      inv = await readInventoryLevels(warehouseId, [...meta.keys()]);
    } catch (e) {
      errors.push(`อ่านคลังเดิมไม่สำเร็จ: ${e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'}`);
    }
  }

  const rows = planPullChanges(read.stock, inv, opts.mode || 'fill_blank', meta);
  // ตัวที่ผูก link ไว้แต่ร้านไม่คืนยอดมา = ประกาศถูกลบ/ดึงไม่สำเร็จ — โชว์ไว้ ไม่ใช่หายเงียบ
  for (const [variationId, m] of meta) {
    if (read.stock.has(variationId)) continue;
    const invRow = inv.get(variationId);
    const available = (invRow?.quantity ?? 0) - (invRow?.reserved_quantity ?? 0);
    rows.push(buildPreviewRow(variationId, m, invRow, null, available, 'no_link'));
  }
  return { rows, errors, quotaUsed, warehouseId };
}

/**
 * แผนขา push โดย **ไม่อ่านยอดบนร้าน** — ใช้ตอนกด "ส่งสต็อกทั้งร้าน" ตรง ๆ โดยไม่ผ่านพรีวิว
 * (การอ่านทั้งร้านซ้ำอีกรอบเปลืองโควตาเปล่า ๆ เพราะยังไงก็ส่งทับอยู่แล้ว)
 *
 * ส่ง `shop` มาด้วยเมื่อรู้ยอดบนร้านแล้ว (หน้าพรีวิวเป็นคนส่ง) — ไม่ส่ง = `shop_before` เป็น null
 * ทั้งชุด แปลว่า "ยังไม่รู้ว่าบนร้านเท่าไร" ไม่ใช่ "บนร้านเป็น 0"
 */
export async function buildPushPlan(
  account: StockSyncAccount,
  opts: { productId?: string; links?: StockLinkRow[]; shop?: Map<string, number | null> } = {},
): Promise<{ rows: StockPreviewRow[]; warehouseId: string | null; errors: string[] }> {
  const errors: string[] = [];
  const warehouseId = await resolveAccountWarehouseId({
    id: account.id,
    company_id: account.company_id,
    warehouse_id: account.warehouse_id ?? null,
  });

  let links = opts.links ?? await loadAccountLinks(account.id);
  if (opts.productId) links = links.filter(l => l.product_id === opts.productId);

  const meta = await loadStockRowMeta(links);
  const variationIds = [...meta.keys()];

  let inv = new Map<string, { quantity: number; reserved_quantity: number }>();
  if (warehouseId) {
    try {
      inv = await readInventoryLevels(warehouseId, variationIds);
    } catch (e) {
      errors.push(`อ่านคลังเดิมไม่สำเร็จ: ${e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'}`);
    }
  }

  const ours = await collectPushQuantities(account, variationIds);
  return {
    rows: planPushChanges(opts.shop ?? new Map<string, number | null>(), ours, inv, meta),
    warehouseId,
    errors,
  };
}

// ── เขียนยอดที่ดึงมาลงคลัง ────────────────────────────────────────────────────

/**
 * เขียนยอดที่ดึงจากร้านลงคลังของเรา — ใช้ร่วมทุก platform
 *
 * แผนของแต่ละแถวมาจาก `planPullChanges` ตัวเดียวกับหน้าพรีวิว — ห้ามคิดกติกาซ้ำที่นี่
 *
 * ⛔ ทุกการเขียนต้องผ่าน `adjustStock` เท่านั้น (DB มี trigger ปฏิเสธการเขียน
 *    `inventory` ตรง ๆ อยู่แล้ว) ไม่งั้นยอดเปลี่ยนโดยไม่มีร่องรอยว่าใครทำ
 */
export async function applyPulledStock(params: {
  account: StockSyncAccount;
  warehouseId: string;
  stockByVariation: Map<string, number>;
  mode: PullStockMode;
  dryRun: boolean;
  referenceType: string;
  /**
   * `inventory_transactions.reference_id` — งานซิงค์ = **id ของรอบ** (`marketplace_sync_runs`)
   * ไม่ใช่ id ของร้านอีกแล้ว เพื่อให้กดจากหน้าความเคลื่อนไหวแล้วเปิดดูรอบนั้นได้
   */
  referenceId: string;
  result: PullStockResult;
  /** ข้อมูลประกอบรายตัวเลือก — ใส่เมื่อจะเขียนรายการลงรอบ (`seedRunItems`) */
  meta?: Map<string, StockRowMeta>;
  /** รอบที่บันทึกผล — มีแล้วจะ `markItemsApplied` ให้ทุกแถวที่ลงมือ */
  runId?: string;
  /** true = รอบนี้ไม่ได้มาจากหน้าพรีวิว ให้เขียนรายการจากแผนที่เพิ่งคิดได้ */
  seedRunItems?: boolean;
  createdBy?: string | null;
}): Promise<StockPreviewRow[]> {
  const {
    account, warehouseId, stockByVariation, mode, dryRun,
    referenceType, referenceId, result, runId,
  } = params;
  const label = stockPlatformLabel(account.platform);

  result.checked = stockByVariation.size;
  result.desired = Object.fromEntries(stockByVariation);

  let invByVariation: Map<string, { quantity: number; reserved_quantity: number }>;
  try {
    invByVariation = await readInventoryLevels(warehouseId, [...stockByVariation.keys()]);
  } catch (e) {
    result.errors.push(`อ่านคลังเดิมไม่สำเร็จ: ${e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'}`);
    return [];
  }

  const rows = planPullChanges(stockByVariation, invByVariation, mode, params.meta || new Map());

  if (runId && params.seedRunItems) {
    await replaceRunItems(runId, rows.map(row => toRunItemInput(row)));
  }

  const applied: SyncRunItemApply[] = [];
  for (const row of rows) {
    if (row.plan === 'skip_nonzero') { result.skipped_nonzero++; continue; }
    if (row.plan === 'unchanged') { result.unchanged = (result.unchanged || 0) + 1; continue; }
    if (!isActionablePlan(row.plan)) continue;   // skip_zero · sync_disabled · no_link

    const platformStock = row.target;
    // quantity = platformStock + reserved เพื่อให้ "ยอดขายได้" (quantity - reserved) เท่ากับ
    // เลขบนร้านเป๊ะ — ต้องสมมาตรกับขา push ที่ส่ง quantity - reserved ไม่งั้น pull เสร็จปุ๊บ
    // push รอบถัดไปจะส่งเลขคนละตัวแล้วหลุดกันใหม่ทันที
    const newQuantity = platformStock + row.ours_reserved;
    result.changes = result.changes || [];
    result.changes.push({ variation_id: row.variation_id, from: row.ours_available, to: platformStock });

    if (!dryRun) {
      try {
        await adjustStock({
          supabase: supabaseAdmin,
          companyId: account.company_id,
          warehouseId,
          variationId: row.variation_id,
          newQuantity,
          referenceType,
          referenceId,
          notes: `ดึงสต็อกจาก ${label} (${mode}) ${row.ours_available} → ${platformStock}`,
          createdBy: params.createdBy ?? null,
        });
        applied.push({ variation_id: row.variation_id, applied: true, after: newQuantity, error: null });
      } catch (e) {
        // แถวเดียวล้มต้องไม่ทำให้ทั้งรอบหยุด — จดไว้ที่แถวนั้นแล้วไปต่อ
        const message = e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ';
        result.errors.push(`${row.name || row.variation_id}: ${message}`);
        applied.push({ variation_id: row.variation_id, applied: false, error: message });
        continue;
      }
    }

    if (mode === 'overwrite' && row.ours_available > 0) result.overwritten = (result.overwritten || 0) + 1;
    else result.filled++;
  }

  if (runId && applied.length > 0) await markItemsApplied(runId, applied);
  return rows;
}

// ── ทางเข้าเดียวของทุก platform ──────────────────────────────────────────────

/**
 * ส่งยอดสต็อกของสินค้าหนึ่งตัวขึ้นร้าน
 *
 * @param opts.variationIds ส่งเฉพาะตัวเลือกเหล่านี้ (ผู้ใช้ติ๊กมาจากหน้าพรีวิว) — ไม่ส่ง = ทั้งสินค้า
 * @param opts.quantities   ยอดที่จะส่งแบบกำหนดเอง (ใช้ตอน "ย้อนรอบ" ที่ต้องส่งเลขเดิมกลับขึ้นร้าน)
 *                          ตัวที่ไม่ได้ระบุจะถอยไปใช้ยอดคลังตามปกติ
 * @param opts.runId        รอบที่บันทึกผล — จะ `markItemsApplied` ให้หลังยิงเสร็จ
 */
export async function pushStockForAccount(
  account: StockSyncAccount,
  productId: string,
  opts: { variationIds?: string[]; runId?: string; quantities?: Map<string, number> } = {},
): Promise<PushStockResult> {
  const adapter = getStockAdapter(account.platform);
  if (!adapter) {
    return {
      success: false,
      updated_models: 0,
      errors: [`ยังไม่รองรับส่งสต็อกขึ้น ${stockPlatformLabel(account.platform)}`],
    };
  }

  try {
    const gate = await stockGateError(account.company_id);
    if (gate) return { success: false, updated_models: 0, errors: [gate] };

    const { data: rows } = await supabaseAdmin
      .from('marketplace_product_links')
      .select(LINK_COLUMNS)
      .eq('product_id', productId)
      .eq('account_id', account.id)
      .eq('sync_enabled', true);

    let links = (rows || []) as unknown as StockLink[];
    // ส่ง array มา (แม้ว่าง) = "เอาเฉพาะที่ระบุ" · ไม่ส่งเลย = ทั้งสินค้า
    // — ตีความ array ว่างเป็น "ทั้งหมด" คือทางที่ทำให้ติ๊กศูนย์แถวแล้วยิงทั้งร้าน
    if (opts.variationIds) {
      const wanted = new Set(opts.variationIds);
      links = links.filter(l => l.variation_id && wanted.has(l.variation_id));
    }
    if (links.length === 0) {
      return { success: false, updated_models: 0, errors: ['No linked items found'] };
    }

    const { unique, aliases } = dedupeLinks(links, adapter.linkIdentity?.bind(adapter));
    const variationIds = unique.map(l => l.variation_id).filter(Boolean) as string[];

    let quantities: Map<string, number>;
    if (opts.quantities) {
      // คัดลอกก่อนเสมอ — ห้ามแก้ Map ของผู้เรียก (รอบย้อนใช้ Map เดียวข้ามหลายสินค้า)
      quantities = new Map(opts.quantities);
      const missing = variationIds.filter(id => !quantities.has(id));
      if (missing.length > 0) {
        for (const [id, qty] of await collectPushQuantities(account, missing)) quantities.set(id, qty);
      }
    } else {
      quantities = await collectPushQuantities(account, variationIds);
    }

    const result = await adapter.pushStock(account, productId, quantities, unique);

    // field ที่ stamp เฉพาะตอนสำเร็จ = สัญญาณจับ "พังเงียบ" — ห้าม stamp เผื่อไว้ก่อน
    const stampIds = (result.pushed_link_ids || []).flatMap(id => aliases.get(id) || [id]);
    if (stampIds.length > 0) {
      await supabaseAdmin
        .from('marketplace_product_links')
        .update({ last_stock_pushed_at: new Date().toISOString() })
        .in('id', stampIds);
    }

    if (opts.runId) {
      const variationByLinkId = new Map(links.map(l => [l.id, l.variation_id]));
      const pushedVariations = new Set(
        stampIds.map(id => variationByLinkId.get(id)).filter(Boolean) as string[],
      );
      const failMessage = result.errors.length > 0 ? result.errors.join('; ').slice(0, 500) : null;
      await markItemsApplied(opts.runId, variationIds.map(variationId => {
        const ok = pushedVariations.has(variationId);
        return {
          variation_id: variationId,
          applied: ok,
          after: ok ? (quantities.get(variationId) ?? null) : null,
          error: ok ? null : failMessage,
        };
      }));
    }

    return {
      success: result.success,
      updated_models: result.updated_models,
      errors: result.errors,
      ...(result.api_calls != null ? { api_calls: result.api_calls } : {}),
    };
  } catch (e) {
    return {
      success: false,
      updated_models: 0,
      errors: [e instanceof Error ? e.message : 'Unknown error'],
    };
  }
}

/**
 * ดึงยอดสต็อกจากร้านลงคลังของเรา (ตั้งยอดตั้งต้น / reconcile)
 *
 * @param opts.variationIds ทำเฉพาะตัวเลือกเหล่านี้ (ที่ผู้ใช้ติ๊กจากหน้าพรีวิว)
 * @param opts.runId        รอบที่บันทึกผล — **`inventory_transactions.reference_id` = ค่านี้**
 *                          ไม่ส่งมาและไม่ใช่ dry run → สร้างรอบให้เองแล้วปิดให้ในตัว
 *                          (ห้ามให้ id ของร้านไปเป็น reference อีก ไม่งั้นย้อนรอยไม่ได้)
 * @param opts.seedRunItems รอบที่ไม่ได้มาจากหน้าพรีวิว — เขียนรายการจากแผนที่คิดได้ตอนทำ
 */
export async function pullStockForAccount(
  account: StockSyncAccount,
  opts: {
    mode?: PullStockMode;
    dryRun?: boolean;
    variationIds?: string[];
    runId?: string;
    seedRunItems?: boolean;
    createdBy?: string | null;
  } = {},
): Promise<PullStockResult> {
  const mode = opts.mode || 'fill_blank';
  const dryRun = opts.dryRun === true;
  const result = emptyPullResult(dryRun);

  const adapter = getStockAdapter(account.platform);
  if (!adapter) {
    result.errors.push(`ยังไม่รองรับดึงสต็อกจาก ${stockPlatformLabel(account.platform)}`);
    return result;
  }

  let ownRunId: string | null = null;
  try {
    const gate = await stockGateError(account.company_id);
    if (gate) { result.errors.push(gate); return result; }

    // คลังของร้านนี้ — ต้องเป็นคลังเดียวกับขา push เสมอ
    const warehouseId = await resolveAccountWarehouseId({
      id: account.id,
      company_id: account.company_id,
      warehouse_id: account.warehouse_id ?? null,
    });
    if (!warehouseId) {
      result.errors.push('ยังไม่มีคลังที่ใช้งานได้ — สร้างคลังก่อน');
      return result;
    }

    const { links, read } = await readShopStock(account, adapter);
    if (links.length === 0) {
      result.errors.push('ร้านนี้ยังไม่มีสินค้าที่ผูก link');
      return result;
    }
    result.errors.push(...read.errors);
    result.quota_used = read.apiCalls ?? 0;

    let stock = read.stock;
    // ส่ง array มา (แม้ว่าง) = "เอาเฉพาะที่ระบุ" · ไม่ส่งเลย = ทุกตัวที่ร้านคืนมา
    // — ถ้าตีความ array ว่างเป็น "ทั้งหมด" ผู้ใช้ที่ติ๊กออกหมดแล้วกดยืนยันจะโดนทับทั้งร้าน
    if (opts.variationIds) {
      const wanted = new Set(opts.variationIds);
      stock = new Map([...stock].filter(([variationId]) => wanted.has(variationId)));
    }

    // เขียนจริงต้องมีรอบเสมอ (dry run ไม่เขียนอะไร จึงไม่ต้องมี)
    let runId = opts.runId;
    if (!runId && !dryRun) {
      const run = await createRun({
        company_id: account.company_id,
        account_id: account.id,
        platform: (account.platform as string) || 'unknown',
        job: 'pull_stock',
        mode,
        status: 'running',
        warehouse_id: warehouseId,
        trigger: 'manual',
        created_by: opts.createdBy ?? null,
        started_at: new Date().toISOString(),
      });
      runId = run.id;
      ownRunId = run.id;
    }
    result.run_id = runId;

    const seedRunItems = opts.seedRunItems === true || ownRunId !== null;
    const meta = runId && seedRunItems ? await loadStockRowMeta(links) : undefined;

    const rows = await applyPulledStock({
      account,
      warehouseId,
      stockByVariation: stock,
      mode,
      dryRun,
      referenceType: stockSyncReferenceType(account.platform as string),
      referenceId: runId || '',
      result,
      meta,
      runId,
      seedRunItems,
      createdBy: opts.createdBy ?? null,
    });

    result.success = result.errors.length === 0;

    // ปิดรอบที่นี่เสมอ (ไม่ว่าจะเป็นรอบที่ route ส่งมาหรือรอบที่สร้างเอง) — ที่นี่คือที่เดียว
    // ที่รู้แผนรายแถวจริง ๆ route จึงไม่ต้องไปคิดตัวเลขสรุปซ้ำ
    if (runId && !dryRun) {
      const changed = result.filled + (result.overwritten || 0);
      await finishRun(runId, {
        status: result.success ? 'done' : (changed > 0 ? 'partial' : 'failed'),
        counts: {
          ...summarizeStockPlans(rows),
          selected: rows.filter(r => isActionablePlan(r.plan)).length,
          changed,
          failed: Math.max(0, rows.filter(r => isActionablePlan(r.plan)).length - changed),
        },
        quota_used: result.quota_used ?? 0,
        errors: result.errors.slice(0, 20),
      });
      ownRunId = null;
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'Unknown error');
    if (ownRunId) {
      await finishRun(ownRunId, { status: 'failed', errors: result.errors.slice(0, 20) });
    }
  }
  return result;
}

// ── auto push หลังสต็อกขยับ ──────────────────────────────────────────────────

/**
 * ส่งยอดสต็อกขึ้นทุกร้าน (ทุก platform) ที่ผูกกับ variation เหล่านี้
 *
 * ⚠️ **ใน route handler ต้องเรียกใน `after(() => syncStockNow(ids))`** — ปล่อยลอยแล้ว
 * Vercel freeze ทิ้งทันทีที่ response ออก (สาเหตุที่ push stock Shopee ตายเงียบ 3 เดือน
 * ดู fix-bug.md 2026-08-29)
 *
 * @param changedWarehouseIds คลังที่เพิ่งเปลี่ยนจริง — ส่งมาแล้วจะข้ามร้านที่ใช้คลังอื่น
 *   เพราะยอดของร้านนั้นไม่ได้ขยับ ยิงไปก็ส่งเลขเดิม เผาโควตาเปล่า ๆ
 *   ไม่ส่ง = ยิงทุกร้านเหมือนเดิม (call site เก่าที่ยังไม่รู้คลัง)
 * @param opts.excludeAccountId ร้านต้นทางของออเดอร์ — ตัดยอดฝั่งเขาเองแล้ว ไม่ต้องยิงกลับ
 */
export async function syncStockNow(
  variationIds: string[],
  changedWarehouseIds?: (string | null | undefined)[],
  opts: { excludeAccountId?: string } = {},
): Promise<void> {
  const ids = [...new Set((variationIds || []).filter(Boolean))];
  if (ids.length === 0) return;
  const changed = (changedWarehouseIds || []).filter(Boolean) as string[];

  const { data: links } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id, account_id, platform')
    .in('variation_id', ids)
    .eq('sync_enabled', true);

  if (!links || links.length === 0) return;

  const seen = new Set<string>();
  const uniquePairs: { product_id: string; account_id: string; platform: string }[] = [];
  for (const link of links) {
    if (opts.excludeAccountId && link.account_id === opts.excludeAccountId) continue;
    // platform ที่ยังไม่มี adapter = ไม่มีทางส่งขึ้นไปได้ ข้ามเงียบ ๆ (ไม่ใช่ error ของผู้ใช้)
    if (!getStockAdapter(link.platform)) continue;
    const key = `${link.product_id}:${link.account_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniquePairs.push({ product_id: link.product_id, account_id: link.account_id, platform: link.platform });
  }
  if (uniquePairs.length === 0) return;

  // โควตาของ scope นั้นหมดแล้ว = ยิงไปก็ fail ทุกตัว (แพลตฟอร์มนับ success rate จาก call จริง)
  // งาน push เป็นงานเบื้องหลัง เลื่อนไปรอบหน้าได้ ไม่ต้องเผาโควตา/คะแนนทิ้ง
  // — เช็คครั้งเดียวต่อ platform ต่อรอบ ไม่ใช่ต่อสินค้า
  const blocked = new Set<string>();
  for (const platform of new Set(uniquePairs.map(p => p.platform))) {
    const quota = await isQuotaBlocked(platform as QuotaPlatform, 'inventory');
    if (quota.blocked) {
      blocked.add(platform);
      console.warn(`[Stock Push] ข้าม ${platform} — โควตา scope "inventory" เต็มถึง ${quota.until}`);
    }
  }

  await parallelLimit(uniquePairs, async ({ product_id, account_id, platform }) => {
    if (blocked.has(platform)) return;
    try {
      const { data: account } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', account_id)
        .eq('is_active', true)
        .single();

      if (!account) return;
      if (account.auto_sync_stock === false) return;

      // ร้านนี้แพ็คจากคลังที่ไม่ได้ขยับ → ยอดเท่าเดิม ไม่ต้องยิง
      if (changed.length > 0) {
        const accountWarehouseId = await resolveAccountWarehouseId(account);
        if (accountWarehouseId && !changed.includes(accountWarehouseId)) return;
      }

      const startMs = Date.now();
      const result = await pushStockForAccount(account as StockSyncAccount, product_id);
      const durationMs = Date.now() - startMs;

      // ต้อง await — งานนี้วิ่งใน after() ปล่อย log ลอยแล้ว Vercel freeze ทิ้งก่อนเขียนเสร็จ
      // (14 วันก่อน 13 ก.ย. 2026 ไม่มี log auto_push_stock เลยทั้งที่ควรมี)
      await logIntegrationNow({
        company_id: account.company_id,
        integration: platform,
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'outgoing',
        action: 'auto_push_stock',
        method: 'POST',
        api_path: getStockAdapter(platform)?.pushApiPath,
        request_body: { product_id, trigger: 'auto_sync' },
        response_body: result,
        status: result.success ? 'success' : 'error',
        error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
        duration_ms: durationMs,
      });

      console.log(`[Stock Push] ${platform} product ${product_id} → account ${account_id}: success=${result.success}`);
    } catch (err) {
      console.error(`[Stock Push] ${platform} push failed for product ${product_id}:`, err);
    }
  }, 5);
}

/**
 * เรียกจาก order sync ของ marketplace — ขายที่ร้านหนึ่งแล้วยอดที่ร้านอื่นต้องลดตาม
 * (ไม่งั้นขายบน Lazada จนของหมด แต่ Shopee ยังโชว์ของเต็ม → oversell)
 *
 * ห้ามให้ error ของ push ทำให้ order sync ล้ม — ครอบ try/catch ไว้ให้แล้ว
 */
export async function pushStockAfterOrderSync(
  variationIds: (string | null | undefined)[],
  warehouseId: string | null | undefined,
  sourceAccountId: string,
): Promise<void> {
  const ids = [...new Set(variationIds.filter(Boolean) as string[])];
  if (ids.length === 0) return;
  try {
    await syncStockNow(ids, warehouseId ? [warehouseId] : undefined, { excludeAccountId: sourceAccountId });
  } catch (err) {
    console.error('[Stock Push] กระจายยอดหลัง order sync ไม่สำเร็จ:', err);
  }
}

/**
 * ประทับว่าร้านนี้ "ตั้งยอดสต็อกตั้งต้นแล้ว" — ขั้นที่ 2 ของลำดับต้อนรับ
 * (`lib/marketplace/onboarding.ts` เป็นคนอ่าน · route ดึง/ส่งสต็อก **ทั้งร้าน** เป็นคนเรียก)
 *
 * เขียนทับเวลาล่าสุดเสมอ ไม่ใช่เขียนครั้งเดียว — ตั้งยอดใหม่ทีหลัง (ย้ายคลัง · นับสต็อกรอบใหม่)
 * ก็ยังอยากรู้ว่าครั้งล่าสุดคือเมื่อไหร่
 */
export async function markStockInitialized(account: { id: string; metadata?: Record<string, unknown> | null }) {
  const { error } = await supabaseAdmin
    .from('marketplace_accounts')
    .update({ metadata: { ...(account.metadata || {}), stock_initialized_at: new Date().toISOString() } })
    .eq('id', account.id);
  if (error) console.error('markStockInitialized failed:', error.message);
}

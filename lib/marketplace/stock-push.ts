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

import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveAccountWarehouseId } from '@/lib/marketplace/warehouse';
import { getStockConfig } from '@/lib/stock-utils';
import { adjustStock } from '@/lib/stock-service';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import type { QuotaPlatform } from '@/lib/marketplace/platforms';
import { getStockAdapter, stockPlatformLabel, stockSyncReferenceType } from '@/lib/marketplace/stock-adapter';
import type {
  PullStockMode,
  PullStockResult,
  PushStockResult,
  StockLink,
  StockSyncAccount,
} from '@/lib/marketplace/stock-adapter';
import { logIntegrationNow } from '@/lib/integration-logger';
import { parallelLimit } from '@/lib/parallel';

export type {
  PullStockChange,
  PullStockMode,
  PullStockResult,
  PushStockResult,
  StockLink,
  StockSyncAccount,
} from '@/lib/marketplace/stock-adapter';
export { getStockAdapter, stockPlatformLabel } from '@/lib/marketplace/stock-adapter';

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

// ── เขียนยอดที่ดึงมาลงคลัง ────────────────────────────────────────────────────

/**
 * เขียนยอดที่ดึงจากร้านลงคลังของเรา — ใช้ร่วมทุก platform
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
  result: PullStockResult;
}): Promise<void> {
  const { account, warehouseId, stockByVariation, mode, dryRun, referenceType, result } = params;
  const label = stockPlatformLabel(account.platform);

  result.checked = stockByVariation.size;
  result.desired = Object.fromEntries(stockByVariation);

  const variationIds = [...stockByVariation.keys()];
  // อ่านทีละ 150 id — `.in()` ที่ยาวเกินทำ URL ทะลุลิมิตของ PostgREST แล้ว **ล้มเงียบ**
  // (คืน error ไม่ใช่แถว) → โค้ดจะนึกว่าไม่มีแถวเดิมเลยแล้วไป insert ทับของที่มีอยู่
  const invByVariation = new Map<string, { quantity: number; reserved_quantity: number }>();
  for (let i = 0; i < variationIds.length; i += 150) {
    const { data: existingInv, error: invError } = await supabaseAdmin
      .from('inventory')
      .select('variation_id, quantity, reserved_quantity')
      .eq('warehouse_id', warehouseId)
      .in('variation_id', variationIds.slice(i, i + 150));
    if (invError) {
      result.errors.push(`อ่านคลังเดิมไม่สำเร็จ: ${invError.message}`);
      return;
    }
    for (const row of existingInv || []) {
      invByVariation.set(row.variation_id as string, {
        quantity: row.quantity || 0,
        reserved_quantity: row.reserved_quantity || 0,
      });
    }
  }

  for (const [variationId, platformStock] of stockByVariation) {
    const inv = invByVariation.get(variationId);
    const reserved = inv?.reserved_quantity || 0;
    const ourAvailable = (inv?.quantity || 0) - reserved;

    if (mode === 'fill_blank') {
      if (platformStock <= 0) continue;
      if (inv && inv.quantity > 0) { result.skipped_nonzero++; continue; }
    } else if (ourAvailable === platformStock) {
      result.unchanged = (result.unchanged || 0) + 1;
      continue;
    }

    // เขียน quantity = platformStock + reserved เพื่อให้ "ยอดขายได้" (quantity - reserved)
    // เท่ากับเลขบนร้านเป๊ะ — ต้องสมมาตรกับขา push ที่ส่ง quantity - reserved
    // ไม่งั้น pull เสร็จปุ๊บ push รอบถัดไปจะส่งเลขคนละตัวแล้วหลุดกันใหม่ทันที
    const newQuantity = platformStock + reserved;
    result.changes = result.changes || [];
    result.changes.push({ variation_id: variationId, from: ourAvailable, to: platformStock });

    if (!dryRun) {
      await adjustStock({
        supabase: supabaseAdmin,
        companyId: account.company_id,
        warehouseId,
        variationId,
        newQuantity,
        referenceType,
        referenceId: account.id,
        notes: `ดึงสต็อกจาก ${label} (${mode}) ${ourAvailable} → ${platformStock}`,
      });
    }

    if (mode === 'overwrite' && ourAvailable > 0) result.overwritten = (result.overwritten || 0) + 1;
    else result.filled++;
  }
}

// ── ทางเข้าเดียวของทุก platform ──────────────────────────────────────────────

/** ส่งยอดสต็อกของสินค้าหนึ่งตัวขึ้นร้าน */
export async function pushStockForAccount(
  account: StockSyncAccount,
  productId: string,
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

    const links = (rows || []) as unknown as StockLink[];
    if (links.length === 0) {
      return { success: false, updated_models: 0, errors: ['No linked items found'] };
    }

    const { unique, aliases } = dedupeLinks(links, adapter.linkIdentity?.bind(adapter));
    const quantities = await collectPushQuantities(
      account,
      unique.map(l => l.variation_id).filter(Boolean) as string[],
    );

    const result = await adapter.pushStock(account, productId, quantities, unique);

    // field ที่ stamp เฉพาะตอนสำเร็จ = สัญญาณจับ "พังเงียบ" — ห้าม stamp เผื่อไว้ก่อน
    const stampIds = (result.pushed_link_ids || []).flatMap(id => aliases.get(id) || [id]);
    if (stampIds.length > 0) {
      await supabaseAdmin
        .from('marketplace_product_links')
        .update({ last_stock_pushed_at: new Date().toISOString() })
        .in('id', stampIds);
    }

    return { success: result.success, updated_models: result.updated_models, errors: result.errors };
  } catch (e) {
    return {
      success: false,
      updated_models: 0,
      errors: [e instanceof Error ? e.message : 'Unknown error'],
    };
  }
}

/** ดึงยอดสต็อกจากร้านลงคลังของเรา (ตั้งยอดตั้งต้น / reconcile) */
export async function pullStockForAccount(
  account: StockSyncAccount,
  opts: { mode?: PullStockMode; dryRun?: boolean } = {},
): Promise<PullStockResult> {
  const mode = opts.mode || 'fill_blank';
  const dryRun = opts.dryRun === true;
  const result = emptyPullResult(dryRun);

  const adapter = getStockAdapter(account.platform);
  if (!adapter) {
    result.errors.push(`ยังไม่รองรับดึงสต็อกจาก ${stockPlatformLabel(account.platform)}`);
    return result;
  }

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

    const { data: rows } = await supabaseAdmin
      .from('marketplace_product_links')
      .select(LINK_COLUMNS)
      .eq('account_id', account.id)
      .not('variation_id', 'is', null);

    const links = (rows || []) as unknown as StockLink[];
    if (links.length === 0) {
      result.errors.push('ร้านนี้ยังไม่มีสินค้าที่ผูก link');
      return result;
    }

    const read = await adapter.fetchPlatformStock(account, links);
    result.errors.push(...read.errors);

    await applyPulledStock({
      account,
      warehouseId,
      stockByVariation: read.stock,
      mode,
      dryRun,
      referenceType: stockSyncReferenceType(account.platform as string),
      result,
    });

    result.success = result.errors.length === 0;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'Unknown error');
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

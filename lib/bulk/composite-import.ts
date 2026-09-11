/**
 * Composite products (สินค้าชุด) in the bulk Excel templates — server side.
 * Cell format / parsing: lib/bulk/composite-ref.ts (client-safe).
 * Saving combos: lib/composite-save.ts (one rule set with the product form).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { comboKey, validateCompositeSlots, type CompositeSlot } from '@/lib/composite-shared';
import {
  loadComponentInfo,
  componentOptionLabel,
  saveCompositeVariations,
  CompositeValidationError,
  type ComponentInfo,
  type ComboInput,
} from '@/lib/composite-save';
import { getCompositePartsMap, type CompositePart } from '@/lib/composite';
import { fetchAllRows } from '@/lib/supabase-paging';
import { parseComponentCell, componentRefOf, formatComponentCell, type ComponentToken } from '@/lib/bulk/composite-ref';

// Keep `.in()` lists short — PostgREST puts them in the URL
const CHUNK = 100;

function chunks<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function loadComponentInfoChunked(
  supabase: SupabaseClient,
  companyId: string,
  ids: string[],
): Promise<Map<string, ComponentInfo>> {
  const map = new Map<string, ComponentInfo>();
  for (const part of chunks([...new Set(ids)])) {
    (await loadComponentInfo(supabase, companyId, part)).forEach((v, k) => map.set(k, v));
  }
  return map;
}

// ───────────────────────────── Export ─────────────────────────────

export interface ComboExportInfo {
  /** "SKU1 + SKU2×2" */
  components: string;
  price_locked: boolean;
}

/** Which of `productIds` are composite, and the component cell + manual-price flag of each combo. */
export async function loadCompositeExportInfo(
  supabase: SupabaseClient,
  companyId: string,
  productIds: string[],
): Promise<{ compositeProductIds: Set<string>; combos: Map<string, ComboExportInfo> }> {
  const compositeProductIds = new Set<string>();
  const combos = new Map<string, ComboExportInfo>();
  const wanted = new Set(productIds);
  if (wanted.size === 0) return { compositeProductIds, combos };

  const { rows: compRows, error: compErr } = await fetchAllRows<{ id: string }>((from, to) =>
    supabase.from('products').select('id').eq('company_id', companyId).eq('is_composite', true).order('id').range(from, to),
  );
  if (compErr) throw new Error(`Failed to load composite products: ${compErr.message}`);
  for (const r of compRows) if (wanted.has(r.id)) compositeProductIds.add(r.id);
  if (compositeProductIds.size === 0) return { compositeProductIds, combos };

  const comboRows: { id: string; price_locked: boolean | null }[] = [];
  for (const ids of chunks([...compositeProductIds], 50)) {
    const { rows, error } = await fetchAllRows<{ id: string; price_locked: boolean | null }>((from, to) =>
      supabase.from('product_variations').select('id, price_locked').eq('company_id', companyId).in('product_id', ids).order('id').range(from, to),
    );
    if (error) throw new Error(`Failed to load combos: ${error.message}`);
    comboRows.push(...rows);
  }

  const parts = new Map<string, CompositePart[]>();
  for (const ids of chunks(comboRows.map(r => r.id))) {
    (await getCompositePartsMap(supabase, ids)).forEach((v, k) => parts.set(k, v));
  }
  const info = await loadComponentInfoChunked(supabase, companyId, [...parts.values()].flat().map(p => p.variationId));

  for (const r of comboRows) {
    const tokens: ComponentToken[] = (parts.get(r.id) || []).map(p => {
      const c = info.get(p.variationId);
      return { ref: c ? componentRefOf(c) : '?', quantity: p.quantity };
    });
    combos.set(r.id, { components: formatComponentCell(tokens), price_locked: !!r.price_locked });
  }
  return { compositeProductIds, combos };
}

// ───────────────────────────── Bulk create ─────────────────────────────

export interface CompositeCreateRow {
  code: string;
  name?: string;
  sku?: string;
  barcode?: string;
  default_price?: number;
  discount_price?: number;
  brand_name?: string;
  category_name?: string;
  description?: string;
  is_active?: boolean;
  components?: string;
  __rowNum?: number;
}

/** Same shape as a `bulk_create_products` result row (+ is_composite). */
export interface CreateResultRow {
  code: string;
  name: string;
  action: 'created' | 'error';
  error?: string;
  product_id?: string | null;
  variation_count?: number;
  is_multi?: boolean;
  brand_name?: string | null;
  category_name?: string | null;
  is_composite?: boolean;
}

/** A normal product the same file creates — lets a dry run accept references to it. */
export interface FileProduct {
  code: string;
  name: string;
  rows: { variation_label?: string; sku?: string }[];
}

export function hasComponents(row: { components?: string }): boolean {
  return !!row.components?.trim();
}

interface Resolved {
  id: string;
  product_id: string;
  product_name: string;
  product_code: string | null;
}
type Resolution = { ok: Resolved } | { error: string };

class PlanError extends Error {}

/** Every "/" split of a ref: "A/B/C" → [A, B/C], [A/B, C] */
function codeLabelSplits(ref: string): { code: string; label: string }[] {
  const out: { code: string; label: string }[] = [];
  for (let i = ref.indexOf('/'); i > 0; i = ref.indexOf('/', i + 1)) {
    const code = ref.slice(0, i).trim();
    const label = ref.slice(i + 1).trim();
    if (code && label) out.push({ code, label });
  }
  return out;
}

async function buildResolver(
  supabase: SupabaseClient,
  companyId: string,
  refs: string[],
  fileProducts: FileProduct[],
): Promise<(ref: string) => Resolution> {
  const uniq = [...new Set(refs)];

  // (1) exact SKU
  const idsBySku = new Map<string, string[]>();
  for (const part of chunks(uniq)) {
    const { data, error } = await supabase.from('product_variations').select('id, sku').eq('company_id', companyId).in('sku', part);
    if (error) throw new Error(`Failed to look up SKUs: ${error.message}`);
    for (const r of data || []) idsBySku.set(r.sku, [...(idsBySku.get(r.sku) || []), r.id]);
  }

  // (2)/(3) product code — the whole ref, or the part before a "/"
  const codes = new Set<string>(uniq);
  for (const r of uniq) for (const s of codeLabelSplits(r)) codes.add(s.code);
  const productByCode = new Map<string, { id: string; variation_label: string | null; is_composite: boolean }>();
  for (const part of chunks([...codes])) {
    const { data, error } = await supabase
      .from('products')
      .select('id, code, variation_label, is_composite')
      .eq('company_id', companyId)
      .in('code', part);
    if (error) throw new Error(`Failed to look up product codes: ${error.message}`);
    for (const p of data || []) productByCode.set(p.code, { id: p.id, variation_label: p.variation_label, is_composite: !!p.is_composite });
  }
  const varIdsByProduct = new Map<string, string[]>();
  for (const part of chunks([...productByCode.values()].map(p => p.id), 50)) {
    const { rows, error } = await fetchAllRows<{ id: string; product_id: string }>((from, to) =>
      supabase.from('product_variations').select('id, product_id').eq('company_id', companyId).in('product_id', part).order('id').range(from, to),
    );
    if (error) throw new Error(`Failed to load variations: ${error.message}`);
    for (const r of rows) varIdsByProduct.set(r.product_id, [...(varIdsByProduct.get(r.product_id) || []), r.id]);
  }

  const info = await loadComponentInfoChunked(supabase, companyId, [
    ...[...idsBySku.values()].flat(),
    ...[...varIdsByProduct.values()].flat(),
  ]);

  // References to normal products created by the same file (dry run only)
  const fileBySku = new Map<string, Resolved>();
  const fileByCodeLabel = new Map<string, Resolved>();
  const fileByCode = new Map<string, Resolved>();
  for (const fp of fileProducts) {
    fp.rows.forEach((r, i) => {
      const res: Resolved = { id: `file:${fp.code}:${i}`, product_id: `file:${fp.code}`, product_name: fp.name, product_code: fp.code };
      if (r.sku && !fileBySku.has(r.sku)) fileBySku.set(r.sku, res);
      const label = (r.variation_label || '').trim();
      if (label) fileByCodeLabel.set(`${fp.code} ${label}`, res);
      if (fp.rows.length === 1) fileByCode.set(fp.code, res);
    });
  }

  const toResolved = (c: ComponentInfo): Resolved => ({
    id: c.id, product_id: c.product_id, product_name: c.product_name, product_code: c.product_code,
  });

  return (ref: string): Resolution => {
    const firstError = { msg: '' };
    const pick = (ids: string[]): Resolution | null => {
      const cands = ids.map(id => info.get(id)).filter((c): c is ComponentInfo => !!c);
      if (cands.length === 0) return null;
      const usable = cands.filter(c => c.is_active && !c.is_composite);
      if (usable.length === 1) return { ok: toResolved(usable[0]) };
      if (!firstError.msg) {
        firstError.msg = usable.length > 1
          ? `"${ref}" ตรงกับหลายตัวเลือก — ใช้ SKU ที่ไม่ซ้ำกัน`
          : cands.some(c => c.is_composite)
            ? `"${ref}" เป็นสินค้าชุด — ใช้เป็นส่วนประกอบไม่ได้`
            : `"${ref}" ถูกปิดใช้งานอยู่ — เปิดใช้งานก่อนจึงใช้เป็นส่วนประกอบได้`;
      }
      return null;
    };

    const bySku = pick(idsBySku.get(ref) || []);
    if (bySku) return bySku;

    for (const s of codeLabelSplits(ref)) {
      const p = productByCode.get(s.code);
      if (!p) continue;
      const ids = (varIdsByProduct.get(p.id) || []).filter(id => {
        const c = info.get(id);
        return !!c && ((c.variation_label || '').trim() === s.label || componentOptionLabel(c) === s.label);
      });
      const r = pick(ids);
      if (r) return r;
    }

    const p = productByCode.get(ref);
    if (p) {
      if (p.is_composite) firstError.msg ||= `"${ref}" เป็นสินค้าชุด — ใช้เป็นส่วนประกอบไม่ได้`;
      else if (p.variation_label == null) firstError.msg ||= `"${ref}" มีหลายตัวเลือก — ระบุเป็น รหัสสินค้า/ตัวเลือก หรือใช้ SKU`;
      else {
        const r = pick(varIdsByProduct.get(p.id) || []);
        if (r) return r;
      }
    }

    const fromFile = fileBySku.get(ref)
      ?? codeLabelSplits(ref).map(s => fileByCodeLabel.get(`${s.code} ${s.label}`)).find(Boolean)
      ?? fileByCode.get(ref);
    if (fromFile) return { ok: fromFile };

    return { error: firstError.msg || `ไม่พบส่วนประกอบ "${ref}" — ใส่ SKU หรือ รหัสสินค้า/ตัวเลือก` };
  };
}

interface GroupPlan {
  slots: CompositeSlot[];
  combos: ComboInput[];
  isActive: boolean;
  brandId: string | null;
  categoryId: string | null;
}

async function lookupByName(
  supabase: SupabaseClient,
  table: 'product_brands' | 'product_categories',
  companyId: string,
  names: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const part of chunks([...new Set(names)])) {
    const { data, error } = await supabase.from(table).select('id, name').eq('company_id', companyId).eq('is_active', true).in('name', part);
    if (error) throw new Error(`Failed to look up ${table}: ${error.message}`);
    for (const r of data || []) if (!map.has(r.name)) map.set(r.name, r.id);
  }
  return map;
}

/** Remove a product whose combos failed to save (kept closed if some combos were already written). */
async function discardProduct(supabase: SupabaseClient, companyId: string, productId: string): Promise<'deleted' | 'closed'> {
  const { count } = await supabase
    .from('product_variations')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('company_id', companyId);
  if (!count) {
    const { error } = await supabase.from('products').delete().eq('id', productId).eq('company_id', companyId);
    if (!error) return 'deleted';
  }
  await supabase.from('products').update({ is_active: false }).eq('id', productId).eq('company_id', companyId);
  return 'closed';
}

/**
 * Create the composite products of a bulk-create file. Each group = the rows of one product
 * code (one row per combo). Same checks as `bulk_create_products`, plus component resolution.
 * Real run: call AFTER the RPC created the normal products, so references to them resolve.
 * Dry run: pass those products as `fileProducts` — they are accepted as "สร้างจากไฟล์นี้".
 */
export async function importCompositeProducts(
  supabase: SupabaseClient,
  opts: {
    companyId: string;
    userId: string;
    groups: [string, CompositeCreateRow[]][];
    dryRun: boolean;
    fileProducts?: FileProduct[];
  },
): Promise<CreateResultRow[]> {
  const { companyId, userId, groups, dryRun } = opts;
  if (groups.length === 0) return [];

  const rowLabel = (r: CompositeCreateRow) => `แถว ${r.__rowNum ?? '?'}`;

  // 1. Parse the component cells
  const parsed = new Map<string, { row: CompositeCreateRow; tokens: ComponentToken[] }[] | string>();
  for (const [code, rows] of groups) {
    const out: { row: CompositeCreateRow; tokens: ComponentToken[] }[] = [];
    let err: string | null = null;
    for (const row of rows) {
      if (!hasComponents(row)) { err = `${rowLabel(row)}: สินค้าชุดต้องใส่ส่วนประกอบทุกแถว`; break; }
      const { tokens, error } = parseComponentCell(row.components || '');
      if (error) { err = `${rowLabel(row)}: ${error}`; break; }
      out.push({ row, tokens });
    }
    parsed.set(code, err ?? out);
  }

  // 2. Bulk lookups
  const allRefs = [...parsed.values()].flatMap(v => (typeof v === 'string' ? [] : v.flatMap(x => x.tokens.map(t => t.ref))));
  const resolve = await buildResolver(supabase, companyId, allRefs, dryRun ? opts.fileProducts || [] : []);

  const existingCodes = new Set<string>();
  for (const part of chunks(groups.map(([code]) => code))) {
    const { data, error } = await supabase.from('products').select('code').eq('company_id', companyId).in('code', part);
    if (error) throw new Error(`Failed to check product codes: ${error.message}`);
    for (const r of data || []) existingCodes.add(r.code);
  }
  const firstRows = groups.map(([, rows]) => rows[0]);
  const brandIds = await lookupByName(supabase, 'product_brands', companyId, firstRows.map(r => r.brand_name || '').filter(Boolean));
  const categoryIds = await lookupByName(supabase, 'product_categories', companyId, firstRows.map(r => r.category_name || '').filter(Boolean));

  // 3. Plan + create each group
  const results: CreateResultRow[] = [];
  for (const [code, rows] of groups) {
    const first = rows[0];
    const base: CreateResultRow = {
      code,
      name: first.name?.trim() || code,
      action: 'created',
      variation_count: rows.length,
      is_multi: true,
      is_composite: true,
      brand_name: first.brand_name || null,
      category_name: first.category_name || null,
    };

    let plan: GroupPlan;
    try {
      plan = planGroup(code, parsed.get(code)!, resolve, {
        existing: existingCodes.has(code),
        brandId: first.brand_name ? brandIds.get(first.brand_name) ?? null : null,
        categoryId: first.category_name ? categoryIds.get(first.category_name) ?? null : null,
        first,
        rowLabel,
      });
    } catch (e) {
      if (!(e instanceof PlanError)) throw e;
      results.push({ ...base, action: 'error', error: e.message });
      continue;
    }

    if (dryRun) {
      results.push(base);
      continue;
    }

    const now = new Date().toISOString();
    const { data: product, error: insertErr } = await supabase
      .from('products')
      .insert({
        company_id: companyId,
        code,
        name: base.name,
        description: first.description?.trim() || null,
        is_active: plan.isActive,
        brand_id: plan.brandId,
        category_id: plan.categoryId,
        variation_label: null,
        source: 'manual',
        created_by: userId,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();
    if (insertErr || !product) {
      results.push({ ...base, action: 'error', error: `บันทึกสินค้าไม่สำเร็จ: ${insertErr?.message || 'unknown'}` });
      continue;
    }

    try {
      const saved = await saveCompositeVariations(supabase, {
        companyId,
        productId: product.id,
        slots: plan.slots,
        combos: plan.combos,
        onlyListed: true,
      });
      results.push({ ...base, product_id: product.id, variation_count: saved.variationIds.length });
    } catch (e) {
      const outcome = await discardProduct(supabase, companyId, product.id);
      const msg = e instanceof CompositeValidationError ? e.message : `บันทึกชุดย่อยไม่สำเร็จ: ${e instanceof Error ? e.message : 'unknown'}`;
      results.push({
        ...base,
        action: 'error',
        error: outcome === 'closed' ? `${msg} (สินค้าถูกสร้างค้างไว้แบบปิดใช้งาน — ลบในหน้าสินค้าก่อนนำเข้าใหม่)` : msg,
      });
    }
  }
  return results;
}

function planGroup(
  code: string,
  parsed: { row: CompositeCreateRow; tokens: ComponentToken[] }[] | string,
  resolve: (ref: string) => Resolution,
  ctx: {
    existing: boolean;
    brandId: string | null;
    categoryId: string | null;
    first: CompositeCreateRow;
    rowLabel: (r: CompositeCreateRow) => string;
  },
): GroupPlan {
  const fail = (msg: string): never => { throw new PlanError(msg); };
  const { first, rowLabel } = ctx;

  if (ctx.existing) fail(`รหัสสินค้า "${code}" มีอยู่แล้ว — ใช้ "แก้ไขข้อมูลพื้นฐาน" หรือ "แก้ราคา" แทน`);
  if (typeof parsed === 'string') return fail(parsed);
  if (first.brand_name && !ctx.brandId) fail(`ไม่พบแบรนด์ "${first.brand_name}"`);
  if (first.category_name && !ctx.categoryId) fail(`ไม่พบหมวดหมู่ "${first.category_name}"`);

  // Slots = component products in order of first appearance
  const slots: CompositeSlot[] = [];
  const slotByProduct = new Map<string, CompositeSlot>();
  const slotCode = new Map<string, string | null>();
  const rowPicks: Map<string, { id: string; quantity: number }>[] = [];
  for (const { row, tokens } of parsed) {
    const picks = new Map<string, { id: string; quantity: number }>();
    for (const t of tokens) {
      const r = resolve(t.ref);
      if ('error' in r) return fail(`${rowLabel(row)}: ${r.error}`);
      const c = r.ok;
      const prev = picks.get(c.product_id);
      if (prev && prev.id !== c.id) {
        fail(`${rowLabel(row)}: มีส่วนประกอบจากสินค้า "${c.product_name}" มากกว่า 1 ตัวเลือก — 1 ชุดย่อยเลือกได้ 1 ตัวเลือกต่อสินค้า`);
      }
      picks.set(c.product_id, { id: c.id, quantity: (prev?.quantity || 0) + t.quantity });
      if (!slotByProduct.has(c.product_id)) {
        const slot: CompositeSlot = { key: `slot${slots.length + 1}`, name: c.product_name, product_id: c.product_id, variation_ids: [], quantity: 0 };
        slots.push(slot);
        slotByProduct.set(c.product_id, slot);
        slotCode.set(c.product_id, c.product_code);
      }
    }
    rowPicks.push(picks);
  }

  parsed.forEach(({ row }, i) => {
    for (const [productId, pick] of rowPicks[i]) {
      const slot = slotByProduct.get(productId)!;
      if (!slot.quantity) slot.quantity = pick.quantity;
      else if (slot.quantity !== pick.quantity) {
        fail(`${rowLabel(row)}: ส่วนประกอบจาก "${slot.name}" ต้องใช้จำนวนต่อชุดเท่ากันทุกแถว (${slot.quantity} กับ ${pick.quantity})`);
      }
      if (!slot.variation_ids.includes(pick.id)) slot.variation_ids.push(pick.id);
    }
    for (const slot of slots) {
      if (!rowPicks[i].has(slot.product_id)) fail(`${rowLabel(row)}: ขาดส่วนประกอบจาก "${slot.name}" — ทุกชุดย่อยต้องมีครบทุกส่วน`);
    }
  });

  // Slot names must be unique — two component products with the same name get their code appended
  const nameCount = new Map<string, number>();
  for (const s of slots) nameCount.set(s.name, (nameCount.get(s.name) || 0) + 1);
  for (const s of slots) {
    const c = slotCode.get(s.product_id);
    if ((nameCount.get(s.name) || 0) > 1 && c) s.name = `${s.name} (${c})`;
  }

  const slotError = validateCompositeSlots(slots);
  if (slotError) fail(slotError);

  const isActive = first.is_active !== false;
  const seen = new Map<string, number | string>();
  const combos: ComboInput[] = parsed.map(({ row }, i) => {
    const key = comboKey([...rowPicks[i].values()].map(p => p.id));
    if (seen.has(key)) fail(`${rowLabel(row)}: ชุดย่อยซ้ำกับแถว ${seen.get(key)}`);
    seen.set(key, row.__rowNum ?? '?');

    const locked = row.default_price != null && !Number.isNaN(row.default_price);
    const def = Number(row.default_price) || 0;
    const disc = Number(row.discount_price) || 0;
    if (!locked && disc > 0) fail(`${rowLabel(row)}: ใส่ราคาขายต้องใส่ราคาปกติด้วย (หรือเว้นว่างทั้งคู่ = ราคารวมส่วนประกอบ)`);
    if (locked && def <= 0) fail(`${rowLabel(row)}: ราคาปกติต้องมากกว่า 0 (เว้นว่าง = ราคารวมส่วนประกอบ)`);
    if (locked && disc > 0 && disc >= def) fail(`${rowLabel(row)}: ราคาขาย (${disc}) ต้องน้อยกว่าราคาปกติ (${def})`);

    const combo: ComboInput = {
      key,
      is_active: isActive && row.is_active !== false,
      price_locked: locked,
    };
    if (locked) {
      combo.default_price = def;
      combo.discount_price = disc;
    }
    if (row.sku?.trim()) combo.sku = row.sku.trim();
    if (row.barcode?.trim()) combo.barcode = row.barcode.trim();
    return combo;
  });

  return { slots, combos, isActive, brandId: ctx.brandId, categoryId: ctx.categoryId };
}

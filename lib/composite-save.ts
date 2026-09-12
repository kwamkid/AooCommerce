/**
 * Composite products (สินค้าชุด) — server-side save of a composite product's combos.
 * One rule set for both `/api/products` (product form) and the Excel bulk importer.
 *
 * Combo identity = its set of component variations (comboKey), so editing the slots keeps
 * existing combo rows — their marketplace links and order history stay attached.
 * Combos that drop out are soft-archived (is_active=false), never deleted.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanVariationLabel } from '@/lib/product-display';
import {
  buildCombos,
  comboComponents,
  comboKey,
  comboLabel,
  comboPrice,
  validateCompositeSlots,
  type CompositeSlot,
} from '@/lib/composite-shared';

export class CompositeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompositeValidationError';
  }
}

export interface ComponentInfo {
  id: string;
  product_id: string;
  product_name: string;
  product_code: string | null;
  variation_label: string | null;
  sku: string | null;
  barcode: string | null;
  default_price: number;
  discount_price: number | null;
  /** variation, its product and not soft-deleted */
  is_active: boolean;
  /** component product is a simple product (one variation) */
  is_simple: boolean;
  is_composite: boolean;
}

/** Option label of a component: its variation label, or the product name for a simple product. */
export function componentOptionLabel(c: ComponentInfo): string {
  const label = c.is_simple
    ? ''
    : cleanVariationLabel({ variation_label: c.variation_label, product_code: c.product_code, sku: c.sku, barcode: c.barcode });
  return label || c.product_name;
}

type ComponentRow = {
  id: string;
  product_id: string;
  variation_label: string | null;
  sku: string | null;
  barcode: string | null;
  default_price: number | null;
  discount_price: number | null;
  is_active: boolean;
  deleted_at: string | null;
  product: { name: string; code: string | null; variation_label: string | null; is_composite: boolean; is_active: boolean } | null;
};

export async function loadComponentInfo(
  supabase: SupabaseClient,
  companyId: string,
  variationIds: string[],
): Promise<Map<string, ComponentInfo>> {
  const map = new Map<string, ComponentInfo>();
  const unique = [...new Set(variationIds.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data, error } = await supabase
    .from('product_variations')
    .select('id, product_id, variation_label, sku, barcode, default_price, discount_price, is_active, deleted_at, product:products!inner(name, code, variation_label, is_composite, is_active)')
    .eq('company_id', companyId)
    .in('id', unique);
  if (error) throw new Error(`Failed to load components: ${error.message}`);
  for (const r of (data || []) as unknown as ComponentRow[]) {
    map.set(r.id, {
      id: r.id,
      product_id: r.product_id,
      product_name: r.product?.name || '-',
      product_code: r.product?.code ?? null,
      variation_label: r.variation_label,
      sku: r.sku,
      barcode: r.barcode,
      default_price: Number(r.default_price) || 0,
      discount_price: r.discount_price != null ? Number(r.discount_price) : null,
      is_active: r.is_active && !r.deleted_at && !!r.product?.is_active,
      is_simple: r.product?.variation_label != null,
      is_composite: !!r.product?.is_composite,
    });
  }
  return map;
}

export interface ComboInput {
  /** comboKey() of the combo's component variation ids */
  key: string;
  is_active?: boolean;
  /** true = price set by hand; false = follows the components */
  price_locked?: boolean;
  default_price?: number | null;
  discount_price?: number | null;
  sku?: string | null;
  barcode?: string | null;
}

export interface SaveCompositeResult {
  created: number;
  updated: number;
  archived: number;
  /** combo variation ids that are part of the product after the save, in slot order */
  variationIds: string[];
  /** comboKey → variation id of the same combos (lets the form attach pictures of new combos) */
  combos: { key: string; variation_id: string }[];
}

interface GeneratedCombo {
  key: string;
  label: string;
  attributes: Record<string, string>;
  components: { variation_id: string; quantity: number }[];
  price: { default_price: number; discount_price: number };
  autoSku: string | null;
}

/**
 * Create / update the combos of a composite product from its slots.
 * @param combos per-combo settings keyed by comboKey (active flag, manual price, SKU)
 * @param onlyListed create only the combos listed in `combos` (Excel import) — default = every
 *   combo the slots produce
 * @throws CompositeValidationError with a Thai message for anything the user must fix
 */
export async function saveCompositeVariations(
  supabase: SupabaseClient,
  opts: {
    companyId: string;
    productId: string;
    slots: CompositeSlot[];
    combos?: ComboInput[];
    onlyListed?: boolean;
  },
): Promise<SaveCompositeResult> {
  const { companyId, productId, slots } = opts;
  const slotError = validateCompositeSlots(slots);
  if (slotError) throw new CompositeValidationError(slotError);

  const info = await loadComponentInfo(supabase, companyId, slots.flatMap(s => s.variation_ids));
  for (const s of slots) {
    for (const id of s.variation_ids) {
      const c = info.get(id);
      if (!c) throw new CompositeValidationError(`ไม่พบตัวเลือกที่เลือกไว้ในช่อง "${s.name}"`);
      if (c.product_id !== s.product_id) throw new CompositeValidationError(`ตัวเลือกในช่อง "${s.name}" ไม่ใช่ของสินค้าที่เลือก`);
      if (c.is_composite) throw new CompositeValidationError(`ใช้สินค้าชุดเป็นส่วนประกอบไม่ได้ (ช่อง "${s.name}")`);
      if (c.product_id === productId) throw new CompositeValidationError('ใช้สินค้าชุดนี้เป็นส่วนประกอบของตัวเองไม่ได้');
    }
  }

  const generated: GeneratedCombo[] = buildCombos(slots).map(picks => {
    const components = comboComponents(picks);
    const optionLabels = picks.map(p => componentOptionLabel(info.get(p.variation_id)!));
    const skus = picks.map(p => info.get(p.variation_id)!.sku);
    return {
      key: comboKey(components.map(c => c.variation_id)),
      label: comboLabel(picks.map((p, i) => ({ label: optionLabels[i], quantity: p.quantity }))),
      attributes: Object.fromEntries(slots.map((s, i) => [s.name.trim(), optionLabels[i]])),
      components,
      price: comboPrice(components.map(c => {
        const ci = info.get(c.variation_id)!;
        return { default_price: ci.default_price, discount_price: ci.discount_price, quantity: c.quantity };
      })),
      autoSku: skus.every(Boolean) ? skus.join('+') : null,
    };
  });

  const inputByKey = new Map((opts.combos || []).map(c => [c.key, c]));
  let kept = generated;
  if (opts.onlyListed) {
    const generatedKeys = new Set(generated.map(g => g.key));
    for (const key of inputByKey.keys()) {
      if (!generatedKeys.has(key)) throw new CompositeValidationError('มีชุดย่อยที่ไม่ตรงกับส่วนประกอบของชุด');
    }
    kept = generated.filter(g => inputByKey.has(g.key));
  }
  if (kept.length === 0) throw new CompositeValidationError('สินค้าชุดต้องมีชุดย่อยอย่างน้อย 1 แบบ');

  // Manual prices must follow the global rule: discount < default (0 = no discount)
  for (const g of kept) {
    const input = inputByKey.get(g.key);
    if (!input?.price_locked) continue;
    const def = Number(input.default_price) || 0;
    const disc = Number(input.discount_price) || 0;
    if (def <= 0) throw new CompositeValidationError(`ชุดย่อย "${g.label}" ต้องมีราคาปกติ`);
    if (disc > 0 && disc >= def) throw new CompositeValidationError(`ชุดย่อย "${g.label}": ราคาลดเหลือต้องน้อยกว่าราคาปกติ`);
  }

  // Product must be marked composite before components are attached (DB guard checks it)
  const { error: productErr } = await supabase
    .from('products')
    .update({ is_composite: true, composite_slots: slots, variation_label: null, selected_variation_types: null })
    .eq('id', productId)
    .eq('company_id', companyId);
  if (productErr) throw new Error(`Failed to update product: ${productErr.message}`);

  // Existing combos of this product, keyed by their component set
  const { data: existingRows, error: existingErr } = await supabase
    .from('product_variations')
    .select('id, sku, barcode, is_active, price_locked, default_price, discount_price')
    .eq('product_id', productId)
    .eq('company_id', companyId);
  if (existingErr) throw new Error(`Failed to load combos: ${existingErr.message}`);
  const existingIds = (existingRows || []).map(r => r.id);
  const { data: existingComps, error: compsErr } = existingIds.length
    ? await supabase.from('product_variation_components').select('variation_id, component_variation_id').in('variation_id', existingIds)
    : { data: [], error: null };
  if (compsErr) throw new Error(`Failed to load combo components: ${compsErr.message}`);
  const compIdsByCombo = new Map<string, string[]>();
  for (const r of existingComps || []) {
    compIdsByCombo.set(r.variation_id, [...(compIdsByCombo.get(r.variation_id) || []), r.component_variation_id]);
  }
  const existingByKey = new Map<string, NonNullable<typeof existingRows>[number]>();
  for (const r of existingRows || []) {
    const ids = compIdsByCombo.get(r.id);
    if (ids?.length) existingByKey.set(comboKey(ids), r);
  }

  const result: SaveCompositeResult = { created: 0, updated: 0, archived: 0, variationIds: [], combos: [] };
  const newVariations: Record<string, unknown>[] = [];
  const componentRows: Record<string, unknown>[] = [];
  const unlockedIds: string[] = [];

  for (const g of kept) {
    const input = inputByKey.get(g.key);
    const existing = existingByKey.get(g.key);
    const locked = input?.price_locked ?? existing?.price_locked ?? false;
    const id = existing?.id ?? crypto.randomUUID();
    const sku = input && input.sku !== undefined ? (input.sku?.trim() || null) : (existing ? existing.sku : g.autoSku);
    const barcode = input && input.barcode !== undefined ? (input.barcode?.trim() || null) : (existing?.barcode ?? null);
    const price = locked
      ? {
          default_price: Number(input?.default_price ?? existing?.default_price) || 0,
          discount_price: Number(input?.discount_price ?? (input ? 0 : existing?.discount_price)) || 0,
        }
      : g.price;
    const fields = {
      variation_label: g.label,
      attributes: g.attributes,
      sku,
      barcode,
      is_active: input?.is_active ?? true,
      price_locked: locked,
      ...price,
    };

    if (existing) {
      const { error } = await supabase.from('product_variations').update(fields).eq('id', existing.id);
      if (error) throw new Error(`Failed to update combo "${g.label}": ${error.message}`);
      result.updated++;
    } else {
      newVariations.push({ id, company_id: companyId, product_id: productId, cost_price: 0, stock: 0, min_stock: 0, ...fields });
      result.created++;
    }
    g.components.forEach((c, i) => componentRows.push({
      company_id: companyId,
      variation_id: id,
      component_variation_id: c.variation_id,
      quantity: c.quantity,
      sort_order: i,
    }));
    if (!locked) unlockedIds.push(id);
    result.variationIds.push(id);
    result.combos.push({ key: g.key, variation_id: id });
  }

  if (newVariations.length) {
    const { error } = await supabase.from('product_variations').insert(newVariations);
    if (error) throw new Error(`Failed to create combos: ${error.message}`);
  }
  if (componentRows.length) {
    const { error } = await supabase
      .from('product_variation_components')
      .upsert(componentRows, { onConflict: 'variation_id,component_variation_id' });
    if (error) throw new Error(`Failed to save combo components: ${error.message}`);
  }

  // Combos that no longer come out of the slots → soft-archive (FKs from orders/links stay valid)
  const keptIds = new Set(result.variationIds);
  const toArchive = (existingRows || []).filter(r => !keptIds.has(r.id) && r.is_active).map(r => r.id);
  if (toArchive.length) {
    const { error } = await supabase.from('product_variations').update({ is_active: false }).in('id', toArchive);
    if (error) throw new Error(`Failed to archive combos: ${error.message}`);
    result.archived = toArchive.length;
  }

  // Authoritative prices for combos that follow their components
  if (unlockedIds.length) {
    const { error } = await supabase.rpc('recompute_composite_prices', { p_variation_ids: unlockedIds });
    if (error) throw new Error(`Failed to compute combo prices: ${error.message}`);
  }

  return result;
}

/**
 * Composite products (สินค้าชุด) — server helpers. Client-safe logic lives in lib/composite-shared.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { comboFallbackImage, componentImageRank, type CompositeSlot } from '@/lib/composite-shared';

export interface CompositePart {
  variationId: string;
  quantity: number;
}

export interface CompositeAvailability {
  quantity: number;
  reserved_quantity: number;
  available: number;
}

/** Components of a combo variation, or null when the variation is not a combo. */
export async function getCompositeParts(
  supabase: SupabaseClient,
  variationId: string,
  companyId?: string,
): Promise<CompositePart[] | null> {
  let q = supabase
    .from('product_variation_components')
    .select('component_variation_id, quantity')
    .eq('variation_id', variationId);
  if (companyId) q = q.eq('company_id', companyId);
  const { data, error } = await q.order('sort_order');
  if (error) throw new Error(`Failed to load composite components: ${error.message}`);
  if (!data || data.length === 0) return null;
  return data.map(r => ({ variationId: r.component_variation_id, quantity: r.quantity }));
}

/** Components for many variations at once — only combos appear in the map. */
export async function getCompositePartsMap(
  supabase: SupabaseClient,
  variationIds: string[],
): Promise<Map<string, CompositePart[]>> {
  const map = new Map<string, CompositePart[]>();
  const unique = [...new Set(variationIds.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data, error } = await supabase
    .from('product_variation_components')
    .select('variation_id, component_variation_id, quantity')
    .in('variation_id', unique)
    .order('sort_order');
  if (error) throw new Error(`Failed to load composite components: ${error.message}`);
  for (const r of data || []) {
    const list = map.get(r.variation_id) || [];
    list.push({ variationId: r.component_variation_id, quantity: r.quantity });
    map.set(r.variation_id, list);
  }
  return map;
}

/**
 * Picture for combos that have no image of their own — order rule = `componentImageRank()` /
 * `comboFallbackImage()` in lib/composite-shared.ts (the product form previews with the same rule);
 * per component: its variation image, else its product image (product_images first, then products.image).
 * Combos with nothing to show are absent from the map. One composite product per call.
 */
export async function getComboFallbackImages(
  supabase: SupabaseClient,
  slots: CompositeSlot[],
  comboIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (comboIds.length === 0 || slots.length === 0) return out;

  const parts = await getCompositePartsMap(supabase, comboIds);
  const componentIds = [...new Set([...parts.values()].flat().map(p => p.variationId))];
  if (componentIds.length === 0) return out;

  const [{ data: varImages }, { data: vars }] = await Promise.all([
    supabase.from('product_images').select('variation_id, image_url, sort_order').in('variation_id', componentIds).order('sort_order'),
    supabase.from('product_variations').select('id, product_id').in('id', componentIds),
  ]);
  const imageByVariation = new Map<string, string>();
  for (const r of varImages || []) if (r.variation_id && !imageByVariation.has(r.variation_id)) imageByVariation.set(r.variation_id, r.image_url);

  const productIds = [...new Set((vars || []).map(v => v.product_id))];
  const productOf = new Map((vars || []).map(v => [v.id, v.product_id]));
  const [{ data: productImages }, { data: products }] = productIds.length
    ? await Promise.all([
        supabase.from('product_images').select('product_id, image_url, sort_order').in('product_id', productIds).is('variation_id', null).order('sort_order'),
        supabase.from('products').select('id, image').in('id', productIds),
      ])
    : [{ data: [] }, { data: [] }];
  const imageByProduct = new Map<string, string>();
  for (const r of productImages || []) if (!imageByProduct.has(r.product_id)) imageByProduct.set(r.product_id, r.image_url);
  for (const p of products || []) if (p.image && !imageByProduct.has(p.id)) imageByProduct.set(p.id, p.image);

  const rank = componentImageRank(slots);
  const imageOf = (id: string) => imageByVariation.get(id) || imageByProduct.get(productOf.get(id) || '');
  for (const [comboId, list] of parts) {
    const img = comboFallbackImage(list.map(p => p.variationId), rank, imageOf);
    if (img) out.set(comboId, img);
  }
  return out;
}

/**
 * Sellable sets per combo = the scarcest component (floor(stock / pieces per set)).
 * `warehouseId` omitted = all warehouses. Non-combo ids are simply absent from the map.
 */
export async function getCompositeAvailability(
  supabase: SupabaseClient,
  companyId: string,
  variationIds: string[],
  warehouseId?: string | null,
): Promise<Map<string, CompositeAvailability>> {
  const map = new Map<string, CompositeAvailability>();
  const unique = [...new Set(variationIds.filter(Boolean))];
  if (unique.length === 0) return map;
  const { data, error } = await supabase.rpc('get_composite_availability', {
    p_company_id: companyId,
    p_variation_ids: unique,
    p_warehouse_id: warehouseId || null,
  });
  if (error) throw new Error(`Failed to compute composite availability: ${error.message}`);
  for (const r of (data || []) as ({ variation_id: string } & CompositeAvailability)[]) {
    map.set(r.variation_id, { quantity: r.quantity, reserved_quantity: r.reserved_quantity, available: r.available });
  }
  return map;
}

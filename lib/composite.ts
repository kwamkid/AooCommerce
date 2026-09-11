/**
 * Composite products (สินค้าชุด) — server helpers. Client-safe logic lives in lib/composite-shared.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

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

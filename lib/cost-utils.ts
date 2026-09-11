/**
 * Cost Utilities — ดึงราคาต้นทุนเฉลี่ย (WAC) สำหรับ snapshot ลง order_items
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getCompositePartsMap } from '@/lib/composite';

/**
 * Batch fetch current WAC (cost_price) for multiple variations
 * Returns a map of variationId → cost_price
 * Composite combos (สินค้าชุด) have no WAC of their own — cost = Σ component WAC × pieces per set
 */
export async function fetchCostMap(
  supabase: SupabaseClient,
  variationIds: string[],
): Promise<Record<string, number | null>> {
  const unique = [...new Set(variationIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const [{ data }, partsMap] = await Promise.all([
    supabase.from('product_variations').select('id, cost_price').in('id', unique),
    getCompositePartsMap(supabase, unique),
  ]);

  const costMap: Record<string, number | null> = Object.fromEntries((data || []).map(v => [v.id, v.cost_price ?? null]));
  if (partsMap.size === 0) return costMap;

  const componentIds = [...new Set([...partsMap.values()].flat().map(p => p.variationId))];
  const { data: components } = await supabase
    .from('product_variations')
    .select('id, cost_price')
    .in('id', componentIds);
  const componentCost = new Map((components || []).map(c => [c.id, c.cost_price as number | null]));

  for (const [comboId, parts] of partsMap) {
    const anyKnown = parts.some(p => componentCost.get(p.variationId) != null);
    costMap[comboId] = anyKnown
      ? parts.reduce((sum, p) => sum + (componentCost.get(p.variationId) ?? 0) * p.quantity, 0)
      : null;
  }
  return costMap;
}

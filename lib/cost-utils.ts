/**
 * Cost Utilities — ดึงราคาต้นทุนเฉลี่ย (WAC) สำหรับ snapshot ลง order_items
 */

import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Batch fetch current WAC (cost_price) for multiple variations
 * Returns a map of variationId → cost_price
 */
export async function fetchCostMap(
  supabase: SupabaseClient,
  variationIds: string[],
): Promise<Record<string, number | null>> {
  const unique = [...new Set(variationIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data } = await supabase
    .from('product_variations')
    .select('id, cost_price')
    .in('id', unique);

  if (!data) return {};
  return Object.fromEntries(data.map(v => [v.id, v.cost_price ?? null]));
}

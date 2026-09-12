/**
 * Product type change (simple ↔ variation) guard.
 *
 * Switching type soft-deletes every current variation row, so it is only
 * allowed while nothing outside the product still depends on those rows.
 * Shops that don't use the stock module have no inventory rows (or all-zero
 * ones) and therefore never hit the stock blocker.
 *
 * `typeChangeBlockReason` is pure (client-safe); `getTypeChangeBlockers`
 * queries the DB and is meant for API routes (service role client).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface TypeChangeBlockers {
  /** pieces on hand (or reserved) across all warehouses for the live variations */
  stock: number;
  /** order lines that reference the live variations */
  orders: number;
  /** marketplace links (Shopee/TikTok/Lazada) attached to the live variations */
  links: number;
  /** composite products that use the live variations as components */
  components: number;
}

export const NO_TYPE_CHANGE_BLOCKERS: TypeChangeBlockers = { stock: 0, orders: 0, links: 0, components: 0 };

/** Thai reason the type can't be changed, or null when it can. */
export function typeChangeBlockReason(b?: TypeChangeBlockers | null): string | null {
  if (!b) return null;
  const parts: string[] = [];
  if (b.stock > 0) parts.push(`มีสต็อกในคลัง ${b.stock.toLocaleString('th-TH')} ชิ้น (เบิกออกให้หมดก่อน)`);
  if (b.orders > 0) parts.push(`มีออเดอร์แล้ว ${b.orders.toLocaleString('th-TH')} รายการ`);
  if (b.links > 0) parts.push(`เชื่อมกับร้าน marketplace อยู่ ${b.links.toLocaleString('th-TH')} รายการ (ยกเลิกการเชื่อมก่อน)`);
  if (b.components > 0) parts.push(`ถูกใช้เป็นชิ้นส่วนของสินค้าชุด ${b.components.toLocaleString('th-TH')} ชุด`);
  if (parts.length === 0) return null;
  return `เปลี่ยนประเภทสินค้าไม่ได้ เพราะ${parts.join(' · ')}`;
}

/**
 * Count everything that still references the given (live) variation ids.
 * Pass the ids of variations with `deleted_at IS NULL` — archived rows from
 * earlier switches are intentionally ignored.
 */
export async function getTypeChangeBlockers(
  client: SupabaseClient,
  companyId: string,
  variationIds: string[],
): Promise<TypeChangeBlockers> {
  if (variationIds.length === 0) return { ...NO_TYPE_CHANGE_BLOCKERS };

  const [inv, orders, links, components] = await Promise.all([
    client
      .from('inventory')
      .select('quantity, reserved_quantity')
      .eq('company_id', companyId)
      .in('variation_id', variationIds)
      .or('quantity.neq.0,reserved_quantity.neq.0'),
    client
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('variation_id', variationIds),
    client
      .from('marketplace_product_links')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .in('variation_id', variationIds),
    client
      .from('product_variation_components')
      .select('variation_id')
      .in('component_variation_id', variationIds),
  ]);

  const stock = ((inv.data || []) as { quantity: number | string | null; reserved_quantity: number | string | null }[])
    .reduce((sum, r) => sum + Math.max(Math.abs(Number(r.quantity) || 0), Math.abs(Number(r.reserved_quantity) || 0)), 0);
  const compositeIds = new Set(((components.data || []) as { variation_id: string }[]).map(r => r.variation_id));

  return {
    stock,
    orders: orders.count ?? 0,
    links: links.count ?? 0,
    components: compositeIds.size,
  };
}

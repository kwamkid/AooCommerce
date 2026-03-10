import { SupabaseClient } from '@supabase/supabase-js';
import { PromotionComponent, PromotionItem } from './types';
import { getBundleSetComponents, allocateBundlePrice } from './bundle-set';
import { getBuyGetFreeComponents } from './buy-get-free';
import { getBuyGetDiscountComponents } from './buy-get-discount';
import { getQtyDiscountComponents, calculateQtyDiscount } from './qty-discount';

// Re-export everything
export { allocateBundlePrice } from './bundle-set';
export { calculateQtyDiscount } from './qty-discount';
export type { PromotionComponent, PromotionItem, PromotionTier, PromotionHeader, PromotionType } from './types';

// ─── Main Dispatcher ────────────────────────────────────

/**
 * Fetch promotion components with allocated prices.
 * Dispatches to the correct type-specific service.
 * Used when creating order items from a promotion.
 */
export async function getPromotionComponents(
  supabase: SupabaseClient,
  promotionId: string,
): Promise<PromotionComponent[]> {
  // Fetch promotion header
  const { data: promotion, error: promError } = await supabase
    .from('promotions')
    .select('id, promotion_type, bundle_price')
    .eq('id', promotionId)
    .single();

  if (promError || !promotion) {
    throw new Error('ไม่พบโปรโมชั่น');
  }

  // Fetch items with default prices
  // Use left join for product_variations (nullable for bundle_set product-level items)
  const { data: items, error: itemsError } = await supabase
    .from('promotion_items')
    .select(`
      variation_id, product_id, role, quantity, special_price,
      product_variations(default_price)
    `)
    .eq('promotion_id', promotionId)
    .order('sort_order');

  if (itemsError) throw itemsError;
  if (!items || items.length === 0) {
    throw new Error('โปรโมชั่นไม่มีสินค้า');
  }

  const typedItems = items as unknown as PromotionItem[];

  switch (promotion.promotion_type) {
    case 'bundle_set':
      return getBundleSetComponents(typedItems, promotion.bundle_price || 0);

    case 'buy_get_free':
      return getBuyGetFreeComponents(typedItems, promotion.bundle_price);

    case 'buy_get_discount':
      return getBuyGetDiscountComponents(typedItems);

    case 'qty_discount':
      return getQtyDiscountComponents(typedItems);

    default:
      throw new Error(`Unknown promotion type: ${promotion.promotion_type}`);
  }
}

import { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ──────────────────────────────────────────────

export interface PromotionComponent {
  variation_id: string;
  quantity: number;
  role: string;
  default_price: number;
  allocated_price: number;
}

interface PromotionItem {
  variation_id: string;
  role: string;
  quantity: number;
  special_price: number | null;
  product_variations: {
    default_price: number;
  };
}

interface PromotionTier {
  min_qty: number;
  discount_type: string;
  discount_value: number;
}

// ─── Price Allocation ───────────────────────────────────

/**
 * Distribute bundle price proportionally by default_price.
 * Free gifts (role='gift') get allocated_price = 0.
 * Rounding error goes to the first non-gift component.
 */
export function allocateBundlePrice(
  bundlePrice: number,
  components: { variation_id: string; default_price: number; quantity: number; role: string }[],
): { variation_id: string; allocated_price: number }[] {
  // Gift items get 0
  const nonGifts = components.filter(c => c.role !== 'gift');
  const gifts = components.filter(c => c.role === 'gift');

  const totalDefault = nonGifts.reduce((sum, c) => sum + c.default_price * c.quantity, 0);

  if (totalDefault <= 0 || bundlePrice <= 0) {
    return components.map(c => ({
      variation_id: c.variation_id,
      allocated_price: 0,
    }));
  }

  // Calculate proportional prices
  let remaining = bundlePrice;
  const result: { variation_id: string; allocated_price: number }[] = [];

  for (let i = 0; i < nonGifts.length; i++) {
    const c = nonGifts[i];
    if (i === nonGifts.length - 1) {
      // Last item gets remainder to avoid rounding error
      result.push({
        variation_id: c.variation_id,
        allocated_price: Math.round(remaining * 100) / 100,
      });
    } else {
      const proportion = (c.default_price * c.quantity) / totalDefault;
      const allocated = Math.round(bundlePrice * proportion * 100) / 100;
      remaining -= allocated;
      result.push({
        variation_id: c.variation_id,
        allocated_price: allocated,
      });
    }
  }

  // Add gifts with 0
  for (const g of gifts) {
    result.push({
      variation_id: g.variation_id,
      allocated_price: 0,
    });
  }

  return result;
}

// ─── Quantity Discount ──────────────────────────────────

/**
 * Calculate the discounted unit price for a given quantity.
 * Returns the unit price after discount.
 */
export function calculateQtyDiscount(
  tiers: PromotionTier[],
  quantity: number,
  originalPrice: number,
): number {
  // Sort tiers by min_qty descending to find the highest applicable tier
  const sorted = [...tiers].sort((a, b) => b.min_qty - a.min_qty);
  const tier = sorted.find(t => quantity >= t.min_qty);

  if (!tier) return originalPrice;

  switch (tier.discount_type) {
    case 'percent':
      return Math.round(originalPrice * (1 - tier.discount_value / 100) * 100) / 100;
    case 'fixed_discount':
      return Math.max(0, originalPrice - tier.discount_value);
    case 'fixed_price':
      return tier.discount_value;
    default:
      return originalPrice;
  }
}

// ─── Get Promotion Components ───────────────────────────

/**
 * Fetch promotion components with allocated prices.
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
  const { data: items, error: itemsError } = await supabase
    .from('promotion_items')
    .select(`
      variation_id, role, quantity, special_price,
      product_variations!inner(default_price)
    `)
    .eq('promotion_id', promotionId)
    .order('sort_order');

  if (itemsError) throw itemsError;
  if (!items || items.length === 0) {
    throw new Error('โปรโมชั่นไม่มีสินค้า');
  }

  const typedItems = items as unknown as PromotionItem[];

  switch (promotion.promotion_type) {
    case 'bundle_set': {
      const allocations = allocateBundlePrice(
        promotion.bundle_price || 0,
        typedItems.map(i => ({
          variation_id: i.variation_id,
          default_price: i.product_variations.default_price,
          quantity: i.quantity,
          role: i.role,
        })),
      );

      return typedItems.map(i => {
        const alloc = allocations.find(a => a.variation_id === i.variation_id);
        return {
          variation_id: i.variation_id,
          quantity: i.quantity,
          role: i.role,
          default_price: i.product_variations.default_price,
          allocated_price: alloc?.allocated_price ?? 0,
        };
      });
    }

    case 'buy_get_free': {
      // Main items: use bundle_price allocation or default_price
      // Gift items: 0
      if (promotion.bundle_price) {
        const allocations = allocateBundlePrice(
          promotion.bundle_price,
          typedItems.map(i => ({
            variation_id: i.variation_id,
            default_price: i.product_variations.default_price,
            quantity: i.quantity,
            role: i.role,
          })),
        );
        return typedItems.map(i => {
          const alloc = allocations.find(a => a.variation_id === i.variation_id);
          return {
            variation_id: i.variation_id,
            quantity: i.quantity,
            role: i.role,
            default_price: i.product_variations.default_price,
            allocated_price: alloc?.allocated_price ?? 0,
          };
        });
      }
      // No bundle price: main items use default, gifts = 0
      return typedItems.map(i => ({
        variation_id: i.variation_id,
        quantity: i.quantity,
        role: i.role,
        default_price: i.product_variations.default_price,
        allocated_price: i.role === 'gift' ? 0 : i.product_variations.default_price * i.quantity,
      }));
    }

    case 'buy_get_discount': {
      return typedItems.map(i => ({
        variation_id: i.variation_id,
        quantity: i.quantity,
        role: i.role,
        default_price: i.product_variations.default_price,
        allocated_price: i.role === 'discounted'
          ? (i.special_price ?? i.product_variations.default_price) * i.quantity
          : i.product_variations.default_price * i.quantity,
      }));
    }

    case 'qty_discount': {
      // For qty_discount, price depends on order quantity — return default for now
      return typedItems.map(i => ({
        variation_id: i.variation_id,
        quantity: i.quantity,
        role: i.role,
        default_price: i.product_variations.default_price,
        allocated_price: i.product_variations.default_price * i.quantity,
      }));
    }

    default:
      throw new Error(`Unknown promotion type: ${promotion.promotion_type}`);
  }
}

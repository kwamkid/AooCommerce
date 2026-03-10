import { PromotionComponent, PromotionItem, PromotionTier } from './types';

// ─── Qty Discount (ซื้อเยอะลดเยอะ) ─────────────────────
//
// Logic:
//   - เลือกสินค้า 1 ตัว + กำหนดขั้นส่วนลด (tiers)
//   - tier ระบุ: min_qty, discount_type, discount_value
//   - discount_type:
//     • 'percent'        → ลด % จาก default_price
//     • 'fixed_discount' → ลดบาท จาก default_price
//     • 'fixed_price'    → ราคาเหลือเท่านี้
//   - ใช้ tier ที่ min_qty สูงสุดที่ quantity >= min_qty
//
// ตัวอย่าง:
//   สินค้า A (100 บาท)
//   Tier 1: ซื้อ 3+ ลด 10% → 90 บาท/ชิ้น
//   Tier 2: ซื้อ 5+ ลด 20% → 80 บาท/ชิ้น
//   Tier 3: ซื้อ 10+ ราคาเหลือ 69 → 69 บาท/ชิ้น
//
//   ซื้อ 7 ชิ้น → ใช้ Tier 2 → 80 × 7 = 560 บาท
//
// Shopee mapping: bundle_deal (with tiers/rule_type)
// Note: ตอน getComponents ยังไม่รู้จำนวน → return default_price
//       ราคาจริงคำนวณตอนสร้าง order ด้วย calculateQtyDiscount()

/**
 * Calculate the discounted unit price for a given quantity.
 * Finds the highest applicable tier and applies discount.
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

/**
 * Get components for qty_discount.
 * Note: actual discounted price depends on order quantity,
 * so this returns default_price as allocated_price.
 * Use calculateQtyDiscount() at order time for actual price.
 */
export function getQtyDiscountComponents(
  items: PromotionItem[],
): PromotionComponent[] {
  return items.map(i => {
    const defPrice = i.product_variations?.default_price || 0;
    return {
      variation_id: i.variation_id || '',
      quantity: i.quantity,
      role: i.role,
      default_price: defPrice,
      allocated_price: defPrice * i.quantity,
    };
  });
}

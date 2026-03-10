import { PromotionComponent, PromotionItem } from './types';
import { allocateBundlePrice } from './bundle-set';

// ─── Buy Get Free (ซื้อแถม) ─────────────────────────────
//
// Logic:
//   - สินค้าหลัก (role='main') + ของแถม (role='gift')
//   - ของแถม allocated_price = 0 เสมอ
//   - ถ้ามี bundle_price → แบ่งราคาสินค้าหลักตามสัดส่วน (gift ยังคง = 0)
//   - ถ้าไม่มี bundle_price → สินค้าหลักใช้ default_price × qty
//
// ตัวอย่าง (มี bundle_price):
//   Main A (100) + Main B (200) + Gift C (50) → bundle 250
//   A ได้ = 250 × (100/300) = 83.33
//   B ได้ = 250 - 83.33 = 166.67
//   C ได้ = 0 (ของแถม)
//
// ตัวอย่าง (ไม่มี bundle_price):
//   Main A (100×2) + Gift C (50×1)
//   A ได้ = 100 × 2 = 200
//   C ได้ = 0
//
// Shopee mapping: add_on_deal (promotion_type=1, gift_with_min_spend)
// Shopee fields: purchase_min_spend, per_gift_num, purchase_limit

/**
 * Get components with allocated prices for buy_get_free.
 */
export function getBuyGetFreeComponents(
  items: PromotionItem[],
  bundlePrice: number | null,
): PromotionComponent[] {
  // If bundle_price is set, use proportional allocation (gifts still = 0)
  if (bundlePrice) {
    const allocations = allocateBundlePrice(
      bundlePrice,
      items.map(i => ({
        variation_id: i.variation_id || '',
        default_price: i.product_variations?.default_price || 0,
        quantity: i.quantity,
        role: i.role,
      })),
    );
    return items.map(i => {
      const defPrice = i.product_variations?.default_price || 0;
      const alloc = allocations.find(a => a.variation_id === (i.variation_id || ''));
      return {
        variation_id: i.variation_id || '',
        quantity: i.quantity,
        role: i.role,
        default_price: defPrice,
        allocated_price: alloc?.allocated_price ?? 0,
      };
    });
  }

  // No bundle price: main items use default_price × qty, gifts = 0
  return items.map(i => {
    const defPrice = i.product_variations?.default_price || 0;
    return {
      variation_id: i.variation_id || '',
      quantity: i.quantity,
      role: i.role,
      default_price: defPrice,
      allocated_price: i.role === 'gift' ? 0 : defPrice * i.quantity,
    };
  });
}

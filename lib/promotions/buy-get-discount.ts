import { PromotionComponent, PromotionItem } from './types';

// ─── Buy Get Discount (ซื้อคู่ลดราคา) ───────────────────
//
// Logic:
//   - สินค้าหลัก (role='main') ราคาปกติ
//   - สินค้าราคาพิเศษ (role='discounted') ใช้ special_price
//   - allocated_price = special_price × qty (สำหรับ discounted)
//   - allocated_price = default_price × qty (สำหรับ main)
//
// ตัวอย่าง:
//   Main A (100×1) + Discounted B (special_price=59, qty=1)
//   A ได้ = 100 × 1 = 100
//   B ได้ = 59 × 1 = 59
//   ยอดรวมโปร = 159 (แทน 100+80=180)
//
// Shopee mapping: add_on_deal (promotion_type=0, add_on_discount)

/**
 * Get components with allocated prices for buy_get_discount.
 */
export function getBuyGetDiscountComponents(
  items: PromotionItem[],
): PromotionComponent[] {
  return items.map(i => {
    const defPrice = i.product_variations?.default_price || 0;
    return {
      variation_id: i.variation_id || '',
      quantity: i.quantity,
      role: i.role,
      default_price: defPrice,
      allocated_price: i.role === 'discounted'
        ? (i.special_price ?? defPrice) * i.quantity
        : defPrice * i.quantity,
    };
  });
}

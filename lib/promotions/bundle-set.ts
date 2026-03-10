import { PromotionComponent, PromotionItem } from './types';

// ─── Bundle Set (เซ็ตรวม) ───────────────────────────────
//
// Logic:
//   - รวมสินค้า 2+ ตัว ขายเป็นเซ็ต
//   - ใช้ discount_type ('percent' | 'fixed_discount') + discount_value
//     - percent: ลดราคาแต่ละ item ตาม % → allocated_price = default_price × (1 - discount_value/100)
//     - fixed_discount: ลดเท่ากันทุก item → allocated_price = default_price - discount_value (min 0)
//   - ถ้ามี bundle_price (legacy) → แบ่งตามสัดส่วน default_price
//   - ถ้ามี gift (ของแถม) → allocated_price = 0
//
// ตัวอย่าง (percent 10%):
//   สินค้า A (100 บาท) + B (200 บาท)
//   A ได้ = 100 × 0.9 = 90 บาท
//   B ได้ = 200 × 0.9 = 180 บาท
//
// ตัวอย่าง (fixed_discount 50 บาท):
//   สินค้า A (100 บาท) + B (200 บาท)
//   A ได้ = 100 - 50 = 50 บาท
//   B ได้ = 200 - 50 = 150 บาท
//
// Shopee mapping: bundle_deal (rule_type 2=DISCOUNT_PERCENTAGE, 3=DISCOUNT_VALUE)

/**
 * Distribute bundle price proportionally by default_price.
 * Free gifts (role='gift') get allocated_price = 0.
 * Rounding error goes to the last non-gift component.
 */
export function allocateBundlePrice(
  bundlePrice: number,
  components: { variation_id: string; default_price: number; quantity: number; role: string }[],
): { variation_id: string; allocated_price: number }[] {
  const nonGifts = components.filter(c => c.role !== 'gift');
  const gifts = components.filter(c => c.role === 'gift');

  const totalDefault = nonGifts.reduce((sum, c) => sum + c.default_price * c.quantity, 0);

  if (totalDefault <= 0 || bundlePrice <= 0) {
    return components.map(c => ({
      variation_id: c.variation_id,
      allocated_price: 0,
    }));
  }

  let remaining = bundlePrice;
  const result: { variation_id: string; allocated_price: number }[] = [];

  for (let i = 0; i < nonGifts.length; i++) {
    const c = nonGifts[i];
    if (i === nonGifts.length - 1) {
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

  for (const g of gifts) {
    result.push({ variation_id: g.variation_id, allocated_price: 0 });
  }

  return result;
}

/**
 * Get components with allocated prices for bundle_set.
 * Supports both variation-level and product-level items.
 * Product-level items have variation_id=null, product_id set.
 *
 * @param discountType - 'percent' | 'fixed_discount' | null (null = legacy bundle_price mode)
 * @param discountValue - discount amount (% or baht)
 * @param bundlePrice - legacy bundle price (used only when discountType is null)
 */
export function getBundleSetComponents(
  items: PromotionItem[],
  bundlePrice: number,
  discountType?: string | null,
  discountValue?: number | null,
): PromotionComponent[] {
  const itemKey = (i: PromotionItem) => i.variation_id || i.product_id || '';
  const defaultPrice = (i: PromotionItem) => i.product_variations?.default_price || 0;

  // Discount-based pricing (new)
  if (discountType && discountValue && discountValue > 0) {
    return items.map(i => {
      const key = itemKey(i);
      const defPrice = defaultPrice(i);
      const isGift = i.role === 'gift';
      let allocated = 0;

      if (!isGift) {
        if (discountType === 'percent') {
          allocated = Math.round(defPrice * i.quantity * (1 - discountValue / 100) * 100) / 100;
        } else {
          // fixed_discount: ลดต่อชิ้น
          allocated = Math.max(0, Math.round((defPrice - discountValue) * i.quantity * 100) / 100);
        }
      }

      return {
        variation_id: key,
        product_id: i.product_id || undefined,
        quantity: i.quantity,
        role: i.role,
        default_price: defPrice,
        allocated_price: allocated,
      };
    });
  }

  // Legacy: bundle_price proportional allocation
  const allocations = allocateBundlePrice(
    bundlePrice,
    items.map(i => ({
      variation_id: itemKey(i),
      default_price: defaultPrice(i),
      quantity: i.quantity,
      role: i.role,
    })),
  );

  return items.map(i => {
    const key = itemKey(i);
    const alloc = allocations.find(a => a.variation_id === key);
    return {
      variation_id: key,
      product_id: i.product_id || undefined,
      quantity: i.quantity,
      role: i.role,
      default_price: defaultPrice(i),
      allocated_price: alloc?.allocated_price ?? 0,
    };
  });
}

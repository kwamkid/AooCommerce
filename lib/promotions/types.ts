// ─── Shared Promotion Types ──────────────────────────────

export interface PromotionComponent {
  variation_id: string;
  product_id?: string;
  quantity: number;
  role: string;
  default_price: number;
  allocated_price: number;
}

export interface PromotionItem {
  variation_id: string | null;
  product_id?: string | null;
  role: string;
  quantity: number;
  special_price: number | null;
  product_variations: {
    default_price: number;
  } | null;
}

export interface PromotionTier {
  min_qty: number;
  discount_type: 'percent' | 'fixed_discount' | 'fixed_price';
  discount_value: number;
}

export interface PromotionHeader {
  id: string;
  promotion_type: string;
  bundle_price: number | null;
}

export type PromotionType = 'bundle_set' | 'buy_get_free' | 'buy_get_discount' | 'qty_discount';

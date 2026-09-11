/**
 * Composite products (สินค้าชุด) — shapes shared by the product edit GET
 * (`/api/products/[id]`), the form and the composite editor. Type-only (client-safe).
 */
import type { CompositeSlot } from '@/lib/composite-shared';

/** One pickable option (a variation) of a component product */
export interface ComponentOption {
  variation_id: string;
  /** Option label — variation label, or the product name for a simple product */
  label: string;
  sku: string | null;
  default_price: number;
  discount_price: number | null;
  /** variation, its product and not soft-deleted */
  is_active: boolean;
  image_url: string | null;
}

/** A product that can fill a slot, with every option it has */
export interface ComponentProduct {
  product_id: string;
  name: string;
  code: string | null;
  image_url: string | null;
  is_simple: boolean;
  is_composite: boolean;
  is_active: boolean;
  options: ComponentOption[];
}

/** A combo that already exists as a product_variations row */
export interface SavedCombo {
  /** empty when the data came from a duplicated product */
  variation_id?: string;
  /** comboKey() of its component variation ids */
  key: string;
  variation_label: string;
  sku: string | null;
  barcode: string | null;
  is_active: boolean;
  price_locked: boolean;
  default_price: number;
  discount_price: number;
  components: { variation_id: string; quantity: number }[];
  /** sets on hand (all warehouses) */
  quantity: number | null;
  /** sets sellable now (on hand − reserved) */
  available: number | null;
}

/** Extra fields the edit GET returns for a composite product */
export interface CompositeProductData {
  is_composite?: boolean;
  composite_slots?: CompositeSlot[] | null;
  composite_combos?: SavedCombo[];
  /** keyed by product_id — every slot product with all its options */
  composite_options?: Record<string, ComponentProduct>;
}

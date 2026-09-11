// Path: components/products/form/types.ts
//
// Shared types of the redesigned product form (ProductFormCard + VariantOptionsEditor).
// Same shapes as ProductForm's local ProductFormData / VariationFormData so the real form
// can switch over without a data migration.

export type ProductType = 'simple' | 'variation' | 'composite';

export interface CategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
  children?: CategoryOption[];
}

export interface BrandOption {
  id: string;
  name: string;
  supplier?: { id: string; name: string; supplier_type: string } | null;
}

/** Company master data "ประเภทตัวเลือก" (GET /api/products/form-options → variation_types) */
export interface VariationTypeOption {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

/** One variation row — VariationFormData + read-only sellable stock */
export interface VariantRow {
  id?: string;
  _tempId: string;
  variation_label: string;
  sku: string;
  barcode: string;
  /** keyed by variation type NAME */
  attributes: Record<string, string>;
  default_price: number;
  discount_price: number;
  cost_price: number;
  is_active: boolean;
  /** sellable stock (Σ available across warehouses) — edit mode only, never sent */
  available?: number;
}

/** One option of a variation product: the type (สี) + its values (แดง/ดำ/ขาว) */
export interface OptionGroup {
  /** variation type id ('' = not picked yet) */
  typeId: string;
  /** variation type name = the key in VariantRow.attributes */
  name: string;
  values: string[];
}

export interface ProductFormValues {
  code: string;
  name: string;
  description: string;
  image: string;
  category_id?: string;
  brand_id?: string;
  product_type: ProductType;
  is_active: boolean;
  selected_variation_types: string[];
  variation_label: string;
  sku: string;
  barcode: string;
  default_price: number;
  discount_price: number;
  cost_price: number;
  variations: VariantRow[];
}

/** key = field path: "name", "default_price", "variation.0.price", "group.1.values" … */
export type FieldErrors = Record<string, string>;

export interface ProductFormFeatures {
  product_brand: boolean;
  supplier: boolean;
  stock: boolean;
}

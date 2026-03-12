// ===== Shared product display helpers =====
// Generic — works with any data shape across the entire app.
// For display: productDisplayName, productSubtitle, cleanVariationLabel

export interface ProductDisplayFields {
  product_name?: string | null;
  product_code?: string | null;
  variation_label?: string | null;
  sku?: string | null;
  barcode?: string | null;
  attributes?: Record<string, string> | null;
}

/** Clean variation label — skip barcode, product code, pure digits */
export function cleanVariationLabel(f: ProductDisplayFields): string {
  if (f.attributes && Object.keys(f.attributes).length > 0) {
    const attrParts: string[] = [];
    Object.values(f.attributes).forEach(v => { if (v?.trim()) attrParts.push(v.trim()); });
    if (attrParts.length > 0) return attrParts.join(' / ');
  }
  const raw = f.variation_label || '';
  if (!raw || raw === f.product_code || raw === f.barcode || raw === f.sku || /^\d+$/.test(raw)) return '';
  return raw;
}

/**
 * Product display name:
 *   simple product  → "Product Name"
 *   variation product → "Product Name - Variation Label"
 */
export function productDisplayName(f: ProductDisplayFields): string {
  const varLabel = cleanVariationLabel(f);
  const name = f.product_name || '-';
  if (varLabel) return `${name} - ${varLabel}`;
  return name;
}

/** Subtitle: product_code | SKU: xxx (de-duped) */
export function productSubtitle(f: ProductDisplayFields): string {
  const parts: string[] = [];
  if (f.product_code) parts.push(f.product_code);
  if (f.sku && f.sku !== f.product_code && f.sku !== f.barcode) parts.push(`SKU: ${f.sku}`);
  return parts.join(' | ');
}

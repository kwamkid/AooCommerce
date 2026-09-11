/**
 * Composite products (สินค้าชุด) in the bulk Excel files — client-safe cell format.
 *
 * Column "ส่วนประกอบ (สินค้าชุด)": one row = one combo. Tokens are joined by " + ",
 * each token is `REF` or `REF×N` (×1 may be omitted; `*`, and `x`/`X` after a space,
 * are accepted too). REF resolves in order: component SKU → `รหัสสินค้า/ตัวเลือก` →
 * product code of a simple product (server side: lib/bulk/composite-import.ts).
 */

export const COMPOSITE_COLUMN_HEADER = 'ส่วนประกอบ (สินค้าชุด)';
export const COMPOSITE_COLUMN_ALIASES = [COMPOSITE_COLUMN_HEADER, 'ส่วนประกอบ', 'components'];
export const PRICE_LOCKED_HEADER = 'ราคาตั้งเอง';
export const PRICE_LOCKED_YES = 'ใช่';
export const COMPOSITE_TYPE_LABEL = 'สินค้าชุด';

export interface ComponentToken {
  ref: string;
  quantity: number;
}

function splitQuantity(token: string): { ref: string; qtyText: string | null } {
  const m = token.match(/^(.+?)\s*[×*]\s*([\d.]+)$/) || token.match(/^(.+?)\s+[xX]\s*([\d.]+)$/);
  return m ? { ref: m[1].trim(), qtyText: m[2] } : { ref: token, qtyText: null };
}

/** "MUG-WHT + TS-WM×2" → tokens · empty cell → no tokens · error = Thai message. */
export function parseComponentCell(text: string): { tokens: ComponentToken[]; error: string | null } {
  const raw = (text || '').trim();
  if (!raw) return { tokens: [], error: null };
  const tokens: ComponentToken[] = [];
  for (const part of raw.split('+')) {
    const token = part.trim();
    if (!token) return { tokens: [], error: `ส่วนประกอบ "${raw}" ไม่ครบ — ใส่แบบ SKU1 + SKU2` };
    const { ref, qtyText } = splitQuantity(token);
    const quantity = qtyText == null ? 1 : Number(qtyText);
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { tokens: [], error: `จำนวนของ "${ref}" ต้องเป็นจำนวนเต็มตั้งแต่ 1` };
    }
    tokens.push({ ref, quantity });
  }
  return { tokens, error: null };
}

export interface ComponentRefSource {
  sku: string | null;
  product_code: string | null;
  product_name: string;
  variation_label: string | null;
  is_simple: boolean;
}

/** How a component is written in the file: SKU when it round-trips, else CODE/ตัวเลือก or CODE. */
export function componentRefOf(c: ComponentRefSource): string {
  const sku = c.sku?.trim() || '';
  const parsesBack = sku && !/[+×*]/.test(sku) && !/\s[xX]\s*[\d.]+$/.test(sku);
  if (parsesBack) return sku;
  const code = c.product_code?.trim() || '';
  if (!code) return sku || c.product_name;
  if (c.is_simple) return code;
  const label = (c.variation_label || '').trim();
  return label ? `${code}/${label}` : code;
}

export function formatComponentCell(parts: ComponentToken[]): string {
  return parts.map(p => (p.quantity > 1 ? `${p.ref}×${p.quantity}` : p.ref)).join(' + ');
}

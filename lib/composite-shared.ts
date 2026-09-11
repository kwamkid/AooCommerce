/**
 * Composite products (สินค้าชุด) — client-safe helpers shared by the product form,
 * `/api/products` and the Excel importer.
 *
 * A composite product's variations are "combos": one pick from every slot
 * (e.g. frame colour × seat-fabric colour). A combo holds no stock — stock lives on
 * the component variations, and lib/stock-service.ts fans every sold-stock op out to them.
 */

export interface CompositeSlot {
  /** Stable id of the slot within the product */
  key: string;
  /** Slot name shown to staff, e.g. "โครงรถเข็น" — also the attribute name of the combo */
  name: string;
  /** Product the options come from */
  product_id: string;
  /** Allowed options (component variation ids) */
  variation_ids: string[];
  /** Pieces of the picked option in one set */
  quantity: number;
}

export interface ComboPick {
  slot_key: string;
  variation_id: string;
  quantity: number;
}

export const MAX_COMPOSITE_COMBOS = 200;

/** Every combo the slots produce (cartesian product), picks in slot order. */
export function buildCombos(slots: CompositeSlot[]): ComboPick[][] {
  if (slots.length === 0) return [];
  return slots.reduce<ComboPick[][]>(
    (acc, slot) => acc.flatMap(combo =>
      slot.variation_ids.map(id => [...combo, { slot_key: slot.key, variation_id: id, quantity: slot.quantity }]),
    ),
    [[]],
  );
}

/** Components of one combo — the same variation picked in two slots is merged. */
export function comboComponents(picks: ComboPick[]): { variation_id: string; quantity: number }[] {
  const merged = new Map<string, number>();
  for (const p of picks) merged.set(p.variation_id, (merged.get(p.variation_id) || 0) + p.quantity);
  return [...merged].map(([variation_id, quantity]) => ({ variation_id, quantity }));
}

/** Identity of a combo = its set of component variations (order-independent). */
export function comboKey(componentVariationIds: string[]): string {
  return [...new Set(componentVariationIds)].sort().join('+');
}

/** "ดำ / แดง" — a pick with more than one piece gets "×n". */
export function comboLabel(parts: { label: string; quantity: number }[]): string {
  return parts.map(p => (p.quantity > 1 ? `${p.label} ×${p.quantity}` : p.label)).join(' / ');
}

/**
 * Price of a combo from its components — preview only; the DB function
 * `recompute_composite_prices()` is authoritative (keep both formulas identical):
 * default = Σ default × qty · discount = Σ selling price × qty when any component is discounted
 * (0 = no discount, and it must stay below default).
 */
export function comboPrice(parts: { default_price: number; discount_price: number | null; quantity: number }[]): {
  default_price: number;
  discount_price: number;
} {
  let def = 0;
  let eff = 0;
  let hasDiscount = false;
  for (const p of parts) {
    const d = Number(p.default_price) || 0;
    const disc = Number(p.discount_price) || 0;
    def += d * p.quantity;
    eff += (disc > 0 ? disc : d) * p.quantity;
    if (disc > 0) hasDiscount = true;
  }
  return { default_price: def, discount_price: hasDiscount && eff < def ? eff : 0 };
}

/** Thai error message, or null when the slots are valid. */
export function validateCompositeSlots(slots: CompositeSlot[]): string | null {
  if (slots.length === 0) return 'เพิ่มส่วนประกอบอย่างน้อย 1 ช่อง';
  const names = new Set<string>();
  for (const s of slots) {
    const name = s.name.trim();
    if (!name) return 'ตั้งชื่อช่องประกอบให้ครบ';
    if (names.has(name)) return `ชื่อช่อง "${name}" ซ้ำกัน`;
    names.add(name);
    if (!s.product_id) return `ช่อง "${name}" ยังไม่ได้เลือกสินค้า`;
    if (s.variation_ids.length === 0) return `ช่อง "${name}" ต้องเลือกอย่างน้อย 1 ตัวเลือก`;
    if (!Number.isInteger(s.quantity) || s.quantity < 1) return `จำนวนต่อชุดของช่อง "${name}" ต้องเป็นจำนวนเต็มตั้งแต่ 1`;
  }
  const pieces = slots.reduce((n, s) => n + s.quantity, 0);
  if (pieces < 2) return 'สินค้าชุดต้องมีของอย่างน้อย 2 ชิ้นต่อชุด (2 ช่อง หรือจำนวนต่อชุดมากกว่า 1)';
  const combos = slots.reduce((n, s) => n * s.variation_ids.length, 1);
  if (combos > MAX_COMPOSITE_COMBOS) return `ชุดย่อยรวม ${combos} แบบ เกินที่รองรับ (${MAX_COMPOSITE_COMBOS})`;
  return null;
}

/**
 * Order line whose sub-rows are the parts of a composite set, not a promotion —
 * the order_items trigger fills `promotion_components` (role 'component') for combo lines
 * without a promotion. Displays show "ชุดประกอบ" and no per-part price (the set price is on the line).
 * Only the missing promotion_id tells them apart — bundle_set promotions use role 'component' too.
 */
export function isCompositeLine(line: {
  promotion_id?: string | null;
  promotion_components?: { role?: string | null }[] | null;
}): boolean {
  const comps = line.promotion_components;
  if (!comps || comps.length === 0) return false;
  return !line.promotion_id;
}

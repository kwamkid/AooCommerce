// Path: lib/product-variants.ts
//
// Pure logic of the Shopee-style variation editor (no React · client-safe · unit-testable).
// The user edits OPTION GROUPS (สี = แดง/ดำ/ขาว · ขนาด = S/M) and the rows of the table are
// derived from them by `regenerateRows()`.
//
// regenerateRows rules — chosen so the few products that are NOT a full grid of their values
// (5 of 100 in real data) keep exactly the rows they have:
//   • value removed from a group   → drop every row having that value
//   • value added to a group       → add every combination containing the new value
//                                    (cartesian over the other groups' current values), skip existing
//   • group added / first value    → every existing row gets the group's FIRST value, then each
//                                    existing row is copied once per other value of the new group
//   • group removed / last value   → drop that attribute, then de-duplicate rows by combo
//                                    (keep the first, prefer a saved row = has `id`)
//   • option type switched in place (สี → ลาย, same values) → attribute key renamed, rows kept
//   • value renamed in place (same count, same position, programmatic) → rows keep id/prices;
//     ChipsInput has no chip editing, so a user "rename" is remove + add (old rows dropped)
//   • nothing left with values     → no rows · rows empty but values exist → full cartesian
// Rows whose combo is unaffected keep their object identity (prices/ids/SKU untouched); only
// `variation_label` is recomputed (values joined ' / ' in group order). Result is ordered by
// the groups' value order (grid order, like the generated table).

import type { FieldErrors, OptionGroup } from '@/components/products/form/types';

export const MAX_OPTION_GROUPS = 2;
export const MAX_OPTION_VALUES = 50;
export const MAX_VARIANT_ROWS = 200;
export const MSG_TOO_MANY_GROUPS = `เพิ่มได้สูงสุด ${MAX_OPTION_GROUPS} ตัวเลือก`;
export const MSG_TOO_MANY_VALUES = `ตัวเลือกละไม่เกิน ${MAX_OPTION_VALUES} ค่า`;
export const MSG_TOO_MANY_ROWS = `ตัวเลือกรวมเกิน ${MAX_VARIANT_ROWS} แบบ`;

/** Minimal row shape the helpers need — VariantRow satisfies it */
export interface VariantRowCore {
  id?: string;
  _tempId: string;
  variation_label: string;
  sku: string;
  barcode: string;
  attributes: Record<string, string>;
  default_price: number;
  discount_price: number;
  cost_price: number;
  is_active: boolean;
}

type Attrs = Record<string, string>;

const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase();

/** Lowercase trimmed values of `groupNames` joined by '|' — identity of a row */
export function comboKey(attrs: Attrs, groupNames: string[]): string {
  return groupNames.map(n => norm(attrs[n])).join('|');
}

/** Trim, drop empty, de-duplicate case-insensitively (keeps the first spelling) */
export function normalizeValues(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

const isActive = (g: OptionGroup) => !!g.name && g.values.length > 0;

/** Groups that produce rows (type picked + at least one value), values normalized */
export function activeGroups(groups: OptionGroup[]): OptionGroup[] {
  return groups
    .map(g => ({ ...g, values: normalizeValues(g.values) }))
    .filter(isActive);
}

export function activeGroupNames(groups: OptionGroup[]): string[] {
  return activeGroups(groups).map(g => g.name);
}

/** "แดง / S" — values in group order */
export function buildVariantLabel(attrs: Attrs, groupNames: string[]): string {
  return groupNames.map(n => (attrs[n] || '').trim()).filter(Boolean).join(' / ');
}

/**
 * Option groups of an existing product, values in order of first appearance.
 * Needs the type ids too (OptionGroup.typeId) — pass the product's selected variation types in order.
 */
export function groupsFromRows(
  rows: Pick<VariantRowCore, 'attributes'>[],
  types: { id: string; name: string }[],
): OptionGroup[] {
  return types.map(t => ({
    typeId: t.id,
    name: t.name,
    values: normalizeValues(rows.map(r => r.attributes[t.name] || '')),
  }));
}

function cartesian(lists: { name: string; values: string[] }[]): Attrs[] {
  let out: Attrs[] = [{}];
  for (const l of lists) {
    const next: Attrs[] = [];
    for (const partial of out) for (const v of l.values) next.push({ ...partial, [l.name]: v });
    out = next;
  }
  return out;
}

export interface RegenerateResult<R> {
  rows: R[];
  /** input rows that are not in `rows` any more (saved ones need a confirm) */
  dropped: R[];
  /** set = change refused (limits) · `rows` is then the input unchanged */
  error?: string;
}

/**
 * Rows for `nextGroups`, derived from the current `rows` (see rules at the top of the file).
 * `makeRow(attributes, template?)` creates a new row — `template` is a sibling row (same values
 * in the other groups) when one exists, so the caller may copy its prices.
 */
export function regenerateRows<R extends VariantRowCore>(
  prevGroups: OptionGroup[],
  nextGroups: OptionGroup[],
  rows: R[],
  makeRow: (attributes: Attrs, template?: R) => R,
): RegenerateResult<R> {
  const fail = (error: string): RegenerateResult<R> => ({ rows, dropped: [], error });
  if (nextGroups.length > MAX_OPTION_GROUPS) return fail(MSG_TOO_MANY_GROUPS);

  const prev = prevGroups.map(g => ({ ...g, values: normalizeValues(g.values) }));
  const next = nextGroups.map(g => ({ ...g, values: normalizeValues(g.values) }));
  if (next.some(g => g.values.length > MAX_OPTION_VALUES)) return fail(MSG_TOO_MANY_VALUES);

  // ── 1. pair next groups with prev groups: same type id first, leftovers by order (= type switched in place)
  const usedPrev = new Set<number>();
  const pairOf: (number | null)[] = next.map(n => {
    if (!n.typeId) return null;
    const i = prev.findIndex((p, idx) => !usedPrev.has(idx) && p.typeId === n.typeId);
    if (i < 0) return null;
    usedPrev.add(i);
    return i;
  });
  const leftoverPrev = prev.map((_, i) => i).filter(i => !usedPrev.has(i));
  pairOf.forEach((p, j) => {
    if (p === null && leftoverPrev.length > 0) {
      const i = leftoverPrev.shift()!;
      usedPrev.add(i);
      pairOf[j] = i;
    }
  });

  let work: R[] = [...rows];
  const setAttrs = (r: R, attrs: Attrs): R => ({ ...r, attributes: attrs });

  // Groups that stop producing rows (removed, or their last value removed)
  const removedNames: string[] = prev
    .filter((p, i) => isActive(p) && !usedPrev.has(i))
    .map(p => p.name);
  // Groups active before AND after — value diff applies; names after rename
  const surviving: { j: number; added: string[] }[] = [];
  // Groups that start producing rows now (added, or first value typed)
  const activated: number[] = [];

  next.forEach((n, j) => {
    const i = pairOf[j];
    const p = i === null ? null : prev[i];
    const was = !!p && isActive(p);
    const now = isActive(n);
    if (was && !now) { removedNames.push(p!.name); return; }
    if (!was && now) { activated.push(j); return; }
    if (!was || !now) return;

    // ── 2. rename the attribute key when the type was switched in place
    if (p!.name !== n.name) {
      work = work.map(r => {
        if (!(p!.name in r.attributes)) return r;
        const { [p!.name]: value, ...rest } = r.attributes;
        return setAttrs(r, { ...rest, [n.name]: value });
      });
    }

    // ── 3. in-place value renames (same count, same position)
    const pv = p!.values;
    const nv = n.values;
    const pvNorm = pv.map(norm);
    const nvNorm = nv.map(norm);
    const renames = new Map<string, string>();
    if (pv.length === nv.length) {
      for (let k = 0; k < pv.length; k++) {
        if (pv[k] === nv[k]) continue;
        const caseOnly = pvNorm[k] === nvNorm[k];
        if (caseOnly || (!nvNorm.includes(pvNorm[k]) && !pvNorm.includes(nvNorm[k]))) renames.set(pvNorm[k], nv[k]);
      }
    }
    if (renames.size > 0) {
      work = work.map(r => {
        const to = renames.get(norm(r.attributes[n.name]));
        return to === undefined ? r : setAttrs(r, { ...r.attributes, [n.name]: to });
      });
    }
    const before = new Set(pvNorm.map(v => (renames.has(v) ? norm(renames.get(v)) : v)));

    // ── 4. value removed → drop rows having it
    const after = new Set(nvNorm);
    const removed = [...before].filter(v => !after.has(v));
    if (removed.length > 0) work = work.filter(r => !removed.includes(norm(r.attributes[n.name])));

    surviving.push({ j, added: nv.filter(v => !before.has(norm(v))) });
  });

  // ── 5. group removed → drop the attribute, de-duplicate by the remaining combo (prefer saved rows)
  if (removedNames.length > 0) {
    const keepNames = surviving.map(s => next[s.j].name);
    work = work.map(r => {
      if (!removedNames.some(n => n in r.attributes)) return r;
      const attrs = { ...r.attributes };
      for (const n of removedNames) delete attrs[n];
      return setAttrs(r, attrs);
    });
    const slot = new Map<string, number>();
    const deduped: R[] = [];
    for (const r of work) {
      const key = comboKey(r.attributes, keepNames);
      const at = slot.get(key);
      if (at === undefined) { slot.set(key, deduped.length); deduped.push(r); }
      else if (!deduped[at].id && r.id) deduped[at] = r;
    }
    work = deduped;
  }

  const namesSoFar = surviving.map(s => next[s.j].name);

  // ── 6. group added → existing rows get the first value, then one copy per other value
  for (const j of activated) {
    const g = next[j];
    if (work.length === 0) { namesSoFar.push(g.name); continue; } // handled by the cartesian fallback
    const base = work.map(r => setAttrs(r, { ...r.attributes, [g.name]: g.values[0] }));
    const names = [...namesSoFar, g.name];
    const seen = new Set(base.map(r => comboKey(r.attributes, names)));
    const extra: R[] = [];
    for (const v of g.values.slice(1)) {
      for (const r of base) {
        const attrs = { ...r.attributes, [g.name]: v };
        const key = comboKey(attrs, names);
        if (seen.has(key)) continue;
        seen.add(key);
        extra.push(makeRow(attrs, r));
      }
    }
    work = [...base, ...extra];
    namesSoFar.push(g.name);
  }

  const finalGroups = activeGroups(next);
  const finalNames = finalGroups.map(g => g.name);

  // ── 7. value added → every combination containing it (cartesian over the other groups)
  if (work.length > 0) {
    const seen = new Set(work.map(r => comboKey(r.attributes, finalNames)));
    for (const { j, added } of surviving) {
      if (added.length === 0) continue;
      const g = next[j];
      const others = finalGroups.filter(o => o.name !== g.name);
      for (const v of added) {
        for (const partial of cartesian(others)) {
          const attrs = { ...partial, [g.name]: v };
          const key = comboKey(attrs, finalNames);
          if (seen.has(key)) continue;
          seen.add(key);
          const template = work.find(r => others.every(o => norm(r.attributes[o.name]) === norm(partial[o.name])));
          work.push(makeRow(attrs, template));
        }
      }
    }
  }

  // ── 8. fallbacks: no option with values → no rows · values but no rows → full grid
  if (finalGroups.length === 0) work = [];
  else if (work.length === 0) work = cartesian(finalGroups).map(attrs => makeRow(attrs));

  if (work.length > MAX_VARIANT_ROWS) return fail(MSG_TOO_MANY_ROWS);

  // ── 9. labels + grid order (stable)
  const rank = (r: R) => finalGroups.map(g => {
    const k = g.values.findIndex(v => norm(v) === norm(r.attributes[g.name]));
    return k < 0 ? Number.MAX_SAFE_INTEGER : k;
  });
  const ranked = work.map((r, idx) => ({ r, idx, key: rank(r) }));
  ranked.sort((a, b) => {
    for (let k = 0; k < a.key.length; k++) if (a.key[k] !== b.key[k]) return a.key[k] - b.key[k];
    return a.idx - b.idx;
  });
  const result = ranked.map(({ r }) => {
    const label = buildVariantLabel(r.attributes, finalNames);
    return label === r.variation_label ? r : { ...r, variation_label: label };
  });

  const kept = new Set(result.map(r => r._tempId));
  return { rows: result, dropped: rows.filter(r => !kept.has(r._tempId)) };
}

type BulkPatch = Partial<Pick<VariantRowCore, 'default_price' | 'discount_price' | 'cost_price' | 'is_active'>>;

/** Bulk fill — only the fields present in `patch` */
export function applyToAll<R extends VariantRowCore>(rows: R[], patch: BulkPatch): R[] {
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as BulkPatch;
  if (Object.keys(defined).length === 0) return rows;
  return rows.map(r => ({ ...r, ...defined }));
}

/** Option-group errors: `group.<i>.name` (type not picked) · `group.<i>.values` (no value) */
export function validateOptionGroups(groups: OptionGroup[]): FieldErrors {
  const errors: FieldErrors = {};
  if (groups.length === 0) errors['group.0.name'] = 'กรุณาเลือกชื่อตัวเลือก';
  groups.forEach((g, i) => {
    if (!g.typeId) errors[`group.${i}.name`] = 'กรุณาเลือกชื่อตัวเลือก';
    else if (normalizeValues(g.values).length === 0) errors[`group.${i}.values`] = 'ใส่ค่าอย่างน้อย 1 ค่า';
  });
  return errors;
}

/**
 * Row errors, keys `variation.<index>.<field>` (price · discount · sku · barcode · attribute name)
 * + `variations_empty`. Same rules as ProductForm.validate().
 */
export function validateVariantRows(rows: VariantRowCore[], groupNames: string[]): FieldErrors {
  const errors: FieldErrors = {};
  if (rows.length === 0) errors.variations_empty = 'ใส่ค่าของตัวเลือกอย่างน้อย 1 ค่า';

  rows.forEach((v, i) => {
    for (const name of groupNames) {
      if (!v.attributes[name]?.trim()) errors[`variation.${i}.${name}`] = 'กรุณากรอก';
    }
    if (!(v.default_price > 0)) errors[`variation.${i}.price`] = 'ต้องมากกว่า 0';
    if (v.discount_price > 0 && v.discount_price >= v.default_price) {
      errors[`variation.${i}.discount`] = 'ราคาขายต้องน้อยกว่าราคาปกติ';
    }
  });

  const dupCheck = (value: (v: VariantRowCore) => string, errorKey: (i: number) => string, message: (n: number) => string) => {
    const seen = new Map<string, number>();
    rows.forEach((v, i) => {
      const key = value(v);
      if (!key) return;
      const first = seen.get(key);
      if (first === undefined) seen.set(key, i);
      else if (!errors[errorKey(i)]) errors[errorKey(i)] = message(first + 1);
    });
  };
  if (groupNames.length > 0) {
    dupCheck(
      v => (groupNames.some(n => norm(v.attributes[n])) ? comboKey(v.attributes, groupNames) : ''),
      i => `variation.${i}.${groupNames[0]}`,
      n => `ตัวเลือกซ้ำกับแถว ${n}`,
    );
  }
  dupCheck(v => norm(v.sku), i => `variation.${i}.sku`, n => `SKU ซ้ำกับแถว ${n}`);
  dupCheck(v => norm(v.barcode), i => `variation.${i}.barcode`, n => `บาร์โค้ดซ้ำกับแถว ${n}`);

  return errors;
}

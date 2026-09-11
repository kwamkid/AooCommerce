'use client';

/**
 * State of the composite-product editor (สินค้าชุด) — slots, the combo rows they produce,
 * per-row settings and the payload for `/api/products` (POST/PUT `composite_slots` +
 * `composite_combos`). Price/label/key formulas come from lib/composite-shared.ts.
 */
import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import {
  buildCombos,
  comboComponents,
  comboKey,
  comboLabel,
  comboPrice,
  validateCompositeSlots,
  MAX_COMPOSITE_COMBOS,
  type ComboPick,
  type CompositeSlot,
} from '@/lib/composite-shared';
import type { ComboInput } from '@/lib/composite-save';
import type { ComponentOption, ComponentProduct, CompositeProductData, SavedCombo } from './types';

export interface ComboRowSetting {
  is_active: boolean;
  price_locked: boolean;
  default_price: number;
  discount_price: number;
  sku: string;
}

export interface ComboRow {
  key: string;
  label: string;
  picks: ComboPick[];
  /** saved combo with the same component set (null = new) */
  saved: SavedCombo | null;
  /** already a product_variations row */
  exists: boolean;
  /** price from the components (what an unlocked row charges) */
  autoPrice: { default_price: number; discount_price: number };
  /** "SKU+SKU" the server fills for a new row left empty */
  autoSku: string;
  /** one of its component options is closed */
  hasInactivePart: boolean;
  setting: ComboRowSetting;
  /** price the row will actually carry */
  price: { default_price: number; discount_price: number };
  errors: { price?: string; sku?: string };
}

type Source = (CompositeProductData & { product_id?: string }) | null | undefined;

const emptySlot = (): CompositeSlot => ({
  key: crypto.randomUUID(),
  name: '',
  product_id: '',
  variation_ids: [],
  quantity: 1,
});

export function useCompositeEditor(source: Source) {
  // Snapshot of what was loaded — defaults for rows are derived from it
  const [initial] = useState(() => {
    const slots = source?.composite_slots ?? [];
    return {
      isEditing: !!source?.product_id && !!source?.is_composite,
      selfProductId: source?.product_id || '',
      slots,
      savedByKey: new Map((source?.composite_combos ?? []).map(c => [c.key, c])),
      slotOptionIds: new Map(slots.map(s => [s.key, new Set(s.variation_ids)])),
    };
  });

  const [slots, setSlots] = useState<CompositeSlot[]>(() =>
    initial.slots.length > 0 ? initial.slots.map(s => ({ ...s, variation_ids: [...s.variation_ids] })) : [emptySlot()],
  );
  const [products, setProducts] = useState<Record<string, ComponentProduct>>(() => source?.composite_options ?? {});
  const [overrides, setOverrides] = useState<Record<string, Partial<ComboRowSetting>>>({});
  const [advanced, setAdvancedState] = useState(() => [...initial.savedByKey.values()].some(c => c.price_locked));
  const [loadingSlots, setLoadingSlots] = useState<Record<string, boolean>>({});
  const [pickErrors, setPickErrors] = useState<Record<string, string>>({});
  const [compositeIds, setCompositeIds] = useState<Set<string>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);

  const optionById = useMemo(() => {
    const map = new Map<string, ComponentOption>();
    for (const p of Object.values(products)) for (const o of p.options) map.set(o.variation_id, o);
    return map;
  }, [products]);

  const allPicked = slots.length > 0 && slots.every(s => !!s.product_id);
  const comboCount = slots.reduce((n, s) => n * s.variation_ids.length, 1);
  const slotError = validateCompositeSlots(slots);

  const rows = useMemo<ComboRow[]>(() => {
    if (!allPicked || comboCount === 0 || comboCount > MAX_COMPOSITE_COMBOS) return [];
    const built = buildCombos(slots).map((picks): ComboRow => {
      const components = comboComponents(picks);
      const key = comboKey(components.map(c => c.variation_id));
      const saved = initial.savedByKey.get(key) ?? null;
      const opts = picks.map(p => optionById.get(p.variation_id));
      const autoPrice = comboPrice(components.map(c => {
        const o = optionById.get(c.variation_id);
        return { default_price: o?.default_price ?? 0, discount_price: o?.discount_price ?? null, quantity: c.quantity };
      }));
      const skus = opts.map(o => o?.sku);
      const hasNewOption = picks.some(p => !initial.slotOptionIds.get(p.slot_key)?.has(p.variation_id));
      const base: ComboRowSetting = {
        is_active: saved ? saved.is_active : !initial.isEditing || hasNewOption,
        price_locked: saved?.price_locked ?? false,
        default_price: saved?.price_locked ? saved.default_price : autoPrice.default_price,
        discount_price: saved?.price_locked ? saved.discount_price : autoPrice.discount_price,
        sku: saved?.sku ?? '',
      };
      const setting = { ...base, ...overrides[key] };
      return {
        key,
        label: comboLabel(picks.map((p, i) => ({ label: opts[i]?.label ?? '…', quantity: p.quantity }))),
        picks,
        saved,
        exists: !!saved?.variation_id,
        autoPrice,
        autoSku: skus.every(Boolean) ? skus.join('+') : '',
        hasInactivePart: opts.some(o => !!o && !o.is_active),
        setting,
        price: setting.price_locked
          ? { default_price: setting.default_price, discount_price: setting.discount_price }
          : autoPrice,
        errors: {},
      };
    });

    const skuSeen = new Set<string>();
    for (const r of built) {
      if (r.setting.price_locked) {
        const { default_price: def, discount_price: disc } = r.setting;
        if (def <= 0) r.errors.price = 'กรอกราคาปกติ';
        else if (disc > 0 && disc >= def) r.errors.price = 'ราคาขายต้องน้อยกว่าราคาปกติ';
      }
      const sku = r.setting.sku.trim().toLowerCase();
      if (sku) {
        if (skuSeen.has(sku)) r.errors.sku = 'SKU ซ้ำกับชุดย่อยอื่น';
        skuSeen.add(sku);
      }
    }
    return built;
  }, [allPicked, comboCount, slots, optionById, overrides, initial]);

  const isLoading = Object.values(loadingSlots).some(Boolean);
  /** Problem with the slots themselves (shown under the slot list) */
  const generalError = isLoading
    ? 'รอโหลดตัวเลือกของสินค้าให้เสร็จก่อน'
    : slotError ?? (rows.length === 0 ? 'สินค้าชุดต้องมีชุดย่อยอย่างน้อย 1 แบบ' : null);
  const firstRowError = rows.find(r => r.errors.price || r.errors.sku);

  // ── slots ──
  const updateSlot = (key: string, patch: Partial<CompositeSlot>) =>
    setSlots(prev => prev.map(s => (s.key === key ? { ...s, ...patch } : s)));
  const addSlot = () => setSlots(prev => [...prev, emptySlot()]);
  const removeSlot = (key: string) => setSlots(prev => prev.filter(s => s.key !== key));

  /** Keep a slot's options in the product's own order (stable combo order) */
  const orderIds = (productId: string, ids: Set<string>) => {
    const ordered = (products[productId]?.options ?? []).map(o => o.variation_id).filter(id => ids.has(id));
    return [...ordered, ...[...ids].filter(id => !ordered.includes(id))];
  };

  const toggleOption = (slotKey: string, variationId: string) =>
    setSlots(prev => prev.map(s => {
      if (s.key !== slotKey) return s;
      const ids = new Set(s.variation_ids);
      if (ids.has(variationId)) ids.delete(variationId);
      else ids.add(variationId);
      return { ...s, variation_ids: orderIds(s.product_id, ids) };
    }));

  const setAllOptions = (slotKey: string, on: boolean) =>
    setSlots(prev => prev.map(s => {
      if (s.key !== slotKey) return s;
      const active = (products[s.product_id]?.options ?? []).filter(o => o.is_active).map(o => o.variation_id);
      return { ...s, variation_ids: on ? active : [] };
    }));

  const clearPickError = (slotKey: string) =>
    setPickErrors(prev => {
      if (!prev[slotKey]) return prev;
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });

  const pickProduct = async (slotKey: string, productId: string) => {
    clearPickError(slotKey);
    if (productId === initial.selfProductId) {
      setPickErrors(prev => ({ ...prev, [slotKey]: 'ใช้สินค้าชุดนี้เป็นส่วนประกอบของตัวเองไม่ได้' }));
      return;
    }
    setLoadingSlots(prev => ({ ...prev, [slotKey]: true }));
    try {
      const res = await apiFetch(`/api/products/${productId}?view=component`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.product) throw new Error(data.error || 'โหลดตัวเลือกของสินค้านี้ไม่สำเร็จ');
      const product: ComponentProduct = data.product;
      if (product.is_composite) {
        setCompositeIds(prev => new Set(prev).add(product.product_id));
        setPickErrors(prev => ({ ...prev, [slotKey]: 'ใช้สินค้าชุดเป็นส่วนประกอบไม่ได้' }));
        return;
      }
      setProducts(prev => ({ ...prev, [product.product_id]: product }));
      setSlots(prev => prev.map(s => {
        if (s.key !== slotKey) return s;
        const prevName = s.product_id ? products[s.product_id]?.name : undefined;
        const keepName = !!s.name.trim() && s.name !== prevName;
        return {
          ...s,
          product_id: product.product_id,
          name: keepName ? s.name : product.name,
          variation_ids: product.options.filter(o => o.is_active).map(o => o.variation_id),
        };
      }));
    } catch (e) {
      setPickErrors(prev => ({ ...prev, [slotKey]: e instanceof Error ? e.message : 'โหลดตัวเลือกของสินค้านี้ไม่สำเร็จ' }));
    } finally {
      setLoadingSlots(prev => ({ ...prev, [slotKey]: false }));
    }
  };

  const clearProduct = (slotKey: string) => {
    clearPickError(slotKey);
    setSlots(prev => prev.map(s => {
      if (s.key !== slotKey) return s;
      const productName = products[s.product_id]?.name;
      return { ...s, product_id: '', variation_ids: [], name: s.name === productName ? '' : s.name };
    }));
  };

  // ── combo rows ──
  const setRow = (key: string, patch: Partial<ComboRowSetting>) =>
    setOverrides(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  /** Lock = start from the price it carries now · unlock = back to the automatic price */
  const lockRow = (row: ComboRow, locked: boolean) =>
    setRow(row.key, locked
      ? { price_locked: true, default_price: row.price.default_price, discount_price: row.price.discount_price }
      : { price_locked: false });

  const setAllActive = (on: boolean) =>
    setOverrides(prev => {
      const next = { ...prev };
      for (const r of rows) next[r.key] = { ...next[r.key], is_active: on };
      return next;
    });

  /** Switching manual pricing off returns every locked row to the automatic price */
  const setAdvanced = (on: boolean) => {
    setAdvancedState(on);
    if (on) return;
    setOverrides(prev => {
      const next = { ...prev };
      for (const r of rows) if (r.setting.price_locked) next[r.key] = { ...next[r.key], price_locked: false };
      return next;
    });
  };

  // ── submit ──
  /** Marks the editor as submitted and returns the first problem (Thai) or null */
  const validate = (): string | null => {
    setSubmitted(true);
    if (generalError) return generalError;
    if (firstRowError) return `ชุดย่อย "${firstRowError.label}": ${firstRowError.errors.price || firstRowError.errors.sku}`;
    return null;
  };

  const payload = (): { composite_slots: CompositeSlot[]; composite_combos: ComboInput[] } => ({
    composite_slots: slots.map(s => ({
      key: s.key,
      name: s.name.trim(),
      product_id: s.product_id,
      variation_ids: s.variation_ids,
      quantity: s.quantity,
    })),
    composite_combos: rows.map(r => {
      const sku = r.setting.sku.trim();
      return {
        key: r.key,
        is_active: r.setting.is_active,
        price_locked: r.setting.price_locked,
        ...(r.setting.price_locked
          ? { default_price: r.setting.default_price, discount_price: r.setting.discount_price }
          : {}),
        // new row left empty → omit so the server fills "SKU+SKU"; existing row sends '' to clear
        ...(r.exists || sku ? { sku } : {}),
      };
    }),
  });

  return {
    isEditing: initial.isEditing,
    selfProductId: initial.selfProductId,
    slots,
    products,
    rows,
    advanced,
    loadingSlots,
    pickErrors,
    compositeIds,
    allPicked,
    /** show the slot problem once everything is picked or after a save attempt */
    visibleGeneralError: submitted || allPicked ? generalError : null,
    addSlot,
    removeSlot,
    updateSlot,
    toggleOption,
    setAllOptions,
    pickProduct,
    clearProduct,
    setRow,
    lockRow,
    setAllActive,
    setAdvanced,
    validate,
    payload,
  };
}

export type CompositeEditorState = ReturnType<typeof useCompositeEditor>;

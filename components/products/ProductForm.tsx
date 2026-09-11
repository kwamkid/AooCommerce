// Path: components/products/ProductForm.tsx
//
// ฟอร์มเพิ่ม/แก้ไขสินค้า (ใช้ทั้ง /products/new และ /products/[id]/edit)
//
// หน้าตาอยู่ที่ `components/products/form/` ชุดเดียวกับหน้าลอง /dev/design/product-form:
//   ProductFormCard      = การ์ดเดียวจบ (สถานะ · ประเภท · รูป · ชื่อ/รหัส · หมวด/แบรนด์ · ราคา · คำอธิบาย)
//   VariantOptionsEditor = ตัวเลือกแบบ Shopee (พิมพ์ค่าแล้วสร้างตารางให้)
//   CompositeEditor      = สินค้าชุด (ของเดิม)
// ไฟล์นี้ถือ state + ตรวจค่า + บันทึก · กติกาสร้าง/ตัดแถวตัวเลือกอยู่ที่ lib/product-variants.ts
//
// เปลี่ยนจากของเดิม (เจ้าของเคาะจากหน้าลอง 12 ก.ย. 2026):
//   • ตัวเลือกไม่ต้องเพิ่มทีละแถวแล้ว — เลือกชื่อตัวเลือก + พิมพ์ค่า ตารางขึ้นเอง
//   • รหัสสินค้าเว้นว่างได้ตอนเพิ่มใหม่ (server ตั้งให้ผ่าน RPC next_product_code)
//   • ปุ่ม "บันทึกแล้วเพิ่มต่อ" ตอนเพิ่มใหม่
//   • โหมดแก้ไขโชว์ยอดพร้อมขาย (จาก inventory ผ่าน /api/products/[id]/stock) อ่านอย่างเดียว
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { type ProductImage, uploadStagedImages } from '@/components/ui/ImageUploader';
import FormSelect from '@/components/ui/FormSelect';
import FormInput from '@/components/ui/FormInput';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import StickyActionBar from '@/components/ui/StickyActionBar';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import CompositeEditor from '@/components/products/composite/CompositeEditor';
import { useCompositeEditor } from '@/components/products/composite/useCompositeEditor';
import type { CompositeProductData } from '@/components/products/composite/types';
import ProductFormCard from '@/components/products/form/ProductFormCard';
import VariantOptionsEditor from '@/components/products/form/VariantOptionsEditor';
import type {
  BrandOption, CategoryOption, FieldErrors, OptionGroup, ProductFormValues, ProductType,
  VariantRow, VariationTypeOption,
} from '@/components/products/form/types';
import {
  activeGroupNames, groupsFromRows, regenerateRows, validateOptionGroups, validateVariantRows,
} from '@/lib/product-variants';
import { ShieldAlert } from 'lucide-react';

// Variation as it comes from the API (edit mode)
interface ApiVariation {
  variation_id?: string;
  variation_label: string;
  sku?: string;
  barcode?: string;
  attributes?: Record<string, string>;
  default_price: number;
  discount_price: number;
  cost_price?: number | null;
  stock: number;
  min_stock: number;
  is_active: boolean;
  /** composite combos: true = price set by hand */
  price_locked?: boolean;
}

// Product interface (from API view) — composite fields come from /api/products/[id]
export interface ProductItem extends CompositeProductData {
  product_id: string;
  code: string;
  name: string;
  description?: string;
  image?: string;
  main_image_url?: string;
  product_type: ProductType;
  category_id?: string | null;
  brand_id?: string | null;
  selected_variation_types?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  simple_variation_label?: string;
  simple_sku?: string;
  simple_barcode?: string;
  simple_default_price?: number;
  simple_discount_price?: number;
  simple_stock?: number;
  simple_min_stock?: number;
  variations: ApiVariation[];
}

export interface FormOptions {
  categories: CategoryOption[];
  brands: BrandOption[];
  variation_types: VariationTypeOption[];
}

interface ProductFormProps {
  editingProduct?: ProductItem | null;
  initialImages?: ProductImage[];
  initialVariationImages?: Record<string, ProductImage[]>;
  /** Pass undefined = still loading (don't self-fetch yet), null = not provided (self-fetch), FormOptions = use this */
  formOptions?: FormOptions | null;
}

const EMPTY_VALUES: ProductFormValues = {
  code: '', name: '', description: '', image: '', category_id: '', brand_id: '',
  product_type: 'simple', is_active: true, selected_variation_types: [],
  variation_label: '-', sku: '', barcode: '', default_price: 0, discount_price: 0, cost_price: 0,
  variations: [],
};

/** API variation → row of the variants table */
const toRow = (v: ApiVariation): VariantRow => ({
  id: v.variation_id,
  _tempId: v.variation_id || crypto.randomUUID(),
  variation_label: v.variation_label,
  sku: v.sku || '',
  barcode: v.barcode || '',
  attributes: v.attributes || {},
  default_price: v.default_price,
  discount_price: v.discount_price,
  cost_price: v.cost_price || 0,
  is_active: v.is_active,
});

/** New generated row — copies the sibling's prices (same values in the other groups) */
const newRow = (attributes: Record<string, string>, template?: VariantRow): VariantRow => ({
  _tempId: crypto.randomUUID(),
  variation_label: '',
  sku: '',
  barcode: '',
  attributes,
  default_price: template?.default_price ?? 0,
  discount_price: template?.discount_price ?? 0,
  cost_price: template?.cost_price ?? 0,
  is_active: true,
});

export default function ProductForm({
  editingProduct,
  initialImages,
  initialVariationImages,
  formOptions,
}: ProductFormProps) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  // Cost permission is per-member (owner/admin always have it, others by toggle)
  const canViewCost = userProfile?.canViewCost === true;

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Track the product_type the form was loaded with — used to detect when the user is changing
  // simple ↔ variation in edit mode (needs confirmation).
  // A duplicate (no product_id) is a new product — nothing saved yet, so no confirmation.
  const isEditMode = !!editingProduct?.product_id;
  const originalProductType = isEditMode ? editingProduct?.product_type : undefined;
  const [pendingTypeChange, setPendingTypeChange] = useState<'simple' | 'variation' | null>(null);
  // สินค้าชุด: เลือกได้ตอนสร้างเท่านั้น · สินค้าชุดที่บันทึกแล้วเปลี่ยนประเภทไม่ได้ (API กันอีกชั้น)
  const compositeLocked = originalProductType === 'composite';
  const composite = useCompositeEditor(editingProduct);

  // ── master data ──
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [variationTypes, setVariationTypes] = useState<VariationTypeOption[]>([]);

  // ── quick-add modals ──
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');
  const [creatingBrand, setCreatingBrand] = useState(false);
  const [showNewVariationType, setShowNewVariationType] = useState(false);
  const [newVariationTypeName, setNewVariationTypeName] = useState('');
  const [creatingVariationType, setCreatingVariationType] = useState(false);

  const closeNewCategory = () => { setShowNewCategory(false); setNewCategoryName(''); setNewCategoryParentId(''); };
  const closeNewBrand = () => { setShowNewBrand(false); setNewBrandName(''); };
  const closeNewVariationType = () => { setShowNewVariationType(false); setNewVariationTypeName(''); };

  // ── images ──
  const [productImages, setProductImages] = useState<ProductImage[]>(initialImages || []);
  const [variationImages, setVariationImages] = useState<Record<string, ProductImage[]>>(initialVariationImages || {});

  // ── form values ──
  const initValues = (): ProductFormValues => {
    if (!editingProduct) return { ...EMPTY_VALUES };
    // Edit existing → keep existing code. Duplicate (no product_id) → blank so the user enters
    // the new product's own code (or leaves it empty and the server assigns one).
    const useCode = editingProduct.product_id ? editingProduct.code : '';
    const base: ProductFormValues = {
      ...EMPTY_VALUES,
      code: useCode,
      name: editingProduct.name,
      description: editingProduct.description || '',
      image: editingProduct.image || '',
      category_id: editingProduct.category_id || '',
      brand_id: editingProduct.brand_id || '',
      product_type: editingProduct.product_type,
      is_active: editingProduct.is_active,
    };
    if (editingProduct.product_type === 'composite') {
      // Combos live in the composite editor (useCompositeEditor) — only basic fields here
      return { ...base, variation_label: '' };
    }
    if (editingProduct.product_type === 'simple') {
      return {
        ...base,
        variation_label: editingProduct.simple_variation_label || '-',
        sku: editingProduct.simple_sku || '',
        barcode: editingProduct.simple_barcode || '',
        default_price: editingProduct.simple_default_price || 0,
        discount_price: editingProduct.simple_discount_price || 0,
        cost_price: editingProduct.variations?.[0]?.cost_price || 0,
      };
    }
    return {
      ...base,
      variation_label: '',
      selected_variation_types: editingProduct.selected_variation_types || [],
      variations: editingProduct.variations.map(toRow),
    };
  };

  const [values, setValues] = useState<ProductFormValues>(initValues);
  const rows = values.variations;
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  /** ยอดพร้อมขายต่อ variation (โหมดแก้ไข · จาก inventory) */
  const [stockByVariation, setStockByVariation] = useState<Record<string, number> | null>(null);

  const setFormValues = (patch: Partial<ProductFormValues>) => {
    setValues(v => ({ ...v, ...patch }));
    setErrors(prev => {
      const next = { ...prev };
      for (const k of Object.keys(patch)) delete next[k];
      if ('default_price' in patch) delete next.discount_price;
      return next;
    });
  };

  // ── master data: from props, or fetched when the parent doesn't provide it ──
  useEffect(() => {
    if (formOptions) {
      setCategories(formOptions.categories);
      setBrands(formOptions.brands);
      setVariationTypes(formOptions.variation_types);
    }
  }, [formOptions]);

  const fetchedRef = useRef(false);
  useEffect(() => {
    // formOptions === undefined → parent is loading, wait
    // formOptions is a FormOptions object → use it, skip fetch
    // formOptions === null → not provided, fetch ourselves
    if (formOptions !== null) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        const response = await apiFetch('/api/products/form-options');
        const data = await response.json();
        setCategories(data.categories || []);
        setBrands(data.brands || []);
        setVariationTypes(data.variation_types || []);
      } catch (err) {
        console.error('Error fetching form options:', err);
      }
    })();
  }, [formOptions]);

  // Sync images when the parent loads them (edit mode)
  useEffect(() => { if (initialImages) setProductImages(initialImages); }, [initialImages]);
  useEffect(() => { if (initialVariationImages) setVariationImages(initialVariationImages); }, [initialVariationImages]);

  // ── open an existing variation product: rows → "ชื่อตัวเลือก + ค่า" ──
  const groupsInitialised = useRef(false);
  useEffect(() => {
    if (groupsInitialised.current) return;
    if (values.product_type !== 'variation') return;
    if (variationTypes.length === 0) return;
    const types = (values.selected_variation_types || [])
      .map(id => variationTypes.find(t => t.id === id))
      .filter((t): t is VariationTypeOption => !!t)
      .map(t => ({ id: t.id, name: t.name }));
    if (types.length === 0) return;
    groupsInitialised.current = true;
    setGroups(groupsFromRows(rows, types));
  }, [variationTypes, values.product_type, values.selected_variation_types, rows]);

  // ── sellable stock (edit mode) — read-only, from table `inventory` ──
  useEffect(() => {
    const id = editingProduct?.product_id;
    if (!id || !features.stock) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/products/${id}/stock`);
        if (!res.ok) return;
        const data = await res.json();
        const totals: Record<string, number> = {};
        for (const w of (data.warehouses || []) as { variations: { variation_id: string; available: number }[] }[]) {
          for (const v of w.variations || []) {
            totals[v.variation_id] = (totals[v.variation_id] || 0) + (Number(v.available) || 0);
          }
        }
        if (!cancelled) setStockByVariation(totals);
      } catch (err) {
        console.error('Failed to load stock:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [editingProduct?.product_id, features.stock]);

  const rowsWithStock = useMemo(() => {
    if (!stockByVariation) return rows;
    return rows.map(r => (r.id ? { ...r, available: stockByVariation[r.id] ?? 0 } : r));
  }, [rows, stockByVariation]);

  const simpleStock = useMemo(() => {
    if (!stockByVariation || values.product_type !== 'simple') return null;
    const varId = editingProduct?.variations?.find(v => v.is_active)?.variation_id
      ?? editingProduct?.variations?.[0]?.variation_id;
    return varId ? (stockByVariation[varId] ?? 0) : null;
  }, [stockByVariation, values.product_type, editingProduct]);

  // ── next product code (create mode) — placeholder only, assigned for real on save ──
  const [nextCode, setNextCode] = useState<string | null>(null);
  useEffect(() => {
    if (isEditMode) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/products/next-code');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.code) setNextCode(data.code);
      } catch { /* placeholder only — ไม่มีก็ไม่เป็นไร */ }
    })();
    return () => { cancelled = true; };
  }, [isEditMode]);

  // ── type change ──
  const handleTypeChange = (type: ProductType) => {
    if (type === values.product_type) return;
    if (type === 'composite' || compositeLocked) {
      // composite เลือกได้ตอนสร้างเท่านั้น (ปุ่มถูก disable อยู่แล้วตอนแก้ไข)
      if (!isEditMode) setFormValues({ product_type: 'composite' });
      return;
    }
    // Edit mode + switching away from the loaded type → confirm first
    if (originalProductType && originalProductType !== type) {
      setPendingTypeChange(type);
      return;
    }
    applyTypeChange(type);
  };

  const applyTypeChange = (type: 'simple' | 'variation') => {
    setValues(v => ({ ...v, product_type: type }));
    if (type === 'variation' && groups.length === 0) setGroups([{ typeId: '', name: '', values: [] }]);
    setErrors({});
  };

  // ── variation options ──
  const handleGroupsChange = async (next: OptionGroup[]) => {
    const result = regenerateRows(groups, next, rows, newRow);
    if (result.error) {
      setGroupsError(result.error);
      return;
    }
    const savedDropped = result.dropped.filter(r => r.id);
    if (savedDropped.length > 0) {
      const ok = await confirm({
        title: `ลบตัวเลือก ${savedDropped.length} แบบ?`,
        description: `${savedDropped.map(r => r.variation_label || r.sku || '-').join(', ')} จะถูกลบเมื่อกดบันทึก — ประวัติออเดอร์/สต็อกเดิมยังอยู่ครบใน DB\n\nถ้าแค่หยุดขายชั่วคราว ให้ปิด "เปิดขาย" ของแถวนั้นแทน`,
        variant: 'danger',
        confirmLabel: 'ลบ',
        cancelLabel: 'ยกเลิก',
      });
      if (!ok) return;
    }
    setGroupsError(null);
    setGroups(next);
    setValues(v => ({
      ...v,
      variations: result.rows,
      selected_variation_types: next.map(g => g.typeId).filter(Boolean),
    }));
    setErrors(prev => Object.fromEntries(
      Object.entries(prev).filter(([k]) => !k.startsWith('group.') && !k.startsWith('variation')),
    ));
    // ลบแถวไหนออก รูปของแถวนั้นก็ไม่ต้องอัปแล้ว
    if (result.dropped.length > 0) {
      setVariationImages(prev => {
        const updated = { ...prev };
        for (const r of result.dropped) delete updated[r._tempId];
        return updated;
      });
    }
  };

  const handleRowsChange = (next: VariantRow[]) => {
    setValues(v => ({ ...v, variations: next }));
    setErrors(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith('variation.'))));
  };

  // ── validate ──
  const validate = (): boolean => {
    const e: FieldErrors = {};
    if (!values.name.trim()) e.name = 'กรุณากรอกชื่อสินค้า';
    // ตอนเพิ่มใหม่เว้นรหัสว่างได้ — server ตั้งให้ (RPC next_product_code)
    if (isEditMode && !values.code.trim()) e.code = 'กรุณากรอกรหัสสินค้า';

    if (values.product_type === 'composite') {
      const compositeError = composite.validate();
      if (compositeError) e.composite = compositeError;
    } else if (values.product_type === 'simple') {
      if (!(values.default_price > 0)) e.default_price = 'ราคาต้องมากกว่า 0';
      // ราคาขาย 0 = ไม่มีส่วนลด (อนุญาต) · ถ้าใส่ต้องน้อยกว่าราคาปกติ
      if (values.discount_price > 0 && values.discount_price >= values.default_price) {
        e.discount_price = 'ราคาขายต้องน้อยกว่าราคาปกติ';
      }
    } else {
      Object.assign(e, validateOptionGroups(groups), validateVariantRows(rows, activeGroupNames(groups)));
    }

    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      // desktop table และการ์ดมือถือมี data-field เหมือนกัน — เลื่อนไปตัวที่มองเห็นอยู่
      const target = [...document.querySelectorAll<HTMLElement>(`[data-field="${first}"]`)]
        .find(el => el.offsetParent !== null);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return !first;
  };

  // ── quick-add handlers ──
  const handleCreateCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || creatingCategory) return;
    setCreatingCategory(true);
    try {
      const res = await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent_id: newCategoryParentId || null }),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || 'ไม่สามารถเพิ่มหมวดหมู่ได้', 'error');
        return;
      }
      const created = result.data;
      // Refresh categories list (nested structure)
      const catRes = await apiFetch('/api/categories');
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.data || []);
      }
      setValues(prev => ({ ...prev, category_id: created.id }));
      closeNewCategory();
    } catch (e) {
      console.error('Failed to create category:', e);
      showToast('ไม่สามารถเพิ่มหมวดหมู่ได้', 'error');
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleCreateBrand = async () => {
    const name = newBrandName.trim();
    if (!name || creatingBrand) return;
    setCreatingBrand(true);
    try {
      const res = await apiFetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || 'ไม่สามารถเพิ่มแบรนด์ได้', 'error');
        return;
      }
      const created = result.data;
      const brandRes = await apiFetch('/api/brands');
      if (brandRes.ok) {
        const brandData = await brandRes.json();
        setBrands(brandData.data || []);
      }
      setValues(prev => ({ ...prev, brand_id: created.id }));
      closeNewBrand();
    } catch (e) {
      console.error('Failed to create brand:', e);
      showToast('ไม่สามารถเพิ่มแบรนด์ได้', 'error');
    } finally {
      setCreatingBrand(false);
    }
  };

  const handleCreateVariationType = async () => {
    const name = newVariationTypeName.trim();
    if (!name || creatingVariationType) return;
    setCreatingVariationType(true);
    try {
      const res = await apiFetch('/api/variation-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const result = await res.json();
      if (!res.ok) {
        showToast(result.error || 'ไม่สามารถเพิ่มประเภทตัวเลือกได้', 'error');
        return;
      }
      const created = result.data as VariationTypeOption;
      setVariationTypes(prev => [...prev, created]);
      // ใส่ให้ช่อง "ชื่อตัวเลือก" ที่ยังว่างอยู่ทันที (ไม่มีช่องว่าง = เพิ่มกลุ่มใหม่ให้)
      const emptyIndex = groups.findIndex(g => !g.typeId);
      const next = emptyIndex >= 0
        ? groups.map((g, i) => (i === emptyIndex ? { ...g, typeId: created.id, name: created.name } : g))
        : [...groups, { typeId: created.id, name: created.name, values: [] }];
      await handleGroupsChange(next);
      closeNewVariationType();
    } catch (e) {
      console.error('Failed to create variation type:', e);
      showToast('ไม่สามารถเพิ่มประเภทตัวเลือกได้', 'error');
    } finally {
      setCreatingVariationType(false);
    }
  };

  // ── save ──
  /** ล้างฟอร์มเพื่อเพิ่มสินค้าตัวถัดไป (ปุ่ม "บันทึกแล้วเพิ่มต่อ") */
  const resetForNext = () => {
    setValues({ ...EMPTY_VALUES });
    setGroups([]);
    setGroupsError(null);
    setErrors({});
    setProductImages([]);
    setVariationImages({});
    setStockByVariation(null);
    groupsInitialised.current = true; // ฟอร์มใหม่ = ไม่ต้องแปลงตัวเลือกจากสินค้าเดิมอีก
    apiFetch('/api/products/next-code')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.code) setNextCode(d.code); })
      .catch(() => {});
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('[data-field="name"] input')?.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 50);
  };

  const doSave = async (mode: 'close' | 'again') => {
    if (!validate()) return;
    setSaving(true);
    try {
      const method = editingProduct?.product_id ? 'PUT' : 'POST';
      const submitData = values.product_type === 'composite'
        ? {
            // สินค้าชุด: basic fields + slots/combos — no price/stock/variation fields
            code: values.code,
            name: values.name,
            description: values.description,
            image: values.image,
            category_id: values.category_id,
            brand_id: values.brand_id,
            is_active: values.is_active,
            product_type: 'composite' as const,
            ...composite.payload(),
          }
        : {
            ...values,
            variation_label: values.product_type === 'variation' ? '' : (values.variation_label.trim() || '-'),
            // `_tempId`/`available` เป็นของฝั่งหน้าจอ ไม่ต้องส่งไป API
            variations: rows.map(({ _tempId, available, ...rest }) => rest),
          };
      const body = editingProduct?.product_id
        ? { id: editingProduct.product_id, ...submitData }
        : submitData;

      const response = await apiFetch('/api/products', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        showToast(result.error || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        setSaving(false);
        return;
      }

      const newProductId = result.product?.product_id || result.product?.id;

      // Upload staged images — reuse token for all uploads
      if (newProductId) {
        const hasStagedProductImages = productImages.some(img => img._stagedFile);
        if (hasStagedProductImages) {
          try {
            await uploadStagedImages(productImages, newProductId);
          } catch (imgError) {
            console.error('Error uploading product images:', imgError);
          }
        }

        // Upload staged variation images — in parallel (not sequential)
        const stagedTargets: { imgs: ProductImage[] | undefined; variationId: string | undefined }[] =
          values.product_type === 'composite'
            // สินค้าชุด: saved combos keep pictures under their variation id, new ones under the combo key
            ? ((result.composite_combos || []) as { key: string; variation_id: string }[]).map(c => ({
                imgs: variationImages[c.variation_id] ?? variationImages[c.key],
                variationId: c.variation_id,
              }))
            : rows.map((v, i) => ({
                imgs: variationImages[v._tempId],
                variationId: result.variations?.[i]?.id,
              }));
        const uploadPromises = stagedTargets
          .filter(t => t.variationId && t.imgs?.some(img => img._stagedFile))
          .map(t =>
            uploadStagedImages(t.imgs!, newProductId, t.variationId)
              .then(() => {})
              .catch(imgError => {
                console.error(`Error uploading images of variation ${t.variationId}:`, imgError);
              })
          );
        if (uploadPromises.length > 0) {
          await Promise.allSettled(uploadPromises);
        }
      }

      if (mode === 'again') {
        showToast(`บันทึก "${values.name}" แล้ว — เพิ่มสินค้าตัวถัดไปได้เลย`);
        resetForNext();
        setSaving(false);
        return;
      }
      router.push('/products');
    } catch (err) {
      console.error('Error saving:', err);
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก', 'error');
      setSaving(false);
    }
  };

  // ── render ──
  const typeDisabled = compositeLocked
    ? { simple: 'สินค้าชุดเปลี่ยนเป็นประเภทอื่นไม่ได้', variation: 'สินค้าชุดเปลี่ยนเป็นประเภทอื่นไม่ได้' }
    : isEditMode
      ? { composite: 'สินค้าที่บันทึกแล้วเปลี่ยนเป็นสินค้าชุดไม่ได้' }
      : undefined;

  return (
    <>
      <div className="space-y-5">
        <ProductFormCard
          values={{ ...values, variations: rowsWithStock }}
          onChange={setFormValues}
          mode={isEditMode ? 'edit' : 'create'}
          errors={errors}
          productImages={productImages}
          onProductImagesChange={setProductImages}
          categories={categories}
          brands={brands}
          onAddCategory={() => setShowNewCategory(true)}
          onAddBrand={() => setShowNewBrand(true)}
          onTypeChange={handleTypeChange}
          typeDisabled={typeDisabled}
          canViewCost={canViewCost}
          features={{
            product_brand: !!features.product_brand,
            supplier: !!features.supplier,
            stock: !!features.stock,
          }}
          codePlaceholder={nextCode ? `เว้นว่าง = ตั้งให้ (${nextCode})` : undefined}
          simpleStock={simpleStock}
          variantsSlot={
            <VariantOptionsEditor
              groups={groups}
              onGroupsChange={handleGroupsChange}
              rows={rowsWithStock}
              onRowsChange={handleRowsChange}
              variationTypes={variationTypes}
              onAddVariationType={() => setShowNewVariationType(true)}
              images={variationImages}
              onImagesChange={(key, imgs) => setVariationImages(prev => ({ ...prev, [key]: imgs }))}
              errors={errors}
              canViewCost={canViewCost}
              showStock={isEditMode && !!features.stock}
              groupsError={groupsError}
            />
          }
          compositeNote={
            <Alert tone="info">สินค้าชุด: ตั้งส่วนประกอบและชุดย่อยในกล่องด้านล่าง</Alert>
          }
        />

        {values.product_type === 'composite' && (
          <CompositeEditor
            editor={composite}
            images={variationImages}
            onImagesChange={(key, imgs) => setVariationImages(prev => ({ ...prev, [key]: imgs }))}
          />
        )}

        {errors.composite && (
          <Alert tone="danger">{errors.composite}</Alert>
        )}

        <StickyActionBar
          saving={saving}
          onSave={() => doSave('close')}
          onCancel={() => router.push('/products')}
          extraActions={!isEditMode
            ? <Button variant="secondary" onClick={() => doSave('again')} disabled={saving}>บันทึกแล้วเพิ่มต่อ</Button>
            : undefined}
        />
      </div>

      {/* Type-change confirmation (edit mode only) — API soft-DELETES the old
          variations (deleted_at = now) so they vanish from the new shape's UI
          but stay in DB for FK history (orders, inventory, reports). */}
      <Modal
        open={!!pendingTypeChange}
        onClose={() => setPendingTypeChange(null)}
        title={
          <span className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            ยืนยันการเปลี่ยนประเภทสินค้า
          </span>
        }
        size="md"
        footer={
          <div className="flex justify-end gap-2 p-4">
            <Button variant="secondary" onClick={() => setPendingTypeChange(null)}>
              ยกเลิก
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingTypeChange) applyTypeChange(pendingTypeChange);
                setPendingTypeChange(null);
              }}
            >
              ยืนยันเปลี่ยนประเภท
            </Button>
          </div>
        }
      >
        <div className="p-5 space-y-3">
          <p className="text-base text-gray-700 dark:text-slate-300">
            กำลังเปลี่ยนประเภทจาก{' '}
            <strong className="text-gray-900 dark:text-white">
              {originalProductType === 'simple' ? 'สินค้าปกติ' : 'สินค้ามีตัวเลือก'}
            </strong>
            {' → '}
            <strong className="text-gray-900 dark:text-white">
              {pendingTypeChange === 'simple' ? 'สินค้าปกติ' : 'สินค้ามีตัวเลือก'}
            </strong>
          </p>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-base text-amber-800 dark:text-amber-300 space-y-1.5">
            <p className="font-medium">⚠ การเปลี่ยนแปลงนี้มีผลใหญ่ต่อสินค้าตัวนี้</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {pendingTypeChange === 'simple' ? (
                <>
                  <li>ตัวเลือกทั้งหมดจะถูก<strong>ลบ</strong>เมื่อกดบันทึก (หายจากหน้าสินค้า)</li>
                  <li>ระบบยัง<strong>เก็บข้อมูลเก่าไว้ใน DB</strong> — ออเดอร์/สต็อก/รายงานยังอ้างอิงได้ครบ</li>
                  <li>ราคาของสินค้านี้จะกลายเป็นค่าเดียวตามที่กรอกใหม่</li>
                </>
              ) : (
                <>
                  <li>ราคาของแบบสินค้าปกติจะถูก<strong>ลบ</strong>เมื่อกดบันทึก</li>
                  <li>ต้องตั้งตัวเลือก (เช่น สี ขนาด) และกรอกราคาของแต่ละแบบใหม่</li>
                  <li>ระบบยัง<strong>เก็บข้อมูลเก่าไว้ใน DB</strong> — ออเดอร์/สต็อก/รายงานยังอ้างอิงได้ครบ</li>
                </>
              )}
              <li className="text-amber-900 dark:text-amber-200 font-medium">การเปลี่ยนแปลงจะมีผลตอนกด &quot;บันทึก&quot; เท่านั้น (ยังไม่บันทึกตอนนี้)</li>
            </ul>
          </div>
        </div>
      </Modal>

      {/* Quick-add: Category */}
      <Modal
        open={showNewCategory}
        onClose={() => { if (!creatingCategory) closeNewCategory(); }}
        title="เพิ่มหมวดหมู่ใหม่"
        size="md"
        footer={
          <div className="flex justify-end gap-2 p-4">
            <Button variant="secondary" onClick={closeNewCategory} disabled={creatingCategory}>ยกเลิก</Button>
            <Button variant="primary" onClick={handleCreateCategory} loading={creatingCategory} disabled={!newCategoryName.trim()}>
              เพิ่มหมวดหมู่
            </Button>
          </div>
        }
      >
        <div className="p-5 space-y-4">
          <FormInput
            autoFocus
            label={<>ชื่อหมวดหมู่<span className="text-red-500"> *</span></>}
            value={newCategoryName}
            onChange={e => setNewCategoryName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newCategoryName.trim()) { e.preventDefault(); handleCreateCategory(); } }}
            placeholder="เช่น เสื้อผ้า, รองเท้า"
          />
          {categories.length > 0 && (
            <div>
              <label className="field-label">หมวดหมู่หลัก (ถ้าเป็นหมวดย่อย)</label>
              <FormSelect
                value={newCategoryParentId}
                onChange={setNewCategoryParentId}
                options={categories.map(c => ({ id: c.id, label: c.name }))}
                placeholder="ไม่ระบุ (หมวดหลัก)"
                clearLabel="ไม่ระบุ (หมวดหลัก)"
                portal
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Quick-add: Brand */}
      <Modal
        open={showNewBrand}
        onClose={() => { if (!creatingBrand) closeNewBrand(); }}
        title="เพิ่มแบรนด์ใหม่"
        size="md"
        footer={
          <div className="flex justify-end gap-2 p-4">
            <Button variant="secondary" onClick={closeNewBrand} disabled={creatingBrand}>ยกเลิก</Button>
            <Button variant="primary" onClick={handleCreateBrand} loading={creatingBrand} disabled={!newBrandName.trim()}>
              เพิ่มแบรนด์
            </Button>
          </div>
        }
      >
        <div className="p-5">
          <FormInput
            autoFocus
            label={<>ชื่อแบรนด์<span className="text-red-500"> *</span></>}
            value={newBrandName}
            onChange={e => setNewBrandName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newBrandName.trim()) { e.preventDefault(); handleCreateBrand(); } }}
            placeholder="เช่น Nike, Apple"
          />
        </div>
      </Modal>

      {/* Quick-add: Variation Type */}
      <Modal
        open={showNewVariationType}
        onClose={() => { if (!creatingVariationType) closeNewVariationType(); }}
        title="เพิ่มชื่อตัวเลือกใหม่"
        size="md"
        footer={
          <div className="flex justify-end gap-2 p-4">
            <Button variant="secondary" onClick={closeNewVariationType} disabled={creatingVariationType}>ยกเลิก</Button>
            <Button variant="primary" onClick={handleCreateVariationType} loading={creatingVariationType} disabled={!newVariationTypeName.trim()}>
              เพิ่มชื่อตัวเลือก
            </Button>
          </div>
        }
      >
        <div className="p-5">
          <FormInput
            autoFocus
            label={<>ชื่อตัวเลือก<span className="text-red-500"> *</span></>}
            value={newVariationTypeName}
            onChange={e => setNewVariationTypeName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newVariationTypeName.trim()) { e.preventDefault(); handleCreateVariationType(); } }}
            placeholder="เช่น สี, ขนาด, รสชาติ"
            hint='ใช้เป็นหัวข้อของตัวเลือก แล้วค่อยพิมพ์ค่า เช่น เลือก "สี" → ใส่ค่า แดง / น้ำเงิน'
          />
        </div>
      </Modal>
      {confirmDialog}
    </>
  );
}

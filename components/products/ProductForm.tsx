// Path: components/products/ProductForm.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { getImageUrl } from '@/lib/utils/image';
import ImageUploader, { type ProductImage, uploadStagedImages } from '@/components/ui/ImageUploader';
import Checkbox from '@/components/ui/Checkbox';
import {
  Plus,
  Trash2,
  Copy,
  Loader2,
  Check,
  Layers,
  BoxSelect
} from 'lucide-react';

interface CategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
  children?: CategoryOption[];
}
interface BrandOption {
  id: string;
  name: string;
}

// Variation Type (from DB)
interface VariationTypeItem {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

// Variation interface (from API)
interface Variation {
  variation_id?: string;
  variation_label: string;
  sku?: string;
  barcode?: string;
  attributes?: Record<string, string>;
  default_price: number;
  discount_price: number;
  stock: number;
  min_stock: number;
  is_active: boolean;
}

// Product interface (from API view)
export interface ProductItem {
  product_id: string;
  code: string;
  name: string;
  description?: string;
  image?: string;
  main_image_url?: string;
  product_type: 'simple' | 'variation';
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
  variations: Variation[];
}

// Form data interface
interface ProductFormData {
  code: string;
  name: string;
  description: string;
  image: string;
  category_id?: string;
  brand_id?: string;
  product_type: 'simple' | 'variation';
  is_active: boolean;
  selected_variation_types: string[];
  variation_label: string;
  sku: string;
  barcode: string;
  default_price: number;
  discount_price: number;
  cost_price: number;
  variations: VariationFormData[];
}

interface VariationFormData {
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

export interface FormOptions {
  categories: CategoryOption[];
  brands: BrandOption[];
  variation_types: VariationTypeItem[];
}

interface ProductFormProps {
  editingProduct?: ProductItem | null;
  initialImages?: ProductImage[];
  initialVariationImages?: Record<string, ProductImage[]>;
  /** Pass undefined = still loading (don't self-fetch yet), null = not provided (self-fetch), FormOptions = use this */
  formOptions?: FormOptions | null;
}

// Field error type — key is field path like "name", "default_price", "variation.0.ความจุ"
type FieldErrors = Record<string, string>;

// Inline error message component
function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="text-red-500 text-xs mt-1">{error}</p>;
}

export default function ProductForm({
  editingProduct,
  initialImages,
  initialVariationImages,
  formOptions,
}: ProductFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { userProfile } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();

  // Only owner/admin can see/edit cost price
  const canViewCost = userProfile?.roles?.some(r => r === 'owner' || r === 'admin') ?? false;

  const [variationTypes, setVariationTypes] = useState<VariationTypeItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Category & Brand state
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState('');
  const [showNewBrand, setShowNewBrand] = useState(false);
  const [newBrandName, setNewBrandName] = useState('');

  // Image state
  const [productImages, setProductImages] = useState<ProductImage[]>(initialImages || []);
  const [variationImages, setVariationImages] = useState<Record<string, ProductImage[]>>(initialVariationImages || {});

  // Generate sellable product code
  const generateSellableCode = () => {
    const prefix = 'SKU';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${prefix}-${timestamp}${random}`;
  };

  // Initialize form data
  const initFormData = (): ProductFormData => {
    if (editingProduct) {
      const useCode = editingProduct.product_id ? editingProduct.code : generateSellableCode();
      if (editingProduct.product_type === 'simple') {
        return {
          code: useCode,
          name: editingProduct.name,
          description: editingProduct.description || '',
          image: editingProduct.image || '',
          category_id: (editingProduct as any).category_id || '',
          brand_id: (editingProduct as any).brand_id || '',
          product_type: 'simple',
          is_active: editingProduct.is_active,
          selected_variation_types: [],
          variation_label: editingProduct.simple_variation_label || '-',
          sku: editingProduct.simple_sku || '',
          barcode: editingProduct.simple_barcode || '',
          default_price: editingProduct.simple_default_price || 0,
          discount_price: editingProduct.simple_discount_price || 0,
          cost_price: (editingProduct.variations?.[0] as any)?.cost_price || 0,
          variations: []
        };
      } else {
        return {
          code: useCode,
          name: editingProduct.name,
          description: editingProduct.description || '',
          image: editingProduct.image || '',
          category_id: (editingProduct as any).category_id || '',
          brand_id: (editingProduct as any).brand_id || '',
          product_type: 'variation',
          is_active: editingProduct.is_active,
          selected_variation_types: editingProduct.selected_variation_types || [],
          variation_label: '',
          sku: '',
          barcode: '',
          default_price: 0,
          discount_price: 0,
          cost_price: 0,
          variations: editingProduct.variations.map(v => ({
            id: v.variation_id,
            _tempId: v.variation_id || crypto.randomUUID(),
            variation_label: v.variation_label,
            sku: v.sku || '',
            barcode: v.barcode || '',
            attributes: v.attributes || {},
            default_price: v.default_price,
            discount_price: v.discount_price,
            cost_price: (v as any).cost_price || 0,
            is_active: v.is_active
          }))
        };
      }
    }

    return {
      code: generateSellableCode(),
      name: '',
      description: '',
      image: '',
      category_id: '',
      brand_id: '',
      product_type: 'simple',
      is_active: true,
      selected_variation_types: [],
      variation_label: '',
      sku: '',
      barcode: '',
      default_price: 0,
      discount_price: 0,
      cost_price: 0,
      variations: []
    };
  };

  const [formData, setFormData] = useState<ProductFormData>(initFormData);

  // Initialize from props if provided
  useEffect(() => {
    if (formOptions) {
      setCategories(formOptions.categories);
      setBrands(formOptions.brands);
      setVariationTypes(formOptions.variation_types);
    }
  }, [formOptions]);

  // Fetch form options only if formOptions is explicitly not provided (undefined = still loading from parent, skip)
  const fetchedRef = useRef(false);
  useEffect(() => {
    // formOptions === undefined → parent is loading, wait
    // formOptions is a FormOptions object → use it, skip fetch
    // formOptions === null → not provided, fetch ourselves
    if (formOptions !== null) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const fetchFormOptions = async () => {
      try {
        const response = await apiFetch('/api/products/form-options');
        const data = await response.json();
        setCategories(data.categories || []);
        setBrands(data.brands || []);
        setVariationTypes(data.variation_types || []);
      } catch (err) {
        console.error('Error fetching form options:', err);
      }
    };
    fetchFormOptions();
  }, [formOptions]);

  // Sync initialImages/initialVariationImages when they change (edit mode)
  useEffect(() => {
    if (initialImages) setProductImages(initialImages);
  }, [initialImages]);

  useEffect(() => {
    if (initialVariationImages) setVariationImages(initialVariationImages);
  }, [initialVariationImages]);

  // Clear field error when user types
  const clearFieldError = (key: string) => {
    if (fieldErrors[key]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Get selected type names from IDs
  const getSelectedTypeNames = (): string[] => {
    return formData.selected_variation_types
      .map(id => variationTypes.find(t => t.id === id)?.name)
      .filter((n): n is string => !!n);
  };

  // Build display name from attributes
  const buildDisplayName = (attrs: Record<string, string>): string => {
    const parts: string[] = [];
    for (const value of Object.values(attrs)) {
      if (value && value.trim()) parts.push(value.trim());
    }
    return parts.join(' / ') || '';
  };

  // Add variation
  const addVariation = () => {
    const newTempId = crypto.randomUUID();
    const attrs: Record<string, string> = {};
    for (const typeName of getSelectedTypeNames()) {
      attrs[typeName] = '';
    }
    setFormData(prev => ({
      ...prev,
      variations: [
        ...prev.variations,
        {
          _tempId: newTempId,
          variation_label: '',
          sku: '',
          barcode: '',
          attributes: attrs,
          default_price: 0,
          discount_price: 0,
          cost_price: 0,
          is_active: true
        }
      ]
    }));
    // Focus first attribute input of the new variation
    setTimeout(() => {
      const el = document.querySelector(`[data-variation-id="${newTempId}"] input[type="text"]`) as HTMLInputElement;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
    }, 50);
  };

  // Remove variation
  const removeVariation = (index: number) => {
    const removed = formData.variations[index];
    // Clean up variation images for this temp ID
    if (removed) {
      setVariationImages(prev => {
        const updated = { ...prev };
        delete updated[removed._tempId];
        return updated;
      });
    }
    setFormData(prev => ({
      ...prev,
      variations: prev.variations.filter((_, i) => i !== index)
    }));
    // Clear any errors for this variation
    setFieldErrors(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`variation.${index}.`)) delete next[key];
      }
      return next;
    });
  };

  // Duplicate variation — always append to the end
  const duplicateVariation = (index: number) => {
    const source = formData.variations[index];
    if (!source) return;
    const newTempId = crypto.randomUUID();
    setFormData(prev => ({
      ...prev,
      variations: [
        ...prev.variations,
        {
          ...source,
          id: undefined,
          _tempId: newTempId,
          sku: '',
          barcode: '',
          attributes: { ...source.attributes },
        }
      ]
    }));
    setTimeout(() => {
      const el = document.querySelector(`[data-variation-id="${newTempId}"] input[type="text"]`) as HTMLInputElement;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
      }
    }, 50);
  };

  // Update variation
  const updateVariation = (index: number, field: keyof VariationFormData, value: unknown) => {
    setFormData(prev => ({
      ...prev,
      variations: prev.variations.map((v, i) => {
        if (i !== index) return v;
        const updated = { ...v, [field]: value };
        if (field === 'attributes') {
          updated.variation_label = buildDisplayName(updated.attributes);
        }
        return updated;
      })
    }));
    // Clear error for this field
    if (field === 'default_price') clearFieldError(`variation.${index}.price`);
  };

  // Update single attribute
  const updateVariationAttribute = (index: number, typeName: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      variations: prev.variations.map((v, i) => {
        if (i !== index) return v;
        const newAttrs = { ...v.attributes, [typeName]: value };
        return {
          ...v,
          attributes: newAttrs,
          variation_label: buildDisplayName(newAttrs)
        };
      })
    }));
    clearFieldError(`variation.${index}.${typeName}`);
  };

  // Validate form — returns true if valid
  const validate = (): boolean => {
    const errors: FieldErrors = {};

    if (!formData.name.trim()) {
      errors.name = 'กรุณากรอกชื่อสินค้า';
    }

    if (!formData.code.trim()) {
      errors.code = 'กรุณากรอกรหัสสินค้า';
    }

    if (formData.product_type === 'simple') {
      if (formData.default_price <= 0) {
        errors.default_price = 'ราคาต้องมากกว่า 0';
      }
    } else if (formData.product_type === 'variation') {
      if (formData.selected_variation_types.length === 0) {
        errors.variation_types = 'กรุณาเลือกอย่างน้อย 1 ประเภท';
      }
      if (formData.variations.length === 0) {
        errors.variations_empty = 'กรุณาเพิ่มอย่างน้อย 1 variation';
      }

      const selectedNames = getSelectedTypeNames();
      for (let i = 0; i < formData.variations.length; i++) {
        const v = formData.variations[i];
        for (const typeName of selectedNames) {
          if (!v.attributes[typeName]?.trim()) {
            errors[`variation.${i}.${typeName}`] = 'กรุณากรอก';
          }
        }
        if (v.default_price <= 0) {
          errors[`variation.${i}.price`] = 'ต้องมากกว่า 0';
        }
      }

      // Check for duplicate attribute combinations
      if (selectedNames.length > 0) {
        const seen = new Map<string, number>();
        for (let i = 0; i < formData.variations.length; i++) {
          const v = formData.variations[i];
          const key = selectedNames.map(n => (v.attributes[n] || '').trim().toLowerCase()).join('|');
          if (!key.replace(/\|/g, '')) continue; // skip if all empty
          if (seen.has(key)) {
            const firstIdx = seen.get(key)!;
            const firstTypeName = selectedNames[0];
            errors[`variation.${i}.${firstTypeName}`] = 'ตัวเลือกซ้ำกับ #' + (firstIdx + 1);
          } else {
            seen.set(key, i);
          }
        }
      }

      // Check for duplicate SKU across variations
      const skuSeen = new Map<string, number>();
      for (let i = 0; i < formData.variations.length; i++) {
        const sku = (formData.variations[i].sku || '').trim().toLowerCase();
        if (!sku) continue;
        if (skuSeen.has(sku)) {
          const firstIdx = skuSeen.get(sku)!;
          errors[`variation.${i}.sku`] = 'SKU ซ้ำกับ #' + (firstIdx + 1);
        } else {
          skuSeen.set(sku, i);
        }
      }

      // Check for duplicate Barcode across variations
      const barcodeSeen = new Map<string, number>();
      for (let i = 0; i < formData.variations.length; i++) {
        const barcode = (formData.variations[i].barcode || '').trim().toLowerCase();
        if (!barcode) continue;
        if (barcodeSeen.has(barcode)) {
          const firstIdx = barcodeSeen.get(barcode)!;
          errors[`variation.${i}.barcode`] = 'Barcode ซ้ำกับ #' + (firstIdx + 1);
        } else {
          barcodeSeen.set(barcode, i);
        }
      }
    }

    setFieldErrors(errors);

    // Scroll to first error
    if (Object.keys(errors).length > 0) {
      const firstKey = Object.keys(errors)[0];
      const el = document.querySelector(`[data-field="${firstKey}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }

    return Object.keys(errors).length === 0;
  };

  // Input class with error state
  const inputClass = (fieldKey: string, base: string) => {
    if (fieldErrors[fieldKey]) {
      return base.replace('border-gray-200', 'border-red-400').replace('focus:ring-[#F4511E]', 'focus:ring-red-400');
    }
    return base;
  };

  // Handle create category (quick-add)
  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim(), parent_id: newCategoryParentId || null }),
      });
      if (res.ok) {
        const { data } = await res.json();
        // Refresh categories list
        const catRes = await apiFetch('/api/categories');
        if (catRes.ok) {
          const catData = await catRes.json();
          setCategories(catData.data || []);
        }
        setFormData(prev => ({ ...prev, category_id: data.id }));
        setNewCategoryName('');
        setNewCategoryParentId('');
        setShowNewCategory(false);
      }
    } catch (e) {
      console.error('Failed to create category:', e);
    }
  };

  // Handle create brand (quick-add)
  const handleCreateBrand = async () => {
    if (!newBrandName.trim()) return;
    try {
      const res = await apiFetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newBrandName.trim() }),
      });
      if (res.ok) {
        const { data } = await res.json();
        // Refresh brands list
        const brandRes = await apiFetch('/api/brands');
        if (brandRes.ok) {
          const brandData = await brandRes.json();
          setBrands(brandData.data || []);
        }
        setFormData(prev => ({ ...prev, brand_id: data.id }));
        setNewBrandName('');
        setShowNewBrand(false);
      }
    } catch (e) {
      console.error('Failed to create brand:', e);
    }
  };

  // Handle save
  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);

    try {
      const method = editingProduct?.product_id ? 'PUT' : 'POST';
      const submitData = {
        ...formData,
        variation_label: formData.product_type === 'variation' ? '' : (formData.variation_label.trim() || '-'),
        // Strip _tempId from variations before sending to API
        variations: formData.variations.map(({ _tempId, ...rest }) => rest),
      };
      const body = editingProduct?.product_id
        ? { id: editingProduct.product_id, ...submitData }
        : submitData;

      const response = await apiFetch('/api/products', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const result = await response.json();

      if (!response.ok) {
        showToast(result.error || 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        setSaving(false);
        return;
      }

      // Get product ID
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
        if (result.variations?.length > 0) {
          const uploadPromises: Promise<void>[] = [];

          for (let i = 0; i < formData.variations.length; i++) {
            const tempId = formData.variations[i]._tempId;
            const actualId = result.variations[i]?.id;
            const imgs = variationImages[tempId];
            if (actualId && imgs?.some(img => img._stagedFile)) {
              uploadPromises.push(
                uploadStagedImages(imgs, newProductId, actualId)
                  .then(() => {})
                  .catch(imgError => {
                    console.error(`Error uploading variation ${i} images:`, imgError);
                  })
              );
            }
          }

          if (uploadPromises.length > 0) {
            await Promise.allSettled(uploadPromises);
          }
        }
      }

      // Navigate back to products list
      router.push('/products');
    } catch (err) {
      console.error('Error saving:', err);
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSave} className="space-y-6" noValidate>
      {/* Top: Image + Basic Info */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Image Section */}
          <div className="w-full md:w-56 flex-shrink-0">
            <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-2">
              รูปภาพสินค้า
            </label>
            <ImageUploader
              images={productImages}
              onImagesChange={setProductImages}
              maxImages={10}
            />
            {formData.image && !productImages.length && (
              <div className="mt-2 flex items-center gap-2">
                <img src={getImageUrl(formData.image)} alt="รูปเดิม" className="w-10 h-10 rounded object-cover" />
                <span className="text-[10px] text-gray-400 dark:text-slate-500">รูปเดิม</span>
              </div>
            )}
          </div>

          {/* Basic Info */}
          <div className="flex-1 space-y-4">
            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-600 dark:text-slate-400">
                สถานะ
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_active: !formData.is_active })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.is_active ? 'bg-[#F4511E]' : 'bg-gray-300'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                    formData.is_active ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
                <span className="text-sm text-gray-500 dark:text-slate-400">{formData.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
              </div>
            </div>

            {/* Name */}
            <div data-field="name">
              <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1.5">
                ชื่อสินค้า *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => { setFormData({ ...formData, name: e.target.value }); clearFieldError('name'); }}
                className={inputClass('name', 'w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent')}
              />
              <FieldError error={fieldErrors.name} />
            </div>

            {/* Code */}
            <div data-field="code">
              <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1.5">
                รหัสสินค้า *
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => { setFormData({ ...formData, code: e.target.value }); clearFieldError('code'); }}
                className={inputClass('code', 'w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent')}
              />
              <FieldError error={fieldErrors.code} />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1.5">
                คำอธิบาย
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                placeholder="รายละเอียดสินค้า (ไม่จำเป็น)"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมวดหมู่</label>
              <div className="flex gap-2">
                <select
                  value={formData.category_id}
                  onChange={e => setFormData(prev => ({ ...prev, category_id: e.target.value }))}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                >
                  <option value="">ไม่ระบุ</option>
                  {categories.map(parent => (
                    parent.children && parent.children.length > 0 ? (
                      <optgroup key={parent.id} label={parent.name}>
                        <option value={parent.id}>{parent.name} (ทั้งหมด)</option>
                        {parent.children.map(child => (
                          <option key={child.id} value={child.id}>{child.name}</option>
                        ))}
                      </optgroup>
                    ) : (
                      <option key={parent.id} value={parent.id}>{parent.name}</option>
                    )
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCategory(!showNewCategory)}
                  className="px-2 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 hover:text-[#F4511E] hover:border-[#F4511E] transition-colors"
                  title="เพิ่มหมวดหมู่ใหม่"
                >+</button>
              </div>
              {/* Quick-add category inline form */}
              {showNewCategory && (
                <div className="mt-2 flex gap-2">
                  <select
                    value={newCategoryParentId}
                    onChange={e => setNewCategoryParentId(e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  >
                    <option value="">หมวดหมู่หลัก</option>
                    {categories.map(c => <option key={c.id} value={c.id}>ภายใต้: {c.name}</option>)}
                  </select>
                  <input
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    placeholder="ชื่อหมวดหมู่"
                    className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                  <button type="button" onClick={handleCreateCategory} className="px-2 py-1.5 bg-[#F4511E] text-white rounded text-xs">เพิ่ม</button>
                </div>
              )}
            </div>

            {/* Brand (feature-gated) */}
            {features.product_brand && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">แบรนด์</label>
                <div className="flex gap-2">
                  <select
                    value={formData.brand_id}
                    onChange={e => setFormData(prev => ({ ...prev, brand_id: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                  >
                    <option value="">ไม่ระบุ</option>
                    {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewBrand(!showNewBrand)}
                    className="px-2 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-500 hover:text-[#F4511E] hover:border-[#F4511E] transition-colors"
                    title="เพิ่มแบรนด์ใหม่"
                  >+</button>
                </div>
                {showNewBrand && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={newBrandName}
                      onChange={e => setNewBrandName(e.target.value)}
                      placeholder="ชื่อแบรนด์"
                      className="flex-1 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    />
                    <button type="button" onClick={handleCreateBrand} className="px-2 py-1.5 bg-[#F4511E] text-white rounded text-xs">เพิ่ม</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Product Type Selector */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-3">
          ประเภทสินค้า
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Simple */}
          <button
            type="button"
            onClick={() => setFormData({ ...formData, product_type: 'simple' })}
            className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
              formData.product_type === 'simple'
                ? 'border-[#F4511E] bg-[#F4511E]/5 shadow-sm'
                : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                formData.product_type === 'simple'
                  ? 'bg-[#F4511E]/20 text-[#C0400E]'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
              }`}>
                <BoxSelect className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-sm text-gray-900 dark:text-white">Simple Product</div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">สินค้าแบบเดี่ยว มีราคาเดียว</div>
              </div>
            </div>
            {formData.product_type === 'simple' && (
              <div className="absolute top-3 right-3 w-5 h-5 bg-[#F4511E] rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </button>

          {/* Variation */}
          <button
            type="button"
            onClick={() => setFormData({ ...formData, product_type: 'variation' })}
            className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
              formData.product_type === 'variation'
                ? 'border-[#F4511E] bg-[#F4511E]/5 shadow-sm'
                : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700/50'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                formData.product_type === 'variation'
                  ? 'bg-[#F4511E]/20 text-[#C0400E]'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500'
              }`}>
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-sm text-gray-900 dark:text-white">Variation Product</div>
                <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">มีหลายตัวเลือก เช่น ขนาด, สี</div>
              </div>
            </div>
            {formData.product_type === 'variation' && (
              <div className="absolute top-3 right-3 w-5 h-5 bg-[#F4511E] rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Simple Product Fields */}
      {formData.product_type === 'simple' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">ราคาสินค้า</h3>
          <div className={`grid grid-cols-2 ${canViewCost ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-4`}>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1.5">SKU</label>
              <input
                type="text"
                value={formData.sku}
                onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                placeholder="SKU-001"
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1.5">Barcode</label>
              <input
                type="text"
                value={formData.barcode}
                onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                placeholder="8851234567890"
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
              />
            </div>
            <div data-field="default_price">
              <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1.5">ราคาปกติ (฿) *</label>
              <input
                type="number"
                step="0.01"
                value={formData.default_price}
                onChange={(e) => { setFormData({ ...formData, default_price: parseFloat(e.target.value) || 0 }); clearFieldError('default_price'); }}
                className={inputClass('default_price', 'w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent')}
              />
              <FieldError error={fieldErrors.default_price} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1.5">ราคาลด (฿)</label>
              <input
                type="number"
                step="0.01"
                value={formData.discount_price}
                onChange={(e) => setFormData({ ...formData, discount_price: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
              />
            </div>
            {canViewCost && (
              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1.5">ต้นทุน (฿)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.cost_price}
                  onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Variation Product Fields */}
      {formData.product_type === 'variation' && (
        <div className="space-y-5">
          {/* Select Variation Types */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5" data-field="variation_types">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1">เลือกประเภทตัวเลือก *</h3>
            <p className="text-sm text-gray-400 mb-3">เลือกอย่างน้อย 1 ประเภท เพื่อกำหนดตัวเลือก</p>
            {variationTypes.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-700 rounded-lg p-3 text-center">ยังไม่มีประเภทตัวเลือก กรุณาเพิ่มใน Settings</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {variationTypes.map(vt => {
                  const isSelected = formData.selected_variation_types.includes(vt.id);
                  return (
                    <button
                      key={vt.id}
                      type="button"
                      onClick={() => {
                        const newTypes = isSelected
                          ? formData.selected_variation_types.filter(id => id !== vt.id)
                          : [...formData.selected_variation_types, vt.id];

                        const newTypeNames = newTypes
                          .map(id => variationTypes.find(t => t.id === id)?.name)
                          .filter((n): n is string => !!n);

                        const updatedVariations = formData.variations.map(v => {
                          const newAttrs: Record<string, string> = {};
                          for (const name of newTypeNames) {
                            newAttrs[name] = v.attributes[name] || '';
                          }
                          return {
                            ...v,
                            attributes: newAttrs,
                            variation_label: buildDisplayName(newAttrs)
                          };
                        });

                        setFormData(prev => ({
                          ...prev,
                          selected_variation_types: newTypes,
                          variations: updatedVariations
                        }));
                        clearFieldError('variation_types');
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-150 ${
                        isSelected
                          ? 'bg-[#F4511E] text-white shadow-sm'
                          : 'bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:border-[#F4511E] hover:text-[#C0400E]'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                      {vt.name}
                    </button>
                  );
                })}
              </div>
            )}
            <FieldError error={fieldErrors.variation_types} />
          </div>

          {/* Variations List */}
          {formData.selected_variation_types.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5" data-field="variations_empty">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Variations ({formData.variations.length})</h3>

              {formData.variations.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 dark:bg-slate-700/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-slate-600">
                  <Layers className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 mb-3">ยังไม่มี variation</p>
                  <button
                    type="button"
                    onClick={addVariation}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white rounded-lg font-semibold transition-colors text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    เพิ่ม Variation
                  </button>
                  <FieldError error={fieldErrors.variations_empty} />
                </div>
              ) : (
                <div className="space-y-3">
                  {formData.variations.map((variation, index) => {
                    const selectedNames = getSelectedTypeNames();
                    const imageKey = variation._tempId;
                    return (
                      <div key={variation._tempId} data-variation-id={variation._tempId} className="bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-xl p-4 hover:border-gray-300 dark:hover:border-slate-500 transition-colors">
                        {/* Header — number + inline attribute inputs + controls */}
                        <div className="flex items-center justify-between mb-3 gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                            <span className="w-6 h-6 bg-white dark:bg-slate-600 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 dark:text-slate-200 border dark:border-slate-500 flex-shrink-0">{index + 1}</span>
                            {selectedNames.map(typeName => {
                              const errKey = `variation.${index}.${typeName}`;
                              return (
                                <div key={typeName} className="flex items-center gap-1" data-field={errKey}>
                                  <span className="text-xs text-gray-400 flex-shrink-0">{typeName}:</span>
                                  <input
                                    type="text"
                                    value={variation.attributes[typeName] || ''}
                                    onChange={(e) => updateVariationAttribute(index, typeName, e.target.value)}
                                    placeholder={typeName}
                                    className={inputClass(errKey, 'w-36 sm:w-48 px-2 py-1 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700 dark:text-white')}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Checkbox checked={variation.is_active} onChange={(v) => updateVariation(index, 'is_active', v)} label="ใช้งาน" />
                            <button
                              type="button"
                              onClick={() => duplicateVariation(index)}
                              className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                              title="คัดลอก"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeVariation(index)}
                              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="ลบ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {/* Attribute validation errors */}
                        {selectedNames.some(typeName => fieldErrors[`variation.${index}.${typeName}`]) && (
                          <div className="mb-2">
                            {selectedNames.map(typeName => {
                              const errKey = `variation.${index}.${typeName}`;
                              return fieldErrors[errKey] ? (
                                <p key={typeName} className="text-red-500 text-xs">{typeName}: {fieldErrors[errKey]}</p>
                              ) : null;
                            })}
                          </div>
                        )}

                        {/* Image + Fields */}
                        <div className="flex gap-3 items-start">
                          {/* Variation Image — compact thumbnail */}
                          <div className="w-[100px] flex-shrink-0">
                            <ImageUploader
                              images={variationImages[imageKey] || []}
                              onImagesChange={(imgs) => setVariationImages(prev => ({ ...prev, [imageKey]: imgs }))}
                              maxImages={1}
                              compact
                            />
                          </div>

                          {/* Fields — SKU, Barcode, Price, Discount, Cost */}
                          <div className={`flex-1 grid grid-cols-2 ${canViewCost ? 'sm:grid-cols-5' : 'sm:grid-cols-4'} gap-2`}>
                            <div data-field={`variation.${index}.sku`}>
                              <label className="block text-xs font-medium text-gray-400 mb-0.5">SKU</label>
                              <input
                                type="text"
                                value={variation.sku}
                                onChange={(e) => { updateVariation(index, 'sku', e.target.value); clearFieldError(`variation.${index}.sku`); }}
                                placeholder="SKU-001"
                                className={inputClass(`variation.${index}.sku`, 'w-full px-2 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700 dark:text-white')}
                              />
                              <FieldError error={fieldErrors[`variation.${index}.sku`]} />
                            </div>
                            <div data-field={`variation.${index}.barcode`}>
                              <label className="block text-xs font-medium text-gray-400 mb-0.5">Barcode</label>
                              <input
                                type="text"
                                value={variation.barcode}
                                onChange={(e) => { updateVariation(index, 'barcode', e.target.value); clearFieldError(`variation.${index}.barcode`); }}
                                placeholder="8851234567890"
                                className={inputClass(`variation.${index}.barcode`, 'w-full px-2 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700 dark:text-white')}
                              />
                              <FieldError error={fieldErrors[`variation.${index}.barcode`]} />
                            </div>
                            <div data-field={`variation.${index}.price`}>
                              <label className="block text-xs font-medium text-gray-400 mb-0.5">ราคา (฿) *</label>
                              <input
                                type="number"
                                step="0.01"
                                value={variation.default_price}
                                onChange={(e) => updateVariation(index, 'default_price', parseFloat(e.target.value) || 0)}
                                className={inputClass(`variation.${index}.price`, 'w-full px-2 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700 dark:text-white')}
                              />
                              <FieldError error={fieldErrors[`variation.${index}.price`]} />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-400 mb-0.5">ราคาลด (฿)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={variation.discount_price}
                                onChange={(e) => updateVariation(index, 'discount_price', parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700 dark:text-white"
                              />
                            </div>
                            {canViewCost && (
                              <div>
                                <label className="block text-xs font-medium text-gray-400 mb-0.5">ต้นทุน (฿)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={variation.cost_price}
                                  onChange={(e) => updateVariation(index, 'cost_price', parseFloat(e.target.value) || 0)}
                                  className="w-full px-2 py-1.5 border border-gray-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700 dark:text-white"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add variation button — always at the bottom */}
                  <button
                    type="button"
                    onClick={addVariation}
                    className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 dark:border-slate-600 hover:border-[#F4511E] hover:bg-[#F4511E]/5 rounded-xl text-sm font-semibold text-gray-500 dark:text-slate-400 hover:text-[#C0400E] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    เพิ่ม Variation
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push('/products')}
          className="px-5 py-2.5 border border-gray-200 dark:border-slate-700 rounded-lg text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-sm font-medium"
        >
          ยกเลิก
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 bg-[#F4511E] hover:bg-[#D63B0E] text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          <span>{saving ? 'กำลังบันทึก...' : 'บันทึก'}</span>
        </button>
      </div>
    </form>
  );
}

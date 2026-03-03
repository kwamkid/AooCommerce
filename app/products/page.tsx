// Path: app/products/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { getImageUrl } from '@/lib/utils/image';
import { formatPrice, formatNumber } from '@/lib/utils/format';
import { useFeatures } from '@/lib/features-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import {
  Plus,
  Edit2,
  Trash2,
  Copy,
  X,
  Check,
  Package2,
  Wine,
  Loader2,
  Award,
  AlertCircle,
  MoreVertical,
  FilterX,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';
import Checkbox from '@/components/ui/Checkbox';
import SearchableDropdown, { DropdownOption } from '@/components/ui/SearchableDropdown';
import FormSelect from '@/components/ui/FormSelect';

// Product interface (from API view)
interface ProductItem {
  product_id: string;
  code: string;
  name: string;
  description?: string;
  image?: string;
  main_image_url?: string;
  product_type: 'simple' | 'variation';
  category_id?: string;
  brand_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  simple_variation_label?: string;
  simple_sku?: string;
  simple_barcode?: string;
  simple_default_price?: number;
  simple_discount_price?: number;
  variations: {
    variation_id?: string;
    variation_label: string;
    sku?: string;
    barcode?: string;
    default_price: number;
    discount_price: number;
    is_active: boolean;
  }[];
}

// Column toggle system
type ColumnKey = 'image' | 'nameCode' | 'type' | 'price' | 'sku' | 'barcode' | 'brand' | 'status' | 'actions';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
}

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

const COLUMN_CONFIGS: ColumnConfig[] = [
  { key: 'image', label: 'รูปภาพ', defaultVisible: true },
  { key: 'nameCode', label: 'ชื่อ/รหัส', defaultVisible: true },
  { key: 'price', label: 'ราคา', defaultVisible: true },
  { key: 'sku', label: 'SKU', defaultVisible: false },
  { key: 'barcode', label: 'Barcode', defaultVisible: false },
  { key: 'brand', label: 'Brand', defaultVisible: false },
  { key: 'type', label: 'ประเภท', defaultVisible: true },
  { key: 'status', label: 'สถานะ', defaultVisible: true },
  { key: 'actions', label: 'จัดการ', defaultVisible: true, alwaysVisible: true },
];

const STORAGE_KEY = 'products-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30" title="ใช้งาน">
      <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
    </span>
  ) : (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-700" title="ปิดใช้งาน">
      <X className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
    </span>
  );
}

function ActionMenu({ productId, onEdit, onDuplicate, onDelete }: {
  productId: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-40 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg py-1">
          <button
            onClick={() => { setOpen(false); onEdit(); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <Edit2 className="w-3.5 h-3.5" />
            แก้ไข
          </button>
          <button
            onClick={() => { setOpen(false); onDuplicate(); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <Copy className="w-3.5 h-3.5" />
            คัดลอก
          </button>
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            ลบ
          </button>
        </div>
      )}
    </div>
  );
}

function ProductsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile, loading: authLoading } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  // Derive filter values from URL search params
  const typeFilter = searchParams.get('type') || '';
  const categoryFilter = searchParams.get('cat') || '';
  const brandFilter = searchParams.get('brand') || '';
  const shopAccountFilter = searchParams.get('shop') || 'all';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const rowsPerPage = parseInt(searchParams.get('limit') || '20', 10);
  const debouncedSearch = searchParams.get('q') || '';

  // Local search input state (for immediate keystroke feedback)
  const [searchInput, setSearchInput] = useState(debouncedSearch);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // Sync search input when URL param changes externally (e.g. browser back)
  useEffect(() => { setSearchInput(debouncedSearch); }, [debouncedSearch]);

  // Helper to update URL params
  const setParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    let pageReset = false;
    for (const [k, v] of Object.entries(updates)) {
      if (k !== 'page') pageReset = true;
      const defaults: Record<string, string> = { type: '', cat: '', brand: '', shop: 'all', q: '', page: '1', limit: '20' };
      if (v === defaults[k] || v === '') params.delete(k);
      else params.set(k, v);
    }
    if (pageReset) params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/products', { scroll: false });
  }, [searchParams, router]);

  // Debounced search handler
  const handleSearchChange = useCallback((val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val) {
      setParams({ q: '' });
      return;
    }
    debounceRef.current = setTimeout(() => setParams({ q: val }), 300);
  }, [setParams]);

  // Check if any filter is active
  const hasActiveFilters = !!(debouncedSearch || typeFilter || categoryFilter || brandFilter || (shopAccountFilter !== 'all'));

  const clearAllFilters = useCallback(() => {
    setSearchInput('');
    router.replace('/products', { scroll: false });
  }, [router]);

  const [productsList, setProductsList] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false); // loading indicator for page changes
  const [dataFetched, setDataFetched] = useState(false);
  const [shopOptions, setShopOptions] = useState<DropdownOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [error, setError] = useState('');

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return new Set(JSON.parse(stored) as ColumnKey[]);
        } catch { /* use defaults */ }
      }
    }
    return new Set(getDefaultColumns());
  });
  // Load time
  const [loadTime, setLoadTime] = useState<number | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [bulkBrandId, setBulkBrandId] = useState('');
  const [bulkBrandSaving, setBulkBrandSaving] = useState(false);


  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Close lightbox on ESC
  useEffect(() => {
    if (!lightboxImage) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [lightboxImage]);

  const toggleColumn = (key: ColumnKey) => {
    const config = COLUMN_CONFIGS.find(c => c.key === key);
    if (config?.alwaysVisible) return;
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const isCol = (key: ColumnKey) => visibleColumns.has(key);


  // Total count from server
  const [totalProducts, setTotalProducts] = useState(0);

  // Fetch products with server-side pagination
  const fetchData = async () => {
    const t0 = Date.now();
    setFetching(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(rowsPerPage), include_shop_options: '1' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (categoryFilter !== '') params.set('category_id', categoryFilter);
      if (brandFilter !== '') params.set('brand_id', brandFilter);
      if (shopAccountFilter !== 'all') params.set('shop_account_id', shopAccountFilter);

      const response = await apiFetch(`/api/products?${params.toString()}`);
      const data = await response.json();
      setProductsList(data.products || []);
      setTotalProducts(data.total ?? data.products?.length ?? 0);
      // Update shop options on first load
      if (data.shopOptions) {
        setShopOptions(data.shopOptions.map((s: any) => ({
          id: s.id,
          label: s.name,
          icon: s.icon || undefined,
          platformIcon: s.platform === 'shopee' ? '/marketplace/shopee.svg' : undefined,
        })));
      }
      setDataFetched(true);
      setLoadTime((Date.now() - t0) / 1000);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('ไม่สามารถโหลดข้อมูลได้');
      setLoadTime(null);
    } finally {
      setLoading(false);
      setFetching(false);
    }
  };

  useFetchOnce(() => {
    fetchData();
    const fetchFilters = async () => {
      try {
        const res = await apiFetch('/api/products/form-options');
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories || []);
          setBrands(data.brands || []);
        }
      } catch (e) {
        console.error('Failed to fetch filters:', e);
      }
    };
    fetchFilters();
  }, !authLoading && !!userProfile);

  // Re-fetch when URL-derived filter/pagination values change (after initial load)
  useEffect(() => {
    if (dataFetched) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, debouncedSearch, typeFilter, categoryFilter, brandFilter, shopAccountFilter]);

  // Handle delete
  const handleDelete = async (product: ProductItem) => {
    const ok = await confirm({ title: `ต้องการลบ "${product.name}"?`, variant: 'danger' }); if (!ok) return;
    try {
      const response = await apiFetch(`/api/products?id=${product.product_id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ไม่สามารถลบได้');
      showToast('ลบสินค้าสำเร็จ');
      setDataFetched(false);
      fetchData();
    } catch (err) {
      console.error('Error deleting:', err);
      showToast(err instanceof Error ? err.message : 'ไม่สามารถลบได้', 'error');
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `ต้องการลบสินค้า ${selectedIds.size} รายการ?`, variant: 'danger' }); if (!ok) return;
    setBulkDeleting(true);
    try {
      const ids = [...selectedIds].join(',');
      const response = await apiFetch(`/api/products?ids=${ids}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ไม่สามารถลบได้');
      showToast(`ลบสินค้า ${selectedIds.size} รายการสำเร็จ`);
      setSelectedIds(new Set());
      setDataFetched(false);
      fetchData();
    } catch (err) {
      console.error('Bulk delete error:', err);
      showToast(err instanceof Error ? err.message : 'ไม่สามารถลบได้', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Bulk assign brand
  const existingBrandCount = productsList.filter(p => selectedIds.has(p.product_id) && p.brand_id).length;

  const handleBulkAssignBrand = async () => {
    if (!bulkBrandId || selectedIds.size === 0) return;
    setBulkBrandSaving(true);
    try {
      const response = await apiFetch('/api/products/bulk-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: [...selectedIds], brand_id: bulkBrandId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ไม่สามารถกำหนด Brand ได้');
      const brandName = brands.find(b => b.id === bulkBrandId)?.name || '';
      showToast(`กำหนด Brand "${brandName}" ให้สินค้า ${selectedIds.size} รายการสำเร็จ`);
      setSelectedIds(new Set());
      setShowBrandModal(false);
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถกำหนด Brand ได้', 'error');
    } finally {
      setBulkBrandSaving(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Clear selection when filters/page change
  useEffect(() => { setSelectedIds(new Set()); }, [debouncedSearch, typeFilter, categoryFilter, brandFilter, shopAccountFilter, currentPage]);

  // Client-side filter (only type filter — rest is server-side)
  const filteredProducts = productsList.filter(product => {
    if (typeFilter !== '' && product.product_type !== typeFilter) return false;
    return true;
  });

  // Pagination — server provides total count, products are already paginated
  const totalFiltered = typeFilter === '' ? totalProducts : filteredProducts.length;
  const totalPages = Math.ceil(totalFiltered / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  // Products are already paginated from server — no need to slice again
  const paginatedProducts = filteredProducts;

  // Select all on current page
  const allPageSelected = paginatedProducts.length > 0 && paginatedProducts.every(p => selectedIds.has(p.product_id));
  const toggleSelectAll = () => {
    const pageIds = paginatedProducts.map(p => p.product_id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageIds.forEach(id => next.delete(id));
      } else {
        pageIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // Clear error alert
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => { setError(''); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#F4511E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">กำลังโหลดข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (!userProfile) return null;

  const thClass = "data-th";

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">สินค้า</h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">จัดการสินค้า (สินค้าปกติ หรือ สินค้าย่อย)</p>
          </div>
          <button
            onClick={() => router.push('/products/new')}
            className="flex items-center space-x-2 px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white rounded-lg font-semibold transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>เพิ่ม<span className="hidden md:inline">สินค้า</span></span>
          </button>
        </div>


        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')}><X className="w-5 h-5" /></button>
          </div>
        )}

        {/* Products Table */}
            {/* Search + Type Filter + Column Settings */}
            <div className="data-filter-card">
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-full md:flex-1 md:min-w-0">
                  <SearchInput value={searchInput} onChange={handleSearchChange} placeholder="ค้นหาชื่อ, รหัส, SKU, Barcode..." className="py-2" />
                </div>
                <div className="flex-1 min-w-0">
                  <FormSelect
                    value={typeFilter}
                    onChange={(v: string) => setParams({ type: v })}
                    options={[
                      { id: 'simple', label: 'สินค้าปกติ' },
                      { id: 'variation', label: 'สินค้าย่อย' },
                    ]}
                    clearLabel="ทั้งหมด"
                    placeholder="ประเภท"
                    searchThreshold={99}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <FormSelect
                    value={categoryFilter}
                    onChange={(v: string) => setParams({ cat: v })}
                    options={categories.flatMap(parent =>
                      parent.children && parent.children.length > 0
                        ? [
                            { id: parent.id, label: parent.name },
                            ...parent.children.map(child => ({ id: child.id, label: child.name, subtitle: parent.name })),
                          ]
                        : [{ id: parent.id, label: parent.name }]
                    )}
                    clearLabel="ทุกหมวดหมู่"
                    placeholder="หมวดหมู่"
                    searchPlaceholder="ค้นหาหมวดหมู่..."
                  />
                </div>
                {features.product_brand && (
                  <div className="flex-1 min-w-0">
                    <FormSelect
                      value={brandFilter}
                      onChange={(v: string) => setParams({ brand: v })}
                      options={brands.map(b => ({ id: b.id, label: b.name }))}
                      clearLabel="ทุกแบรนด์"
                      placeholder="แบรนด์"
                      searchPlaceholder="ค้นหาแบรนด์..."
                    />
                  </div>
                )}
                {shopOptions.length > 0 && (
                  <div className="flex-shrink-0">
                    <SearchableDropdown
                      value={shopAccountFilter}
                      onChange={(v: string) => setParams({ shop: v })}
                      options={shopOptions}
                      placeholder="ร้านค้า"
                      searchPlaceholder="ค้นหาร้านค้า..."
                      allLabel="ทุกร้านค้า"
                    />
                  </div>
                )}
                {hasActiveFilters && (
                  <button
                    onClick={clearAllFilters}
                    className="flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0 whitespace-nowrap"
                  >
                    <FilterX className="w-3.5 h-3.5" />
                    ล้างตัวกรอง
                  </button>
                )}
              </div>
            </div>

            {/* Bulk Action Bar — floating bottom */}
            {selectedIds.size > 0 && (
              <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 shadow-lg px-6 py-3">
                <div className="max-w-screen-xl mx-auto flex items-center justify-between">
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="text-sm text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                  >
                    clear all
                  </button>
                  <div className="flex items-center gap-2">
                    {features.product_brand && brands.length > 0 && (
                      <button
                        onClick={() => { setBulkBrandId(''); setShowBrandModal(true); }}
                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium transition-colors"
                      >
                        <Award className="w-4 h-4" />
                        กำหนด Brand
                      </button>
                    )}
                    <button
                      onClick={handleBulkDelete}
                      disabled={bulkDeleting}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      {bulkDeleting ? 'กำลังลบ...' : `ลบ ${selectedIds.size} รายการ`}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Bulk Assign Brand Modal */}
            {showBrandModal && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShowBrandModal(false)}>
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
                    กำหนด Brand ให้สินค้า {selectedIds.size} รายการ
                  </h3>

                  {existingBrandCount > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2.5 mb-4">
                      <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        สินค้า {selectedIds.size} รายการที่เลือก มี {existingBrandCount} รายการที่มี Brand อยู่แล้ว — จะถูกเปลี่ยนเป็น Brand ใหม่
                      </p>
                    </div>
                  )}

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">เลือก Brand</label>
                    <FormSelect
                      value={bulkBrandId}
                      onChange={setBulkBrandId}
                      options={brands.map(b => ({ id: b.id, label: b.name }))}
                      placeholder="เลือกแบรนด์..."
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setShowBrandModal(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      onClick={handleBulkAssignBrand}
                      disabled={!bulkBrandId || bulkBrandSaving}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                    >
                      {bulkBrandSaving ? 'กำลังบันทึก...' : 'ยืนยัน'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Products Table */}
            <div className="data-table-wrap relative">
              {/* Loading overlay for page/filter changes */}
              {fetching && !loading && (
                <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 z-10 flex items-center justify-center rounded-xl">
                  <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
                </div>
              )}
              <div className="overflow-x-auto">
              <table className="data-table-fixed">
                <thead className="data-thead">
                  <tr>
                    <th className="w-[36px] px-1 py-2 text-center">
                      <Checkbox checked={allPageSelected} onChange={() => toggleSelectAll()} />
                    </th>
                    {isCol('image') && <th className={`${thClass} !px-1`} style={{ width: '72px', minWidth: '72px' }}>รูป</th>}
                    {isCol('nameCode') && <th className={`${thClass} !px-2`} style={{ minWidth: '340px' }}>ชื่อ/รหัส</th>}
                    {isCol('price') && <th className={`${thClass} !px-2`} style={{ minWidth: '180px' }}>ราคา</th>}
                    {isCol('brand') && <th className={`${thClass} !px-2`}>Brand</th>}
                    {isCol('type') && <th className={`${thClass} !px-2 w-[80px]`}>ประเภท</th>}
                    {isCol('status') && <th className={`${thClass} !px-1 w-[50px] text-center`}>สถานะ</th>}
                    {isCol('actions') && <th className={`${thClass} !px-1 w-[44px] text-center`}>จัดการ</th>}
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {paginatedProducts.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.size + 1} className="px-6 py-8 text-center text-gray-500 dark:text-slate-400">ไม่พบข้อมูลสินค้า</td>
                    </tr>
                  ) : (
                    paginatedProducts.map((product) => (
                      <tr key={product.product_id} className="data-tr">
                        {/* Checkbox */}
                        <td className="w-[36px] px-1 py-2 text-center">
                          <Checkbox checked={selectedIds.has(product.product_id)} onChange={() => toggleSelect(product.product_id)} />
                        </td>
                        {/* Image */}
                        {isCol('image') && (
                          <td className="px-1 py-1.5 whitespace-nowrap" style={{ width: '72px', minWidth: '72px' }}>
                            {(product.main_image_url || product.image) ? (
                              <img
                                src={product.main_image_url || getImageUrl(product.image)}
                                alt={product.name}
                                style={{ width: '56px', height: '56px', minWidth: '56px', minHeight: '56px' }}
                                className="object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setLightboxImage(product.main_image_url || getImageUrl(product.image))}
                              />
                            ) : (
                              <div
                                style={{ width: '56px', height: '56px', minWidth: '56px', minHeight: '56px' }}
                                className="bg-gray-200 dark:bg-slate-700 rounded flex items-center justify-center"
                              >
                                <Package2 className="w-7 h-7 text-gray-400" />
                              </div>
                            )}
                          </td>
                        )}

                        {/* Name / Code */}
                        {isCol('nameCode') && (
                          <td className="px-2 py-2">
                            <div className="data-primary text-gray-900 dark:text-slate-100 text-base line-clamp-2">
                              {product.name}
                            </div>
                            <div className="code-text text-gray-400 dark:text-slate-500">{product.code}</div>
                          </td>
                        )}

                        {/* Price (+ inline SKU/Barcode) */}
                        {isCol('price') && (
                          <td className="px-2 py-2">
                            {product.product_type === 'simple' ? (
                              <div>
                                <div className="text-base flex items-center space-x-1">
                                  <span className="text-gray-400 font-medium">฿</span>
                                  <span>{formatNumber(product.simple_default_price)}</span>
                                  {product.simple_discount_price != null && product.simple_discount_price > 0 && (
                                    <span className="text-red-600 dark:text-red-400">(฿{formatNumber(product.simple_discount_price)})</span>
                                  )}
                                </div>
                                {(isCol('sku') || isCol('barcode')) && (product.simple_sku || product.simple_barcode) && (
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {isCol('sku') && product.simple_sku && (
                                      <span className="data-muted text-gray-400 dark:text-slate-500">SKU: <span className="code-text">{product.simple_sku}</span></span>
                                    )}
                                    {isCol('barcode') && product.simple_barcode && (
                                      <span className="data-muted text-gray-400 dark:text-slate-500">BC: <span className="code-text">{product.simple_barcode}</span></span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {product.variations && product.variations.length > 0 ? (
                                  product.variations.map((v) => (
                                    <div key={v.variation_id || `${product.product_id}-${v.variation_label}`}>
                                      <div className="text-base flex items-center space-x-1">
                                        <Wine className="w-3.5 h-3.5 text-gray-400" />
                                        <span className="data-secondary text-gray-500 dark:text-slate-400">{v.variation_label}</span>
                                        <span className="text-gray-400 font-medium ml-1">฿</span>
                                        <span>{formatNumber(v.default_price)}</span>
                                        {v.discount_price > 0 && (
                                          <span className="text-red-600 dark:text-red-400">(฿{formatNumber(v.discount_price)})</span>
                                        )}
                                      </div>
                                      {(isCol('sku') || isCol('barcode')) && (v.sku || v.barcode) && (
                                        <div className="flex items-center gap-2 ml-5">
                                          {isCol('sku') && v.sku && (
                                            <span className="data-muted text-gray-400 dark:text-slate-500">SKU: <span className="code-text">{v.sku}</span></span>
                                          )}
                                          {isCol('barcode') && v.barcode && (
                                            <span className="data-muted text-gray-400 dark:text-slate-500">BC: <span className="code-text">{v.barcode}</span></span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <span className="data-muted text-gray-400 dark:text-slate-500 text-base">ไม่มีสินค้าย่อย</span>
                                )}
                              </div>
                            )}
                          </td>
                        )}

                        {/* Brand */}
                        {isCol('brand') && (
                          <td className="px-2 py-2 whitespace-nowrap">
                            {product.brand_id ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-xs font-medium">
                                <Award className="w-3 h-3" />
                                {brands.find(b => b.id === product.brand_id)?.name || '-'}
                              </span>
                            ) : (
                              <span className="data-muted text-gray-400 dark:text-slate-500">-</span>
                            )}
                          </td>
                        )}

                        {/* Type */}
                        {isCol('type') && (
                          <td className="px-2 py-2 whitespace-nowrap">
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                              product.product_type === 'simple'
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            }`}>
                              {product.product_type === 'simple' ? 'ปกติ' : 'ย่อย'}
                            </span>
                          </td>
                        )}

                        {/* Status */}
                        {isCol('status') && (
                          <td className="px-1 py-2 whitespace-nowrap text-center">
                            <ActiveBadge isActive={product.is_active} />
                          </td>
                        )}

                        {/* Actions — dropdown menu */}
                        {isCol('actions') && (
                          <td className="px-1 py-2 whitespace-nowrap text-center">
                            <ActionMenu
                              productId={product.product_id}
                              onEdit={() => window.open(`/products/${product.product_id}/edit`, '_blank')}
                              onDuplicate={() => router.push(`/products/new?duplicate=${product.product_id}`)}
                              onDelete={() => handleDelete(product)}
                            />
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalRecords={totalFiltered}
                startIdx={startIndex}
                endIdx={Math.min(startIndex + rowsPerPage, totalFiltered)}
                recordsPerPage={rowsPerPage}
                setRecordsPerPage={(v: number) => setParams({ limit: String(v) })}
                setPage={(p: number) => setParams({ page: String(p) })}
                loadTime={loadTime}
              >
                <ColumnSettingsDropdown
                  configs={COLUMN_CONFIGS}
                  visible={visibleColumns}
                  toggle={toggleColumn}
                  buttonClassName="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                  dropUp
                />
              </Pagination>
            </div>
      </div>

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
          onClick={() => setLightboxImage(null)}
          role="dialog"
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImage}
            alt="Product"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {confirmDialog}
    </Layout>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    }>
      <ProductsPageContent />
    </Suspense>
  );
}

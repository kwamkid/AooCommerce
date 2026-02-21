// Path: app/products/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { getImageUrl } from '@/lib/utils/image';
import { formatPrice, formatNumber } from '@/lib/utils/format';
import { useFeatures } from '@/lib/features-context';
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
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';
import Checkbox from '@/components/ui/Checkbox';
import SearchableDropdown, { DropdownOption } from '@/components/ui/SearchableDropdown';

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
type ColumnKey = 'image' | 'nameCode' | 'type' | 'price' | 'sku' | 'barcode' | 'status' | 'actions';

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
  { key: 'type', label: 'ประเภท', defaultVisible: true },
  { key: 'price', label: 'ราคา', defaultVisible: true },
  { key: 'sku', label: 'SKU', defaultVisible: false },
  { key: 'barcode', label: 'Barcode', defaultVisible: false },
  { key: 'status', label: 'สถานะ', defaultVisible: true },
  { key: 'actions', label: 'จัดการ', defaultVisible: true, alwaysVisible: true },
];

const STORAGE_KEY = 'products-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="flex items-center text-green-600">
      <Check className="w-4 h-4 mr-1" />
      <span className="text-sm">ใช้งาน</span>
    </span>
  ) : (
    <span className="flex items-center text-gray-600 dark:text-slate-400">
      <X className="w-4 h-4 mr-1" />
      <span className="text-sm">ปิดใช้งาน</span>
    </span>
  );
}

export default function ProductsPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();

  const [productsList, setProductsList] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false); // loading indicator for page changes
  const [dataFetched, setDataFetched] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'simple' | 'variation'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [shopAccountFilter, setShopAccountFilter] = useState<string>('all');
  const [shopOptions, setShopOptions] = useState<DropdownOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [error, setError] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

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
  const fetchData = async (pageNum?: number, perPage?: number) => {
    const t0 = Date.now();
    setFetching(true);
    try {
      const p = pageNum ?? currentPage;
      const l = perPage ?? rowsPerPage;
      const params = new URLSearchParams({ page: String(p), limit: String(l), include_shop_options: '1' });
      if (searchTerm) params.set('search', searchTerm);
      if (categoryFilter !== 'all') params.set('category_id', categoryFilter);
      if (brandFilter !== 'all') params.set('brand_id', brandFilter);
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

  // Re-fetch when pagination/filters change (after initial load)
  useEffect(() => {
    if (dataFetched) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage]);

  // Debounced re-fetch when server-side filters change
  useEffect(() => {
    if (!dataFetched) return;
    const timer = setTimeout(() => {
      setCurrentPage(1);
      fetchData(1);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, categoryFilter, brandFilter, shopAccountFilter]);

  // Handle delete
  const handleDelete = async (product: ProductItem) => {
    if (!confirm(`คุณต้องการลบ ${product.name} หรือไม่?`)) return;
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
    if (!confirm(`คุณต้องการลบสินค้า ${selectedIds.size} รายการ หรือไม่?`)) return;
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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Clear selection when filters/page change
  useEffect(() => { setSelectedIds(new Set()); }, [searchTerm, typeFilter, categoryFilter, brandFilter, shopAccountFilter, currentPage]);

  // Client-side filter (only type filter — rest is server-side)
  const filteredProducts = productsList.filter(product => {
    if (typeFilter !== 'all' && product.product_type !== typeFilter) return false;
    return true;
  });

  // Pagination — server provides total count, products are already paginated
  const totalFiltered = typeFilter === 'all' ? totalProducts : filteredProducts.length;
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

  useEffect(() => { setCurrentPage(1); }, [typeFilter]);

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
            <span>เพิ่มสินค้า</span>
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
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="ค้นหาชื่อ, รหัส, SKU, Barcode..." className="py-2" />
                </div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as 'all' | 'simple' | 'variation')}
                  className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                >
                  <option value="all">ทั้งหมด</option>
                  <option value="simple">สินค้าปกติ</option>
                  <option value="variation">สินค้าย่อย</option>
                </select>
                {/* Category filter */}
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                >
                  <option value="all">ทุกหมวดหมู่</option>
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

                {/* Brand filter — only when feature enabled */}
                {features.product_brand && (
                  <select
                    value={brandFilter}
                    onChange={e => setBrandFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
                  >
                    <option value="all">ทุกแบรนด์</option>
                    {brands.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                )}

                {/* Shop account filter */}
                {shopOptions.length > 0 && (
                  <SearchableDropdown
                    value={shopAccountFilter}
                    onChange={setShopAccountFilter}
                    options={shopOptions}
                    placeholder="ร้านค้า"
                    searchPlaceholder="ค้นหาร้านค้า..."
                    allLabel="ทุกร้านค้า"
                  />
                )}
              </div>
            </div>

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                <span className="text-sm text-red-700 dark:text-red-300 font-medium">
                  เลือก {selectedIds.size} รายการ
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    {bulkDeleting ? 'กำลังลบ...' : `ลบ ${selectedIds.size} รายการ`}
                  </button>
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
                    <th className="w-[44px] px-3 py-3 text-center">
                      <Checkbox checked={allPageSelected} onChange={() => toggleSelectAll()} />
                    </th>
                    {isCol('image') && <th className={`${thClass} w-[88px]`}>รูปภาพ</th>}
                    {isCol('nameCode') && <th className={thClass}>ชื่อ/รหัส</th>}
                    {isCol('type') && <th className={thClass}>ประเภท</th>}
                    {isCol('price') && <th className={thClass}>ราคา</th>}
                    {isCol('status') && <th className={thClass}>สถานะ</th>}
                    {isCol('actions') && <th className={`${thClass} text-right`}>จัดการ</th>}
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
                        <td className="w-[44px] px-3 py-3 text-center">
                          <Checkbox checked={selectedIds.has(product.product_id)} onChange={() => toggleSelect(product.product_id)} />
                        </td>
                        {/* Image */}
                        {isCol('image') && (
                          <td className="px-3 py-3 whitespace-nowrap w-[88px]">
                            {(product.main_image_url || product.image) ? (
                              <img
                                src={product.main_image_url || getImageUrl(product.image)}
                                alt={product.name}
                                className="w-16 h-16 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setLightboxImage(product.main_image_url || getImageUrl(product.image))}
                              />
                            ) : (
                              <div className="w-16 h-16 bg-gray-200 dark:bg-slate-700 rounded flex items-center justify-center">
                                <Package2 className="w-8 h-8 text-gray-400" />
                              </div>
                            )}
                          </td>
                        )}

                        {/* Name / Code */}
                        {isCol('nameCode') && (
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {product.name}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-slate-500">{product.code}</div>
                          </td>
                        )}

                        {/* Type */}
                        {isCol('type') && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                              product.product_type === 'simple'
                                ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                            }`}>
                              {product.product_type === 'simple' ? 'สินค้าปกติ' : 'สินค้าย่อย'}
                            </span>
                          </td>
                        )}

                        {/* Price (+ inline SKU/Barcode) */}
                        {isCol('price') && (
                          <td className="px-6 py-4">
                            {product.product_type === 'simple' ? (
                              <div>
                                <div className="text-sm flex items-center space-x-1">
                                  <span className="text-gray-400 font-medium">฿</span>
                                  <span>{formatNumber(product.simple_default_price)}</span>
                                  {product.simple_discount_price != null && product.simple_discount_price > 0 && (
                                    <span className="text-red-600 dark:text-red-400">(฿{formatNumber(product.simple_discount_price)})</span>
                                  )}
                                </div>
                                {(isCol('sku') || isCol('barcode')) && (product.simple_sku || product.simple_barcode) && (
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {isCol('sku') && product.simple_sku && (
                                      <span className="text-xs text-gray-400 dark:text-slate-500">SKU: {product.simple_sku}</span>
                                    )}
                                    {isCol('barcode') && product.simple_barcode && (
                                      <span className="text-xs text-gray-400 dark:text-slate-500">BC: {product.simple_barcode}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {product.variations && product.variations.length > 0 ? (
                                  product.variations.map((v) => (
                                    <div key={v.variation_id || `${product.product_id}-${v.variation_label}`}>
                                      <div className="text-sm flex items-center space-x-1">
                                        <Wine className="w-3.5 h-3.5 text-gray-400" />
                                        <span className="text-gray-500 dark:text-slate-400">{v.variation_label}</span>
                                        <span className="text-gray-400 font-medium ml-1">฿</span>
                                        <span>{formatNumber(v.default_price)}</span>
                                        {v.discount_price > 0 && (
                                          <span className="text-red-600 dark:text-red-400">(฿{formatNumber(v.discount_price)})</span>
                                        )}
                                      </div>
                                      {(isCol('sku') || isCol('barcode')) && (v.sku || v.barcode) && (
                                        <div className="flex items-center gap-2 ml-5">
                                          {isCol('sku') && v.sku && (
                                            <span className="text-xs text-gray-400 dark:text-slate-500">SKU: {v.sku}</span>
                                          )}
                                          {isCol('barcode') && v.barcode && (
                                            <span className="text-xs text-gray-400 dark:text-slate-500">BC: {v.barcode}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-sm text-gray-400 dark:text-slate-500">ไม่มีสินค้าย่อย</span>
                                )}
                              </div>
                            )}
                          </td>
                        )}

                        {/* Status */}
                        {isCol('status') && (
                          <td className="px-6 py-4 whitespace-nowrap">
                            <ActiveBadge isActive={product.is_active} />
                          </td>
                        )}

                        {/* Actions */}
                        {isCol('actions') && (
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                            <button
                              onClick={() => router.push(`/products/${product.product_id}/edit`)}
                              className="text-[#F4511E] hover:text-[#D63B0E] inline-flex items-center"
                              title="แก้ไข"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => router.push(`/products/new?duplicate=${product.product_id}`)}
                              className="text-blue-500 hover:text-blue-600 inline-flex items-center"
                              title="คัดลอกสินค้า"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(product)}
                              className="text-red-600 hover:text-red-700 inline-flex items-center"
                              title="ลบ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
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
                setRecordsPerPage={setRowsPerPage}
                setPage={setCurrentPage}
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

    </Layout>
  );
}

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { Loader2, Search, Package2, Pencil, Eye, EyeOff, ClipboardList, X, Warehouse, FilterX } from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';
import Pagination from '@/app/components/Pagination';
import AdjustStockModal from './AdjustStockModal';
import {
  InventoryItem, WarehouseItem, StockColumnKey,
  STOCK_COLUMN_CONFIGS, STOCK_COLUMNS_STORAGE_KEY,
  getVariationLabel, getProductDisplayName, getProductSubtitle,
} from './types';

interface FilterOption { id: string; label: string; subtitle?: string }

type StockFilterValue = 'all' | 'normal' | 'low' | 'out' | 'negative' | 'empty';

interface StockTabProps {
  warehouses: WarehouseItem[];
  onViewHistory?: (variationId: string, productLabel: string) => void;
}

export default function StockTab({ warehouses, onViewHistory }: StockTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { features } = useFeatures();

  // Read filters from URL search params (persistent across refresh)
  const search = searchParams.get('q') || '';
  const warehouse = searchParams.get('wh') || '';
  const stockFilter = (searchParams.get('stock') || 'all') as StockFilterValue;
  const hideEmpty = searchParams.get('hide_empty') === '1';
  const categoryFilter = searchParams.get('cat') || '';
  const brandFilter = searchParams.get('brand') || '';
  const supplierFilter = searchParams.get('sup') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);
  const recordsPerPage = parseInt(searchParams.get('limit') || '20', 10);

  // Helper to update URL params without full page reload
  const setParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === '' || val === 'all' || val === '0') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    }
    // Always reset to page 1 when any filter changes (except page itself)
    if (!('page' in updates)) {
      params.delete('page');
    }
    const qs = params.toString();
    router.replace(`/inventory${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router]);

  // Check if any filter is active
  const hasActiveFilters = search || warehouse || stockFilter !== 'all' || hideEmpty || categoryFilter || brandFilter || supplierFilter;

  const clearAllFilters = () => {
    router.replace('/inventory', { scroll: false });
  };

  // Debounced search
  const [searchInput, setSearchInput] = useState(search);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => { setSearchInput(search); }, [search]);

  const handleSearchInput = (val: string) => {
    setSearchInput(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setParams({ q: val || null });
    }, 500);
  };

  // Data state
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loadTime, setLoadTime] = useState<number | null>(null);

  // Filter options
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [brands, setBrands] = useState<FilterOption[]>([]);
  const [suppliers, setSuppliers] = useState<FilterOption[]>([]);

  // Fetch filter options once
  const filtersFetchedRef = useRef(false);
  useEffect(() => {
    if (filtersFetchedRef.current) return;
    filtersFetchedRef.current = true;
    const fetchFilters = async () => {
      try {
        const res = await apiFetch('/api/products/form-options');
        if (!res.ok) return;
        const data = await res.json();
        // Categories: flatten parent+children
        const cats: FilterOption[] = [];
        for (const parent of (data.categories || [])) {
          cats.push({ id: parent.id, label: parent.name });
          if (parent.children) {
            for (const child of parent.children) {
              cats.push({ id: child.id, label: child.name, subtitle: parent.name });
            }
          }
        }
        setCategories(cats);
        // Brands
        setBrands((data.brands || []).map((b: { id: string; name: string }) => ({ id: b.id, label: b.name })));
        // Suppliers (unique from brands)
        const supMap = new Map<string, string>();
        for (const b of (data.brands || [])) {
          if (b.supplier?.id) supMap.set(b.supplier.id, b.supplier.name);
        }
        setSuppliers(Array.from(supMap, ([id, name]) => ({ id, label: name })));
      } catch { /* ignore */ }
    };
    fetchFilters();
  }, []);

  // Column toggle
  const [visibleColumns, setVisibleColumns] = useState<Set<StockColumnKey>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STOCK_COLUMNS_STORAGE_KEY);
      if (stored) {
        try { return new Set(JSON.parse(stored) as StockColumnKey[]); } catch { /* defaults */ }
      }
    }
    return new Set(STOCK_COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key));
  });

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxImage) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [lightboxImage]);

  // Adjust modal
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);

  const toggleColumn = (key: StockColumnKey) => {
    const config = STOCK_COLUMN_CONFIGS.find(c => c.key === key);
    if (config?.alwaysVisible) return;
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(STOCK_COLUMNS_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const fetchInventory = async () => {
    setLoading(true);
    const t0 = Date.now();
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(recordsPerPage));
      if (warehouse) params.set('warehouse_id', warehouse);
      if (search) params.set('search', search);
      if (stockFilter === 'low') params.set('low_stock', 'true');
      if (categoryFilter) params.set('category_id', categoryFilter);
      if (brandFilter) params.set('brand_id', brandFilter);
      if (supplierFilter) params.set('supplier_id', supplierFilter);

      const res = await apiFetch(`/api/inventory?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setLowStockCount(data.lowStockCount || 0);
      setLoadTime((Date.now() - t0) / 1000);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
      setLoadTime(null);
    } finally {
      setLoading(false);
    }
  };

  // Fetch when URL params change
  const depsKey = `${page}-${recordsPerPage}-${warehouse}-${search}-${stockFilter}-${categoryFilter}-${brandFilter}-${supplierFilter}`;
  const fetchedRef = useRef(false);
  const prevDepsRef = useRef(depsKey);

  useEffect(() => {
    const depsChanged = prevDepsRef.current !== depsKey;
    prevDepsRef.current = depsKey;

    if (fetchedRef.current && !depsChanged) return;
    fetchedRef.current = true;
    fetchInventory();
  }, [depsKey]);

  const openAdjustModal = (item: InventoryItem) => {
    setAdjustItem(item);
  };

  const getInitialWarehouseId = () => {
    if (warehouse) return warehouse;
    if (warehouses.length === 1) return warehouses[0].id;
    return '';
  };

  // Display — apply client-side filters
  const displayedItems = items.filter(item => {
    if (hideEmpty && item.quantity <= 0 && item.reserved_quantity <= 0) return false;
    if (stockFilter === 'normal' && (item.is_out_of_stock || item.is_low_stock || item.available < 0)) return false;
    if (stockFilter === 'out' && !item.is_out_of_stock) return false;
    if (stockFilter === 'negative' && item.available >= 0) return false;
    if (stockFilter === 'empty' && !(item.quantity === 0 && item.reserved_quantity === 0)) return false;
    return true;
  });
  const hasClientFilter = hideEmpty || (stockFilter !== 'all' && stockFilter !== 'low');
  const effectiveTotal = hasClientFilter ? displayedItems.length : total;
  const totalPages = hasClientFilter ? 1 : Math.ceil(total / recordsPerPage);
  const startIdx = hasClientFilter ? 0 : (page - 1) * recordsPerPage;
  const endIdx = hasClientFilter ? displayedItems.length : Math.min(startIdx + displayedItems.length, total);

  function getStockBadge(item: InventoryItem) {
    if (item.quantity === 0 && item.reserved_quantity === 0) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 font-medium">ยังไม่มี</span>;
    }
    if (item.is_out_of_stock) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">หมด</span>;
    }
    if (item.is_low_stock) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium">ต่ำ</span>;
    }
    if (item.min_stock > 0 && item.available <= item.min_stock * 1.5) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium">ใกล้หมด</span>;
    }
    return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-medium">ปกติ</span>;
  }

  return (
    <>
      {/* Filters */}
      <div className="data-filter-card space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={e => handleSearchInput(e.target.value)}
              placeholder="ค้นหาชื่อ, รหัส, SKU..."
              className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            />
          </div>
          {warehouses.length > 1 && (
            <div className="w-40">
              <FormSelect
                value={warehouse}
                onChange={v => setParams({ wh: v || null })}
                options={warehouses.map(wh => ({ id: wh.id, label: wh.name }))}
                clearLabel="ทุกคลัง"
                icon={<Warehouse className="w-4 h-4" />}
              />
            </div>
          )}
          <button
            onClick={() => setParams({ hide_empty: hideEmpty ? null : '1' })}
            className={`h-[42px] px-2.5 border rounded-lg transition-colors flex items-center ${
              hideEmpty
                ? 'border-[#F4511E] bg-[#F4511E]/10 text-[#F4511E]'
                : 'border-gray-300 dark:border-slate-500 text-gray-400 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700/50'
            }`}
            title={hideEmpty ? 'แสดงสินค้าหมด/ว่าง' : 'ซ่อนสินค้าหมด/ว่าง'}
          >
            {hideEmpty ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
        {/* Category / Brand / Supplier filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {categories.length > 0 && (
            <div className="w-[calc(50%-0.25rem)] sm:w-40">
              <FormSelect
                value={categoryFilter}
                onChange={v => setParams({ cat: v || null })}
                options={categories}
                clearLabel="ทุกหมวดหมู่"
                placeholder="หมวดหมู่"
                searchPlaceholder="ค้นหาหมวดหมู่..."
              />
            </div>
          )}
          {features.product_brand && brands.length > 0 && (
            <div className="w-[calc(50%-0.25rem)] sm:w-40">
              <FormSelect
                value={brandFilter}
                onChange={v => setParams({ brand: v || null })}
                options={brands}
                clearLabel="ทุกแบรนด์"
                placeholder="แบรนด์"
                searchPlaceholder="ค้นหาแบรนด์..."
              />
            </div>
          )}
          {suppliers.length > 0 && (
            <div className="w-[calc(50%-0.25rem)] sm:w-40">
              <FormSelect
                value={supplierFilter}
                onChange={v => setParams({ sup: v || null })}
                options={suppliers}
                clearLabel="ทุก Supplier"
                placeholder="Supplier"
                searchPlaceholder="ค้นหา Supplier..."
              />
            </div>
          )}
          {/* Clear all filters */}
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <FilterX className="w-3.5 h-3.5" />
              ล้างตัวกรอง
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            { value: 'all', label: 'ทั้งหมด' },
            { value: 'normal', label: 'ปกติ' },
            { value: 'low', label: `ต่ำกว่า Min${lowStockCount > 0 ? ` (${lowStockCount})` : ''}` },
            { value: 'out', label: 'หมด' },
            { value: 'negative', label: 'ติดลบ' },
            { value: 'empty', label: 'ยังไม่มี stock' },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => setParams({ stock: opt.value === 'all' ? null : opt.value })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                stockFilter === opt.value
                  ? 'bg-[#F4511E] text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" /></div>
      ) : displayedItems.length === 0 ? (
        <div className="text-center py-16">
          <Package2 className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400 text-sm">
            {hasActiveFilters ? 'ไม่พบสินค้าที่ตรงกับตัวกรอง' : 'ยังไม่มีสินค้า กรุณาเพิ่มสินค้าก่อน'}
          </p>
        </div>
      ) : (
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table-fixed">
              <thead className="data-thead">
                <tr>
                  {visibleColumns.has('image') && <th className="data-th !pl-4 !pr-1" style={{ width: '80px', minWidth: '80px' }}>รูป</th>}
                  {visibleColumns.has('product') && <th className="data-th !px-2" style={{ minWidth: '240px' }}>ชื่อสินค้า</th>}
                  {visibleColumns.has('sku') && <th className="data-th">SKU</th>}
                  {visibleColumns.has('quantity') && <th className="data-th text-right">จำนวน</th>}
                  {visibleColumns.has('reserved') && <th className="data-th text-right">จอง</th>}
                  {visibleColumns.has('available') && <th className="data-th text-right">พร้อมขาย</th>}
                  {visibleColumns.has('min') && <th className="data-th text-right">Min</th>}
                  {visibleColumns.has('status') && <th className="data-th text-center" style={{ minWidth: '80px' }}>สถานะ</th>}
                  {visibleColumns.has('actions') && <th className="data-th text-center w-20"></th>}
                </tr>
              </thead>
              <tbody className="data-tbody">
                {displayedItems.map(item => {
                  const displayName = getProductDisplayName(item);
                  return (
                    <tr key={item.id} className="data-tr">
                      {visibleColumns.has('image') && (
                        <td className="pl-4 pr-1 py-1.5 whitespace-nowrap" style={{ width: '80px', minWidth: '80px' }}>
                          {item.product_image ? (
                            <img
                              src={item.product_image}
                              alt=""
                              style={{ width: '56px', height: '56px', minWidth: '56px', minHeight: '56px' }}
                              className="object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => setLightboxImage(item.product_image!)}
                            />
                          ) : (
                            <div
                              style={{ width: '56px', height: '56px', minWidth: '56px', minHeight: '56px' }}
                              className="bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center"
                            >
                              <Package2 className="w-7 h-7 text-gray-400" />
                            </div>
                          )}
                        </td>
                      )}
                      {visibleColumns.has('product') && (
                        <td className="px-2 py-2">
                          <div className="data-primary text-gray-900 dark:text-white line-clamp-2">{displayName}</div>
                          <div className="data-secondary text-gray-400 dark:text-slate-500">{getProductSubtitle(item)}</div>
                        </td>
                      )}
                      {visibleColumns.has('sku') && (
                        <td className="px-6 py-4 text-gray-600 dark:text-slate-300 font-mono text-sm">{item.sku || '-'}</td>
                      )}
                      {visibleColumns.has('quantity') && (
                        <td className="px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-white">{item.quantity.toLocaleString()}</td>
                      )}
                      {visibleColumns.has('reserved') && (
                        <td className="px-6 py-4 text-right text-sm text-amber-600 dark:text-amber-400">{item.reserved_quantity > 0 ? item.reserved_quantity.toLocaleString() : '-'}</td>
                      )}
                      {visibleColumns.has('available') && (
                        <td className="px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-white">{item.available.toLocaleString()}</td>
                      )}
                      {visibleColumns.has('min') && (
                        <td className="px-6 py-4 text-right text-sm text-gray-500 dark:text-slate-400">{item.min_stock > 0 ? item.min_stock.toLocaleString() : '-'}</td>
                      )}
                      {visibleColumns.has('status') && (
                        <td className="px-6 py-4 text-center whitespace-nowrap">{getStockBadge(item)}</td>
                      )}
                      {visibleColumns.has('actions') && (
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openAdjustModal(item)}
                              className="p-1.5 text-gray-400 hover:text-[#F4511E] hover:bg-[#F4511E]/10 rounded-lg transition-colors"
                              title="ปรับ stock"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => onViewHistory?.(item.variation_id, displayName)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title="ดูประวัติ"
                            >
                              <ClipboardList className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalRecords={effectiveTotal}
            startIdx={startIdx}
            endIdx={endIdx}
            recordsPerPage={recordsPerPage}
            setRecordsPerPage={v => setParams({ limit: String(v) })}
            setPage={v => setParams({ page: v > 1 ? String(v) : null })}
            loadTime={loadTime}
          >
            <ColumnSettingsDropdown
              configs={STOCK_COLUMN_CONFIGS}
              visible={visibleColumns}
              toggle={toggleColumn}
              buttonClassName="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              dropUp
            />
          </Pagination>
        </div>
      )}

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

      {/* Adjust Modal */}
      {adjustItem && (
        <AdjustStockModal
          item={adjustItem}
          warehouses={warehouses}
          initialWarehouseId={getInitialWarehouseId()}
          onClose={() => setAdjustItem(null)}
          onSaved={() => { setAdjustItem(null); fetchInventory(); }}
        />
      )}
    </>
  );
}

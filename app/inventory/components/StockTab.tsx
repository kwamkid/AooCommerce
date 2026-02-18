'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { Loader2, Search, Package2, Pencil, Eye, EyeOff, ClipboardList, X } from 'lucide-react';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';
import Pagination from '@/app/components/Pagination';
import AdjustStockModal from './AdjustStockModal';
import {
  InventoryItem, WarehouseItem, StockColumnKey,
  STOCK_COLUMN_CONFIGS, STOCK_COLUMNS_STORAGE_KEY,
  getVariationLabel, getProductDisplayName,
} from './types';

interface StockTabProps {
  warehouses: WarehouseItem[];
  onViewHistory?: (variationId: string, productLabel: string) => void;
}

export default function StockTab({ warehouses, onViewHistory }: StockTabProps) {
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'normal' | 'low' | 'out' | 'negative' | 'empty'>('all');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [loadTime, setLoadTime] = useState<number | null>(null);

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

  const fetchedRef = useRef(false);
  const depsKey = `${page}-${recordsPerPage}-${warehouse}-${search}-${stockFilter}`;
  const prevDepsRef = useRef(depsKey);

  useEffect(() => {
    const depsChanged = prevDepsRef.current !== depsKey;
    prevDepsRef.current = depsKey;

    if (fetchedRef.current && !depsChanged) return;
    fetchedRef.current = true;
    fetchInventory();
  }, [depsKey]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => setPage(1), 500));
  };

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
    // Hide empty: hide items with 0 quantity AND 0 reserved (including out of stock)
    if (hideEmpty && item.quantity <= 0 && item.reserved_quantity <= 0) return false;
    // Stock status filter (client-side for normal/out/negative; low is API-side)
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
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="ค้นหาชื่อ, รหัส, SKU..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            />
          </div>
          {warehouses.length > 1 && (
            <select
              value={warehouse}
              onChange={e => { setWarehouse(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
            >
              <option value="">ทุกคลัง</option>
              {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
            </select>
          )}
          <button
            onClick={() => setHideEmpty(!hideEmpty)}
            className={`px-2.5 py-2 border rounded-lg transition-colors ${
              hideEmpty
                ? 'border-[#F4511E] bg-[#F4511E]/10 text-[#F4511E]'
                : 'border-gray-300 dark:border-slate-600 text-gray-400 dark:text-slate-500 hover:bg-gray-50 dark:hover:bg-slate-700/50'
            }`}
            title={hideEmpty ? 'แสดงสินค้าหมด/ว่าง' : 'ซ่อนสินค้าหมด/ว่าง'}
          >
            {hideEmpty ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
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
              onClick={() => { setStockFilter(opt.value); setPage(1); }}
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
            {search || stockFilter !== 'all' || hideEmpty ? 'ไม่พบสินค้าที่ตรงกับตัวกรอง' : 'ยังไม่มีสินค้า กรุณาเพิ่มสินค้าก่อน'}
          </p>
        </div>
      ) : (
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  {visibleColumns.has('product') && <th className="data-th">สินค้า</th>}
                  {visibleColumns.has('sku') && <th className="data-th">SKU</th>}
                  {visibleColumns.has('quantity') && <th className="data-th text-right">จำนวน</th>}
                  {visibleColumns.has('reserved') && <th className="data-th text-right">จอง</th>}
                  {visibleColumns.has('available') && <th className="data-th text-right">พร้อมขาย</th>}
                  {visibleColumns.has('min') && <th className="data-th text-right">Min</th>}
                  {visibleColumns.has('status') && <th className="data-th text-center">สถานะ</th>}
                  {visibleColumns.has('actions') && <th className="data-th text-center w-20"></th>}
                </tr>
              </thead>
              <tbody className="data-tbody">
                {displayedItems.map(item => {
                  const displayName = getProductDisplayName(item);
                  return (
                    <tr key={item.id} className="data-tr">
                      {visibleColumns.has('product') && (
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {item.product_image ? (
                              <img
                                src={item.product_image}
                                alt=""
                                className="w-8 h-8 rounded object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => setLightboxImage(item.product_image!)}
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                                <Package2 className="w-4 h-4 text-gray-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-gray-900 dark:text-white truncate">{displayName}</p>
                              <p className="text-xs text-gray-500 dark:text-slate-400">{item.product_code}</p>
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleColumns.has('sku') && (
                        <td className="px-6 py-4 text-gray-600 dark:text-slate-300 font-mono text-xs">{item.sku || '-'}</td>
                      )}
                      {visibleColumns.has('quantity') && (
                        <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-white">{item.quantity.toLocaleString()}</td>
                      )}
                      {visibleColumns.has('reserved') && (
                        <td className="px-6 py-4 text-right text-amber-600 dark:text-amber-400">{item.reserved_quantity > 0 ? item.reserved_quantity.toLocaleString() : '-'}</td>
                      )}
                      {visibleColumns.has('available') && (
                        <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-white">{item.available.toLocaleString()}</td>
                      )}
                      {visibleColumns.has('min') && (
                        <td className="px-6 py-4 text-right text-gray-500 dark:text-slate-400">{item.min_stock > 0 ? item.min_stock.toLocaleString() : '-'}</td>
                      )}
                      {visibleColumns.has('status') && (
                        <td className="px-6 py-4 text-center">{getStockBadge(item)}</td>
                      )}
                      {visibleColumns.has('actions') && (
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => openAdjustModal(item)}
                              className="p-1.5 text-gray-400 hover:text-[#F4511E] hover:bg-[#F4511E]/10 rounded-lg transition-colors"
                              title="ปรับ stock"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onViewHistory?.(item.variation_id, displayName)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title="ดูประวัติ"
                            >
                              <ClipboardList className="w-3.5 h-3.5" />
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
            setRecordsPerPage={setRecordsPerPage}
            setPage={setPage}
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Search, Package2, AlertTriangle, Filter,
  ChevronLeft, ChevronRight, Warehouse
} from 'lucide-react';

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
}

interface InventoryItem {
  id: string;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_code: string;
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  product_image: string | null;
  bottle_size: string;
  sku: string;
  barcode: string;
  attributes: Record<string, string> | null;
  default_price: number;
  quantity: number;
  reserved_quantity: number;
  available: number;
  min_stock: number;
  is_low_stock: boolean;
  is_out_of_stock: boolean;
  updated_at: string;
}

export default function InventoryPage() {
  const { userProfile } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Warehouses for filter
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [page, selectedWarehouse, lowStockOnly]);

  const fetchWarehouses = async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        setWarehouses(data.warehouses || []);
      }
    } catch {
      // silent
    }
  };

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (selectedWarehouse) params.set('warehouse_id', selectedWarehouse);
      if (search) params.set('search', search);
      if (lowStockOnly) params.set('low_stock', 'true');

      const res = await apiFetch(`/api/inventory?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
      setLowStockCount(data.lowStockCount || 0);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, limit, selectedWarehouse, search, lowStockOnly, showToast]);

  // Search with debounce
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => {
      setPage(1);
      fetchInventory();
    }, 500));
  };

  const totalPages = Math.ceil(total / limit);

  function getStockBadge(item: InventoryItem) {
    if (item.is_out_of_stock) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400 font-medium">หมด</span>;
    }
    if (item.is_low_stock) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">ต่ำ</span>;
    }
    if (item.min_stock > 0 && item.available <= item.min_stock * 1.5) {
      return <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium">ใกล้หมด</span>;
    }
    return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 font-medium">ปกติ</span>;
  }

  function getVariationLabel(item: InventoryItem) {
    if (item.attributes && Object.keys(item.attributes).length > 0) {
      return Object.values(item.attributes).join(' / ');
    }
    return item.bottle_size || '';
  }

  return (
    <Layout
      title="สินค้าคงคลัง"
      breadcrumbs={[{ label: 'คลังสินค้า' }, { label: 'สินค้าคงคลัง' }]}
    >
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="ค้นหาชื่อ, รหัส, SKU..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            />
          </div>

          {/* Warehouse filter */}
          {warehouses.length > 1 && (
            <select
              value={selectedWarehouse}
              onChange={e => { setSelectedWarehouse(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
            >
              <option value="">ทุกคลัง</option>
              {warehouses.map(wh => (
                <option key={wh.id} value={wh.id}>{wh.name}</option>
              ))}
            </select>
          )}

          {/* Low stock filter */}
          <button
            onClick={() => { setLowStockOnly(!lowStockOnly); setPage(1); }}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
              lowStockOnly
                ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Stock ต่ำ
            {lowStockCount > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{lowStockCount}</span>
            )}
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Package2 className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 text-sm">
              {search || lowStockOnly ? 'ไม่พบสินค้าที่ตรงกับตัวกรอง' : 'ยังไม่มีข้อมูล stock กรุณารับสินค้าเข้าคลังก่อน'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สินค้า</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">SKU</th>
                      {warehouses.length > 1 && (
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">คลัง</th>
                      )}
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">จำนวน</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">จอง</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">พร้อมขาย</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">Min</th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {items.map(item => {
                      const varLabel = getVariationLabel(item);
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {item.product_image ? (
                                <img src={item.product_image} alt="" className="w-8 h-8 rounded object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                                  <Package2 className="w-4 h-4 text-gray-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white truncate">{item.product_name}</p>
                                <p className="text-xs text-gray-500 dark:text-slate-400">
                                  {item.product_code}
                                  {varLabel && <span className="ml-1">• {varLabel}</span>}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-slate-300 font-mono text-xs">{item.sku || '-'}</td>
                          {warehouses.length > 1 && (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                                <span className="text-gray-600 dark:text-slate-300 text-xs">{item.warehouse_name}</span>
                              </div>
                            </td>
                          )}
                          <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{item.quantity.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-amber-600 dark:text-amber-400">{item.reserved_quantity > 0 ? item.reserved_quantity.toLocaleString() : '-'}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{item.available.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-gray-500 dark:text-slate-400">{item.min_stock > 0 ? item.min_stock.toLocaleString() : '-'}</td>
                          <td className="px-4 py-3 text-center">{getStockBadge(item)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {items.map(item => {
                const varLabel = getVariationLabel(item);
                return (
                  <div key={item.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {item.product_image ? (
                          <img src={item.product_image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                            <Package2 className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{item.product_name}</p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">
                            {item.product_code}
                            {varLabel && <span> • {varLabel}</span>}
                          </p>
                        </div>
                      </div>
                      {getStockBadge(item)}
                    </div>
                    <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-slate-400">จำนวน</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{item.quantity.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-slate-400">จอง</p>
                        <p className="text-sm font-medium text-amber-600 dark:text-amber-400">{item.reserved_quantity > 0 ? item.reserved_quantity.toLocaleString() : '-'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-slate-400">พร้อมขาย</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{item.available.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-slate-400">Min</p>
                        <p className="text-sm text-gray-500 dark:text-slate-400">{item.min_stock > 0 ? item.min_stock.toLocaleString() : '-'}</p>
                      </div>
                    </div>
                    {warehouses.length > 1 && (
                      <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                        <Warehouse className="w-3 h-3" />
                        {item.warehouse_name}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  แสดง {(page - 1) * limit + 1}-{Math.min(page * limit, total)} จาก {total} รายการ
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-slate-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

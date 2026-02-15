'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Search, Package2, Plus, X, Trash2,
  Warehouse, AlertTriangle, CheckCircle, PackageMinus
} from 'lucide-react';

// ─── Interfaces ──────────────────────────────────────────────

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
}

interface Product {
  id: string; // variation_id
  product_id: string;
  code: string;
  name: string;
  image?: string;
  bottle_size?: string;
  product_type: 'simple' | 'variation';
  default_price: number;
  sku?: string;
}

interface StockInfo {
  quantity: number;
  reserved_quantity: number;
  available: number;
}

interface IssueItem {
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  bottle_size?: string;
  image?: string;
  sku?: string;
  quantity: number;
  reason: string;
  notes: string;
}

// ─── Common Reasons ──────────────────────────────────────────

const COMMON_REASONS = [
  { label: 'เสียหาย', value: 'เสียหาย' },
  { label: 'หมดอายุ', value: 'หมดอายุ' },
  { label: 'ตัวอย่าง', value: 'ตัวอย่าง' },
  { label: 'อื่นๆ', value: 'อื่นๆ' },
];

// ─── Page Component ──────────────────────────────────────────

export default function StockIssuePage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  // Warehouses
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);

  // Products (flat list)
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  // Inventory stock map: variation_id -> StockInfo
  const [stockMap, setStockMap] = useState<Record<string, StockInfo>>({});
  const [loadingStock, setLoadingStock] = useState(false);

  // Issue items
  const [items, setItems] = useState<IssueItem[]>([]);

  // Batch notes
  const [batchNotes, setBatchNotes] = useState('');

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Submitting
  const [submitting, setSubmitting] = useState(false);

  // Success state
  const [showSuccess, setShowSuccess] = useState(false);

  // ─── Fetch Warehouses ────────────────────────────────────

  useEffect(() => {
    if (authLoading || !userProfile) return;
    fetchWarehouses();
    fetchProducts();
  }, [authLoading, userProfile]);

  const fetchWarehouses = async () => {
    setLoadingWarehouses(true);
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        const whs = data.warehouses || [];
        setWarehouses(whs);
        // Auto-select default (first) warehouse
        if (whs.length > 0) {
          setSelectedWarehouse(whs[0].id);
        }
      }
    } catch {
      showToast('โหลดข้อมูลคลังสินค้าไม่สำเร็จ', 'error');
    } finally {
      setLoadingWarehouses(false);
    }
  };

  // ─── Fetch Products ──────────────────────────────────────

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await apiFetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch products');
      const result = await res.json();
      const fetchedProducts = result.products || [];

      const flatProducts: Product[] = [];
      fetchedProducts.forEach((sp: any) => {
        if (sp.product_type === 'simple') {
          const variation_id = sp.variations && sp.variations.length > 0
            ? sp.variations[0].variation_id
            : null;
          flatProducts.push({
            id: variation_id || sp.product_id,
            product_id: sp.product_id,
            code: sp.code,
            name: sp.name,
            image: sp.main_image_url || sp.image,
            bottle_size: sp.simple_bottle_size,
            product_type: 'simple',
            default_price: sp.simple_default_price || 0,
            sku: sp.variations?.[0]?.sku || '',
          });
        } else {
          (sp.variations || []).forEach((v: any) => {
            flatProducts.push({
              id: v.variation_id,
              product_id: sp.product_id,
              code: `${sp.code}-${v.bottle_size}`,
              name: sp.name,
              image: v.image_url || sp.main_image_url || sp.image,
              bottle_size: v.bottle_size,
              product_type: 'variation',
              default_price: v.default_price || 0,
              sku: v.sku || '',
            });
          });
        }
      });
      setProducts(flatProducts);
    } catch {
      showToast('โหลดข้อมูลสินค้าไม่สำเร็จ', 'error');
    } finally {
      setLoadingProducts(false);
    }
  };

  // ─── Fetch Inventory for Selected Warehouse ──────────────

  const fetchInventory = useCallback(async (warehouseId: string) => {
    if (!warehouseId) {
      setStockMap({});
      return;
    }
    setLoadingStock(true);
    try {
      const res = await apiFetch(`/api/inventory?warehouse_id=${warehouseId}&limit=999`);
      if (!res.ok) throw new Error('Failed to fetch inventory');
      const data = await res.json();
      const inventoryItems = data.items || [];

      const map: Record<string, StockInfo> = {};
      inventoryItems.forEach((item: any) => {
        map[item.variation_id] = {
          quantity: item.quantity || 0,
          reserved_quantity: item.reserved_quantity || 0,
          available: item.available ?? (item.quantity - (item.reserved_quantity || 0)),
        };
      });
      setStockMap(map);
    } catch {
      showToast('โหลดข้อมูล stock ไม่สำเร็จ', 'error');
      setStockMap({});
    } finally {
      setLoadingStock(false);
    }
  }, [showToast]);

  // Re-fetch inventory when warehouse changes
  useEffect(() => {
    if (selectedWarehouse) {
      fetchInventory(selectedWarehouse);
    } else {
      setStockMap({});
    }
  }, [selectedWarehouse, fetchInventory]);

  // ─── Product Search & Add ────────────────────────────────

  const filteredProducts = products.filter(p => {
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q))
    );
  });

  const handleAddProduct = (product: Product) => {
    const existingIndex = items.findIndex(i => i.variation_id === product.id);

    if (existingIndex !== -1) {
      // Duplicate: increment quantity
      const newItems = [...items];
      newItems[existingIndex].quantity += 1;
      setItems(newItems);
    } else {
      const newItem: IssueItem = {
        variation_id: product.id,
        product_id: product.product_id,
        product_code: product.code,
        product_name: product.name,
        bottle_size: product.bottle_size,
        image: product.image,
        sku: product.sku,
        quantity: 1,
        reason: 'เสียหาย',
        notes: '',
      };
      setItems([...items, newItem]);
    }

    setProductSearch('');
    setShowProductDropdown(false);

    // Focus back to search input
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleUpdateQuantity = (index: number, quantity: number) => {
    const newItems = [...items];
    newItems[index].quantity = Math.max(1, quantity);
    setItems(newItems);
  };

  const handleUpdateReason = (index: number, reason: string) => {
    const newItems = [...items];
    newItems[index].reason = reason;
    setItems(newItems);
  };

  const handleUpdateNotes = (index: number, notes: string) => {
    const newItems = [...items];
    newItems[index].notes = notes;
    setItems(newItems);
  };

  // ─── Submit ──────────────────────────────────────────────

  const canSubmit = selectedWarehouse && items.length > 0 && items.every(i => i.reason.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const payload = {
        warehouse_id: selectedWarehouse,
        items: items.map(i => ({
          variation_id: i.variation_id,
          quantity: i.quantity,
          reason: i.reason,
          notes: i.notes || undefined,
        })),
        notes: batchNotes || undefined,
      };

      const res = await apiFetch('/api/inventory/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'เกิดข้อผิดพลาดในการเบิกออกสินค้า');
      }

      showToast('เบิกออกสินค้าสำเร็จ', 'success');
      setShowSuccess(true);

      // Reset form
      setItems([]);
      setBatchNotes('');

      // Refresh inventory
      fetchInventory(selectedWarehouse);

      // Auto-hide success after 3 seconds
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  // ─── Helper: get stock info for a variation ──────────────

  const getStock = (variationId: string): StockInfo | null => {
    return stockMap[variationId] || null;
  };

  const getBottleSizeDisplay = (bottleSize?: string) => {
    return bottleSize || '';
  };

  // ─── Loading State ───────────────────────────────────────

  if (authLoading) {
    return (
      <Layout
        title="เบิกออกสินค้า"
        breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'เบิกออกสินค้า' }]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  // ─── Render ──────────────────────────────────────────────

  return (
    <Layout
      title="เบิกออกสินค้า"
      breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'เบิกออกสินค้า' }]}
    >
      <div className="space-y-4 max-w-5xl">
        {/* Success Message */}
        {showSuccess && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <p className="text-sm font-medium text-green-700 dark:text-green-300">เบิกออกสินค้าสำเร็จ</p>
          </div>
        )}

        {/* Warehouse Selection */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            คลังสินค้า <span className="text-red-500">*</span>
          </label>
          {loadingWarehouses ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              กำลังโหลด...
            </div>
          ) : warehouses.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">ไม่พบคลังสินค้า</p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Warehouse className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={selectedWarehouse}
                  onChange={e => setSelectedWarehouse(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] appearance-none"
                >
                  <option value="">เลือกคลังสินค้า</option>
                  {warehouses.map(wh => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}{wh.code ? ` (${wh.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {loadingStock && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  โหลด stock...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Product Search */}
        {selectedWarehouse && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              เพิ่มสินค้า
            </label>
            <div className="relative">
              <div className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg hover:border-[#F4511E] transition-colors bg-white dark:bg-slate-700">
                <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={productSearch}
                  onChange={e => {
                    setProductSearch(e.target.value);
                    setShowProductDropdown(true);
                  }}
                  onFocus={() => setShowProductDropdown(true)}
                  onBlur={() => {
                    setTimeout(() => setShowProductDropdown(false), 200);
                  }}
                  placeholder="พิมพ์ชื่อสินค้า, รหัส หรือ SKU เพื่อค้นหา..."
                  disabled={loadingProducts}
                  className="flex-1 outline-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 disabled:opacity-50"
                />
                {loadingProducts && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
              </div>

              {/* Search Dropdown */}
              {showProductDropdown && productSearch && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-72 overflow-auto">
                  {filteredProducts.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">ไม่พบสินค้า</div>
                  ) : (
                    filteredProducts.map(product => {
                      const capacityDisplay = getBottleSizeDisplay(product.bottle_size);
                      const stock = getStock(product.id);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => handleAddProduct(product)}
                          className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-3"
                        >
                          {product.image ? (
                            <img src={product.image} alt={product.name} className="w-10 h-10 object-cover rounded flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
                              <Package2 className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {product.name}{capacityDisplay && ` - ${capacityDisplay}`}
                            </div>
                            <div className="text-xs text-gray-400 dark:text-slate-500">
                              {product.code}
                              {product.sku && ` | SKU: ${product.sku}`}
                            </div>
                          </div>
                          {stock && (
                            <div className="text-right flex-shrink-0">
                              <div className={`text-xs font-medium ${stock.available > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-slate-500'}`}>
                                คงเหลือ {stock.available.toLocaleString()}
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Items Table / Cards */}
        {items.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            {/* Desktop Table */}
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สินค้า</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-20">รหัส</th>
                      <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-20">คงเหลือ</th>
                      <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-20">เบิก</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-44">เหตุผล</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-36">หมายเหตุ</th>
                      <th className="px-2 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {items.map((item, index) => {
                      const stock = getStock(item.variation_id);
                      const available = stock?.available ?? 0;
                      const isOverStock = item.quantity > available;
                      const capacityDisplay = getBottleSizeDisplay(item.bottle_size);

                      return (
                        <tr key={item.variation_id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                          {/* Product */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {item.image ? (
                                <img src={item.image} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-9 h-9 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                  <Package2 className="w-4 h-4 text-gray-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                                  {item.product_name}{capacityDisplay && ` - ${capacityDisplay}`}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Code/SKU */}
                          <td className="px-3 py-3">
                            <span className="text-xs text-gray-500 dark:text-slate-400 font-mono">{item.sku || item.product_code}</span>
                          </td>

                          {/* Available Stock */}
                          <td className="px-3 py-3 text-right">
                            {stock ? (
                              <span className={`text-sm font-medium ${stock.available > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                                {stock.available.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-slate-500">-</span>
                            )}
                          </td>

                          {/* Quantity Input */}
                          <td className="px-3 py-3 text-center">
                            <div className="inline-flex flex-col items-center">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e => handleUpdateQuantity(index, parseInt(e.target.value) || 1)}
                                className={`w-16 px-2 py-1 border rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-[#F4511E] ${
                                  isOverStock
                                    ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
                                    : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700'
                                } text-gray-900 dark:text-white`}
                              />
                              {isOverStock && (
                                <span className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-0.5">
                                  <AlertTriangle className="w-3 h-3" />
                                  เกิน stock
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Reason */}
                          <td className="px-3 py-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap gap-1">
                                {COMMON_REASONS.map(r => (
                                  <button
                                    key={r.value}
                                    type="button"
                                    onClick={() => handleUpdateReason(index, r.value)}
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                                      item.reason === r.value
                                        ? 'bg-[#F4511E] text-white'
                                        : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                                    }`}
                                  >
                                    {r.label}
                                  </button>
                                ))}
                              </div>
                              {item.reason === 'อื่นๆ' && (
                                <input
                                  type="text"
                                  value={item.reason === 'อื่นๆ' ? '' : item.reason}
                                  onChange={e => handleUpdateReason(index, e.target.value || 'อื่นๆ')}
                                  placeholder="ระบุเหตุผล..."
                                  className="w-full px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#F4511E]"
                                />
                              )}
                            </div>
                          </td>

                          {/* Notes */}
                          <td className="px-3 py-3">
                            <input
                              type="text"
                              value={item.notes}
                              onChange={e => handleUpdateNotes(index, e.target.value)}
                              placeholder="หมายเหตุ..."
                              className="w-full px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#F4511E]"
                            />
                          </td>

                          {/* Remove */}
                          <td className="px-2 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
              {items.map((item, index) => {
                const stock = getStock(item.variation_id);
                const available = stock?.available ?? 0;
                const isOverStock = item.quantity > available;
                const capacityDisplay = getBottleSizeDisplay(item.bottle_size);

                return (
                  <div key={item.variation_id} className="p-3 space-y-2.5">
                    {/* Product Info Row */}
                    <div className="flex items-start gap-2">
                      {item.image ? (
                        <img src={item.image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                          <Package2 className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                          {item.product_name}{capacityDisplay && ` - ${capacityDisplay}`}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">{item.sku || item.product_code}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Stock + Quantity Row */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs text-gray-500 dark:text-slate-400">คงเหลือ:</span>
                        <span className={`text-sm font-medium ${stock && stock.available > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-500'}`}>
                          {stock ? stock.available.toLocaleString() : '-'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-slate-400">เบิก:</span>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => handleUpdateQuantity(index, parseInt(e.target.value) || 1)}
                          className={`w-16 px-2 py-1 border rounded text-center text-sm focus:outline-none focus:ring-2 focus:ring-[#F4511E] ${
                            isOverStock
                              ? 'border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20'
                              : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700'
                          } text-gray-900 dark:text-white`}
                        />
                      </div>
                    </div>
                    {isOverStock && (
                      <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-3 h-3" />
                        จำนวนเบิกเกินกว่า stock ที่มี
                      </div>
                    )}

                    {/* Reason Chips */}
                    <div>
                      <span className="text-xs text-gray-500 dark:text-slate-400 mb-1 block">เหตุผล:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMON_REASONS.map(r => (
                          <button
                            key={r.value}
                            type="button"
                            onClick={() => handleUpdateReason(index, r.value)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                              item.reason === r.value
                                ? 'bg-[#F4511E] text-white'
                                : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                      {item.reason === 'อื่นๆ' && (
                        <input
                          type="text"
                          placeholder="ระบุเหตุผล..."
                          onChange={e => handleUpdateReason(index, e.target.value || 'อื่นๆ')}
                          className="mt-1.5 w-full px-2.5 py-1.5 border border-gray-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#F4511E]"
                        />
                      )}
                    </div>

                    {/* Notes */}
                    <input
                      type="text"
                      value={item.notes}
                      onChange={e => handleUpdateNotes(index, e.target.value)}
                      placeholder="หมายเหตุ (ถ้ามี)..."
                      className="w-full px-2.5 py-1.5 border border-gray-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#F4511E]"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {selectedWarehouse && items.length === 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-8 text-center">
            <PackageMinus className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 text-sm">
              ยังไม่มีสินค้าในรายการเบิก กรุณาค้นหาและเพิ่มสินค้าด้านบน
            </p>
          </div>
        )}

        {/* Batch Notes */}
        {items.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              หมายเหตุรวม
            </label>
            <textarea
              value={batchNotes}
              onChange={e => setBatchNotes(e.target.value)}
              rows={2}
              placeholder="หมายเหตุสำหรับการเบิกออกครั้งนี้ (ไม่บังคับ)..."
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
            />
          </div>
        )}

        {/* Action Buttons */}
        {selectedWarehouse && (
          <div className="flex justify-end gap-3 pb-4">
            <button
              type="button"
              onClick={handleCancel}
              className="px-5 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-sm font-medium"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="bg-[#F4511E] text-white px-5 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  กำลังบันทึก...
                </>
              ) : (
                <>
                  <PackageMinus className="w-4 h-4" />
                  บันทึกเบิกออก
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}

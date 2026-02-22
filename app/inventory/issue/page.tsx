'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Package2, X, Trash2,
  Warehouse, AlertTriangle, PackageMinus, CheckCircle2,
} from 'lucide-react';
import ProductSearchInput from '@/components/ui/ProductSearchInput';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

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
  variation_label?: string;
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
  variation_label?: string;
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

  // Submitting
  const [submitting, setSubmitting] = useState(false);

  // Confirm dialog
  const [showConfirm, setShowConfirm] = useState(false);

  // ─── Fetch Warehouses ────────────────────────────────────

  useFetchOnce(() => {
    fetchWarehouses();
    fetchProducts();
  }, !authLoading && !!userProfile);

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
            variation_label: sp.simple_variation_label,
            product_type: 'simple',
            default_price: sp.simple_default_price || 0,
            sku: sp.variations?.[0]?.sku || '',
          });
        } else {
          (sp.variations || []).forEach((v: any) => {
            flatProducts.push({
              id: v.variation_id,
              product_id: sp.product_id,
              code: `${sp.code}-${v.variation_label}`,
              name: sp.name,
              image: v.image_url || sp.main_image_url || sp.image,
              variation_label: v.variation_label,
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
        variation_label: product.variation_label,
        image: product.image,
        sku: product.sku,
        quantity: 1,
        reason: 'เสียหาย',
        notes: '',
      };
      setItems([...items, newItem]);
    }

    // Note: search clearing and re-focus handled by ProductSearchInput
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

  const handleSubmit = () => {
    if (!canSubmit) return;
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirm(false);
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

      const res = await apiFetch('/api/inventory/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'เกิดข้อผิดพลาดในการเบิกออกสินค้า');
      }

      showToast(`สร้างใบเบิกออก ${result.issue_number || ''} สำเร็จ`, 'success');
      router.push('/inventory/issues');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด';
      showToast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/inventory/issues');
  };

  // ─── Helper: get stock info for a variation ──────────────

  const getStock = (variationId: string): StockInfo | null => {
    return stockMap[variationId] || null;
  };

  // Hide variation_label if it's a barcode/number or same as code/sku
  const getCleanVarLabel = (item: IssueItem) => {
    const raw = item.variation_label || '';
    if (!raw || raw === item.product_code || raw === item.sku || /^\d+$/.test(raw)) return '';
    return raw;
  };

  const buildSubtitle = (item: IssueItem) => {
    const parts: string[] = [];
    if (item.product_code) parts.push(item.product_code);
    if (item.sku && item.sku !== item.product_code) parts.push(`SKU: ${item.sku}`);
    return parts.join(' | ');
  };

  // ─── Loading State ───────────────────────────────────────

  if (authLoading) {
    return (
      <Layout
        title="เบิกออกสินค้า"
        breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการเบิกออก', href: '/inventory/issues' }, { label: 'เบิกออกสินค้า' }]}
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
      breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการเบิกออก', href: '/inventory/issues' }, { label: 'เบิกออกสินค้า' }]}
    >
      <div className="space-y-4 max-w-5xl">
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

        {/* Desktop: Table + Search in one card */}
        {selectedWarehouse && (
          <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700">
            {items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สินค้า</th>
                      <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-24">สต๊อกปัจจุบัน</th>
                      <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-28">เบิกออก</th>
                      <th className="text-left px-3 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-48">เหตุผล</th>
                      <th className="px-2 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {items.map((item, index) => {
                      const stock = getStock(item.variation_id);
                      const available = stock?.available ?? 0;
                      const isOverStock = item.quantity > available;
                      const varLabel = getCleanVarLabel(item);

                      return (
                        <tr key={item.variation_id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {item.image ? (
                                <img src={item.image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                  <Package2 className="w-5 h-5 text-gray-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2 break-words">
                                  {item.product_name}{varLabel ? ` - ${varLabel}` : ''}
                                </p>
                                <p className="text-xs text-gray-400 dark:text-slate-500 truncate">
                                  {buildSubtitle(item)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {stock ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                stock.available <= 0
                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                  : stock.available <= 5
                                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              }`}>
                                {stock.available.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-slate-500">-</span>
                            )}
                          </td>
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
                                <span className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-0.5 whitespace-nowrap">
                                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                  เกิน stock
                                </span>
                              )}
                            </div>
                          </td>
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
                                  value={item.notes}
                                  onChange={e => handleUpdateNotes(index, e.target.value)}
                                  placeholder="ระบุเหตุผล / หมายเหตุ..."
                                  className="w-full px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#F4511E]"
                                />
                              )}
                            </div>
                          </td>
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
            )}
            {/* Product Search — always at bottom of card */}
            <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
              <ProductSearchInput
                products={products}
                onSelect={(p) => handleAddProduct(p as Product)}
                loading={loadingProducts}
                renderExtra={(p) => {
                  const stock = getStock(p.id);
                  if (!stock) return null;
                  return (
                    <div className="text-right flex-shrink-0">
                      <div className={`text-xs font-medium ${stock.available > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-slate-500'}`}>
                        สต๊อก {stock.available.toLocaleString()}
                      </div>
                    </div>
                  );
                }}
              />
            </div>
            {items.length === 0 && (
              <div className="text-center py-8 text-gray-400 dark:text-slate-500">
                <PackageMinus className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm">เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน</p>
              </div>
            )}
          </div>
        )}

        {/* Mobile Cards */}
        {items.length > 0 && (
          <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {items.map((item, index) => {
                const stock = getStock(item.variation_id);
                const available = stock?.available ?? 0;
                const isOverStock = item.quantity > available;
                const varLabel = getCleanVarLabel(item);

                return (
                  <div key={item.variation_id} className="p-3 space-y-2.5">
                    <div className="flex items-start gap-2">
                      {item.image ? (
                        <img src={item.image} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                          <Package2 className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2 break-words">
                          {item.product_name}{varLabel ? ` - ${varLabel}` : ''}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{buildSubtitle(item)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs text-gray-500 dark:text-slate-400">สต๊อก:</span>
                        {stock ? (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                            stock.available <= 0
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : stock.available <= 5
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          }`}>
                            {stock.available.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-slate-400">เบิกออก:</span>
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
                          value={item.notes}
                          onChange={e => handleUpdateNotes(index, e.target.value)}
                          placeholder="ระบุเหตุผล / หมายเหตุ..."
                          className="mt-1.5 w-full px-2.5 py-1.5 border border-gray-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#F4511E]"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* Mobile: Search + empty state */}
        {selectedWarehouse && (
          <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <ProductSearchInput
              products={products}
              onSelect={(p) => handleAddProduct(p as Product)}
              loading={loadingProducts}
              renderExtra={(p) => {
                const stock = getStock(p.id);
                if (!stock) return null;
                return (
                  <div className="text-right flex-shrink-0">
                    <div className={`text-xs font-medium ${stock.available > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-slate-500'}`}>
                      สต๊อก {stock.available.toLocaleString()}
                    </div>
                  </div>
                );
              }}
            />
            {items.length === 0 && (
              <div className="text-center py-8 text-gray-400 dark:text-slate-500">
                <PackageMinus className="w-10 h-10 mx-auto mb-2" />
                <p className="text-sm">เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน</p>
              </div>
            )}
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

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirmSubmit}
        icon={<PackageMinus className="w-6 h-6 text-[#F4511E]" />}
        title="ยืนยันเบิกออกสินค้า"
        description="คุณต้องการเบิกออกสินค้าทั้งหมดใช่หรือไม่?"
        confirmLabel="ยืนยันเบิกออก"
        confirmIcon={<CheckCircle2 className="w-4 h-4" />}
      >
        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-slate-400">คลังสินค้า</span>
            <span className="font-medium text-gray-900 dark:text-white">{warehouses.find(w => w.id === selectedWarehouse)?.name || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-slate-400">จำนวนรายการ</span>
            <span className="font-medium text-gray-900 dark:text-white">{items.length} รายการ</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-slate-400">จำนวนรวม</span>
            <span className="font-medium text-gray-900 dark:text-white">{items.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()} ชิ้น</span>
          </div>
        </div>
      </ConfirmDialog>
    </Layout>
  );
}

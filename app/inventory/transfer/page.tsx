'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Package, Package2, Trash2, X,
  Save, Warehouse, ChevronDown, FileText, ArrowRightLeft,
  AlertTriangle
} from 'lucide-react';
import ProductSearchInput from '@/components/ui/ProductSearchInput';

// Interfaces
interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  is_default?: boolean;
}

interface Product {
  id: string;
  product_id: string;
  code: string;
  name: string;
  image?: string;
  variation_label?: string;
  product_type: 'simple' | 'variation';
  default_price: number;
  sku?: string;
}

interface TransferItem {
  variation_id: string;
  product_id: string;
  code: string;
  name: string;
  image?: string;
  variation_label?: string;
  sku?: string;
  quantity: number;
  available_stock: number | null;
}

interface InventoryRecord {
  variation_id: string;
  quantity: number;
}

export default function StockTransferPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Warehouses
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destWarehouseId, setDestWarehouseId] = useState('');

  // Source inventory
  const [sourceInventory, setSourceInventory] = useState<InventoryRecord[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // Products (flattened)
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // Product search

  // Transfer items
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);

  // Batch notes
  const [batchNotes, setBatchNotes] = useState('');

  // Fetch warehouses and products on mount
  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchWarehouses();
      fetchProducts();
    }
  }, [authLoading, userProfile]);

  // Fetch source inventory when source warehouse changes
  useEffect(() => {
    if (sourceWarehouseId) {
      fetchSourceInventory(sourceWarehouseId);
    } else {
      setSourceInventory([]);
    }
  }, [sourceWarehouseId]);

  // Update available stock on transfer items when source inventory changes
  useEffect(() => {
    if (transferItems.length > 0) {
      setTransferItems(prev =>
        prev.map(item => ({
          ...item,
          available_stock: getStockForVariation(item.variation_id),
        }))
      );
    }
  }, [sourceInventory]);

  const fetchWarehouses = async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        const warehouseList: WarehouseItem[] = data.warehouses || [];
        setWarehouses(warehouseList);

        // Auto-select default warehouse as source
        const defaultWh = warehouseList.find(wh => wh.is_default);
        if (defaultWh) {
          setSourceWarehouseId(defaultWh.id);
        } else if (warehouseList.length === 1) {
          setSourceWarehouseId(warehouseList[0].id);
        }
      }
    } catch {
      showToast('โหลดข้อมูลคลังสินค้าไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      setProductsLoading(true);
      const res = await apiFetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch products');

      const result = await res.json();
      const fetchedProducts = result.products || [];

      const flatProducts: Product[] = [];
      fetchedProducts.forEach((sp: any) => {
        if (sp.product_type === 'simple') {
          const variation_id = sp.variations && sp.variations.length > 0 ? sp.variations[0].variation_id : null;
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
      setProductsLoading(false);
    }
  };

  const fetchSourceInventory = async (warehouseId: string) => {
    try {
      setInventoryLoading(true);
      const res = await apiFetch(`/api/inventory?warehouse_id=${warehouseId}`);
      if (res.ok) {
        const data = await res.json();
        const records: InventoryRecord[] = (data.inventory || []).map((inv: any) => ({
          variation_id: inv.variation_id,
          quantity: inv.quantity ?? 0,
        }));
        setSourceInventory(records);
      } else {
        setSourceInventory([]);
      }
    } catch {
      setSourceInventory([]);
    } finally {
      setInventoryLoading(false);
    }
  };

  const getStockForVariation = (variationId: string): number | null => {
    if (!sourceWarehouseId) return null;
    const record = sourceInventory.find(inv => inv.variation_id === variationId);
    return record ? record.quantity : 0;
  };

  // Add product to transfer list
  const handleAddProduct = (product: Product) => {
    const existingIndex = transferItems.findIndex(
      item => item.variation_id === product.id
    );

    if (existingIndex !== -1) {
      // Increment quantity if already exists
      const updated = [...transferItems];
      updated[existingIndex].quantity += 1;
      setTransferItems(updated);
    } else {
      // Add new item
      setTransferItems([
        ...transferItems,
        {
          variation_id: product.id,
          product_id: product.product_id,
          code: product.code,
          name: product.name,
          image: product.image,
          variation_label: product.variation_label,
          sku: product.sku,
          quantity: 1,
          available_stock: getStockForVariation(product.id),
        },
      ]);
    }

    // Note: search clearing and re-focus handled by ProductSearchInput
  };

  // Remove item from list
  const handleRemoveItem = (index: number) => {
    setTransferItems(transferItems.filter((_, i) => i !== index));
  };

  // Update item quantity
  const handleUpdateQuantity = (index: number, quantity: number) => {
    const updated = [...transferItems];
    updated[index].quantity = Math.max(1, quantity);
    setTransferItems(updated);
  };

  // Filter products based on search

  // Check if quantity exceeds available stock
  const hasStockWarning = (item: TransferItem): boolean => {
    if (item.available_stock === null) return false;
    return item.quantity > item.available_stock;
  };

  // Check if any item has a stock warning
  const hasAnyStockWarning = transferItems.some(item => hasStockWarning(item));

  // Validate warehouses are different
  const warehousesAreSame = sourceWarehouseId && destWarehouseId && sourceWarehouseId === destWarehouseId;

  // Submit
  const handleSubmit = async () => {
    if (!sourceWarehouseId || !destWarehouseId || transferItems.length === 0) return;
    if (warehousesAreSame) {
      showToast('คลังต้นทางและปลายทางต้องไม่เป็นคลังเดียวกัน', 'error');
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        from_warehouse_id: sourceWarehouseId,
        to_warehouse_id: destWarehouseId,
        items: transferItems.map(item => ({
          variation_id: item.variation_id,
          quantity: item.quantity,
        })),
        notes: batchNotes || undefined,
      };

      const res = await apiFetch('/api/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        // Check for partial success
        if (result.partial_success && result.errors) {
          const errorDetails = result.errors
            .map((err: { variation_id?: string; error?: string }) =>
              `${err.variation_id || 'รายการ'}: ${err.error || 'ไม่ทราบสาเหตุ'}`
            )
            .join('\n');
          showToast(
            `โอนย้ายบางรายการไม่สำเร็จ: ${errorDetails}`,
            'error'
          );
          // Still reset successfully transferred items
          if (result.succeeded_count && result.succeeded_count > 0) {
            showToast(
              `โอนย้ายสำเร็จ ${result.succeeded_count} รายการ`,
              'success'
            );
          }
          // Reset form
          setTransferItems([]);
          setBatchNotes('');
          // Refresh source inventory
          fetchSourceInventory(sourceWarehouseId);
          return;
        }
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }

      showToast(`สร้างใบโอนย้าย ${result.transfer_number || ''} สำเร็จ`, 'success');

      // Redirect to transfer detail or list
      if (result.transfer_id) {
        router.push(`/inventory/transfers/${result.transfer_id}`);
      } else {
        router.push('/inventory/transfers');
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโอนย้ายสินค้า',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel
  const handleCancel = () => {
    router.push('/inventory/transfers');
  };

  const canSubmit =
    sourceWarehouseId &&
    destWarehouseId &&
    !warehousesAreSame &&
    transferItems.length > 0 &&
    !submitting;

  const sourceWarehouse = warehouses.find(wh => wh.id === sourceWarehouseId);
  const destWarehouse = warehouses.find(wh => wh.id === destWarehouseId);

  if (authLoading || loading) {
    return (
      <Layout
        title="โอนย้ายสินค้า"
        breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการโอนย้าย', href: '/inventory/transfers' }, { label: 'สร้างใบโอนย้าย' }]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="โอนย้ายสินค้า"
      breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการโอนย้าย', href: '/inventory/transfers' }, { label: 'สร้างใบโอนย้าย' }]}
    >
      <div className="space-y-4">
        {/* Warehouse Selection */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 items-end">
            {/* Source Warehouse */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                <Warehouse className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                คลังต้นทาง <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={sourceWarehouseId}
                  onChange={e => setSourceWarehouseId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] appearance-none pr-8"
                >
                  <option value="">-- เลือกคลังต้นทาง --</option>
                  {warehouses.map(wh => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}{wh.code ? ` (${wh.code})` : ''}{wh.is_default ? ' - ค่าเริ่มต้น' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
              {inventoryLoading && (
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  กำลังโหลดสต็อก...
                </p>
              )}
            </div>

            {/* Arrow */}
            <div className="hidden sm:flex items-center justify-center pb-1">
              <ArrowRightLeft className="w-5 h-5 text-gray-400 dark:text-slate-500" />
            </div>
            <div className="flex sm:hidden items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-gray-400 dark:text-slate-500 rotate-90" />
            </div>

            {/* Destination Warehouse */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                <Warehouse className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                คลังปลายทาง <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={destWarehouseId}
                  onChange={e => setDestWarehouseId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] appearance-none pr-8"
                >
                  <option value="">-- เลือกคลังปลายทาง --</option>
                  {warehouses.map(wh => (
                    <option key={wh.id} value={wh.id}>
                      {wh.name}{wh.code ? ` (${wh.code})` : ''}{wh.is_default ? ' - ค่าเริ่มต้น' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Same warehouse warning */}
          {warehousesAreSame && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              คลังต้นทางและปลายทางต้องไม่เป็นคลังเดียวกัน
            </div>
          )}

          {warehouses.length > 2 && (
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-2">
              มีทั้งหมด {warehouses.length} คลัง
            </p>
          )}
        </div>

        {/* Stock warning banner */}
        {transferItems.length > 0 && hasAnyStockWarning && (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>บางรายการมีจำนวนโอนย้ายมากกว่าสต็อกที่มีในคลังต้นทาง</span>
          </div>
        )}

        {/* Desktop: Table + Search in one card */}
        <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700">
          {transferItems.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">
                        สินค้า
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-28">
                        รหัส/SKU
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-28">
                        สต็อกต้นทาง
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-28">
                        จำนวนโอน
                      </th>
                      <th className="text-center px-2 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {transferItems.map((item, index) => {
                      const warning = hasStockWarning(item);
                      return (
                        <tr key={item.variation_id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/30 ${warning ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {item.image ? (
                                <img
                                  src={item.image}
                                  alt={item.name}
                                  className="w-10 h-10 rounded object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                  <Package className="w-5 h-5 text-gray-400" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white truncate">
                                  {item.name}
                                </p>
                                {item.variation_label && (
                                  <p className="text-xs text-gray-500 dark:text-slate-400">
                                    {item.variation_label}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-gray-600 dark:text-slate-300 font-mono text-xs">
                              {item.code}
                            </span>
                            {item.sku && (
                              <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                                {item.sku}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.available_stock !== null ? (
                              <span className={`text-sm font-medium ${item.available_stock === 0 ? 'text-red-500' : 'text-gray-700 dark:text-slate-300'}`}>
                                {item.available_stock.toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-slate-500">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={e =>
                                  handleUpdateQuantity(index, parseInt(e.target.value) || 1)
                                }
                                className={`w-20 px-2 py-1.5 border rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] ${
                                  warning
                                    ? 'border-amber-400 dark:border-amber-500'
                                    : 'border-gray-300 dark:border-slate-600'
                                }`}
                              />
                              {warning && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs rounded-full whitespace-nowrap">
                                  <AlertTriangle className="w-3 h-3" />
                                  เกิน
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="ลบ"
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
            </>
          )}
          {/* Product Search */}
          <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
            <ProductSearchInput
              products={products}
              onSelect={(p) => handleAddProduct(p as Product)}
              loading={productsLoading}
              isAlreadyAdded={(p) => transferItems.some(item => item.variation_id === p.id)}
              formatSubtitle={(p) => {
                const parts = [p.code];
                if (p.sku) parts.push(`SKU: ${p.sku}`);
                const stock = getStockForVariation(p.id);
                if (stock !== null) parts.push(`สต็อก: ${stock}`);
                return parts.join(' | ');
              }}
            />
          </div>
          {transferItems.length === 0 && (
            <div className="text-center py-8 text-gray-400 dark:text-slate-500">
              <Package2 className="w-10 h-10 mx-auto mb-2" />
              <p className="text-sm">เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน</p>
            </div>
          )}
          {/* Summary row */}
          {transferItems.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 rounded-b-lg flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-slate-400">
                รวม {transferItems.length} รายการ
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                จำนวนรวม: {transferItems.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()} ชิ้น
              </span>
            </div>
          )}
        </div>

        {/* Mobile Cards */}
        {transferItems.length > 0 && (
          <div className="md:hidden space-y-2">
            {transferItems.map((item, index) => {
              const warning = hasStockWarning(item);
              return (
                <div
                  key={item.variation_id}
                  className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border p-3 ${
                    warning
                      ? 'border-amber-300 dark:border-amber-700'
                      : 'border-gray-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-12 h-12 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                          <Package className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          {item.code}
                          {item.variation_label && ` | ${item.variation_label}`}
                        </p>
                        {item.sku && (
                          <p className="text-xs text-gray-400 dark:text-slate-500">
                            SKU: {item.sku}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">
                        สต็อกต้นทาง
                      </label>
                      <div className={`px-2 py-1.5 rounded-lg text-center text-sm font-medium ${
                        item.available_stock !== null
                          ? item.available_stock === 0
                            ? 'text-red-500 bg-red-50 dark:bg-red-900/20'
                            : 'text-gray-700 dark:text-slate-300 bg-gray-50 dark:bg-slate-700/50'
                          : 'text-gray-400 dark:text-slate-500 bg-gray-50 dark:bg-slate-700/50'
                      }`}>
                        {item.available_stock !== null ? item.available_stock.toLocaleString() : '-'}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">
                        จำนวนโอน
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e =>
                          handleUpdateQuantity(index, parseInt(e.target.value) || 1)
                        }
                        className={`w-full px-2 py-1.5 border rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] ${
                          warning
                            ? 'border-amber-400 dark:border-amber-500'
                            : 'border-gray-300 dark:border-slate-600'
                        }`}
                      />
                    </div>
                  </div>

                  {warning && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      จำนวนโอนเกินสต็อกที่มี ({item.available_stock?.toLocaleString()})
                    </div>
                  )}
                </div>
              );
            })}

            {/* Mobile summary */}
            <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5 flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-slate-400">
                รวม {transferItems.length} รายการ
              </span>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                จำนวนรวม: {transferItems.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()} ชิ้น
              </span>
            </div>
          </div>
        )}
        {/* Mobile: Search + empty state */}
        <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <ProductSearchInput
            products={products}
            onSelect={(p) => handleAddProduct(p as Product)}
            loading={productsLoading}
            isAlreadyAdded={(p) => transferItems.some(item => item.variation_id === p.id)}
            formatSubtitle={(p) => {
              const parts = [p.code];
              if (p.sku) parts.push(`SKU: ${p.sku}`);
              const stock = getStockForVariation(p.id);
              if (stock !== null) parts.push(`สต็อก: ${stock}`);
              return parts.join(' | ');
            }}
          />
          {transferItems.length === 0 && (
            <div className="text-center py-8 text-gray-400 dark:text-slate-500">
              <Package2 className="w-10 h-10 mx-auto mb-2" />
              <p className="text-sm">เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน</p>
            </div>
          )}
        </div>

        {/* Batch Notes */}
        {transferItems.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              หมายเหตุรวม
            </label>
            <textarea
              value={batchNotes}
              onChange={e => setBatchNotes(e.target.value)}
              rows={3}
              placeholder="หมายเหตุสำหรับการโอนย้ายครั้งนี้..."
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
            />
          </div>
        )}

        {/* Action Buttons */}
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
            disabled={!canSubmit}
            className="bg-[#F4511E] text-white px-5 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังสร้างใบโอนย้าย...
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4" />
                สร้างใบโอนย้ายและจัดส่ง
              </>
            )}
          </button>
        </div>
      </div>
    </Layout>
  );
}

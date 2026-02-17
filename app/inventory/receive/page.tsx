'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Search, Package, Package2, Plus, Trash2, X,
  Save, Warehouse, ChevronDown, FileText
} from 'lucide-react';

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

interface ReceiveItem {
  variation_id: string;
  product_id: string;
  code: string;
  name: string;
  image?: string;
  variation_label?: string;
  sku?: string;
  quantity: number;
  notes: string;
}

export default function StockReceivePage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Warehouses
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  // Products (flattened)
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // Product search
  const [productSearch, setProductSearch] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);

  // Receive items
  const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>([]);

  // Batch notes
  const [batchNotes, setBatchNotes] = useState('');

  // Fetch warehouses and products on mount
  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchWarehouses();
      fetchProducts();
    }
  }, [authLoading, userProfile]);

  const fetchWarehouses = async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        const warehouseList: WarehouseItem[] = data.warehouses || [];
        setWarehouses(warehouseList);

        // Auto-select default warehouse
        const defaultWh = warehouseList.find(wh => wh.is_default);
        if (defaultWh) {
          setSelectedWarehouseId(defaultWh.id);
        } else if (warehouseList.length === 1) {
          setSelectedWarehouseId(warehouseList[0].id);
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

  // Add product to receive list
  const handleAddProduct = (product: Product) => {
    const existingIndex = receiveItems.findIndex(
      item => item.variation_id === product.id
    );

    if (existingIndex !== -1) {
      // Increment quantity if already exists
      const updated = [...receiveItems];
      updated[existingIndex].quantity += 1;
      setReceiveItems(updated);
    } else {
      // Add new item
      setReceiveItems([
        ...receiveItems,
        {
          variation_id: product.id,
          product_id: product.product_id,
          code: product.code,
          name: product.name,
          image: product.image,
          variation_label: product.variation_label,
          sku: product.sku,
          quantity: 1,
          notes: '',
        },
      ]);
    }

    // Clear search and close dropdown
    setProductSearch('');
    setShowProductDropdown(false);

    // Refocus search input
    setTimeout(() => {
      productSearchRef.current?.focus();
    }, 100);
  };

  // Remove item from list
  const handleRemoveItem = (index: number) => {
    setReceiveItems(receiveItems.filter((_, i) => i !== index));
  };

  // Update item quantity
  const handleUpdateQuantity = (index: number, quantity: number) => {
    const updated = [...receiveItems];
    updated[index].quantity = Math.max(1, quantity);
    setReceiveItems(updated);
  };

  // Update item notes
  const handleUpdateNotes = (index: number, notes: string) => {
    const updated = [...receiveItems];
    updated[index].notes = notes;
    setReceiveItems(updated);
  };

  // Filter products based on search
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.code.toLowerCase().includes(productSearch.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(productSearch.toLowerCase()))
  );

  // Submit
  const handleSubmit = async () => {
    if (!selectedWarehouseId || receiveItems.length === 0) return;

    try {
      setSubmitting(true);

      const payload = {
        warehouse_id: selectedWarehouseId,
        items: receiveItems.map(item => ({
          variation_id: item.variation_id,
          quantity: item.quantity,
          notes: item.notes || undefined,
        })),
        notes: batchNotes || undefined,
      };

      const res = await apiFetch('/api/inventory/receives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }

      showToast(`สร้างใบรับเข้า ${result.receive_number || ''} สำเร็จ`, 'success');

      // Redirect to detail or list
      if (result.receive_id) {
        router.push(`/inventory/receives/${result.receive_id}`);
      } else {
        router.push('/inventory/receives');
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการรับเข้าสินค้า',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel
  const handleCancel = () => {
    router.push('/inventory/receives');
  };

  const canSubmit = selectedWarehouseId && receiveItems.length > 0 && !submitting;

  const selectedWarehouse = warehouses.find(wh => wh.id === selectedWarehouseId);

  if (authLoading || loading) {
    return (
      <Layout
        title="รับเข้าสินค้า"
        breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า', href: '/inventory/receives' }, { label: 'รับเข้าสินค้า' }]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="รับเข้าสินค้า"
      breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า', href: '/inventory/receives' }, { label: 'รับเข้าสินค้า' }]}
    >
      <div className="space-y-4">
        {/* Warehouse Selection */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            <Warehouse className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            คลังสินค้า <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <select
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="w-full sm:w-72 px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] appearance-none pr-8"
            >
              <option value="">-- เลือกคลังสินค้า --</option>
              {warehouses.map(wh => (
                <option key={wh.id} value={wh.id}>
                  {wh.name}{wh.code ? ` (${wh.code})` : ''}{wh.is_default ? ' - ค่าเริ่มต้น' : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          {warehouses.length > 1 && (
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5">
              มีทั้งหมด {warehouses.length} คลัง
            </p>
          )}
        </div>

        {/* Product Search */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            เพิ่มสินค้า
          </label>
          <div className="relative">
            <div className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg hover:border-[#F4511E] transition-colors bg-white dark:bg-slate-700">
              <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <input
                ref={productSearchRef}
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
                className="flex-1 outline-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
              />
              {productsLoading && (
                <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />
              )}
            </div>

            {/* Product Search Dropdown */}
            {showProductDropdown && productSearch && (
              <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-72 overflow-auto">
                {filteredProducts.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                    ไม่พบสินค้า
                  </div>
                ) : (
                  filteredProducts.map(product => {
                    const variationLabelDisplay = product.variation_label || '';
                    const isAlreadyAdded = receiveItems.some(
                      item => item.variation_id === product.id
                    );
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => handleAddProduct(product)}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors flex items-center gap-3"
                      >
                        {product.image ? (
                          <img
                            src={product.image}
                            alt={product.name}
                            className="w-10 h-10 object-cover rounded flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
                            <Package className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {product.name}
                            {variationLabelDisplay && ` - ${variationLabelDisplay}`}
                          </div>
                          <div className="text-xs text-gray-400 dark:text-slate-500">
                            {product.code}
                            {product.sku && ` | SKU: ${product.sku}`}
                          </div>
                        </div>
                        {isAlreadyAdded && (
                          <span className="text-xs text-[#F4511E] font-medium flex-shrink-0">
                            +1
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Receive Items List */}
        {receiveItems.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-center py-12">
            <Package2 className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 text-sm">
              ยังไม่มีสินค้าในรายการ กรุณาค้นหาและเพิ่มสินค้าด้านบน
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-slate-700">
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
                      <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-24">
                        จำนวน
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-48">
                        หมายเหตุ
                      </th>
                      <th className="text-center px-2 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {receiveItems.map((item, index) => (
                      <tr key={item.variation_id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
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
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={e =>
                              handleUpdateQuantity(index, parseInt(e.target.value) || 1)
                            }
                            className="w-20 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={item.notes}
                            onChange={e => handleUpdateNotes(index, e.target.value)}
                            placeholder="หมายเหตุ..."
                            className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] placeholder-gray-400 dark:placeholder-slate-500"
                          />
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
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary row */}
              <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-slate-400">
                  รวม {receiveItems.length} รายการ
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  จำนวนรวม: {receiveItems.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()} ชิ้น
                </span>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {receiveItems.map((item, index) => (
                <div
                  key={item.variation_id}
                  className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700 p-3"
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
                        จำนวน
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e =>
                          handleUpdateQuantity(index, parseInt(e.target.value) || 1)
                        }
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">
                        หมายเหตุ
                      </label>
                      <input
                        type="text"
                        value={item.notes}
                        onChange={e => handleUpdateNotes(index, e.target.value)}
                        placeholder="หมายเหตุ..."
                        className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] placeholder-gray-400 dark:placeholder-slate-500"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* Mobile summary */}
              <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5 flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-slate-400">
                  รวม {receiveItems.length} รายการ
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  จำนวนรวม: {receiveItems.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()} ชิ้น
                </span>
              </div>
            </div>
          </>
        )}

        {/* Batch Notes */}
        {receiveItems.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              หมายเหตุรวม
            </label>
            <textarea
              value={batchNotes}
              onChange={e => setBatchNotes(e.target.value)}
              rows={3}
              placeholder="หมายเหตุสำหรับการรับเข้าครั้งนี้..."
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
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                บันทึกรับเข้า
              </>
            )}
          </button>
        </div>
      </div>
    </Layout>
  );
}

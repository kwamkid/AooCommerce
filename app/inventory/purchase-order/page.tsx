'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import {
  Loader2, ArrowLeft, Factory, Warehouse as WarehouseIcon, Trash2,
  Package2, CalendarDays, ClipboardList, Check, AlertCircle,
} from 'lucide-react';

interface Supplier {
  id: string;
  name: string;
  supplier_type: string;
}

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  is_default: boolean;
}

interface POItem {
  variation_id: string;
  product_id: string;
  code: string;
  name: string;
  image?: string | null;
  variation_label?: string;
  sku?: string;
  quantity: number;
  unit_cost: number;
}

export default function CreatePurchaseOrderPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [items, setItems] = useState<POItem[]>([]);
  const [notes, setNotes] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (authLoading || !userProfile) return;
    if (!features.supplier) {
      router.replace('/inventory/receives');
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetchSuppliers();
    fetchWarehouses();
  }, [authLoading, userProfile, features.supplier, router]);

  const fetchSuppliers = async () => {
    try {
      const res = await apiFetch('/api/suppliers');
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.data || []);
      }
    } catch { /* ignore */ }
  };

  const fetchWarehouses = async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        const whs = data.warehouses || [];
        setWarehouses(whs);
        // Auto-select default warehouse
        const defaultWh = whs.find((w: WarehouseItem) => w.is_default);
        if (defaultWh) setSelectedWarehouseId(defaultWh.id);
        else if (whs.length === 1) setSelectedWarehouseId(whs[0].id);
      }
    } catch { /* ignore */ }
  };

  // Fetch supplier products when supplier changes
  useEffect(() => {
    if (!selectedSupplierId) {
      setSupplierProducts([]);
      return;
    }
    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const res = await apiFetch(`/api/suppliers/${selectedSupplierId}/products`);
        if (res.ok) {
          const data = await res.json();
          // Map to ProductSearchItem format
          const mapped: ProductSearchItem[] = (data.variations || []).map((v: {
            variation_id: string; product_id: string; product_code: string;
            product_name: string; product_image: string | null;
            variation_label: string; sku: string; cost_price: number;
            default_price: number;
          }) => ({
            id: v.variation_id,
            product_id: v.product_id,
            code: v.product_code,
            name: v.product_name,
            image: v.product_image,
            variation_label: v.variation_label,
            sku: v.sku,
            default_price: v.default_price,
            _cost_price: v.cost_price,
          }));
          setSupplierProducts(mapped);
        }
      } catch { /* ignore */ }
      setLoadingProducts(false);
    };
    fetchProducts();
  }, [selectedSupplierId]);

  const handleAddProduct = (product: ProductSearchItem) => {
    const existingIdx = items.findIndex(i => i.variation_id === product.id);
    if (existingIdx >= 0) {
      setItems(prev => prev.map((item, i) =>
        i === existingIdx ? { ...item, quantity: item.quantity + 1 } : item
      ));
    } else {
      setItems(prev => [...prev, {
        variation_id: product.id,
        product_id: product.product_id,
        code: product.code,
        name: product.name,
        image: product.image,
        variation_label: product.variation_label,
        sku: product.sku,
        quantity: 1,
        unit_cost: (product as unknown as { _cost_price?: number })._cost_price || 0,
      }]);
    }
  };

  const updateItemQty = (idx: number, value: number) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, quantity: Math.max(1, value) } : item
    ));
  };

  const updateItemCost = (idx: number, value: number) => {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, unit_cost: Math.max(0, value) } : item
    ));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);

  const handleSubmit = async () => {
    if (!selectedSupplierId) {
      showToast('กรุณาเลือก Supplier', 'error');
      return;
    }
    if (!selectedWarehouseId) {
      showToast('กรุณาเลือกคลังสินค้า', 'error');
      return;
    }
    if (items.length === 0) {
      showToast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'error');
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/inventory/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: selectedSupplierId,
          warehouse_id: selectedWarehouseId,
          items: items.map(i => ({
            variation_id: i.variation_id,
            quantity: i.quantity,
            unit_cost: i.unit_cost,
          })),
          notes: notes || undefined,
          expected_date: expectedDate || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        showToast(`สร้าง ${data.po_number} สำเร็จ`);
        router.push(`/inventory/purchase-orders/${data.po_id}`);
      } else {
        const data = await res.json();
        showToast(data.error || 'สร้างไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  };

  const formatCurrency = (n: number) => {
    return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="สร้างใบสั่งซื้อ (PO)"
      breadcrumbs={[
        { label: 'คลังสินค้า', href: '/inventory' },
        { label: 'ใบสั่งซื้อ', href: '/inventory/purchase-orders' },
        { label: 'สร้างใหม่' },
      ]}
    >
      <div className="max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/inventory/purchase-orders')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">สร้างใบสั่งซื้อ (PO)</h1>
        </div>

        {/* Supplier + Warehouse */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              <Factory className="w-4 h-4 inline mr-1" />
              Supplier *
            </label>
            <select
              value={selectedSupplierId}
              onChange={e => {
                setSelectedSupplierId(e.target.value);
                setItems([]); // Clear items when supplier changes
              }}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
            >
              <option value="">-- เลือก Supplier --</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              <WarehouseIcon className="w-4 h-4 inline mr-1" />
              คลังสินค้า *
            </label>
            <select
              value={selectedWarehouseId}
              onChange={e => setSelectedWarehouseId(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
            >
              <option value="">-- เลือกคลัง --</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Expected date */}
        <div className="sm:max-w-xs">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            <CalendarDays className="w-4 h-4 inline mr-1" />
            วันที่คาดว่าจะได้รับ
          </label>
          <input
            type="date"
            value={expectedDate}
            onChange={e => setExpectedDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
          />
        </div>

        {/* Items table */}
        {items.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="data-table-fixed">
                <thead>
                  <tr className="data-thead-tr">
                    <th className="data-th w-[60px]">รูป</th>
                    <th className="data-th">สินค้า</th>
                    <th className="data-th w-[100px]">จำนวน</th>
                    <th className="data-th w-[120px]">ต้นทุน/ชิ้น</th>
                    <th className="data-th w-[100px] text-right">รวม</th>
                    <th className="data-th w-[50px]"></th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {items.map((item, idx) => (
                    <tr key={`${item.variation_id}-${idx}`} className="data-tr">
                      <td className="px-3 py-3">
                        {item.image ? (
                          <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-slate-600" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                            <Package2 className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {item.name}
                          {item.variation_label && item.variation_label !== 'default' && (
                            <span className="text-gray-500 dark:text-slate-400"> - {item.variation_label}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">
                          {item.code}
                          {item.sku && <span className="ml-2">SKU: {item.sku}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => updateItemQty(idx, parseInt(e.target.value) || 1)}
                          min={1}
                          className="w-20 px-2 py-1.5 text-sm text-center border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          value={item.unit_cost}
                          onChange={e => updateItemCost(idx, parseFloat(e.target.value) || 0)}
                          min={0}
                          step={0.01}
                          className="w-24 px-2 py-1.5 text-sm text-right border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-[#F4511E] focus:border-[#F4511E]"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          ฿{formatCurrency(item.quantity * item.unit_cost)}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => removeItem(idx)}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-gray-100 dark:divide-slate-700">
              {items.map((item, idx) => (
                <div key={`${item.variation_id}-${idx}`} className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {item.image ? (
                      <img src={item.image} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-200 dark:border-slate-600" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                        <Package2 className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {item.name}
                        {item.variation_label && item.variation_label !== 'default' && (
                          <span className="text-gray-500"> - {item.variation_label}</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">{item.code}</div>
                    </div>
                    <button onClick={() => removeItem(idx)} className="p-1 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">จำนวน</label>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={e => updateItemQty(idx, parseInt(e.target.value) || 1)}
                        min={1}
                        className="w-full px-2 py-1.5 text-sm text-center border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">ต้นทุน/ชิ้น</label>
                      <input
                        type="number"
                        value={item.unit_cost}
                        onChange={e => updateItemCost(idx, parseFloat(e.target.value) || 0)}
                        min={0}
                        step={0.01}
                        className="w-full px-2 py-1.5 text-sm text-right border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">รวม</label>
                      <div className="px-2 py-1.5 text-sm text-right font-medium text-gray-900 dark:text-white">
                        ฿{formatCurrency(item.quantity * item.unit_cost)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Product search */}
        {selectedSupplierId ? (
          <div>
            <ProductSearchInput
              products={supplierProducts}
              onSelect={handleAddProduct}
              loading={loadingProducts}
              placeholder="ค้นหาสินค้าของ supplier นี้..."
              isAlreadyAdded={(p) => items.some(i => i.variation_id === p.id)}
            />
            {!loadingProducts && supplierProducts.length === 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Supplier นี้ยังไม่มีสินค้า (ต้องผูก Brand กับ Supplier ก่อน)
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-400 dark:text-slate-500">
            <Factory className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">เลือก Supplier ก่อนเพื่อเพิ่มสินค้า</p>
          </div>
        )}

        {/* Summary */}
        {items.length > 0 && (
          <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-slate-400">
              รวม <span className="font-medium text-gray-900 dark:text-white">{items.length}</span> รายการ |
              จำนวนรวม <span className="font-medium text-gray-900 dark:text-white">{totalQty}</span> ชิ้น
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              ฿{formatCurrency(totalAmount)}
            </div>
          </div>
        )}

        {/* Notes */}
        {items.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุ</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="หมายเหตุ (ถ้ามี)"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E] focus:border-transparent resize-none"
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push('/inventory/purchase-orders')}
            className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || items.length === 0}
            className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#D63B0E] disabled:opacity-50 transition-colors"
          >
            <ClipboardList className="w-4 h-4" />
            สร้างใบสั่งซื้อ
          </button>
        </div>
      </div>

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">ยืนยันสร้างใบสั่งซื้อ</h3>
            <div className="text-sm text-gray-600 dark:text-slate-300 space-y-2">
              <p>Supplier: <span className="font-medium text-gray-900 dark:text-white">{suppliers.find(s => s.id === selectedSupplierId)?.name}</span></p>
              <p>คลัง: <span className="font-medium text-gray-900 dark:text-white">{warehouses.find(w => w.id === selectedWarehouseId)?.name}</span></p>
              <p>จำนวนรายการ: <span className="font-medium text-gray-900 dark:text-white">{items.length} รายการ ({totalQty} ชิ้น)</span></p>
              <p>มูลค่ารวม: <span className="font-medium text-gray-900 dark:text-white">฿{formatCurrency(totalAmount)}</span></p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-sm text-gray-600 dark:text-slate-400 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#D63B0E] disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

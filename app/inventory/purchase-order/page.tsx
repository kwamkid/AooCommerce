'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { productDisplayName, productSubtitle } from '../components/types';
import FormSelect from '@/components/ui/FormSelect';
import EntitySearchInput, { type EntitySearchOption } from '@/components/ui/EntitySearchInput';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { type DateValueType } from 'react-tailwindcss-datepicker';
import Link from 'next/link';
import {
  Loader2, Factory, Warehouse as WarehouseIcon, Trash2,
  Package, Package2, CalendarDays, ClipboardList, CheckCircle2,
  Save, FileText, AlertCircle, Star, Tag, ExternalLink,
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

const getDisplayName = (item: POItem) => productDisplayName({ product_name: item.name, product_code: item.code, variation_label: item.variation_label, sku: item.sku });
const getSubtitle = (item: POItem) => productSubtitle({ product_code: item.code, sku: item.sku });

export default function CreatePurchaseOrderPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features, fetched: featuresFetched } = useFeatures();
  const { showToast } = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [allBrands, setAllBrands] = useState<{ id: string; name: string; supplier_id: string | null }[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');
  const [items, setItems] = useState<POItem[]>([]);
  const [notes, setNotes] = useState('');
  const [expectedDateValue, setExpectedDateValue] = useState<DateValueType>({ startDate: null, endDate: null });
  const expectedDate = expectedDateValue?.startDate
    ? new Date(expectedDateValue.startDate).toISOString().split('T')[0]
    : '';
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Stock data for current warehouse
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  // Derived: selected supplier info + brands
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);
  const supplierBrands = allBrands.filter(b => b.supplier_id === selectedSupplierId);

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (authLoading || !userProfile || !featuresFetched) return;
    if (!features.supplier) {
      router.replace('/inventory/receives');
      return;
    }
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetchSuppliers();
    fetchWarehouses();
    fetchBrands();
  }, [authLoading, userProfile, featuresFetched, features.supplier, router]);

  // Fetch stock when warehouse changes
  useEffect(() => {
    if (selectedWarehouseId) {
      fetchStock(selectedWarehouseId);
    } else {
      setStockMap({});
    }
  }, [selectedWarehouseId]);

  const fetchStock = async (warehouseId: string) => {
    try {
      const res = await apiFetch(`/api/inventory?warehouse_id=${warehouseId}&limit=9999`);
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, number> = {};
        for (const item of (data.items || [])) {
          map[item.variation_id] = item.quantity ?? 0;
        }
        setStockMap(map);
      }
    } catch {
      // silently fail — stock badge is non-critical
    }
  };

  const fetchSuppliers = async () => {
    try {
      const res = await apiFetch('/api/suppliers');
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.data || []);
      }
    } catch { /* ignore */ }
  };

  const fetchBrands = async () => {
    try {
      const res = await apiFetch('/api/brands');
      if (res.ok) {
        const data = await res.json();
        setAllBrands((data.data || []).map((b: { id: string; name: string; supplier_id: string | null }) => ({
          id: b.id, name: b.name, supplier_id: b.supplier_id,
        })));
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
        const defaultWh = whs.find((w: WarehouseItem) => w.is_default);
        if (defaultWh) setSelectedWarehouseId(defaultWh.id);
        else if (whs.length === 1) setSelectedWarehouseId(whs[0].id);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
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

  const formatCurrency = (n: number) => {
    return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

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
    setShowConfirm(false);
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
    }
  };

  const canSubmit = selectedSupplierId && selectedWarehouseId && items.length > 0 && !saving;
  const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);

  if (authLoading || loading) {
    return (
      <Layout
        title="สร้างใบสั่งซื้อ (PO)"
        breadcrumbs={[
          { label: 'คลังสินค้า', href: '/inventory' },
          { label: 'ใบสั่งซื้อ', href: '/inventory/purchase-orders' },
          { label: 'สร้างใหม่' },
        ]}
      >
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
      <div className="space-y-4">
        {/* Supplier + Warehouse + Expected Date — single card, 3 columns */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Supplier */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                <Factory className="w-4 h-4 inline mr-1" />
                Supplier <span className="text-red-500">*</span>
              </label>
              <EntitySearchInput
                value={selectedSupplierId}
                onChange={(id) => {
                  setSelectedSupplierId(id);
                  setItems([]);
                }}
                onClear={() => {
                  setSelectedSupplierId('');
                  setItems([]);
                  setSupplierProducts([]);
                }}
                options={suppliers.map(s => ({
                  id: s.id,
                  label: s.name,
                  subtitle: s.supplier_type === 'manufacturer' ? 'ผู้ผลิต' : s.supplier_type === 'distributor' ? 'ผู้จัดจำหน่าย' : s.supplier_type === 'wholesaler' ? 'ขายส่ง' : s.supplier_type,
                }))}
                placeholder="ค้นหาชื่อ Supplier..."
                icon={<Factory className="w-4 h-4" />}
              />
            </div>

            {/* Warehouse */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                เข้าคลังสินค้า <span className="text-red-500">*</span>
              </label>
              <FormSelect
                value={selectedWarehouseId}
                onChange={setSelectedWarehouseId}
                options={warehouses.map(w => ({
                  id: w.id,
                  label: `${w.name}${w.code ? ` (${w.code})` : ''}`,
                  icon: w.is_default ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : undefined,
                }))}
                placeholder="-- เลือกคลัง --"
                searchPlaceholder="ค้นหาคลัง..."
                icon={<WarehouseIcon className="w-4 h-4" />}
              />
            </div>

            {/* Expected Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                <CalendarDays className="w-4 h-4 inline mr-1" />
                วันที่คาดว่าจะได้รับ
              </label>
              <DateRangePicker
                value={expectedDateValue}
                onChange={setExpectedDateValue}
                asSingle={true}
                useRange={false}
                showShortcuts={false}
                showFooter={false}
                placeholder="เลือกวันที่"
              />
            </div>
          </div>
        </div>

        {/* Supplier Info Card — แสดงเมื่อเลือก supplier แล้ว */}
        {selectedSupplierId && selectedSupplier && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Factory className="w-4 h-4 text-gray-500 dark:text-slate-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">{selectedSupplier.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400">
                  {selectedSupplier.supplier_type === 'manufacturer' ? 'ผู้ผลิต' : selectedSupplier.supplier_type === 'distributor' ? 'ผู้จัดจำหน่าย' : selectedSupplier.supplier_type === 'wholesaler' ? 'ขายส่ง' : selectedSupplier.supplier_type}
                </span>
              </div>
              <Link
                href={`/settings/suppliers/${selectedSupplierId}/edit`}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                title="แก้ไข Supplier"
              >
                <span className="hidden md:inline">แก้ไข Supplier</span>
                <ExternalLink className="w-4 h-4 md:w-3 md:h-3" />
              </Link>
            </div>

            {/* แบรนด์ที่ผูกกับ Supplier นี้ */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-slate-400 flex items-center gap-1">
                <Tag className="w-3 h-3" /> แบรนด์:
              </span>
              {supplierBrands.length > 0 ? (
                supplierBrands.map(b => (
                  <span
                    key={b.id}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    {b.name}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400 dark:text-slate-500">ยังไม่มีแบรนด์ผูกกับ Supplier นี้</span>
              )}
            </div>

            {/* Warning: ไม่มีสินค้า */}
            {!loadingProducts && supplierProducts.length === 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-amber-800 dark:text-amber-200 font-medium">Supplier นี้ยังไม่มีสินค้า</p>
                  <p className="text-amber-600 dark:text-amber-400 text-xs mt-0.5">
                    {supplierBrands.length > 0
                      ? <>ต้องผูกสินค้ากับ Brand ของ Supplier นี้ก่อน → <Link href="/products" className="underline font-medium hover:text-amber-700 dark:hover:text-amber-300">ไปหน้าสินค้า</Link></>
                      : <>ต้องเพิ่ม Brand ให้กับ Supplier ก่อน → <Link href={`/settings/suppliers/${selectedSupplierId}/edit`} className="underline font-medium hover:text-amber-700 dark:hover:text-amber-300">ไปแก้ไข Supplier</Link></>
                    }
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Desktop: Table + Search in one card */}
        <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700">
          {items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th">สินค้า</th>
                    <th className="data-th text-center w-28 whitespace-nowrap">สต๊อกปัจจุบัน</th>
                    <th className="data-th text-center w-24">จำนวน</th>
                    <th className="data-th text-center w-28">ต้นทุน/ชิ้น</th>
                    <th className="data-th text-right w-28">รวม</th>
                    <th className="data-th w-12"></th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {items.map((item, idx) => (
                    <tr key={`${item.variation_id}-${idx}`} className="data-tr">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2.5">
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-12 h-12 rounded object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <Package className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
                              {getDisplayName(item)}
                            </div>
                            <span className="text-xs text-gray-400 dark:text-slate-500">
                              {getSubtitle(item)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-center">
                        {(() => {
                          const stock = stockMap[item.variation_id] ?? null;
                          if (stock === null) return <span className="text-xs text-gray-400">-</span>;
                          return (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              stock <= 0
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : stock <= 5
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              {stock.toLocaleString()}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateItemQty(idx, parseInt(e.target.value) || 1)}
                          className="w-20 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
                        />
                      </td>
                      <td className="px-6 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_cost}
                          onChange={e => updateItemCost(idx, parseFloat(e.target.value) || 0)}
                          className="w-24 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
                        />
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          ฿{formatCurrency(item.quantity * item.unit_cost)}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
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
          )}
          {/* Product Search */}
          {selectedSupplierId ? (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
              <ProductSearchInput
                products={supplierProducts}
                onSelect={handleAddProduct}
                loading={loadingProducts}
                placeholder="ค้นหาสินค้าของ supplier นี้..."
                isAlreadyAdded={(p) => items.some(i => i.variation_id === p.id)}
              />
            </div>
          ) : (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
              <p className="text-sm text-gray-400 dark:text-slate-500">เลือก Supplier ก่อนเพื่อค้นหาสินค้า</p>
            </div>
          )}
          {items.length === 0 && selectedSupplierId && (
            <div className="text-center py-8 text-gray-400 dark:text-slate-500">
              <Package2 className="w-10 h-10 mx-auto mb-2" />
              <p className="text-sm">เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน</p>
            </div>
          )}
          {!selectedSupplierId && (
            <div className="text-center py-8 text-gray-400 dark:text-slate-500">
              <Factory className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">เลือก Supplier ก่อนเพื่อเพิ่มสินค้า</p>
            </div>
          )}
          {/* Summary row */}
          {items.length > 0 && (
            <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 rounded-b-lg flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-slate-400">
                รวม {items.length} รายการ | จำนวนรวม {totalQty.toLocaleString()} ชิ้น
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                ฿{formatCurrency(totalAmount)}
              </span>
            </div>
          )}
        </div>

        {/* Mobile Cards */}
        {items.length > 0 && (
          <div className="md:hidden space-y-2">
            {items.map((item, idx) => (
              <div
                key={`${item.variation_id}-${idx}`}
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
                      <p className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2 break-words">
                        {getDisplayName(item)}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs text-gray-400 dark:text-slate-500 truncate">
                          {getSubtitle(item)}
                        </p>
                        {(() => {
                          const stock = stockMap[item.variation_id] ?? null;
                          if (stock === null) return null;
                          return (
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                              stock <= 0
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                : stock <= 5
                                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                  : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              สต๊อก {stock.toLocaleString()}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">จำนวน</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={e => updateItemQty(idx, parseInt(e.target.value) || 1)}
                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">ต้นทุน/ชิ้น</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_cost}
                      onChange={e => updateItemCost(idx, parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">รวม</label>
                    <div className="px-2 py-1.5 text-sm text-right font-medium text-gray-900 dark:text-white">
                      ฿{formatCurrency(item.quantity * item.unit_cost)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Mobile: Search + empty state — before summary so order matches desktop */}
        <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          {selectedSupplierId ? (
            <>
              <ProductSearchInput
                products={supplierProducts}
                onSelect={handleAddProduct}
                loading={loadingProducts}
                placeholder="ค้นหาสินค้าของ supplier นี้..."
                isAlreadyAdded={(p) => items.some(i => i.variation_id === p.id)}
              />
              {items.length === 0 && supplierProducts.length > 0 && (
                <div className="text-center py-8 text-gray-400 dark:text-slate-500">
                  <Package2 className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-400 dark:text-slate-500">
              <Factory className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">เลือก Supplier ก่อนเพื่อเพิ่มสินค้า</p>
            </div>
          )}
        </div>

        {/* Mobile summary */}
        {items.length > 0 && (
          <div className="md:hidden bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5 flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-slate-400">
              รวม {items.length} รายการ | {totalQty.toLocaleString()} ชิ้น
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              ฿{formatCurrency(totalAmount)}
            </span>
          </div>
        )}

        {/* Notes */}
        {items.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              หมายเหตุ
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="หมายเหตุสำหรับใบสั่งซื้อนี้..."
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pb-4">
          <button
            type="button"
            onClick={() => router.push('/inventory/purchase-orders')}
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
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                กำลังบันทึก...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                สร้างใบสั่งซื้อ
              </>
            )}
          </button>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        icon={<ClipboardList className="w-6 h-6 text-[#F4511E]" />}
        title="ยืนยันสร้างใบสั่งซื้อ"
        description="คุณต้องการสร้างใบสั่งซื้อนี้ใช่หรือไม่?"
        confirmLabel="ยืนยันสร้าง"
        confirmIcon={<CheckCircle2 className="w-4 h-4" />}
      >
        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-slate-400">Supplier</span>
            <span className="font-medium text-gray-900 dark:text-white">{selectedSupplier?.name || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-slate-400">คลังสินค้า</span>
            <span className="font-medium text-gray-900 dark:text-white">{selectedWarehouse?.name || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-slate-400">จำนวนรายการ</span>
            <span className="font-medium text-gray-900 dark:text-white">{items.length} รายการ</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-slate-400">จำนวนรวม</span>
            <span className="font-medium text-gray-900 dark:text-white">{totalQty.toLocaleString()} ชิ้น</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-slate-400">มูลค่ารวม</span>
            <span className="font-medium text-gray-900 dark:text-white">฿{formatCurrency(totalAmount)}</span>
          </div>
        </div>
      </ConfirmDialog>
    </Layout>
  );
}

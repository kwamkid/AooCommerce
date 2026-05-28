'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Button from '@/components/ui/Button';
import type { DateValueType } from '@/components/ui/DateRangePicker';
import { Loader2, ClipboardList, CheckCircle2, Save, FileText } from 'lucide-react';

import type { EditItem, Supplier, WarehouseItem } from '../purchase-orders/components/types';
import { formatCurrency } from '../purchase-orders/components/types';
import POInfoCard from '../purchase-orders/components/POInfoCard';
import POEditItemsTable from '../purchase-orders/components/POEditItemsTable';

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
  const [items, setItems] = useState<EditItem[]>([]);
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

  // Derived
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);
  const selectedWarehouse = warehouses.find(w => w.id === selectedWarehouseId);
  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_cost), 0);
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
  const canSubmit = selectedSupplierId && selectedWarehouseId && items.length > 0 && !saving;

  const fetchedRef = useRef(false);

  useEffect(() => {
    if (authLoading || !userProfile || !featuresFetched) return;
    if (!features.supplier) { router.replace('/inventory/receives'); return; }
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchSuppliers();
    fetchWarehouses();
    fetchBrands();
  }, [authLoading, userProfile, featuresFetched, features.supplier, router]);

  // Fetch stock when warehouse changes
  useEffect(() => {
    if (selectedWarehouseId) {
      (async () => {
        try {
          const res = await apiFetch(`/api/inventory?warehouse_id=${selectedWarehouseId}&limit=9999`);
          if (res.ok) { const d = await res.json(); const m: Record<string, number> = {}; for (const i of (d.items || [])) m[i.variation_id] = i.quantity ?? 0; setStockMap(m); }
        } catch { /* */ }
      })();
    } else { setStockMap({}); }
  }, [selectedWarehouseId]);

  const fetchSuppliers = async () => {
    try { const res = await apiFetch('/api/suppliers'); if (res.ok) { const d = await res.json(); setSuppliers(d.data || []); } } catch { /* */ }
  };
  const fetchWarehouses = async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const d = await res.json();
        const whs = d.warehouses || [];
        setWarehouses(whs);
        const defaultWh = whs.find((w: WarehouseItem) => w.is_default);
        if (defaultWh) setSelectedWarehouseId(defaultWh.id);
        else if (whs.length === 1) setSelectedWarehouseId(whs[0].id);
      }
    } catch { /* */ }
    finally { setLoading(false); }
  };
  const fetchBrands = async () => {
    try { const res = await apiFetch('/api/brands'); if (res.ok) { const d = await res.json(); setAllBrands((d.data || []).map((b: { id: string; name: string; supplier_id: string | null }) => ({ id: b.id, name: b.name, supplier_id: b.supplier_id }))); } } catch { /* */ }
  };

  // Fetch supplier products when supplier changes
  useEffect(() => {
    if (!selectedSupplierId) { setSupplierProducts([]); return; }
    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const res = await apiFetch(`/api/suppliers/${selectedSupplierId}/products`);
        if (res.ok) {
          const d = await res.json();
          setSupplierProducts((d.variations || []).map((v: { variation_id: string; product_id: string; product_code: string; product_name: string; product_image: string | null; variation_label: string; sku: string; cost_price: number; default_price: number }) => ({
            id: v.variation_id, product_id: v.product_id, code: v.product_code, name: v.product_name, image: v.product_image,
            variation_label: v.variation_label, sku: v.sku, default_price: v.default_price, _cost_price: v.cost_price,
          })));
        }
      } catch { /* */ }
      setLoadingProducts(false);
    };
    fetchProducts();
  }, [selectedSupplierId]);

  // ─── Item actions ───
  const handleAddProduct = (product: ProductSearchItem) => {
    const idx = items.findIndex(i => i.variation_id === product.id);
    if (idx >= 0) { setItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: item.quantity + 1 } : item)); }
    else {
      setItems(prev => [...prev, {
        variation_id: product.id, product_id: product.product_id, code: product.code, name: product.name, image: product.image,
        variation_label: product.variation_label, sku: product.sku, quantity: 1,
        unit_cost: (product as unknown as { _cost_price?: number })._cost_price || 0,
      }]);
    }
  };
  const updateItemQty = (idx: number, v: number) => setItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: Math.max(1, v) } : item));
  const updateItemCost = (idx: number, v: number) => setItems(prev => prev.map((item, i) => i === idx ? { ...item, unit_cost: Math.max(0, v) } : item));
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  // ─── Submit ───
  const handleSubmit = async () => {
    if (!selectedSupplierId) { showToast('กรุณาเลือก Supplier', 'error'); return; }
    if (!selectedWarehouseId) { showToast('กรุณาเลือกคลังสินค้า', 'error'); return; }
    if (items.length === 0) { showToast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'error'); return; }
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
          items: items.map(i => ({ variation_id: i.variation_id, quantity: i.quantity, unit_cost: i.unit_cost })),
          notes: notes || undefined,
          expected_date: expectedDate || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`สร้าง ${data.po_number} สำเร็จ`);
        router.push('/inventory/purchase-orders');
      } else {
        const data = await res.json();
        showToast(data.error || 'สร้างไม่สำเร็จ', 'error');
      }
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
    finally { setSaving(false); }
  };

  if (authLoading || loading) {
    return (
      <Layout title="สร้างใบสั่งซื้อ (PO)" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'ใบสั่งซื้อ', href: '/inventory/purchase-orders' }, { label: 'สร้างใหม่' }]}>
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
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
        {/* Supplier + Warehouse + Date + Supplier Info */}
        <POInfoCard
          po={null}
          isEditable={true}
          suppliers={suppliers}
          warehouses={warehouses}
          editSupplierId={selectedSupplierId}
          editWarehouseId={selectedWarehouseId}
          editExpectedDate={expectedDateValue}
          onSupplierChange={(id) => { setSelectedSupplierId(id); setItems([]); }}
          onSupplierClear={() => { setSelectedSupplierId(''); setItems([]); setSupplierProducts([]); }}
          onWarehouseChange={setSelectedWarehouseId}
          onExpectedDateChange={setExpectedDateValue}
          selectedSupplier={selectedSupplier || null}
          allBrands={allBrands}
          supplierProducts={supplierProducts}
          loadingProducts={loadingProducts}
        />

        {/* Items Table */}
        <POEditItemsTable
          items={items}
          supplierId={selectedSupplierId}
          supplierProducts={supplierProducts}
          loadingProducts={loadingProducts}
          stockMap={stockMap}
          onAddProduct={handleAddProduct}
          onUpdateQty={updateItemQty}
          onUpdateCost={updateItemCost}
          onRemove={removeItem}
        />

        {/* Notes */}
        {(items.length > 0 || notes) && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" /> หมายเหตุ
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="หมายเหตุสำหรับ PO นี้..."
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pb-4">
          <Button variant="secondary" onClick={() => router.push('/inventory/purchase-orders')}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={saving}
            icon={<Save className="w-4 h-4" />}
          >
            {saving ? 'กำลังบันทึก...' : 'สร้างใบสั่งซื้อ'}
          </Button>
        </div>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirm}
        icon={<ClipboardList className="w-6 h-6 text-primary" />}
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

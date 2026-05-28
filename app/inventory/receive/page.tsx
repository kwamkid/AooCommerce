'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, Package2, Save, Warehouse, FileText, CheckCircle2, ClipboardList, Star, Plus, AlertTriangle,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Button from '@/components/ui/Button';
import FormSelect from '@/components/ui/FormSelect';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';
import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';

// Interfaces
interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  is_default?: boolean;
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
  unit_cost: number;
  po_quantity?: number;
}

interface POOption {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  warehouse_id: string;
  items: { variation_id: string; quantity: number; received_quantity: number; unit_cost: number; variation: { id: string; variation_label: string; sku: string | null; product: { id: string; code: string; name: string; image: string | null } } }[];
}

export default function StockReceivePage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  type ReceiveMode = 'manual' | 'po';
  const [mode, setMode] = useState<ReceiveMode>('manual');

  const [availablePOs, setAvailablePOs] = useState<POOption[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [selectedPOId, setSelectedPOId] = useState('');
  const [selectedPO, setSelectedPO] = useState<POOption | null>(null);

  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('');

  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [receiveItems, setReceiveItems] = useState<ReceiveItem[]>([]);
  const [batchNotes, setBatchNotes] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchWarehouses();
      fetchProducts();
      if (features.supplier) fetchPOs();
    }
  }, [authLoading, userProfile]); // eslint-disable-line react-hooks/exhaustive-deps

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
    } catch { /* silent */ }
  };

  const fetchWarehouses = async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        const list: WarehouseItem[] = data.warehouses || [];
        setWarehouses(list);
        const def = list.find(wh => wh.is_default);
        if (def) setSelectedWarehouseId(def.id);
        else if (list.length === 1) setSelectedWarehouseId(list[0].id);
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
      if (!res.ok) throw new Error('Failed');
      const result = await res.json();
      const flat: ProductSearchItem[] = [];
      for (const sp of (result.products || [])) {
        if (sp.product_type === 'simple') {
          const vid = sp.variations?.[0]?.variation_id ?? sp.product_id;
          flat.push({
            id: vid,
            product_id: sp.product_id,
            code: sp.code,
            name: sp.name,
            image: sp.main_image_url || sp.image,
            variation_label: sp.simple_variation_label,
            product_type: 'simple',
            default_price: sp.simple_default_price || 0,
            cost_price: sp.variations?.[0]?.cost_price || 0,
            sku: sp.variations?.[0]?.sku || '',
          } as ProductSearchItem);
        } else {
          for (const v of (sp.variations || [])) {
            flat.push({
              id: v.variation_id,
              product_id: sp.product_id,
              code: `${sp.code}-${v.variation_label}`,
              name: sp.name,
              image: v.image_url || sp.main_image_url || sp.image,
              variation_label: v.variation_label,
              product_type: 'variation',
              default_price: v.default_price || 0,
              cost_price: v.cost_price || 0,
              sku: v.sku || '',
            } as ProductSearchItem);
          }
        }
      }
      setProducts(flat);
    } catch {
      showToast('โหลดข้อมูลสินค้าไม่สำเร็จ', 'error');
    } finally {
      setProductsLoading(false);
    }
  };

  const fetchPOs = async () => {
    try {
      setPosLoading(true);
      const [r1, r2] = await Promise.all([
        apiFetch('/api/inventory/purchase-orders?status=sent'),
        apiFetch('/api/inventory/purchase-orders?status=partial_received'),
      ]);
      const pos: POOption[] = [];
      if (r1.ok) { const d = await r1.json(); pos.push(...(d.purchase_orders || []).map((po: any) => ({ id: po.id, po_number: po.po_number, supplier_id: po.supplier?.id || '', supplier_name: po.supplier?.name || '', warehouse_id: po.warehouse?.id || '', items: [] }))); }
      if (r2.ok) { const d = await r2.json(); pos.push(...(d.purchase_orders || []).map((po: any) => ({ id: po.id, po_number: po.po_number, supplier_id: po.supplier?.id || '', supplier_name: po.supplier?.name || '', warehouse_id: po.warehouse?.id || '', items: [] }))); }
      setAvailablePOs(pos);
    } catch { /* ignore */ } finally {
      setPosLoading(false);
    }
  };

  const handleModeChange = (newMode: ReceiveMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setReceiveItems([]);
    setBatchNotes('');
    if (newMode === 'manual') {
      setSelectedPOId('');
      setSelectedPO(null);
    } else {
      fetchPOs();
    }
  };

  const handleSelectPO = async (poId: string) => {
    setSelectedPOId(poId);
    if (!poId) { setSelectedPO(null); setReceiveItems([]); return; }
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`);
      if (!res.ok) return;
      const data = await res.json();
      const po = data.purchase_order;
      setSelectedPO({ id: po.id, po_number: po.po_number, supplier_id: po.supplier?.id || '', supplier_name: po.supplier?.name || '', warehouse_id: po.warehouse_id, items: po.items || [] });
      if (po.warehouse_id) setSelectedWarehouseId(po.warehouse_id);
      const newItems: ReceiveItem[] = [];
      for (const item of (po.items || [])) {
        const remaining = item.quantity - (item.received_quantity || 0);
        if (remaining <= 0) continue;
        newItems.push({
          variation_id: item.variation_id,
          product_id: item.variation?.product?.id || '',
          code: item.variation?.product?.code || '',
          name: item.variation?.product?.name || '',
          image: item.variation?.product?.image,
          variation_label: item.variation?.variation_label,
          sku: item.variation?.sku || undefined,
          quantity: remaining,
          unit_cost: item.unit_cost || 0,
          po_quantity: remaining,
        });
      }
      setReceiveItems(newItems);
    } catch {
      showToast('โหลดข้อมูล PO ไม่สำเร็จ', 'error');
    }
  };

  const handleAddProduct = (product: ProductSearchItem) => {
    const existing = receiveItems.findIndex(i => i.variation_id === product.id);
    if (existing !== -1) {
      const updated = [...receiveItems];
      updated[existing].quantity += 1;
      setReceiveItems(updated);
    } else {
      setReceiveItems([...receiveItems, {
        variation_id: product.id,
        product_id: (product as any).product_id || product.id,
        code: product.code || '',
        name: product.name,
        image: product.image ?? undefined,
        variation_label: product.variation_label,
        sku: product.sku,
        quantity: 1,
        unit_cost: (product as any).cost_price || 0,
      }]);
    }
  };

  const handleUpdateField = (idx: number, field: keyof TableItem, value: number | string) => {
    const updated = [...receiveItems];
    if (field === 'quantity') updated[idx].quantity = Math.max(1, value as number);
    if (field === 'unit_cost') updated[idx].unit_cost = Math.max(0, value as number);
    setReceiveItems(updated);
  };

  const handleRemoveItem = (idx: number) => {
    setReceiveItems(receiveItems.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (!selectedWarehouseId || receiveItems.length === 0) return;
    setShowConfirm(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirm(false);
    try {
      setSubmitting(true);
      const payload: Record<string, unknown> = {
        warehouse_id: selectedWarehouseId,
        items: receiveItems.map(item => ({
          variation_id: item.variation_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost || undefined,
        })),
        notes: batchNotes || undefined,
      };
      if (selectedPO) {
        payload.po_id = selectedPO.id;
        payload.supplier_id = selectedPO.supplier_id;
      }
      const res = await apiFetch('/api/inventory/receives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาด');
      showToast(`สร้างใบรับเข้า ${result.receive_number || ''} สำเร็จ`, 'success');
      router.push('/inventory/receives');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการรับเข้าสินค้า', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedWarehouse = warehouses.find(wh => wh.id === selectedWarehouseId);
  const canSubmit = selectedWarehouseId && receiveItems.length > 0 && !submitting;
  const hasPOMismatch = receiveItems.some(i => i.po_quantity != null && i.quantity !== i.po_quantity);

  const tableItems: TableItem[] = receiveItems.map(i => ({
    variation_id: i.variation_id,
    product_id: i.product_id,
    product_name: i.name,
    product_code: i.code,
    variation_label: i.variation_label,
    sku: i.sku,
    image: i.image,
    quantity: i.quantity,
    unit_cost: i.unit_cost,
    po_quantity: i.po_quantity,
  }));

  if (authLoading || loading) {
    return (
      <Layout title="รับเข้าสินค้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า', href: '/inventory/receives' }, { label: 'รับเข้าสินค้า' }]}>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="รับเข้าสินค้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า', href: '/inventory/receives' }, { label: 'รับเข้าสินค้า' }]}>
      <div className="space-y-4">
        {/* Mode Switch */}
        {features.supplier && (
          <div className="flex gap-1 bg-gray-100 dark:bg-slate-700 rounded-lg p-1 w-fit">
            <button type="button" onClick={() => handleModeChange('manual')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'manual' ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'}`}>
              <Plus className="w-4 h-4" />รับเข้าใหม่
            </button>
            <button type="button" onClick={() => handleModeChange('po')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'po' ? 'bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'}`}>
              <ClipboardList className="w-4 h-4" />จาก PO
            </button>
          </div>
        )}

        {/* Warehouse selector (manual mode) */}
        {mode === 'manual' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              คลังสินค้า <span className="text-red-500">*</span>
            </label>
            <div className="w-full sm:w-72">
              <FormSelect
                value={selectedWarehouseId}
                onChange={setSelectedWarehouseId}
                options={warehouses.map(wh => ({ id: wh.id, label: `${wh.name}${wh.code ? ` (${wh.code})` : ''}`, icon: wh.is_default ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : undefined }))}
                placeholder="-- เลือกคลังสินค้า --"
                searchPlaceholder="ค้นหาคลัง..."
                icon={<Warehouse className="w-4 h-4" />}
              />
            </div>
          </div>
        )}

        {/* PO selector */}
        {mode === 'po' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              <ClipboardList className="w-4 h-4 inline mr-1" />
              เลือกใบสั่งซื้อ (PO) <span className="text-red-500">*</span>
            </label>
            <div className="w-full sm:w-96">
              <EntitySearchInput
                value={selectedPOId}
                onChange={handleSelectPO}
                onClear={() => handleSelectPO('')}
                options={availablePOs.map(po => ({ id: po.id, label: po.po_number, subtitle: po.supplier_name, icon: <ClipboardList className="w-4 h-4 text-gray-400" /> }))}
                placeholder="ค้นหา PO หรือชื่อ Supplier..."
                icon={<ClipboardList className="w-4 h-4" />}
                loading={posLoading}
                emptyMessage="ไม่มี PO ที่รอรับของ"
              />
            </div>
            {selectedPO && (
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
                <span>Supplier: <strong className="text-gray-700 dark:text-slate-300">{selectedPO.supplier_name}</strong></span>
                <span>คลัง: <strong className="text-gray-700 dark:text-slate-300">{warehouses.find(wh => wh.id === selectedWarehouseId)?.name || '-'}</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Items Table */}
        <ItemsTable
          items={tableItems}
          columns={mode === 'po' ? ['stock_badge', 'po_quantity', 'qty', 'unit_cost', 'total'] : ['stock_badge', 'qty', 'unit_cost', 'total']}
          stockMap={stockMap}
          disableStockWarning
          products={products}
          loadingProducts={productsLoading}
          onAdd={handleAddProduct}
          onUpdateField={handleUpdateField}
          onRemove={handleRemoveItem}
          emptyMessage={selectedWarehouseId ? 'เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน' : 'เลือกคลังสินค้าก่อน'}
        />

        {/* PO mismatch warning */}
        {hasPOMismatch && (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            จำนวนรับเข้าไม่ตรงกับ PO บางรายการ
          </div>
        )}

        {/* Batch Notes */}
        {receiveItems.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />หมายเหตุรวม
            </label>
            <textarea value={batchNotes} onChange={e => setBatchNotes(e.target.value)} rows={3}
              placeholder="หมายเหตุสำหรับการรับเข้าครั้งนี้..."
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pb-4">
          <Button variant="secondary" onClick={() => router.push('/inventory/receives')}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
            loading={submitting}
            icon={<Save className="w-4 h-4" />}
          >
            {submitting ? 'กำลังบันทึก...' : 'บันทึกรับเข้า'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleConfirmSubmit}
        icon={<Package2 className="w-6 h-6 text-primary" />}
        title="ยืนยันรับเข้าสินค้า"
        description="คุณต้องการรับเข้าสินค้าทั้งหมดใช่หรือไม่?"
        confirmLabel="ยืนยันรับเข้า"
        confirmIcon={<CheckCircle2 className="w-4 h-4" />}
      >
        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-slate-400">คลังสินค้า</span>
            <span className="font-medium text-gray-900 dark:text-white">{selectedWarehouse?.name || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-slate-400">จำนวนรายการ</span>
            <span className="font-medium text-gray-900 dark:text-white">{receiveItems.length} รายการ</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-slate-400">จำนวนรวม</span>
            <span className="font-medium text-gray-900 dark:text-white">{receiveItems.reduce((s, i) => s + i.quantity, 0).toLocaleString()} ชิ้น</span>
          </div>
        </div>
        {hasPOMismatch && (
          <div className="mt-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-2.5 text-sm text-amber-700 dark:text-amber-400">
            จำนวนรับเข้าไม่ตรงกับ PO บางรายการ
          </div>
        )}
      </ConfirmDialog>
    </Layout>
  );
}

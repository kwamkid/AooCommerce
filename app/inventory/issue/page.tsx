'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, PackageMinus, CheckCircle2, Warehouse, Star,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import FormSelect from '@/components/ui/FormSelect';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';
import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  is_default?: boolean;
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
}

const REASON_OPTIONS = [
  { value: 'เสียหาย', label: 'เสียหาย' },
  { value: 'หมดอายุ', label: 'หมดอายุ' },
  { value: 'ตัวอย่าง', label: 'ตัวอย่าง' },
  { value: 'อื่นๆ', label: 'อื่นๆ' },
];

export default function StockIssuePage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);

  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [loadingStock, setLoadingStock] = useState(false);

  const [items, setItems] = useState<IssueItem[]>([]);
  const [batchNotes, setBatchNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
        const whs: WarehouseItem[] = data.warehouses || [];
        setWarehouses(whs);
        if (whs.length > 0) setSelectedWarehouse(whs[0].id);
      }
    } catch {
      showToast('โหลดข้อมูลคลังสินค้าไม่สำเร็จ', 'error');
    } finally {
      setLoadingWarehouses(false);
    }
  };

  const fetchProducts = async () => {
    setLoadingProducts(true);
    try {
      const res = await apiFetch('/api/products');
      if (!res.ok) throw new Error('Failed');
      const result = await res.json();
      const flat: ProductSearchItem[] = [];
      for (const sp of (result.products || [])) {
        if (sp.product_type === 'simple') {
          const vid = sp.variations?.[0]?.variation_id ?? sp.product_id;
          flat.push({ id: vid, product_id: sp.product_id, code: sp.code, name: sp.name, image: sp.main_image_url || sp.image, variation_label: sp.simple_variation_label, product_type: 'simple', default_price: sp.simple_default_price || 0, sku: sp.variations?.[0]?.sku || '' } as ProductSearchItem);
        } else {
          for (const v of (sp.variations || [])) {
            flat.push({ id: v.variation_id, product_id: sp.product_id, code: `${sp.code}-${v.variation_label}`, name: sp.name, image: v.image_url || sp.main_image_url || sp.image, variation_label: v.variation_label, product_type: 'variation', default_price: v.default_price || 0, sku: v.sku || '' } as ProductSearchItem);
          }
        }
      }
      setProducts(flat);
    } catch {
      showToast('โหลดข้อมูลสินค้าไม่สำเร็จ', 'error');
    } finally {
      setLoadingProducts(false);
    }
  };

  const fetchInventory = useCallback(async (warehouseId: string) => {
    if (!warehouseId) { setStockMap({}); return; }
    setLoadingStock(true);
    try {
      const res = await apiFetch(`/api/inventory?warehouse_id=${warehouseId}&limit=999`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const map: Record<string, number> = {};
      for (const item of (data.items || [])) {
        map[item.variation_id] = item.available ?? (item.quantity - (item.reserved_quantity || 0));
      }
      setStockMap(map);
    } catch {
      showToast('โหลดข้อมูล stock ไม่สำเร็จ', 'error');
      setStockMap({});
    } finally {
      setLoadingStock(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (selectedWarehouse) fetchInventory(selectedWarehouse);
    else setStockMap({});
  }, [selectedWarehouse, fetchInventory]);

  const handleAddProduct = (product: ProductSearchItem) => {
    const existing = items.findIndex(i => i.variation_id === product.id);
    if (existing !== -1) {
      const updated = [...items];
      updated[existing].quantity += 1;
      setItems(updated);
    } else {
      setItems([...items, {
        variation_id: product.id,
        product_id: (product as any).product_id || product.id,
        product_code: product.code || '',
        product_name: product.name,
        variation_label: product.variation_label,
        image: product.image ?? undefined,
        sku: product.sku,
        quantity: 1,
        reason: 'เสียหาย',
      }]);
    }
  };

  const handleUpdateField = (idx: number, field: keyof TableItem, value: number | string) => {
    const updated = [...items];
    if (field === 'quantity') updated[idx].quantity = Math.max(1, value as number);
    if (field === 'reason') updated[idx].reason = value as string;
    setItems(updated);
  };

  const handleRemoveItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

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
        })),
        notes: batchNotes || undefined,
      };
      const res = await apiFetch('/api/inventory/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'เกิดข้อผิดพลาดในการเบิกออกสินค้า');
      showToast(`สร้างใบเบิกออก ${result.issue_number || ''} สำเร็จ`, 'success');
      router.push('/inventory/issues');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const tableItems: TableItem[] = items.map(i => ({
    variation_id: i.variation_id,
    product_id: i.product_id,
    product_name: i.product_name,
    product_code: i.product_code,
    variation_label: i.variation_label,
    sku: i.sku,
    image: i.image,
    quantity: i.quantity,
    reason: i.reason,
  }));

  if (authLoading) {
    return (
      <Layout title="เบิกออกสินค้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการเบิกออก', href: '/inventory/issues' }, { label: 'เบิกออกสินค้า' }]}>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="เบิกออกสินค้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการเบิกออก', href: '/inventory/issues' }, { label: 'เบิกออกสินค้า' }]}>
      <div className="space-y-4">
        {/* Warehouse Selection */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
            คลังสินค้า <span className="text-red-500">*</span>
          </label>
          {loadingWarehouses ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />กำลังโหลด...
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1 max-w-sm">
                <FormSelect
                  value={selectedWarehouse}
                  onChange={setSelectedWarehouse}
                  options={warehouses.map(wh => ({ id: wh.id, label: `${wh.name}${wh.code ? ` (${wh.code})` : ''}`, icon: wh.is_default ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : undefined }))}
                  placeholder="เลือกคลังสินค้า"
                  searchPlaceholder="ค้นหาคลัง..."
                  icon={<Warehouse className="w-4 h-4" />}
                />
              </div>
              {loadingStock && (
                <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />โหลด stock...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Items Table */}
        {selectedWarehouse && (
          <ItemsTable
            items={tableItems}
            columns={['stock_badge', 'qty', 'reason']}
            stockMap={stockMap}
            reasonOptions={REASON_OPTIONS}
            products={products}
            loadingProducts={loadingProducts}
            onAdd={handleAddProduct}
            onUpdateField={handleUpdateField}
            onRemove={handleRemoveItem}
            emptyMessage="เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน"
            showSummary={true}
          />
        )}

        {/* Batch Notes */}
        {items.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">หมายเหตุรวม</label>
            <textarea value={batchNotes} onChange={e => setBatchNotes(e.target.value)} rows={2}
              placeholder="หมายเหตุสำหรับการเบิกออกครั้งนี้ (ไม่บังคับ)..."
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
            />
          </div>
        )}

        {/* Action Buttons */}
        {selectedWarehouse && (
          <div className="flex justify-end gap-3 pb-4">
            <button type="button" onClick={() => router.push('/inventory/issues')}
              className="px-5 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-sm font-medium">
              ยกเลิก
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canSubmit || submitting}
              className="bg-[#F4511E] text-white px-5 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังบันทึก...</> : <><PackageMinus className="w-4 h-4" />บันทึกเบิกออก</>}
            </button>
          </div>
        )}
      </div>

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
            <span className="font-medium text-gray-900 dark:text-white">{items.reduce((s, i) => s + i.quantity, 0).toLocaleString()} ชิ้น</span>
          </div>
        </div>
      </ConfirmDialog>
    </Layout>
  );
}

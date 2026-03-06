'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Loader2, FileText, ArrowRightLeft, AlertTriangle, Star, Warehouse,
} from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';
import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  is_default?: boolean;
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
  stock_source: number | null;
  stock_dest: number | null;
}

interface InventoryRecord {
  variation_id: string;
  quantity: number;
  available: number;
}

export default function StockTransferPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destWarehouseId, setDestWarehouseId] = useState('');

  const [sourceInventory, setSourceInventory] = useState<InventoryRecord[]>([]);
  const [destInventory, setDestInventory] = useState<InventoryRecord[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [allowOversell, setAllowOversell] = useState(true);

  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);
  const [batchNotes, setBatchNotes] = useState('');

  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchWarehouses();
      fetchProducts();
    }
  }, [authLoading, userProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sourceWarehouseId) fetchSourceInventory(sourceWarehouseId);
    else setSourceInventory([]);
  }, [sourceWarehouseId]);

  useEffect(() => {
    if (destWarehouseId) fetchDestInventory(destWarehouseId);
    else setDestInventory([]);
  }, [destWarehouseId]);

  // Update stock_source on items when source inventory changes
  useEffect(() => {
    if (transferItems.length > 0) {
      setTransferItems(prev => prev.map(item => ({
        ...item,
        stock_source: getAvailable(sourceInventory, item.variation_id),
      })));
    }
  }, [sourceInventory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update stock_dest on items when dest inventory changes
  useEffect(() => {
    if (transferItems.length > 0) {
      setTransferItems(prev => prev.map(item => ({
        ...item,
        stock_dest: getQty(destInventory, item.variation_id),
      })));
    }
  }, [destInventory]); // eslint-disable-line react-hooks/exhaustive-deps

  function getAvailable(inv: InventoryRecord[], variationId: string): number | null {
    if (!sourceWarehouseId) return null;
    const r = inv.find(i => i.variation_id === variationId);
    return r ? r.available : 0;
  }

  function getQty(inv: InventoryRecord[], variationId: string): number | null {
    if (!destWarehouseId) return null;
    const r = inv.find(i => i.variation_id === variationId);
    return r ? r.quantity : 0;
  }

  const fetchWarehouses = async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        const list: WarehouseItem[] = data.warehouses || [];
        setWarehouses(list);
        if (data.stockConfig) setAllowOversell(data.stockConfig.allowOversell !== false);
        const def = list.find(wh => wh.is_default);
        if (def) setSourceWarehouseId(def.id);
        else if (list.length === 1) setSourceWarehouseId(list[0].id);
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
      setProductsLoading(false);
    }
  };

  const fetchSourceInventory = async (warehouseId: string) => {
    try {
      setInventoryLoading(true);
      const res = await apiFetch(`/api/inventory?warehouse_id=${warehouseId}&limit=9999`);
      if (res.ok) {
        const data = await res.json();
        setSourceInventory((data.items || []).map((inv: any) => ({
          variation_id: inv.variation_id,
          quantity: inv.quantity ?? 0,
          available: inv.available ?? (inv.quantity ?? 0) - (inv.reserved_quantity ?? 0),
        })));
      } else setSourceInventory([]);
    } catch {
      setSourceInventory([]);
    } finally {
      setInventoryLoading(false);
    }
  };

  const fetchDestInventory = async (warehouseId: string) => {
    try {
      const res = await apiFetch(`/api/inventory?warehouse_id=${warehouseId}&limit=9999`);
      if (res.ok) {
        const data = await res.json();
        setDestInventory((data.items || []).map((inv: any) => ({
          variation_id: inv.variation_id,
          quantity: inv.quantity ?? 0,
          available: inv.available ?? (inv.quantity ?? 0) - (inv.reserved_quantity ?? 0),
        })));
      } else setDestInventory([]);
    } catch {
      setDestInventory([]);
    }
  };

  const handleAddProduct = (product: ProductSearchItem) => {
    const existing = transferItems.findIndex(i => i.variation_id === product.id);
    if (existing !== -1) {
      const updated = [...transferItems];
      updated[existing].quantity += 1;
      setTransferItems(updated);
    } else {
      setTransferItems([...transferItems, {
        variation_id: product.id,
        product_id: (product as any).product_id || product.id,
        code: product.code || '',
        name: product.name,
        image: product.image ?? undefined,
        variation_label: product.variation_label,
        sku: product.sku,
        quantity: 1,
        stock_source: getAvailable(sourceInventory, product.id),
        stock_dest: getQty(destInventory, product.id),
      }]);
    }
  };

  const handleUpdateField = (idx: number, field: keyof TableItem, value: number | string) => {
    const updated = [...transferItems];
    if (field === 'quantity') updated[idx].quantity = Math.max(1, value as number);
    setTransferItems(updated);
  };

  const handleRemoveItem = (idx: number) => {
    setTransferItems(transferItems.filter((_, i) => i !== idx));
  };

  const warehousesAreSame = sourceWarehouseId && destWarehouseId && sourceWarehouseId === destWarehouseId;
  const hasStockWarning = transferItems.some(i => i.stock_source !== null && i.quantity > (i.stock_source ?? 0));
  const canSubmit = sourceWarehouseId && destWarehouseId && !warehousesAreSame && transferItems.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (warehousesAreSame) { showToast('คลังต้นทางและปลายทางต้องไม่เป็นคลังเดียวกัน', 'error'); return; }
    try {
      setSubmitting(true);
      const payload = {
        from_warehouse_id: sourceWarehouseId,
        to_warehouse_id: destWarehouseId,
        items: transferItems.map(i => ({ variation_id: i.variation_id, quantity: i.quantity })),
        notes: batchNotes || undefined,
      };
      const res = await apiFetch('/api/inventory/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) {
        if (result.partial_success && result.errors) {
          const details = result.errors.map((e: any) => `${e.variation_id || 'รายการ'}: ${e.error || ''}`).join('\n');
          showToast(`โอนย้ายบางรายการไม่สำเร็จ: ${details}`, 'error');
          if (result.succeeded_count > 0) showToast(`โอนย้ายสำเร็จ ${result.succeeded_count} รายการ`, 'success');
          setTransferItems([]);
          setBatchNotes('');
          fetchSourceInventory(sourceWarehouseId);
          return;
        }
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
      showToast(`สร้างใบโอนย้าย ${result.transfer_number || ''} สำเร็จ`, 'success');
      router.push('/inventory/transfers');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการโอนย้ายสินค้า', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const tableItems: TableItem[] = transferItems.map(i => ({
    variation_id: i.variation_id,
    product_id: i.product_id,
    product_name: i.name,
    product_code: i.code,
    variation_label: i.variation_label,
    sku: i.sku,
    image: i.image,
    quantity: i.quantity,
    stock_source: i.stock_source,
    stock_dest: i.stock_dest,
  }));

  if (authLoading || loading) {
    return (
      <Layout title="โอนย้ายสินค้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการโอนย้าย', href: '/inventory/transfers' }, { label: 'สร้างใบโอนย้าย' }]}>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="โอนย้ายสินค้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการโอนย้าย', href: '/inventory/transfers' }, { label: 'สร้างใบโอนย้าย' }]}>
      <div className="space-y-4 animate-fadeIn">
        {/* Warehouse Selection */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
          <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                คลังต้นทาง <span className="text-red-500">*</span>
              </label>
              <FormSelect
                value={sourceWarehouseId}
                onChange={setSourceWarehouseId}
                options={warehouses.filter(wh => wh.id !== destWarehouseId).map(wh => ({ id: wh.id, label: `${wh.name}${wh.code ? ` (${wh.code})` : ''}`, icon: wh.is_default ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : undefined }))}
                placeholder="-- เลือกคลังต้นทาง --"
                searchPlaceholder="ค้นหาคลัง..."
                icon={<Warehouse className="w-4 h-4" />}
              />
            </div>
            <div className="flex items-center justify-center sm:mt-8 flex-shrink-0">
              <ArrowRightLeft className="w-5 h-5 text-gray-400 dark:text-slate-500 rotate-90 sm:rotate-0" />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                คลังปลายทาง <span className="text-red-500">*</span>
              </label>
              <FormSelect
                value={destWarehouseId}
                onChange={setDestWarehouseId}
                options={warehouses.filter(wh => wh.id !== sourceWarehouseId).map(wh => ({ id: wh.id, label: `${wh.name}${wh.code ? ` (${wh.code})` : ''}`, icon: wh.is_default ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : undefined }))}
                placeholder="-- เลือกคลังปลายทาง --"
                searchPlaceholder="ค้นหาคลัง..."
                icon={<Warehouse className="w-4 h-4" />}
              />
            </div>
          </div>
          {inventoryLoading && (
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-1.5 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />กำลังโหลดสต็อก...
            </p>
          )}
          {warehousesAreSame && (
            <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              คลังต้นทางและปลายทางต้องไม่เป็นคลังเดียวกัน
            </div>
          )}
        </div>

        {/* Stock warning banner */}
        {hasStockWarning && transferItems.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            บางรายการมีจำนวนโอนย้ายมากกว่าสต็อกที่มีในคลังต้นทาง
          </div>
        )}

        {/* Items Table */}
        {sourceWarehouseId && destWarehouseId && !warehousesAreSame && (
          <ItemsTable
            items={tableItems}
            columns={['stock_source', 'stock_dest', 'qty']}
            products={products}
            loadingProducts={productsLoading}
            onAdd={handleAddProduct}
            onUpdateField={handleUpdateField}
            onRemove={handleRemoveItem}
            emptyMessage="เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน"
            showSummary={true}
            stockMap={Object.fromEntries(sourceInventory.map(s => [s.variation_id, s.available]))}
            disableOutOfStock={!allowOversell}
          />
        )}

        {/* Batch Notes */}
        {transferItems.length > 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
              <FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" />หมายเหตุรวม
            </label>
            <textarea value={batchNotes} onChange={e => setBatchNotes(e.target.value)} rows={3}
              placeholder="หมายเหตุสำหรับการโอนย้ายครั้งนี้..."
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pb-4">
          <button type="button" onClick={() => router.push('/inventory/transfers')}
            className="px-5 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-sm font-medium">
            ยกเลิก
          </button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit}
            className="bg-[#F4511E] text-white px-5 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
            {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />กำลังสร้างใบโอนย้าย...</> : <><ArrowRightLeft className="w-4 h-4" />สร้างใบโอนย้าย</>}
          </button>
        </div>
      </div>
    </Layout>
  );
}

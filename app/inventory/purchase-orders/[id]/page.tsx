'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { generatePOPdf } from '@/lib/supplier-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';
import type { DateValueType } from '@/components/ui/DateRangePicker';
import { Loader2, FileText, Save } from 'lucide-react';

import type { PurchaseOrderDetail, EditItem, Supplier, WarehouseItem } from '../components/types';
import { formatCurrency } from '../components/types';
import POHeaderActions from '../components/POHeaderActions';
import POInfoCard from '../components/POInfoCard';
import POEditItemsTable from '../components/POEditItemsTable';
import POViewItemsTable from '../components/POViewItemsTable';
import POReceivesSection from '../components/POReceivesSection';

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features, fetched: featuresFetched } = useFeatures();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();
  const poId = params.id as string;

  const [po, setPO] = useState<PurchaseOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const fetchedRef = useRef(false);

  // ─── Edit state ───
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [supplierProducts, setSupplierProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [allBrands, setAllBrands] = useState<{ id: string; name: string; supplier_id: string | null }[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const [editSupplierId, setEditSupplierId] = useState('');
  const [editWarehouseId, setEditWarehouseId] = useState('');
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [editExpectedDate, setEditExpectedDate] = useState<DateValueType>({ startDate: null, endDate: null });
  const [saving, setSaving] = useState(false);
  const [editInitialized, setEditInitialized] = useState(false);

  const isEditable = po?.status === 'draft' || po?.status === 'sent';

  // ─── Fetch PO ───
  useEffect(() => {
    if (authLoading || !userProfile || !featuresFetched) return;
    if (!features.supplier) { router.replace('/inventory/receives'); return; }
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchPO();
  }, [authLoading, userProfile, featuresFetched, features.supplier, router, poId]);

  const fetchPO = async () => {
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`);
      if (!res.ok) { showToast('ไม่พบใบสั่งซื้อ', 'error'); router.push('/inventory/purchase-orders'); return; }
      const data = await res.json();
      const fresh = data.purchase_order as PurchaseOrderDetail;
      // Auto-recalculate status for POs with receives (fixes legacy data)
      if (fresh.receives?.length > 0 && ['sent', 'partial_received', 'received', 'received_mismatch'].includes(fresh.status)) {
        try {
          const recalcRes = await apiFetch(`/api/inventory/purchase-orders/${poId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recalculate: true }) });
          if (recalcRes.ok) {
            const rd = await recalcRes.json();
            if (rd.new_status && rd.new_status !== fresh.status) fresh.status = rd.new_status;
          }
        } catch { /* ignore recalc errors */ }
      }
      setPO(fresh);
      // Directly re-init edit state from fresh data (don't rely on useEffect)
      if (fresh.status === 'draft' || fresh.status === 'sent') {
        initEditFromPO(fresh);
        // Also fetch reference data (suppliers, warehouses, brands) if not loaded yet
        if (suppliers.length === 0) fetchSuppliers();
        if (warehouses.length === 0) fetchWarehouses();
        if (allBrands.length === 0) fetchBrands();
      }
    } catch { showToast('โหลดข้อมูลไม่สำเร็จ', 'error'); }
    finally { setLoading(false); }
  };

  const initEditFromPO = (p: PurchaseOrderDetail) => {
    setEditSupplierId(p.supplier?.id || '');
    setEditWarehouseId(p.warehouse?.id || '');
    setEditNotes(p.notes || '');
    if (p.expected_date) setEditExpectedDate({ startDate: p.expected_date, endDate: p.expected_date });
    else setEditExpectedDate({ startDate: null, endDate: null });
    setEditItems(p.items.map(item => ({
      variation_id: item.variation_id,
      product_id: item.variation?.product?.id || '',
      code: item.variation?.product?.code || '',
      name: item.variation?.product?.name || '',
      image: item.variation?.product?.image,
      variation_label: item.variation?.variation_label,
      sku: item.variation?.sku || undefined,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
    })));
    setEditInitialized(true);
  };

  // ─── Fetch reference data ───
  const fetchSuppliers = async () => {
    try { const res = await apiFetch('/api/suppliers'); if (res.ok) { const d = await res.json(); setSuppliers(d.data || []); } } catch { /* */ }
  };
  const fetchWarehouses = async () => {
    try { const res = await apiFetch('/api/warehouses'); if (res.ok) { const d = await res.json(); setWarehouses(d.warehouses || []); } } catch { /* */ }
  };
  const fetchBrands = async () => {
    try { const res = await apiFetch('/api/brands'); if (res.ok) { const d = await res.json(); setAllBrands((d.data || []).map((b: { id: string; name: string; supplier_id: string | null }) => ({ id: b.id, name: b.name, supplier_id: b.supplier_id }))); } } catch { /* */ }
  };

  // ─── Fetch supplier products when supplier changes ───
  useEffect(() => {
    if (!editSupplierId || !editInitialized) { setSupplierProducts([]); return; }
    const fetchProducts = async () => {
      setLoadingProducts(true);
      try {
        const res = await apiFetch(`/api/suppliers/${editSupplierId}/products`);
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
  }, [editSupplierId, editInitialized]);

  // ─── Fetch stock when warehouse changes ───
  useEffect(() => {
    if (!editWarehouseId || !editInitialized) { setStockMap({}); return; }
    (async () => {
      try {
        const res = await apiFetch(`/api/inventory?warehouse_id=${editWarehouseId}&limit=9999`);
        if (res.ok) { const d = await res.json(); const m: Record<string, number> = {}; for (const i of (d.items || [])) m[i.variation_id] = i.quantity ?? 0; setStockMap(m); }
      } catch { /* */ }
    })();
  }, [editWarehouseId, editInitialized]);

  // ─── Edit item actions ───
  const handleAddProduct = (product: ProductSearchItem) => {
    const idx = editItems.findIndex(i => i.variation_id === product.id);
    if (idx >= 0) { setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: item.quantity + 1 } : item)); }
    else {
      setEditItems(prev => [...prev, {
        variation_id: product.id, product_id: product.product_id, code: product.code, name: product.name, image: product.image,
        variation_label: product.variation_label, sku: product.sku, quantity: 1,
        unit_cost: (product as unknown as { _cost_price?: number })._cost_price || 0,
      }]);
    }
  };
  const updateItemQty = (idx: number, v: number) => setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: Math.max(1, v) } : item));
  const updateItemCost = (idx: number, v: number) => setEditItems(prev => prev.map((item, i) => i === idx ? { ...item, unit_cost: Math.max(0, v) } : item));
  const removeItem = (idx: number) => setEditItems(prev => prev.filter((_, i) => i !== idx));

  // ─── Save (PUT — draft or sent) ───
  const handleSave = async () => {
    if (!editSupplierId) { showToast('กรุณาเลือก Supplier', 'error'); return; }
    if (!editWarehouseId) { showToast('กรุณาเลือกคลังสินค้า', 'error'); return; }
    if (editItems.length === 0) { showToast('กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ', 'error'); return; }
    setSaving(true);
    try {
      const ed = editExpectedDate?.startDate ? new Date(editExpectedDate.startDate).toISOString().split('T')[0] : '';
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: editSupplierId, warehouse_id: editWarehouseId, notes: editNotes || undefined, expected_date: ed || undefined, items: editItems.map(i => ({ variation_id: i.variation_id, quantity: i.quantity, unit_cost: i.unit_cost })) }),
      });
      if (res.ok) {
        showToast('บันทึกสำเร็จ');
        router.push('/inventory/purchase-orders');
      }
      else { const d = await res.json(); showToast(d.error || 'บันทึกไม่สำเร็จ', 'error'); }
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
    finally { setSaving(false); }
  };

  // ─── Status actions ───
  const updateStatus = async (newStatus: string, confirmMsg: string) => {
    const ok = await confirm({ title: confirmMsg, ...(newStatus === 'cancelled' ? { variant: 'danger' as const } : {}) }); if (!ok) return;
    setUpdating(true);
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus }) });
      if (res.ok) {
        const d = await res.json();
        if (newStatus === 'sent' && d.share_token) {
          const url = `${window.location.origin}/po/${d.share_token}`;
          navigator.clipboard.writeText(url).then(() => showToast('แจ้ง Sup สำเร็จ — คัดลอกลิงก์แล้ว')).catch(() => showToast('แจ้ง Sup สำเร็จ'));
        } else { showToast('อัปเดตสถานะสำเร็จ'); }
        await fetchPO();
      } else { const d = await res.json(); showToast(d.error || 'อัปเดตไม่สำเร็จ', 'error'); }
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
    finally { setUpdating(false); }
  };

  const autoSendIfDraft = async (): Promise<string | null> => {
    if (!po || po.status !== 'draft') return po?.share_token || null;
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'sent' }) });
      if (res.ok) { const d = await res.json(); await fetchPO(); return d.share_token || null; }
    } catch { /* */ }
    return null;
  };

  const handleCopyLink = async () => {
    if (!po) return;
    let token = po.share_token;
    if (!token) {
      if (po.status === 'draft') { token = await autoSendIfDraft(); }
      else { try { const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ generate_token: true }) }); if (res.ok) { const d = await res.json(); token = d.share_token; if (token) setPO({ ...po, share_token: token }); } } catch { /* */ } }
    }
    if (token) { navigator.clipboard.writeText(`${window.location.origin}/po/${token}`).then(() => showToast('คัดลอกลิงก์ PO ออนไลน์แล้ว')); }
    else { showToast('ไม่สามารถสร้างลิงก์ได้', 'error'); }
  };

  const handlePrintPdf = async () => {
    if (!po) return;
    setGeneratingPdf(true);
    try { if (po.status === 'draft') await autoSendIfDraft(); const blob = await generatePOPdf(po); showPdfPreview(blob, 'ใบสั่งซื้อ'); }
    catch (err) { console.error('PDF error:', err); showToast('สร้าง PDF ไม่สำเร็จ', 'error'); }
    finally { setGeneratingPdf(false); }
  };

  // ─── Derived ───
  const selectedSupplier = suppliers.find(s => s.id === editSupplierId);
  const canSave = editSupplierId && editWarehouseId && editItems.length > 0 && !saving;

  // ─── Loading ───
  if (authLoading || loading) {
    return <Layout><div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div></Layout>;
  }
  if (!po) return null;

  return (
    <Layout
      title={po.po_number}
      breadcrumbs={[
        { label: 'คลังสินค้า', href: '/inventory' },
        { label: 'ใบสั่งซื้อ', href: '/inventory/purchase-orders' },
        { label: po.po_number },
      ]}
    >
      <div className="space-y-4">
        {/* Header */}
        <POHeaderActions
          status={po.status}
          updating={updating}
          generatingPdf={generatingPdf}
          onCopyLink={handleCopyLink}
          onPrintPdf={handlePrintPdf}
          onCancel={() => updateStatus('cancelled', 'ต้องการยกเลิก PO นี้?')}
          onClose={() => updateStatus('closed', 'ต้องการปิด PO นี้?')}
        />

        {/* Supplier + Warehouse + Date + Supplier Info */}
        <POInfoCard
          po={po}
          isEditable={!!isEditable}
          suppliers={suppliers}
          warehouses={warehouses}
          editSupplierId={editSupplierId}
          editWarehouseId={editWarehouseId}
          editExpectedDate={editExpectedDate}
          onSupplierChange={(id) => { setEditSupplierId(id); setEditItems([]); }}
          onSupplierClear={() => { setEditSupplierId(''); setEditItems([]); setSupplierProducts([]); }}
          onWarehouseChange={setEditWarehouseId}
          onExpectedDateChange={setEditExpectedDate}
          selectedSupplier={selectedSupplier}
          allBrands={allBrands}
          supplierProducts={supplierProducts}
          loadingProducts={loadingProducts}
        />

        {/* Items */}
        {isEditable ? (
          <POEditItemsTable
            items={editItems}
            supplierId={editSupplierId}
            supplierProducts={supplierProducts}
            loadingProducts={loadingProducts}
            stockMap={stockMap}
            onAddProduct={handleAddProduct}
            onUpdateQty={updateItemQty}
            onUpdateCost={updateItemCost}
            onRemove={removeItem}
          />
        ) : (
          <POViewItemsTable items={po.items} totalAmount={po.total_amount} />
        )}

        {/* Notes */}
        {isEditable ? (
          (editItems.length > 0 || editNotes) && (
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5"><FileText className="w-4 h-4 inline mr-1.5 -mt-0.5" /> หมายเหตุ</label>
              <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3} placeholder="หมายเหตุสำหรับ PO นี้..."
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500" />
            </div>
          )
        ) : po.notes ? (
          <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg p-3">
            <p className="text-sm text-amber-800 dark:text-amber-300"><span className="font-medium">หมายเหตุ:</span> {po.notes}</p>
          </div>
        ) : null}

        {/* Linked receives */}
        {po.receives && po.receives.length > 0 && (
          <POReceivesSection receives={po.receives} poItems={po.items} />
        )}

        {/* Save button (editable only) */}
        {isEditable && (
          <div className="flex justify-end gap-3 pb-4">
            <button type="button" onClick={handleSave} disabled={!canSave}
              className="bg-primary text-white px-5 py-2.5 rounded-lg hover:bg-primary-hover transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> กำลังบันทึก...</> : <><Save className="w-4 h-4" /> บันทึก</>}
            </button>
          </div>
        )}
      </div>
      {confirmDialog}
    </Layout>
  );
}

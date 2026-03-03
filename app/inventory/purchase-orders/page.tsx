'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generatePOPdf } from '@/lib/supplier-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';
import FormSelect from '@/components/ui/FormSelect';
import ActionMenu, { ActionItem } from '@/app/orders/components/ActionMenu';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import {
  Loader2, Plus, Search, ClipboardList, Factory, Warehouse,
  CheckCircle2, Clock, Package, XCircle, Send, Pencil, Printer, Link2, Ban, Lock, AlertTriangle,
} from 'lucide-react';

interface PurchaseOrder {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  notes: string | null;
  total_amount: number;
  created_at: string;
  created_by_name: string | null;
  supplier: { id: string; name: string; supplier_type: string } | null;
  warehouse: { id: string; name: string; code: string | null } | null;
  items: { id: string; quantity: number; received_quantity: number }[];
}

// ─── Column config ──────────────────────────────
type ColumnKey = 'poInfo' | 'supplier' | 'warehouse' | 'itemCount' | 'amount' | 'status' | 'createdBy' | 'actions';

const COLUMN_CONFIGS: { key: ColumnKey; label: string; defaultVisible: boolean; alwaysVisible?: boolean }[] = [
  { key: 'poInfo', label: 'เลขที่ PO', defaultVisible: true, alwaysVisible: true },
  { key: 'supplier', label: 'Supplier', defaultVisible: true },
  { key: 'warehouse', label: 'คลัง', defaultVisible: true },
  { key: 'itemCount', label: 'รายการ', defaultVisible: true },
  { key: 'amount', label: 'มูลค่า', defaultVisible: true },
  { key: 'status', label: 'สถานะ', defaultVisible: true },
  { key: 'createdBy', label: 'ผู้สร้าง', defaultVisible: true },
  { key: 'actions', label: 'จัดการ', defaultVisible: true, alwaysVisible: true },
];

const STORAGE_KEY = 'po-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

const STATUS_OPTIONS = [
  { id: 'draft', label: 'ร่าง' },
  { id: 'sent', label: 'แจ้ง Sup แล้ว' },
  { id: 'partial_received', label: 'รับบางส่วน' },
  { id: 'received', label: 'รับครบ' },
  { id: 'received_mismatch', label: 'รับไม่ตรง' },
  { id: 'closed', label: 'ปิด' },
  { id: 'cancelled', label: 'ยกเลิก' },
];

function statusBadge(status: string) {
  switch (status) {
    case 'draft': return { label: 'ร่าง', color: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300' };
    case 'sent': return { label: 'แจ้ง Sup แล้ว', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
    case 'partial_received': return { label: 'รับบางส่วน', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    case 'received': return { label: 'รับครบ', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
    case 'received_mismatch': return { label: 'รับไม่ตรง', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' };
    case 'closed': return { label: 'ปิด', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' };
    case 'cancelled': return { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
    default: return { label: status, color: 'bg-gray-100 text-gray-600' };
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'draft': return <ClipboardList className="w-3 h-3" />;
    case 'sent': return <Send className="w-3 h-3" />;
    case 'partial_received': return <Clock className="w-3 h-3" />;
    case 'received': return <CheckCircle2 className="w-3 h-3" />;
    case 'received_mismatch': return <AlertTriangle className="w-3 h-3" />;
    case 'closed': return <Package className="w-3 h-3" />;
    case 'cancelled': return <XCircle className="w-3 h-3" />;
    default: return null;
  }
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features, fetched: featuresFetched } = useFeatures();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try { return new Set(JSON.parse(stored) as ColumnKey[]); } catch { /* defaults */ }
      }
    }
    return new Set(getDefaultColumns());
  });
  const toggleColumn = (key: ColumnKey) => {
    const config = COLUMN_CONFIGS.find(c => c.key === key);
    if (config?.alwaysVisible) return;
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };
  const isCol = (key: ColumnKey) => visibleColumns.has(key);

  // Feature gate redirect
  useFetchOnce(() => {
    if (!features.supplier) {
      router.replace('/inventory/receives');
      return;
    }
    fetchData();
  }, !authLoading && !!userProfile && featuresFetched);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/inventory/purchase-orders');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPurchaseOrders(data.purchase_orders || []);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Auto-send draft PO → returns share_token or null
  const autoSendIfDraft = async (poId: string, currentStatus: string): Promise<string | null> => {
    if (currentStatus !== 'draft') return null;
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });
      if (res.ok) {
        const d = await res.json();
        fetchData(); // refresh list
        return d.share_token || null;
      }
    } catch { /* */ }
    return null;
  };

  const handlePrint = async (id: string, status: string) => {
    setPrintingId(id);
    try {
      // Auto-send draft before printing
      if (status === 'draft') await autoSendIfDraft(id, status);
      const res = await apiFetch(`/api/inventory/purchase-orders/${id}`);
      if (!res.ok) { showToast('โหลดข้อมูลไม่สำเร็จ', 'error'); return; }
      const result = await res.json();
      const po = result.purchase_order;
      if (!po) { showToast('ไม่พบรายการ', 'error'); return; }
      const blob = await generatePOPdf(po);
      showPdfPreview(blob, 'ใบสั่งซื้อ');
    } catch {
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
    }
  };

  const handleCopyLink = async (poId: string, status: string) => {
    setActionLoadingId(poId);
    try {
      // Auto-send draft before generating link
      if (status === 'draft') {
        const token = await autoSendIfDraft(poId, status);
        if (token) {
          await navigator.clipboard.writeText(`${window.location.origin}/po/${token}`);
          showToast('แจ้ง Sup สำเร็จ — คัดลอกลิงก์แล้ว');
          setActionLoadingId(null);
          return;
        }
      }
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generate_token: true }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.share_token) {
          await navigator.clipboard.writeText(`${window.location.origin}/po/${d.share_token}`);
          showToast('คัดลอกลิงก์ PO ออนไลน์แล้ว');
        }
      }
    } catch { showToast('สร้างลิงก์ไม่สำเร็จ', 'error'); }
    finally { setActionLoadingId(null); }
  };

  const handleCancel = async (poId: string) => {
    const ok = await confirm({ title: 'ต้องการยกเลิก PO นี้?', variant: 'danger' });
    if (!ok) return;
    setActionLoadingId(poId);
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (res.ok) { showToast('ยกเลิก PO สำเร็จ'); fetchData(); }
      else { const d = await res.json(); showToast(d.error || 'ไม่สำเร็จ', 'error'); }
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
    finally { setActionLoadingId(null); }
  };

  const handleClose = async (poId: string) => {
    const ok = await confirm({ title: 'ต้องการปิด PO นี้?' });
    if (!ok) return;
    setActionLoadingId(poId);
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      if (res.ok) { showToast('ปิด PO สำเร็จ'); fetchData(); }
      else { const d = await res.json(); showToast(d.error || 'ไม่สำเร็จ', 'error'); }
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
    finally { setActionLoadingId(null); }
  };

  const getMenuItems = (po: PurchaseOrder): ActionItem[] => {
    const items: ActionItem[] = [
      { key: 'edit', label: 'แก้ไข', icon: <Pencil className="w-4 h-4" />, onClick: () => router.push(`/inventory/purchase-orders/${po.id}`) },
      { key: 'print', label: 'พิมพ์', icon: <Printer className="w-4 h-4" />, onClick: () => handlePrint(po.id, po.status), disabled: printingId === po.id },
      { key: 'copyLink', label: 'คัดลอกลิงก์ PO', icon: <Link2 className="w-4 h-4" />, onClick: () => handleCopyLink(po.id, po.status) },
    ];
    if (po.status === 'draft' || po.status === 'sent') {
      items.push({ key: 'cancel', label: 'ยกเลิก', icon: <Ban className="w-4 h-4" />, danger: true, dividerBefore: true, onClick: () => handleCancel(po.id) });
    }
    if (po.status === 'partial_received' || po.status === 'received' || po.status === 'received_mismatch') {
      items.push({ key: 'close', label: 'ปิด PO', description: 'จบ PO นี้ ไม่รอรับของเพิ่ม', icon: <Lock className="w-4 h-4" />, onClick: () => handleClose(po.id), dividerBefore: true });
    }
    return items;
  };

  // Unique suppliers & warehouses for filter
  const suppliers = [...new Map(
    purchaseOrders.filter(po => po.supplier).map(po => [po.supplier!.id, po.supplier!])
  ).values()];
  const warehouses = [...new Map(
    purchaseOrders.filter(po => po.warehouse).map(po => [po.warehouse!.id, po.warehouse!])
  ).values()];

  // Filter
  const filtered = purchaseOrders.filter(po => {
    if (statusFilter !== '' && po.status !== statusFilter) return false;
    if (supplierFilter && po.supplier?.id !== supplierFilter) return false;
    if (warehouseFilter && po.warehouse?.id !== warehouseFilter) return false;
    if (search) {
      const term = search.toLowerCase();
      const matchPO = po.po_number.toLowerCase().includes(term);
      const matchSupplier = po.supplier?.name.toLowerCase().includes(term);
      const matchNotes = po.notes?.toLowerCase().includes(term);
      const matchCreatedBy = po.created_by_name?.toLowerCase().includes(term);
      if (!matchPO && !matchSupplier && !matchNotes && !matchCreatedBy) return false;
    }
    return true;
  });

  // Pagination
  const totalRecords = filtered.length;
  const totalPages = Math.ceil(totalRecords / recordsPerPage);
  const startIdx = (page - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + recordsPerPage, totalRecords);
  const paged = filtered.slice(startIdx, endIdx);

  const formatDate = (d: string) => {
    const isDateOnly = d.length <= 10;
    const date = new Date(isDateOnly ? d + 'T00:00:00' : d);
    if (isDateOnly) {
      return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
    }
    return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const visibleCount = COLUMN_CONFIGS.filter(c => visibleColumns.has(c.key)).length;

  if (authLoading || loading) {
    return (
      <Layout title="ใบสั่งซื้อ (PO)" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'ใบสั่งซื้อ (PO)' }]}>
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" /></div>
      </Layout>
    );
  }

  return (
    <Layout
      title="ใบสั่งซื้อ (PO)"
      breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'ใบสั่งซื้อ (PO)' }]}
    >
      <div className="space-y-4">
        {/* Action Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="ค้นหา..."
              className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            />
          </div>
          <div className="w-28 md:w-40 flex-shrink-0">
            <FormSelect
              value={statusFilter}
              onChange={v => { setStatusFilter(v); setPage(1); }}
              options={STATUS_OPTIONS}
              clearLabel="ทุกสถานะ"
              searchThreshold={99}
            />
          </div>
          {suppliers.length > 1 && (
            <div className="hidden md:block w-40 flex-shrink-0">
              <FormSelect
                value={supplierFilter}
                onChange={v => { setSupplierFilter(v); setPage(1); }}
                options={suppliers.map(s => ({ id: s.id, label: s.name }))}
                clearLabel="ทุก Supplier"
                icon={<Factory className="w-4 h-4" />}
              />
            </div>
          )}
          {warehouses.length > 1 && (
            <div className="hidden md:block w-40 flex-shrink-0">
              <FormSelect
                value={warehouseFilter}
                onChange={v => { setWarehouseFilter(v); setPage(1); }}
                options={warehouses.map(wh => ({ id: wh.id, label: wh.name }))}
                clearLabel="ทุกคลัง"
                icon={<Warehouse className="w-4 h-4" />}
              />
            </div>
          )}
          <button
            onClick={() => router.push('/inventory/purchase-order')}
            className="bg-[#F4511E] text-white p-2.5 md:px-4 md:py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap flex-shrink-0"
            title="สร้างใบสั่งซื้อ"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">สร้างใบสั่งซื้อ</span>
          </button>
        </div>

        {/* Desktop Table */}
        <div className="data-table-wrap hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  {isCol('poInfo') && <th className="data-th">เลขที่ PO</th>}
                  {isCol('supplier') && <th className="data-th">Supplier</th>}
                  {isCol('warehouse') && <th className="data-th">คลัง</th>}
                  {isCol('itemCount') && <th className="data-th text-center">รายการ</th>}
                  {isCol('amount') && <th className="data-th text-right">มูลค่า</th>}
                  {isCol('status') && <th className="data-th text-center">สถานะ</th>}
                  {isCol('createdBy') && <th className="data-th">ผู้สร้าง</th>}
                  {isCol('actions') && <th className="data-th text-center">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="data-tbody">
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCount} className="px-6 py-12 text-center">
                      <ClipboardList className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-gray-500 dark:text-slate-400 text-sm">
                        {purchaseOrders.length === 0 ? 'ยังไม่มีใบสั่งซื้อ' : 'ไม่พบรายการที่ค้นหา'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paged.map(po => {
                    const badge = statusBadge(po.status);
                    const totalQty = po.items.reduce((s, i) => s + i.quantity, 0);
                    const totalReceived = po.items.reduce((s, i) => s + i.received_quantity, 0);
                    return (
                      <tr key={po.id} className="data-tr cursor-pointer" onClick={() => router.push(`/inventory/purchase-orders/${po.id}`)}>
                        {isCol('poInfo') && (
                          <td className="data-td">
                            <p
                              className="id-text-clickable text-gray-900 dark:text-white"
                              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(po.po_number).then(() => showToast('คัดลอกเลข PO แล้ว')); }}
                              title="คัดลอกเลข PO"
                            >{po.po_number}</p>
                            <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(po.created_at)}</p>
                          </td>
                        )}
                        {isCol('supplier') && (
                          <td className="data-td">
                            <div className="flex items-center gap-1.5">
                              <Factory className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="data-primary text-gray-900 dark:text-slate-100">{po.supplier?.name || '-'}</span>
                            </div>
                          </td>
                        )}
                        {isCol('warehouse') && (
                          <td className="data-td">
                            <div className="flex items-center gap-1.5">
                              <Warehouse className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="data-text text-gray-700 dark:text-slate-300">{po.warehouse?.name || '-'}</span>
                            </div>
                          </td>
                        )}
                        {isCol('itemCount') && (
                          <td className="data-td text-center">
                            <span className="data-text text-gray-700 dark:text-slate-300">{po.items.length}</span>
                            {totalReceived > 0 && (
                              <span className="data-number-muted text-gray-500 dark:text-slate-400 ml-1">({totalReceived}/{totalQty})</span>
                            )}
                          </td>
                        )}
                        {isCol('amount') && (
                          <td className="data-td text-right">
                            <span className="data-number text-gray-900 dark:text-white">฿{formatCurrency(po.total_amount)}</span>
                          </td>
                        )}
                        {isCol('status') && (
                          <td className="data-td text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                              {statusIcon(po.status)}
                              {badge.label}
                            </span>
                          </td>
                        )}
                        {isCol('createdBy') && (
                          <td className="data-td data-text text-gray-700 dark:text-slate-300">{po.created_by_name || '-'}</td>
                        )}
                        {isCol('actions') && (
                          <td className="data-td" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center">
                              <ActionMenu items={getMenuItems(po)} />
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={page} totalPages={totalPages} totalRecords={totalRecords}
            startIdx={startIdx} endIdx={endIdx} recordsPerPage={recordsPerPage}
            setRecordsPerPage={setRecordsPerPage} setPage={setPage}
          >
            <ColumnSettingsDropdown
              configs={COLUMN_CONFIGS}
              visible={visibleColumns}
              toggle={toggleColumn}
              buttonClassName="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              dropUp
            />
          </Pagination>
        </div>

        {/* Mobile */}
        <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
          {paged.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-slate-400 text-sm">
                {purchaseOrders.length === 0 ? 'ยังไม่มีใบสั่งซื้อ' : 'ไม่พบรายการที่ค้นหา'}
              </p>
            </div>
          ) : paged.map(po => {
            const badge = statusBadge(po.status);
            return (
              <div key={po.id} className="p-4 border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer" onClick={() => router.push(`/inventory/purchase-orders/${po.id}`)}>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <span
                      className="id-text-clickable text-gray-900 dark:text-white"
                      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(po.po_number).then(() => showToast('คัดลอกเลข PO แล้ว')); }}
                      title="คัดลอกเลข PO"
                    >{po.po_number}</span>
                    <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(po.created_at)}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                    {statusIcon(po.status)}
                    {badge.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <Factory className="w-3.5 h-3.5 text-gray-400" />
                  <span className="data-text text-gray-700 dark:text-slate-300">{po.supplier?.name || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="data-muted text-gray-400 dark:text-slate-500">{po.items.length} รายการ | {po.created_by_name || '-'}</span>
                  <span className="data-number text-gray-900 dark:text-white">฿{formatCurrency(po.total_amount)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {confirmDialog}
    </Layout>
  );
}

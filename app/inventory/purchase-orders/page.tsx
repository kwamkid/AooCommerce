'use client';

import { useState } from 'react';
import { useCopy } from '@/lib/useCopy';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generatePOPdf } from '@/lib/supplier-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import DataTable from '@/components/ui/DataTable';
import FormSelect from '@/components/ui/FormSelect';
import ActionMenu, { ActionItem } from '@/components/ui/ActionMenu';
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
  const copy = useCopy();
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
          showToast('แจ้ง Sup สำเร็จ');
          await copy(`${window.location.origin}/po/${token}`, 'ลิงก์');
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
          await copy(`${window.location.origin}/po/${d.share_token}`, 'ลิงก์ PO ออนไลน์')
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

  if (authLoading || loading) {
    return (
      <Layout title="ใบสั่งซื้อ (PO)" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'ใบสั่งซื้อ (PO)' }]}>
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
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
              className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary"
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
          <Button
            variant="primary"
            onClick={() => router.push('/inventory/purchase-order')}
            title="สร้างใบสั่งซื้อ"
            icon={<Plus className="w-4 h-4" />}
            className="whitespace-nowrap flex-shrink-0"
          >
            <span className="hidden md:inline">สร้างใบสั่งซื้อ</span>
          </Button>
        </div>

        <DataTable<PurchaseOrder>
          storageKey="po-visible-columns"
          columns={[
            {
              key: 'poInfo', label: 'เลขที่ PO', alwaysVisible: true,
              render: (po) => (
                <>
                  <p
                    className="id-text-clickable text-gray-900 dark:text-white"
                    onClick={(e) => { e.stopPropagation(); copy(po.po_number, 'เลข PO'); }}
                    title="คัดลอกเลข PO"
                  >{po.po_number}</p>
                  <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(po.created_at)}</p>
                </>
              ),
            },
            {
              key: 'supplier', label: 'Supplier',
              render: (po) => (
                <div className="flex items-center gap-1.5">
                  <Factory className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="data-primary text-gray-900 dark:text-slate-100">{po.supplier?.name || '-'}</span>
                </div>
              ),
            },
            {
              key: 'warehouse', label: 'คลัง',
              render: (po) => (
                <div className="flex items-center gap-1.5">
                  <Warehouse className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="data-text text-gray-700 dark:text-slate-300">{po.warehouse?.name || '-'}</span>
                </div>
              ),
            },
            {
              key: 'itemCount', label: 'รายการ', headerClassName: 'text-center', cellClassName: 'text-center',
              render: (po) => {
                const totalQty = po.items.reduce((s, i) => s + i.quantity, 0);
                const totalReceived = po.items.reduce((s, i) => s + i.received_quantity, 0);
                return (
                  <>
                    <span className="data-text text-gray-700 dark:text-slate-300">{po.items.length}</span>
                    {totalReceived > 0 && (
                      <span className="data-number-muted text-gray-500 dark:text-slate-400 ml-1">({totalReceived}/{totalQty})</span>
                    )}
                  </>
                );
              },
            },
            {
              key: 'amount', label: 'มูลค่า', headerClassName: 'text-right', cellClassName: 'text-right',
              render: (po) => <span className="data-number text-gray-900 dark:text-white">฿{formatCurrency(po.total_amount)}</span>,
            },
            {
              key: 'status', label: 'สถานะ', headerClassName: 'text-center', cellClassName: 'text-center',
              render: (po) => {
                const badge = statusBadge(po.status);
                return (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge.color}`}>
                    {statusIcon(po.status)}
                    {badge.label}
                  </span>
                );
              },
            },
            {
              key: 'createdBy', label: 'ผู้สร้าง',
              render: (po) => <span className="data-text text-gray-700 dark:text-slate-300">{po.created_by_name || '-'}</span>,
            },
            {
              key: 'actions', label: 'จัดการ', alwaysVisible: true, headerClassName: 'text-center', stopPropagation: true, hideMobile: true,
              render: (po) => (
                <div className="flex items-center justify-center">
                  <ActionMenu items={getMenuItems(po)} />
                </div>
              ),
            },
          ]}
          data={paged}
          loading={false}
          getRowId={(po) => po.id}
          onRowClick={(po) => router.push(`/inventory/purchase-orders/${po.id}`)}
          emptyMessage={purchaseOrders.length === 0 ? 'ยังไม่มีใบสั่งซื้อ' : 'ไม่พบรายการที่ค้นหา'}
          emptyIcon={<ClipboardList className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          currentPage={page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          recordsPerPage={recordsPerPage}
          onPageChange={setPage}
          onRecordsPerPageChange={setRecordsPerPage}
          mobileCardRender={(po) => {
            const badge = statusBadge(po.status);
            return (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <span
                      className="id-text-clickable text-gray-900 dark:text-white"
                      onClick={(e) => { e.stopPropagation(); copy(po.po_number, 'เลข PO'); }}
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
              </>
            );
          }}
        />
      </div>
      {confirmDialog}
    </Layout>
  );
}

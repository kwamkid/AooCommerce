'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import {
  ShoppingBag, Search, Plus, Package, Loader2, CreditCard,
  Banknote, XCircle, Trash2, Send, Printer, FileText, ClipboardList, X, UserPlus,
} from 'lucide-react';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import FormSelect from '@/components/ui/FormSelect';
import ActionMenu, { type ActionItem } from '@/app/orders/components/ActionMenu';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import { getTabColor, getBadgeColor } from '@/lib/status-tab-colors';
import PaymentModal from '@/app/orders/components/PaymentModal';
import ShipModal, { type ShipResult } from '@/components/ui/ShipModal';
import { printOrder, type PrintType } from '@/components/ui/OrderPrintButtons';
import { preOpenPrintWindow } from '@/lib/print-pdf';

interface WholesaleOrder {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  flow_type: string;
  total_amount: number;
  created_at: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
}

function formatDateTime(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}
function formatMoney(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_TABS = [
  { key: 'all', label: 'ทั้งหมด', ...getTabColor('all') },
  { key: 'new', label: 'ใหม่', ...getTabColor('new') },
  { key: 'ready_to_ship', label: 'รอคอนเฟิร์ม', ...getTabColor('ready_to_ship') },
  { key: 'processing', label: 'ที่ต้องจัดส่ง', ...getTabColor('processing') },
  { key: 'completed', label: 'สำเร็จ', ...getTabColor('completed') },
  { key: 'cancelled', label: 'ยกเลิก', ...getTabColor('cancelled') },
];

const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'ใหม่', ready_to_ship: 'รอคอนเฟิร์ม', processing: 'ที่ต้องจัดส่ง',
  shipping: 'กำลังส่ง', completed: 'สำเร็จ', cancelled: 'ยกเลิก',
};

const PAYMENT_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'รอชำระ', cls: 'text-orange-600 dark:text-orange-400' },
  paid: { label: 'ชำระแล้ว', cls: 'text-green-600 dark:text-green-400' },
};

const FLOW_TYPE_OPTIONS = [
  { id: '', label: 'ทั้งหมด' },
  { id: 'w_cash', label: 'เงินสด' },
  { id: 'w_credit', label: 'เครดิต' },
];

function getFocusAction(order: WholesaleOrder): { label: string; icon: React.ReactNode; action: string; color: string } | null {
  const { order_status, payment_status, flow_type } = order;
  // ใหม่ + รอชำระ (เงินสดเท่านั้น) → ยืนยันชำระ
  if (order_status === 'new' && payment_status === 'pending') {
    return { label: 'ยืนยันชำระ', icon: <Banknote className="w-3.5 h-3.5" />, action: 'confirm_payment', color: 'green' };
  }
  // รอคอนเฟิร์ม → คอนเฟิร์มออเดอร์
  if (order_status === 'ready_to_ship') {
    return { label: 'คอนเฟิร์มออเดอร์', icon: <Package className="w-3.5 h-3.5" />, action: 'accept', color: 'indigo' };
  }
  // ที่ต้องจัดส่ง → จัดส่งแล้ว (ไปสำเร็จเลย)
  if (order_status === 'processing') {
    return { label: 'จัดส่ง', icon: <Send className="w-3.5 h-3.5" />, action: 'ship_complete', color: 'amber' };
  }
  // สำเร็จ + เครดิต + ยังไม่ชำระ → บันทึกชำระ
  if (order_status === 'completed' && flow_type === 'w_credit' && payment_status === 'pending') {
    return { label: 'บันทึกชำระ', icon: <Banknote className="w-3.5 h-3.5" />, action: 'confirm_payment', color: 'green' };
  }
  return null;
}

export default function DealerOrdersPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  const [orders, setOrders] = useState<WholesaleOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [flowFilter, setFlowFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [loadTime, setLoadTime] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [paymentOrder, setPaymentOrder] = useState<WholesaleOrder | null>(null);
  const [shipOrder, setShipOrder] = useState<WholesaleOrder | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOverlay, setBulkOverlay] = useState<{ show: boolean; message: string; progress: number }>({ show: false, message: '', progress: 0 });

  const showStatusCol = statusFilter === 'all';
  const isProcessingTab = statusFilter === 'processing';

  const fetchData = useCallback(async () => {
    setLoading(true);
    const t0 = Date.now();
    try {
      const params = new URLSearchParams({
        page: String(page), limit: String(recordsPerPage),
        flow_type: flowFilter || 'w_cash,w_credit',
        customer_type: 'wholesale_dealer',
      });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await apiFetch(`/api/orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setTotal(data.pagination?.total || data.total || 0);
        if (data.statusCounts) setStatusCounts(data.statusCounts);
        setLoadTime((Date.now() - t0) / 1000);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, recordsPerPage, search, statusFilter, flowFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAction = async (order: WholesaleOrder, action: string) => {

    if (action === 'confirm_payment') {
      setPaymentOrder(order);
      return;
    } else if (action === 'accept') {
      const ok = await confirm({ title: `รับออเดอร์ ${order.order_number}?`, variant: 'primary' });
      if (!ok) return;
      setActionLoading(order.id);
      try {
        const res = await apiFetch(`/api/orders`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, order_status: 'processing' }) });
        if (!res.ok) throw new Error('Failed');
        showToast('รับออเดอร์สำเร็จ', 'success');
        fetchData();
      } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
      finally { setActionLoading(null); }
    } else if (action === 'ship_complete') {
      setShipOrder(order);
      return;
    } else if (action === 'cancel') {
      const ok = await confirm({ title: `ยกเลิกออเดอร์ ${order.order_number}?`, description: 'ยกเลิกแล้วไม่สามารถย้อนกลับได้', variant: 'danger' });
      if (!ok) return;
      setActionLoading(order.id);
      try {
        await apiFetch(`/api/orders`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, order_status: 'cancelled' }) });
        showToast('ยกเลิกออเดอร์แล้ว', 'success');
        fetchData();
      } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
      finally { setActionLoading(null); }
    }
  };

  const totalPages = Math.ceil(total / recordsPerPage);

  const handlePrint = (orderId: string, type: PrintType) => {
    // Open the print tab synchronously inside this click handler so mobile
    // browsers (iOS Safari) don't treat it as a blocked popup.
    const printWindow = preOpenPrintWindow();
    (async () => {
      try {
        await printOrder(orderId, type, { printWindow });
      } catch (err) {
        printWindow?.close();
        showToast('ไม่สามารถพิมพ์เอกสารได้', 'error');
        console.error('Print error:', err);
      }
    })();
  };

  // Clear selection when tab changes
  useEffect(() => { setSelectedIds(new Set()); }, [statusFilter]);

  const handleBulkPrint = async (ids: string[], type: 'packing' | 'label') => {
    if (!ids.length) return;
    const label = type === 'packing' ? 'ใบจัดของ' : 'ใบปะหน้า';
    setBulkOverlay({ show: true, message: `กำลังโหลดข้อมูล... (0/${ids.length})`, progress: 5 });
    try {
      const { showPdfPreview, mergePdfBlobs } = await import('@/lib/print-pdf');
      // Fetch all order data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allData: any[] = [];
      for (let i = 0; i < ids.length; i++) {
        setBulkOverlay({ show: true, message: `กำลังโหลดข้อมูล... (${i + 1}/${ids.length})`, progress: Math.round(((i + 1) / ids.length) * 60) });
        try {
          const res = await apiFetch(`/api/orders/${ids[i]}`);
          if (res.ok) { const d = await res.json(); allData.push(d.order || d); }
        } catch { /* skip */ }
      }
      if (!allData.length) { showToast('ไม่สามารถโหลดข้อมูลได้', 'error'); return; }

      setBulkOverlay({ show: true, message: `กำลังสร้าง${label}...`, progress: 75 });
      if (type === 'packing') {
        const { generatePackingPdf } = await import('@/lib/orders-packing-pdf');
        const blob = await generatePackingPdf(allData);
        showPdfPreview(blob, `${label} ${allData.length} รายการ`);
      } else {
        const { generateShippingLabelPdf } = await import('@/lib/order-shipping-label-pdf');
        const blobs: Blob[] = [];
        for (const od of allData) {
          try {
            blobs.push(await generateShippingLabelPdf({ data: {
              order_number: od.order_number,
              created_at: od.created_at,
              shipping_carrier: od.shipping_carrier || '',
              tracking_number: od.tracking_number || '',
              delivery_name: od.delivery_name || od.customer?.name || '',
              delivery_phone: od.delivery_phone || od.customer?.phone || '',
              delivery_address: od.delivery_address || '',
              delivery_district: od.delivery_district || '',
              delivery_amphoe: od.delivery_amphoe || '',
              delivery_province: od.delivery_province || '',
              delivery_postal_code: od.delivery_postal_code || '',
              items: (od.items || []).map((i: any) => ({ product_name: i.product_name, variation_label: i.variation_label, quantity: i.quantity, sku: i.sku })),
            } }));
          } catch { /* skip */ }
        }
        if (!blobs.length) { showToast('ไม่สามารถสร้างเอกสารได้', 'error'); return; }
        setBulkOverlay({ show: true, message: 'กำลังรวมเอกสาร...', progress: 90 });
        const merged = blobs.length === 1 ? blobs[0] : await mergePdfBlobs(blobs);
        showPdfPreview(merged, `${label} ${allData.length} รายการ`);
      }
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
    finally { setBulkOverlay({ show: false, message: '', progress: 0 }); }
  };

  const getMenuItems = (order: WholesaleOrder): ActionItem[] => {
    const items: ActionItem[] = [];
    const canCancel = ['new', 'ready_to_ship', 'processing'].includes(order.order_status);
    const hasProcessed = ['processing', 'shipping', 'completed'].includes(order.order_status);

    // === Financial documents ===
    if (hasProcessed) {
      items.push({ key: 'print_tax', label: 'ใบกำกับภาษี/ใบแจ้งหนี้', icon: <FileText className="w-4 h-4" />, onClick: () => handlePrint(order.id, 'tax') });
      items.push({ key: 'print_dn', label: 'ใบส่งสินค้า', icon: <FileText className="w-4 h-4" />, onClick: () => handlePrint(order.id, 'dn') });
      items.push({
        key: 'print_all', label: 'พิมพ์ทั้งหมด', icon: <Printer className="w-4 h-4" />,
        className: 'text-primary font-medium',
        onClick: () => handlePrint(order.id, 'all'),
      });
    }

    // === Shipping documents ===
    if (hasProcessed) {
      items.push({ key: 'print_packing', label: 'ใบจัดของ', icon: <ClipboardList className="w-4 h-4" />, dividerBefore: true, onClick: () => handlePrint(order.id, 'packing') });
      items.push({ key: 'print_label', label: 'ใบปะหน้า', icon: <Printer className="w-4 h-4" />, onClick: () => handlePrint(order.id, 'label') });
    }

    // === Cancel ===
    if (canCancel) {
      items.push({ key: 'cancel', label: 'ยกเลิกออเดอร์', icon: <Trash2 className="w-4 h-4" />, danger: true, dividerBefore: true, onClick: (e) => { e?.stopPropagation(); handleAction(order, 'cancel'); } });
    }

    return items;
  };

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <ShoppingBag className="w-8 h-8 text-primary" />
              คำสั่งซื้อตัวแทนขายขาด
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">ตัวแทนขายขาด (เงินสด / เครดิต)</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/customers/new?type=wholesale_dealer')}
              className="px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2 text-sm font-medium">
              <UserPlus className="w-4 h-4" /> เพิ่มตัวแทน
            </button>
            <Link href="/dealer-orders/new"
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors text-sm font-medium">
              <Plus className="w-4 h-4" /> สร้างคำสั่งซื้อ
            </Link>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_TABS.map(s => {
            const isActive = statusFilter === s.key;
            const count = statusCounts[s.key] || 0;
            return (
              <button key={s.key} onClick={() => { setStatusFilter(s.key); setPage(1); }}
                className={`flex-shrink-0 rounded-xl px-4 py-2 min-w-[80px] text-center transition-all ${isActive ? `${s.active} text-white shadow-md` : `${s.inactive} hover:opacity-80`}`}>
                <div className={`text-xs font-medium ${isActive ? 'text-white/80' : s.labelColor}`}>{s.label}</div>
                <div className={`text-xl font-bold ${isActive ? 'text-white' : s.countColor}`}>{count}</div>
              </button>
            );
          })}
        </div>

        {/* Search + Flow filter */}
        <div className="data-filter-card">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="ค้นหาเลขที่, ชื่อลูกค้า..."
                className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>
            <div className="w-[140px] flex-shrink-0">
              <FormSelect value={flowFilter} onChange={(v) => { setFlowFilter(v); setPage(1); }}
                options={FLOW_TYPE_OPTIONS} placeholder="ทั้งหมด" icon={<CreditCard className="w-4 h-4" />} />
            </div>
          </div>
        </div>

        {/* Table + Mobile Cards via DataTable */}
        <DataTable<WholesaleOrder>
          storageKey="dealer-orders-columns"
          columns={[
            {
              key: 'order_number', label: 'เลขที่', alwaysVisible: true,
              render: (order) => (
                <>
                  <span className="font-mono text-sm font-bold text-primary">{order.order_number}</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDateTime(order.created_at)}</p>
                </>
              ),
            },
            {
              key: 'customer', label: 'ลูกค้า', alwaysVisible: true,
              render: (order) => (
                <>
                  <p className="text-sm text-gray-900 dark:text-white font-medium">{order.customer_name || '-'}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                    {order.flow_type === 'w_credit' ? 'เครดิต' : 'เงินสด'}
                    {order.customer_phone && ` · ${order.customer_phone}`}
                  </p>
                </>
              ),
            },
            {
              key: 'total', label: 'ยอด', headerClassName: 'text-right', cellClassName: 'text-right',
              render: (order) => (
                <span className="text-sm font-medium text-gray-900 dark:text-white">฿{formatMoney(order.total_amount)}</span>
              ),
            },
            ...(showStatusCol ? [{
              key: 'status', label: 'สถานะ',
              render: (order: WholesaleOrder) => {
                const bc = getBadgeColor(order.order_status);
                const statusLabel = ORDER_STATUS_LABELS[order.order_status] || order.order_status;
                return (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bc.bg} ${bc.color}`}>
                    {statusLabel}
                  </span>
                );
              },
            }] as DataTableColumn<WholesaleOrder>[] : []),
            {
              key: 'payment', label: 'ชำระ',
              render: (order) => {
                const pBadge = PAYMENT_BADGE[order.payment_status] || PAYMENT_BADGE.pending;
                return (
                  <span className={`text-xs font-medium ${pBadge.cls}`}>
                    {order.payment_status === 'paid' && <CreditCard className="w-3 h-3 inline mr-1" />}
                    {pBadge.label}
                  </span>
                );
              },
            },
            {
              key: 'actions', label: 'จัดการ', alwaysVisible: true, headerClassName: 'text-right', cellClassName: 'text-right', stopPropagation: true,
              render: (order) => {
                const focus = getFocusAction(order);
                const isActioning = actionLoading === order.id;
                return (
                  <div className="flex items-center justify-end gap-1.5">
                    {focus && (
                      <button onClick={(e) => { e.stopPropagation(); handleAction(order, focus.action); }}
                        disabled={isActioning} className={`btn-focus-action ${focus.color}`}>
                        {isActioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : focus.icon}
                        {focus.label}
                      </button>
                    )}
                    <ActionMenu items={getMenuItems(order)} />
                  </div>
                );
              },
            },
          ]}
          data={orders}
          loading={loading}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/dealer-orders/${r.id}`)}
          {...(isProcessingTab ? { selectedIds, onSelectionChange: setSelectedIds } : {})}
          rowClassName={(r) => r.order_status === 'cancelled' ? 'opacity-50' : ''}
          emptyMessage="ไม่มีคำสั่งซื้อ"
          emptyIcon={<Package className="w-12 h-12 text-gray-300" />}
          currentPage={page}
          totalPages={totalPages}
          totalRecords={total}
          recordsPerPage={recordsPerPage}
          onPageChange={setPage}
          onRecordsPerPageChange={(v) => { setRecordsPerPage(v); setPage(1); }}
          loadTime={loadTime}
          mobileCardRender={(order) => {
            const bc = getBadgeColor(order.order_status);
            const statusLabel = ORDER_STATUS_LABELS[order.order_status] || order.order_status;
            const pBadge = PAYMENT_BADGE[order.payment_status] || PAYMENT_BADGE.pending;
            const focus = getFocusAction(order);
            const isActioning = actionLoading === order.id;
            const canCancel = ['new', 'ready_to_ship', 'processing'].includes(order.order_status);
            return (
              <>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm font-bold text-primary">{order.order_number}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDateTime(order.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bc.bg} ${bc.color}`}>
                      {statusLabel}
                    </span>
                    {canCancel && (
                      <ActionMenu items={[
                        { key: 'cancel', label: 'ยกเลิกออเดอร์', icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: (e) => { e.stopPropagation(); handleAction(order, 'cancel'); } },
                      ]} />
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700 dark:text-slate-300 font-medium">{order.customer_name || '-'}</span>
                    <span className="text-sm text-gray-900 dark:text-white font-semibold">฿{formatMoney(order.total_amount)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
                    <span className={`font-medium ${pBadge.cls}`}>
                      {order.payment_status === 'paid' && <CreditCard className="w-3 h-3 inline mr-1" />}
                      {pBadge.label}
                    </span>
                    <span>{order.flow_type === 'w_credit' ? 'เครดิต' : 'เงินสด'}</span>
                  </div>
                </div>
                {focus && (
                  <div className="mt-3 flex gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => handleAction(order, focus.action)}
                      disabled={isActioning} className={`btn-focus-action ${focus.color} flex-1 justify-center`}>
                      {isActioning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : focus.icon}
                      {focus.label}
                    </button>
                  </div>
                )}
              </>
            );
          }}
        />
      </div>
      {shipOrder && (
        <ShipModal
          orderNumber={shipOrder.order_number}
          customerName={shipOrder.customer_name || '-'}
          onSubmit={async (result: ShipResult) => {
            await apiFetch(`/api/orders`, {
              method: 'PUT', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: shipOrder.id, order_status: 'completed', payment_status: 'paid', shipping_carrier: result.carrier || result.method || undefined, tracking_number: result.tracking || undefined }),
            });
            showToast('จัดส่งสำเร็จ', 'success');
            setShipOrder(null);
            fetchData();
          }}
          onClose={() => setShipOrder(null)}
        />
      )}
      {paymentOrder && (
        <PaymentModal
          show={!!paymentOrder}
          orderId={paymentOrder.id}
          orderNumber={paymentOrder.order_number}
          totalAmount={paymentOrder.total_amount}
          defaultPaymentMethod="transfer"
          onClose={() => setPaymentOrder(null)}
          onSuccess={() => { setPaymentOrder(null); fetchData(); }}
        />
      )}
      {confirmDialog}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 shadow-lg px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
            <button onClick={() => setSelectedIds(new Set())} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500">
              <X className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">เลือก {selectedIds.size} รายการ</span>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => handleBulkPrint([...selectedIds], 'packing')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                <ClipboardList className="w-4 h-4" />
                ใบจัดของ ({selectedIds.size})
              </button>
              <button onClick={() => handleBulkPrint([...selectedIds], 'label')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                <Printer className="w-4 h-4" />
                ใบปะหน้า ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      )}

      <LoadingOverlay isOpen={bulkOverlay.show} title={bulkOverlay.message} progress={bulkOverlay.progress} />
    </Layout>
  );
}

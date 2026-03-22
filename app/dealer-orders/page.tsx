'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import {
  ShoppingBag, Search, Plus, Package, Loader2, CheckCircle2, Clock, Truck, CreditCard,
  Banknote, XCircle, Send, Printer, FileText, ClipboardList,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import FormSelect from '@/components/ui/FormSelect';
import ActionMenu, { type ActionItem } from '@/app/orders/components/ActionMenu';
import { getTabColor, getBadgeColor } from '@/lib/status-tab-colors';
import PaymentModal from '@/app/orders/components/PaymentModal';
import ShipModal, { type ShipResult } from '@/components/ui/ShipModal';
import { showPdfPreview } from '@/lib/print-pdf';
import { generatePackingPdf } from '@/lib/orders-packing-pdf';
import { generateShippingLabelPdf } from '@/lib/order-shipping-label-pdf';

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

  const showStatusCol = statusFilter === 'all';

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
      const ok = await confirm({ title: `รับออเดอร์ ${order.order_number}?`, variant: 'default' });
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
      const ok = await confirm({ title: `ยกเลิกออเดอร์ ${order.order_number}?`, message: 'ยกเลิกแล้วไม่สามารถย้อนกลับได้', variant: 'danger' });
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

  const handlePrint = async (orderId: string, type: 'tax' | 'dn' | 'packing' | 'label' | 'all') => {
    try {
      const res = await apiFetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error('Failed to fetch order');
      const data = await res.json();
      const orderData = data.order || data;
      const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');

      if (type === 'tax') {
        const blob = await generateFullInvoicePdf(orderData);
        showPdfPreview(blob, `ใบกำกับภาษี ${orderData.order_number}`);
      } else if (type === 'dn') {
        const blob = await generateFullInvoicePdf({ ...orderData, tax_invoice_doc_type: 'dn' });
        showPdfPreview(blob, `ใบส่งสินค้า ${orderData.order_number}`);
      } else if (type === 'packing') {
        const blob = await generatePackingPdf([orderData]);
        showPdfPreview(blob, `ใบจัดของ ${orderData.order_number}`);
      } else if (type === 'label') {
        const blob = await generateShippingLabelPdf([orderData]);
        showPdfPreview(blob, `ใบปะหน้า ${orderData.order_number}`);
      } else if (type === 'all') {
        const { mergePdfBlobs } = await import('@/lib/print-pdf');
        const blobs = await Promise.all([
          generateFullInvoicePdf(orderData),
          generateFullInvoicePdf({ ...orderData, tax_invoice_doc_type: 'dn' }),
          generatePackingPdf([orderData]),
          generateShippingLabelPdf([orderData]),
        ]);
        const merged = await mergePdfBlobs(blobs);
        showPdfPreview(merged, `เอกสารทั้งหมด ${orderData.order_number}`);
      }
    } catch (err) {
      showToast('ไม่สามารถพิมพ์เอกสารได้', 'error');
      console.error('Print error:', err);
    }
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
        className: 'text-[#F4511E] font-medium',
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
      items.push({ key: 'cancel', label: 'ยกเลิกออเดอร์', icon: <XCircle className="w-4 h-4" />, danger: true, dividerBefore: true, onClick: (e) => { e?.stopPropagation(); handleAction(order, 'cancel'); } });
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
              <ShoppingBag className="w-8 h-8 text-[#F4511E]" />
              คำสั่งซื้อตัวแทนขายขาด
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">ตัวแทนขายขาด (เงินสด / เครดิต)</p>
          </div>
          <Link href="/dealer-orders/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#E64A19] transition-colors text-sm font-medium">
            <Plus className="w-4 h-4" /> สร้างคำสั่งซื้อ
          </Link>
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
                className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50" />
            </div>
            <div className="w-[140px] flex-shrink-0">
              <FormSelect value={flowFilter} onChange={(v) => { setFlowFilter(v); setPage(1); }}
                options={FLOW_TYPE_OPTIONS} placeholder="ทั้งหมด" icon={<CreditCard className="w-4 h-4" />} />
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" /></div>
        ) : orders.length === 0 ? (
          <>
          <div className="text-center py-16 hidden md:block">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400">ไม่มีคำสั่งซื้อ</p>
          </div>
          <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-center py-16">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400">ไม่มีคำสั่งซื้อ</p>
          </div>
          </>
        ) : (
          <>
          <div className="data-table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th">เลขที่</th>
                    <th className="data-th">ลูกค้า</th>
                    <th className="data-th text-right">ยอด</th>
                    {showStatusCol && <th className="data-th">สถานะ</th>}
                    <th className="data-th">ชำระ</th>
                    <th className="data-th text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {orders.map(order => {
                    const bc = getBadgeColor(order.order_status);
                    const statusLabel = ORDER_STATUS_LABELS[order.order_status] || order.order_status;
                    const pBadge = PAYMENT_BADGE[order.payment_status] || PAYMENT_BADGE.pending;
                    const focus = getFocusAction(order);
                    const isActioning = actionLoading === order.id;
                    const canCancel = ['new', 'ready_to_ship', 'processing'].includes(order.order_status);

                    return (
                      <tr key={order.id} className="data-tr cursor-pointer" onClick={() => router.push(`/dealer-orders/${order.id}`)}>
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm font-bold text-[#F4511E]">{order.order_number}</span>
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDateTime(order.created_at)}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white font-medium">{order.customer_name || '-'}</p>
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                            {order.flow_type === 'w_credit' ? 'เครดิต' : 'เงินสด'}
                            {order.customer_phone && ` · ${order.customer_phone}`}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900 dark:text-white">฿{formatMoney(order.total_amount)}</td>
                        {showStatusCol && (
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bc.bg} ${bc.color}`}>
                              {statusLabel}
                            </span>
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <span className={`text-xs font-medium ${pBadge.cls}`}>
                            {order.payment_status === 'paid' && <CreditCard className="w-3 h-3 inline mr-1" />}
                            {pBadge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page} totalPages={totalPages} setPage={setPage}
              startIdx={total > 0 ? (page - 1) * recordsPerPage + 1 : 0}
              endIdx={Math.min(page * recordsPerPage, total)}
              totalRecords={total}
              recordsPerPage={recordsPerPage} setRecordsPerPage={(v: number) => { setRecordsPerPage(v); setPage(1); }}
              loadTime={loadTime}
            />
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {orders.map(order => {
                const bc = getBadgeColor(order.order_status);
                const statusLabel = ORDER_STATUS_LABELS[order.order_status] || order.order_status;
                const pBadge = PAYMENT_BADGE[order.payment_status] || PAYMENT_BADGE.pending;
                const focus = getFocusAction(order);
                const isActioning = actionLoading === order.id;
                const canCancel = ['new', 'ready_to_ship', 'processing'].includes(order.order_status);

                return (
                  <div key={order.id} className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div
                        className="cursor-pointer flex-1 min-w-0"
                        onClick={() => router.push(`/dealer-orders/${order.id}`)}
                      >
                        <p className="font-mono text-sm font-bold text-[#F4511E]">{order.order_number}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDateTime(order.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bc.bg} ${bc.color}`}>
                          {statusLabel}
                        </span>
                        {canCancel && (
                          <ActionMenu items={[
                            { key: 'cancel', label: 'ยกเลิกออเดอร์', icon: <XCircle className="w-4 h-4" />, danger: true, onClick: (e) => { e.stopPropagation(); handleAction(order, 'cancel'); } },
                          ]} />
                        )}
                      </div>
                    </div>
                    <div
                      className="cursor-pointer"
                      onClick={() => router.push(`/dealer-orders/${order.id}`)}
                    >
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
                  </div>
                );
              })}
            </div>
            <Pagination
              currentPage={page} totalPages={totalPages} setPage={setPage}
              startIdx={total > 0 ? (page - 1) * recordsPerPage + 1 : 0}
              endIdx={Math.min(page * recordsPerPage, total)}
              totalRecords={total}
              recordsPerPage={recordsPerPage} setRecordsPerPage={(v: number) => { setRecordsPerPage(v); setPage(1); }}
              loadTime={loadTime}
            />
          </div>
          </>
        )}
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
    </Layout>
  );
}

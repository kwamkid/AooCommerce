'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  Package,
  Loader2,
  Link2,
  Edit2,
  Trash2,
  CreditCard,
  CheckCircle,
  Banknote,
  Pause,
  Play,
  Clock,
  Scissors,
  XCircle,
  ImageIcon,
  X,
} from 'lucide-react';
import { generateOrderInvoicePdf } from '@/lib/order-invoice-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import { markOrdersPrinted, updateLocalPrintStatus } from '@/lib/print-tracking';
import { useCompany } from '@/lib/company-context';
import { getInvoiceMenuLabel } from '@/lib/invoice-utils';
import OrderCard from './OrderCard';
import ActionMenu, { ActionItem } from './ActionMenu';
import TaxInvoiceModal from './TaxInvoiceModal';
import SplitParcelModal from './SplitParcelModal';
import Pagination from '@/app/components/Pagination';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import { Order } from './types';
import { isMarketplaceSource } from '@/lib/marketplace/types';

const ON_HOLD_KEY = '__on_hold__';
const ACTIVE_KEY = '__active__';
const VERIFYING_KEY = '__verifying__';

interface TimeSlot {
  pickup_time_id: string;
  date: number;
  display: string;
  recommended: boolean;
}

interface TimeSlotModal {
  orderId: string;
  orderSn: string;
  orderNumber: string;
  timeSlots: TimeSlot[];
}

interface ReadyToShipTabProps {
  /** Normal (non-hold) order count from parent status counts */
  normalCount: number;
  /** On hold count from parent */
  onHoldCount: number;
  /** Search term from parent */
  search?: string;
  /** Channel filter from parent */
  channel?: string;
  /** Created by filter from parent */
  createdBy?: string;
  userProfile: any;
  onRefresh: () => void;
  onImageClick: (url: string) => void;
  onPaymentClick: (order: Order) => void;
  onStatusClick: (order: Order) => void;
  onDeleteOrder: (e: React.MouseEvent, order: Order) => void;
}

export default function ReadyToShipTab({
  normalCount,
  onHoldCount,
  search,
  channel,
  createdBy,
  userProfile,
  onRefresh,
  onImageClick,
  onPaymentClick,
  onStatusClick,
  onDeleteOrder,
}: ReadyToShipTabProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const { currentCompany } = useCompany();
  const vatRegistered = currentCompany?.vat_registered || false;

  // Sub-tab state — default to verifying tab first (like processing tab)
  const [activeGroup, setActiveGroup] = useState<string>(VERIFYING_KEY);
  const isOnHoldTab = activeGroup === ON_HOLD_KEY;
  const isVerifyingTab = activeGroup === VERIFYING_KEY;
  const [verifyingCount, setVerifyingCount] = useState(0);
  const [verifyingCountLoaded, setVerifyingCountLoaded] = useState(false);

  // Self-fetched orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [overlayTitle, setOverlayTitle] = useState('กำลังรับออเดอร์...');
  const [overlayMessage, setOverlayMessage] = useState<string | undefined>();
  const [overlayProgress, setOverlayProgress] = useState<number | undefined>();
  const [confirmModal, setConfirmModal] = useState<{ type: 'accept' | 'cancel'; ids: string[] } | null>(null);
  const [holdModal, setHoldModal] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [toast, setToast] = useState('');
  const [timeSlotModal, setTimeSlotModal] = useState<TimeSlotModal | null>(null);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | null>(null);
  const [pendingTimeSlotOrders, setPendingTimeSlotOrders] = useState<TimeSlotModal[]>([]);
  const [splitModal, setSplitModal] = useState<{
    orderId: string;
    orderNumber: string;
    orderItems: { id: string; product_name: string; variation_label?: string | null; quantity: number; image?: string | null }[];
    isShopee: boolean;
  } | null>(null);
  const [slipModal, setSlipModal] = useState<{ orderId: string; orderNumber: string; imageUrl: string } | null>(null);
  const [slipLoading, setSlipLoading] = useState(false);

  // Fetch verifying count (for sub-tab badge)
  const fetchVerifyingCount = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set('status', 'ready_to_ship');
      params.set('source', 'exclude_pos');
      params.set('payment_status', 'verifying');
      params.set('page', '1');
      params.set('limit', '1');
      if (search) params.set('search', search);
      if (channel && channel !== 'all') params.set('channel', channel);
      if (createdBy && createdBy !== 'all') params.set('created_by', createdBy);
      const res = await apiFetch(`/api/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setVerifyingCount(data.pagination?.total || 0);
        setVerifyingCountLoaded(true);
      }
    } catch { /* silent */ }
  }, [search, channel, createdBy]);

  // Self-fetch orders
  const fetchOrders = useCallback(async () => {
    if (!activeGroup) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', 'ready_to_ship');
      params.set('source', 'exclude_pos');
      params.set('page', currentPage.toString());
      params.set('limit', recordsPerPage.toString());
      params.set('sort_by', 'created_at');
      params.set('sort_dir', 'desc');

      if (activeGroup === VERIFYING_KEY) {
        // Show only verifying payment orders
        params.set('payment_status', 'verifying');
      } else if (activeGroup === ON_HOLD_KEY) {
        params.set('shipping_carrier', ON_HOLD_KEY);
      } else {
        // Normal tab: exclude verifying + on_hold
        params.set('shipping_carrier', ACTIVE_KEY);
        params.set('exclude_payment_status', 'verifying');
      }

      if (search) params.set('search', search);
      if (channel && channel !== 'all') params.set('channel', channel);
      if (createdBy && createdBy !== 'all') params.set('created_by', createdBy);

      const response = await apiFetch(`/api/orders?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch orders');

      const result = await response.json();
      setOrders(result.orders || []);
      setTotalOrders(result.pagination?.total || 0);
      setTotalPages(result.pagination?.totalPages || 0);
    } catch (err) {
      console.error('ReadyToShipTab fetch error:', err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [activeGroup, currentPage, recordsPerPage, search, channel, createdBy]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    fetchVerifyingCount();
  }, [fetchVerifyingCount]);

  // Auto-switch to active tab when no more verifying orders (only after count is loaded)
  useEffect(() => {
    if (isVerifyingTab && verifyingCountLoaded && verifyingCount === 0) {
      setActiveGroup(ACTIVE_KEY);
    }
  }, [isVerifyingTab, verifyingCountLoaded, verifyingCount]);

  // Reset page when switching tab or search changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [activeGroup, search, channel, createdBy]);

  // Refresh handler — refresh parent + re-fetch our tab
  const handleRefresh = useCallback(() => {
    onRefresh();
    fetchOrders();
    fetchVerifyingCount();
    window.dispatchEvent(new Event('orders-count-changed'));
  }, [onRefresh, fetchOrders, fetchVerifyingCount]);

  // View slip for verifying orders
  const handleViewSlip = async (orderId: string, orderNumber: string) => {
    setSlipLoading(true);
    try {
      const res = await apiFetch(`/api/payment-records?order_id=${orderId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      const record = data.payment_records?.[0];
      if (record?.slip_image_url) {
        setSlipModal({ orderId, orderNumber, imageUrl: record.slip_image_url });
      } else {
        showToast('ไม่พบรูปสลิป', 'error');
      }
    } catch {
      showToast('โหลดสลิปไม่สำเร็จ', 'error');
    } finally {
      setSlipLoading(false);
    }
  };

  // Reject slip → payment_status: pending → auto-reverse to order_status: new
  const handleRejectSlip = async (orderId: string) => {
    if (!confirm('ต้องการปฏิเสธสลิปนี้หรือไม่?\n\nออเดอร์จะกลับไปสถานะ "ใหม่" ให้ลูกค้าแจ้งชำระใหม่')) return;
    setActionLoading(true);
    try {
      // Reject payment record
      const prRes = await apiFetch(`/api/payment-records?order_id=${orderId}`);
      if (prRes.ok) {
        const prData = await prRes.json();
        const record = prData.payment_records?.[0];
        if (record) {
          await apiFetch('/api/payment-records/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_record_id: record.id, action: 'reject' }),
          });
        }
      }
      // Update payment_status → pending (auto-reverse will set order_status → new)
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, payment_status: 'pending' }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast('ปฏิเสธสลิปแล้ว — ออเดอร์กลับไปสถานะ "ใหม่"', 'success');
      setSlipModal(null);
      handleRefresh();
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Approve slip → payment_status: paid (order moves to "รอกดรับออเดอร์" sub-tab)
  const handleApproveSlip = async (orderId: string) => {
    setActionLoading(true);
    try {
      // Verify payment record
      const prRes = await apiFetch(`/api/payment-records?order_id=${orderId}`);
      if (prRes.ok) {
        const prData = await prRes.json();
        const record = prData.payment_records?.[0];
        if (record) {
          await apiFetch('/api/payment-records/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ payment_record_id: record.id, action: 'verify' }),
          });
        }
      }
      // Update payment_status → paid
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, payment_status: 'paid' }),
      });
      if (!res.ok) throw new Error('Failed');
      showToast('ยืนยันสลิปแล้ว', 'success');
      handleRefresh();
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Selection — only selectable in normal (non-verifying, non-hold) tab
  const selectableOrders = (isOnHoldTab || isVerifyingTab) ? [] : orders;
  const allSelected = selectableOrders.length > 0 && (
    selectedIds.size >= totalOrders || selectableOrders.every(o => selectedIds.has(o.id))
  );

  // Auto-select recommended timeslot when modal opens
  useEffect(() => {
    if (timeSlotModal) {
      const recommended = timeSlotModal.timeSlots.find(s => s.recommended);
      setSelectedTimeSlotId(recommended?.pickup_time_id || null);
    }
  }, [timeSlotModal]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = async () => {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }

    // If all orders fit in one page, just select locally
    if (totalOrders <= orders.length) {
      setSelectedIds(new Set(selectableOrders.map(o => o.id)));
      return;
    }

    // Fetch ALL order IDs for ready_to_ship (active only, exclude verifying) from server
    try {
      const params = new URLSearchParams();
      params.set('status', 'ready_to_ship');
      params.set('source', 'exclude_pos');
      params.set('shipping_carrier', ACTIVE_KEY);
      params.set('exclude_payment_status', 'verifying');
      params.set('ids_only', 'true');

      const res = await apiFetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const result = await res.json();
      setSelectedIds(new Set(result.ids || []));
    } catch {
      // Fallback: select only current page
      setSelectedIds(new Set(selectableOrders.map(o => o.id)));
    }
  };

  const handleBulkAccept = async (ids: string[]) => {
    setBulkLoading(true);
    setOverlayOpen(true);
    setOverlayTitle('กำลังรับออเดอร์...');
    setOverlayMessage(`0 / ${ids.length}`);
    setOverlayProgress(0);
    try {
      // Split Shopee vs manual orders
      const shopeeIds = ids.filter(id => orders.find(o => o.id === id)?.source === 'shopee');
      const manualIds = ids.filter(id => !shopeeIds.includes(id));

      let successCount = 0;
      let processedCount = 0;
      const total = ids.length;
      const timeSlotQueue: TimeSlotModal[] = [];
      const errors: string[] = [];

      // Process manual orders
      if (manualIds.length > 0) {
        setOverlayMessage(`Manual orders: ${manualIds.length} รายการ`);
        const res = await apiFetch('/api/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bulk_accept', ids: manualIds }),
        });
        if (res.ok) {
          const result = await res.json();
          const count = result.updated || manualIds.length;
          successCount += count;
          processedCount += manualIds.length;
        } else {
          const d = await res.json();
          errors.push(d.error || 'Manual accept failed');
          processedCount += manualIds.length;
        }
        setOverlayProgress(Math.round((processedCount / total) * 100));
        setOverlayMessage(`${processedCount} / ${total}`);
      }

      // Process Shopee orders
      if (shopeeIds.length > 0) {
        setOverlayMessage(`${processedCount} / ${total} — กำลังส่งไป Shopee...`);
        const res = await apiFetch('/api/shopee/orders/bulk-ship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_ids: shopeeIds }),
        });
        if (res.ok) {
          const data = await res.json();
          for (const r of data.results || []) {
            processedCount++;
            setOverlayProgress(Math.round((processedCount / total) * 100));
            setOverlayMessage(`${processedCount} / ${total}`);
            if (r.success) {
              successCount++;
            } else if (r.needs_time_slot && r.time_slots?.length > 0) {
              const order = orders.find(o => o.id === r.order_id);
              timeSlotQueue.push({
                orderId: r.order_id,
                orderSn: r.order_sn,
                orderNumber: order?.order_number || r.order_sn,
                timeSlots: r.time_slots,
              });
            } else if (r.error) {
              errors.push(`${r.order_sn}: ${r.error}`);
            }
          }
        } else {
          errors.push('Shopee accept failed');
        }
      }

      setOverlayProgress(100);
      setOverlayMessage('เสร็จสิ้น');

      // Show results
      if (successCount > 0) {
        showToast(`กดรับสำเร็จ ${successCount} รายการ`, 'success');
      }
      if (errors.length > 0) {
        showToast(errors.join('\n'), 'error');
      }

      setSelectedIds(new Set());
      setConfirmModal(null);

      // If any orders need timeslot selection, show modal for first one and queue the rest
      if (timeSlotQueue.length > 0) {
        setTimeSlotModal(timeSlotQueue[0]);
        setPendingTimeSlotOrders(timeSlotQueue.slice(1));
      } else {
        handleRefresh();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setBulkLoading(false);
      setConfirmModal(null);
      setOverlayOpen(false);
      setOverlayProgress(undefined);
      setOverlayMessage(undefined);
    }
  };

  const handleBulkCancel = async (ids: string[]) => {
    setBulkLoading(true);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_cancel', ids }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      const result = await res.json();
      showToast(`ยกเลิกสำเร็จ ${result.updated || ids.length} รายการ`, 'success');
      setSelectedIds(new Set());
      handleRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setBulkLoading(false);
      setConfirmModal(null);
    }
  };

  const [actionLoading, setActionLoading] = useState(false);
  const [taxInvoiceModal, setTaxInvoiceModal] = useState<{ orderId: string; orderNumber: string; customerId?: string } | null>(null);

  const handlePrintInvoice = async (orderId: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error('Failed to fetch order');
      const result = await res.json();
      const blob = await generateOrderInvoicePdf({ data: result.order });
      showPdfPreview(blob, getInvoiceMenuLabel(result.order.payment_status, vatRegistered));
      markOrdersPrinted([orderId], 'invoice');
      updateLocalPrintStatus(setOrders, [orderId], 'invoice');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSingleAcceptShopee = async (orderId: string, pickupTimeId?: string) => {
    setActionLoading(true);
    setOverlayOpen(true);
    setOverlayTitle('กำลังรับออเดอร์...');
    setOverlayProgress(undefined);
    setOverlayMessage(undefined);
    try {
      const payload: Record<string, unknown> = { order_ids: [orderId] };
      if (pickupTimeId) payload.pickup_time_id = pickupTimeId;

      const res = await apiFetch('/api/shopee/orders/bulk-ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const r = data.results?.[0];

      if (r?.success) {
        showToast('รับออเดอร์ Shopee สำเร็จ');
        // Show next pending timeslot order, or refresh
        if (pendingTimeSlotOrders.length > 0) {
          setTimeSlotModal(pendingTimeSlotOrders[0]);
          setPendingTimeSlotOrders(prev => prev.slice(1));
        } else {
          setTimeSlotModal(null);
          handleRefresh();
        }
      } else if (r?.needs_time_slot && r.time_slots?.length > 0) {
        // Find matching order for display
        const order = orders.find(o => o.id === orderId);
        setTimeSlotModal({
          orderId,
          orderSn: r.order_sn || '',
          orderNumber: order?.order_number || r.order_sn || '',
          timeSlots: r.time_slots,
        });
      } else {
        showToast(r?.error || 'รับออเดอร์ไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading(false);
      setOverlayOpen(false);
      setOverlayProgress(undefined);
      setOverlayMessage(undefined);
    }
  };

  const handleHold = async () => {
    if (!holdModal) return;
    setActionLoading(true);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'hold', ids: [holdModal.orderId], hold_reason: holdReason || null }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      showToast('พักออเดอร์แล้ว', 'success');
      handleRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading(false);
      setHoldModal(null);
      setHoldReason('');
    }
  };

  const handleUnhold = async (orderId: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unhold', ids: [orderId] }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      showToast('ปลดการพักแล้ว', 'success');
      handleRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally { setActionLoading(false); }
  };

  const handleOpenSplit = async (order: Order) => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/orders/${order.id}`);
      if (!res.ok) throw new Error('Failed to fetch order');
      const result = await res.json();
      const items = (result.order?.items || []).map((i: any) => ({
        id: i.id,
        product_name: i.product_name,
        variation_label: i.variation_label,
        quantity: i.quantity,
        image: i.image,
      }));
      setSplitModal({
        orderId: order.id,
        orderNumber: order.order_number,
        orderItems: items,
        isShopee: order.source === 'shopee',
      });
    } catch {
      showToast('ไม่สามารถดึงข้อมูลสินค้าได้', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const renderCardActions = (order: Order) => {
    const isShopee = order.source === 'shopee';
    const isMarketplace = isMarketplaceSource(order.source);
    const isOnHold = order.fulfillment_status === 'on_hold';
    const primaryActions: React.ReactNode[] = [];
    const menuItems: ActionItem[] = [];

    // Primary: Unhold for on_hold orders
    if (isOnHold) {
      primaryActions.push(
        <button
          key="unhold"
          onClick={(e) => { e.stopPropagation(); handleUnhold(order.id); }}
          disabled={actionLoading}
          className="px-2.5 py-2 md:px-4 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          title="กลับมา"
        >
          <Play className="w-4 h-4" />
          <span className="hidden md:inline">กลับมา</span>
        </button>
      );
    } else if (isVerifyingTab && order.payment_status === 'verifying') {
      // Verifying tab: Approve + Reject slip
      primaryActions.push(
        <button
          key="view-slip"
          onClick={(e) => { e.stopPropagation(); handleViewSlip(order.id, order.order_number); }}
          disabled={actionLoading || slipLoading}
          className="px-2.5 py-2 md:px-3 text-sm font-medium rounded-lg border border-purple-300 dark:border-purple-600 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          title="ดูสลิป"
        >
          <ImageIcon className="w-4 h-4" />
          <span className="hidden md:inline">ดูสลิป</span>
        </button>
      );
      primaryActions.push(
        <button
          key="approve-slip"
          onClick={(e) => { e.stopPropagation(); handleApproveSlip(order.id); }}
          disabled={actionLoading}
          className="px-2.5 py-2 md:px-4 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
          title="ยืนยันสลิป"
        >
          <CheckCircle className="w-4 h-4" />
          <span className="hidden md:inline">ยืนยัน</span>
        </button>
      );
    } else {
      // Normal tab: Split + Accept
      // Primary: Split button (>1 piece, not already split)
      if (order.can_split_order && !order.is_split) {
        primaryActions.push(
          <button
            key="split"
            onClick={(e) => { e.stopPropagation(); handleOpenSplit(order); }}
            disabled={actionLoading}
            className="px-2.5 py-2 md:px-3 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            title="แบ่งกล่อง"
          >
            <Scissors className="w-4 h-4" />
            <span className="hidden md:inline">แบ่งกล่อง</span>
          </button>
        );
      }

      // Primary: Accept (same button for both Shopee and manual)
      primaryActions.push(
        <button
          key="accept"
          onClick={(e) => {
            e.stopPropagation();
            if (isShopee) handleSingleAcceptShopee(order.id);
            else onStatusClick(order);
          }}
          disabled={actionLoading}
          className="px-2.5 py-2 md:px-4 text-sm font-medium rounded-lg bg-[#F4511E] text-white hover:bg-[#D63B0E] transition-colors flex items-center gap-1.5 disabled:opacity-50"
          title="รับออเดอร์"
        >
          <Package className="w-4 h-4" />
          <span className="hidden md:inline">รับออเดอร์</span>
        </button>
      );
    }

    // === Section 1: Special items (slip verification + split) ===
    if (order.payment_status === 'verifying') {
      menuItems.push({
        key: 'view-slip', label: 'ดูสลิป', icon: <ImageIcon className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handleViewSlip(order.id, order.order_number); },
        className: 'p-1.5 text-gray-400 hover:text-purple-600 transition-colors rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30',
      });
      menuItems.push({
        key: 'reject-slip', label: 'ปฏิเสธสลิป', icon: <XCircle className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handleRejectSlip(order.id); },
        className: 'p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30',
        danger: true,
      });
    }
    if (order.is_split) {
      menuItems.push({
        key: 'unsplit', label: 'ยกเลิกแบ่งกล่อง', icon: <Scissors className="w-4 h-4" />, dividerBefore: menuItems.length > 0,
        onClick: async (e) => {
          e.stopPropagation();
          if (!confirm('ยกเลิกการแบ่งกล่องออเดอร์นี้?')) return;
          setActionLoading(true);
          try {
            const res = await apiFetch('/api/orders/unsplit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ order_id: order.id }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
            showToast('ยกเลิกแบ่งกล่องแล้ว', 'success');
            handleRefresh();
          } catch (err) {
            showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
          } finally { setActionLoading(false); }
        },
        className: 'p-1.5 text-gray-400 hover:text-amber-600 transition-colors rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30',
      });
    }

    // === Section 2: เอกสารการเงิน ===
    const section2Start = menuItems.length;
    if (order.payment_status !== 'paid') {
      menuItems.push({
        key: 'invoice', label: 'ใบแจ้งหนี้', icon: <Banknote className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintInvoice(order.id); },
        className: 'p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30',
      });
    }
    if (order.payment_status === 'paid') {
      menuItems.push({
        key: 'receipt', label: 'ใบเสร็จรับเงิน', icon: <Banknote className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintInvoice(order.id); },
        className: 'p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30',
      });
    }
    if (vatRegistered && order.payment_status === 'paid' && order.tax_invoice_requested !== true) {
      menuItems.push({
        key: 'abbreviated-invoice', label: 'ใบกำกับอย่างย่อ', icon: <Banknote className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintInvoice(order.id); },
        className: 'p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30',
      });
      menuItems.push({
        key: 'full-invoice', label: 'ใบกำกับแบบเต็ม', icon: <Banknote className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); setTaxInvoiceModal({ orderId: order.id, orderNumber: order.order_number, customerId: order.customer_id }); },
        className: 'p-1.5 text-gray-400 hover:text-emerald-600 transition-colors rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30',
      });
    }
    if (menuItems.length > section2Start && section2Start > 0) {
      menuItems[section2Start].dividerBefore = true;
    }

    // === Section 3: อื่นๆ ===
    if (!order.source || order.source === 'manual') {
      const section3Start = menuItems.length;
      menuItems.push({
        key: 'link', label: 'คัดลอกลิงก์', icon: <Link2 className="w-4 h-4" />,
        onClick: (e) => {
          e.stopPropagation();
          const billUrl = `${window.location.origin}/bills/${order.id}`;
          navigator.clipboard.writeText(billUrl).then(() => {
            setToast('คัดลอกลิงก์บิลออนไลน์แล้ว');
            setTimeout(() => setToast(''), 2500);
          });
        },
        className: 'p-1.5 text-gray-400 hover:text-[#F4511E] transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700',
      });
      menuItems.push({
        key: 'edit', label: 'แก้ไข', icon: <Edit2 className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); router.push(`/orders/${order.id}/edit`); },
        className: 'p-1.5 text-blue-500 hover:text-blue-700 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
      });
      if (section3Start > 0) menuItems[section3Start].dividerBefore = true;
    }

    // === Section 4: สถานะ ===
    {
      const section4Start = menuItems.length;
      if (!isOnHold) {
        menuItems.push({
          key: 'hold', label: 'พักไว้', icon: <Pause className="w-4 h-4" />,
          onClick: (e) => { e.stopPropagation(); setHoldModal({ orderId: order.id, orderNumber: order.order_number }); },
          className: 'p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700',
        });
      }
      if (!isMarketplace) {
        menuItems.push({
          key: 'cancel', label: 'ยกเลิก', icon: <Trash2 className="w-4 h-4" />,
          onClick: (e) => { e.stopPropagation(); setConfirmModal({ type: 'cancel', ids: [order.id] }); },
          className: 'p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30',
          danger: true,
        });
      }
      if (menuItems.length > section4Start && section4Start > 0) {
        menuItems[section4Start].dividerBefore = true;
      }
    }

    return (
      <>
        {primaryActions}
        <ActionMenu items={menuItems} />
      </>
    );
  };

  return (
    <>
      {/* Sub-tabs */}
      {(verifyingCount > 0 || onHoldCount > 0) && (
        <div className="flex gap-1.5 overflow-x-auto mb-4">
          {verifyingCount > 0 && (
            <button
              onClick={() => setActiveGroup(VERIFYING_KEY)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                isVerifyingTab
                  ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                  : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              รอตรวจสลิป ({verifyingCount})
            </button>
          )}
          <button
            onClick={() => setActiveGroup(ACTIVE_KEY)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeGroup === ACTIVE_KEY
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
          >
            รอกดรับออเดอร์ ({normalCount - verifyingCount})
          </button>
          {onHoldCount > 0 && (
            <button
              onClick={() => setActiveGroup(ON_HOLD_KEY)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                isOnHoldTab
                  ? 'bg-gray-200 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400'
                  : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              พักไว้ ({onHoldCount})
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      )}

      {/* Order Cards */}
      {!loading && orders.length > 0 && (
        <div className="space-y-3">
          {!isOnHoldTab && !isVerifyingTab && selectableOrders.length > 1 && (
            <label className="flex items-center gap-2 px-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-[#F4511E] focus:ring-[#F4511E]"
              />
              <span className="text-xs text-gray-400 dark:text-slate-500">
                เลือกทั้งหมด{totalOrders > orders.length ? ` (${totalOrders})` : ''}
              </span>
            </label>
          )}
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              statusFilter="ready_to_ship"
              selected={!isOnHoldTab && selectedIds.has(order.id)}
              showCheckbox={!isOnHoldTab && !isVerifyingTab}
              onToggleSelect={toggleSelect}
              onImageClick={onImageClick}
              showPaymentStatus
              actions={renderCardActions(order)}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && orders.length === 0 && (
        <div className="text-center py-12 text-gray-400 dark:text-slate-500 text-sm">
          ไม่มีออเดอร์
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={totalOrders}
          startIdx={(currentPage - 1) * recordsPerPage}
          endIdx={Math.min(currentPage * recordsPerPage, totalOrders)}
          recordsPerPage={recordsPerPage}
          setRecordsPerPage={setRecordsPerPage}
          setPage={setCurrentPage}
        />
      )}

      {/* Floating bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 shadow-lg px-6 py-3">
          <div className="max-w-screen-xl mx-auto flex items-center justify-between">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-sm text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
            >
              clear all
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConfirmModal({ type: 'accept', ids: Array.from(selectedIds) })}
                disabled={bulkLoading}
                className="px-2.5 py-2 md:px-4 text-sm font-medium rounded-lg bg-[#F4511E] text-white hover:bg-[#D63B0E] transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Package className="w-4 h-4" />
                <span className="hidden md:inline">รับออเดอร์</span> ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {confirmModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !bulkLoading && setConfirmModal(null)}
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              {confirmModal.type === 'accept' ? 'ยืนยันกดรับออเดอร์' : 'ยืนยันยกเลิกออเดอร์'}
            </h3>
            <p className="text-gray-600 dark:text-slate-400 mb-6">
              {confirmModal.type === 'accept'
                ? `ยืนยันกดรับ ${confirmModal.ids.length} รายการ? ออเดอร์จะเปลี่ยนเป็นสถานะ "ที่ต้องจัดส่ง"`
                : `ยืนยันยกเลิก ${confirmModal.ids.length} รายการ? การดำเนินการนี้ไม่สามารถย้อนกลับได้`
              }
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmModal(null)}
                disabled={bulkLoading}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => confirmModal.type === 'accept'
                  ? handleBulkAccept(confirmModal.ids)
                  : handleBulkCancel(confirmModal.ids)
                }
                disabled={bulkLoading}
                className={`px-4 py-2 rounded-lg text-white transition-colors disabled:opacity-50 flex items-center gap-2 ${
                  confirmModal.type === 'accept' ? 'bg-[#F4511E] hover:bg-[#D63B0E]' : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {bulkLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>
                ) : (
                  <span>ยืนยัน</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tax Invoice Modal */}
      {taxInvoiceModal && (
        <TaxInvoiceModal
          orderId={taxInvoiceModal.orderId}
          orderNumber={taxInvoiceModal.orderNumber}
          customerId={taxInvoiceModal.customerId}
          onClose={() => setTaxInvoiceModal(null)}
          onSaved={async (updatedOrder) => {
            setTaxInvoiceModal(null);
            try {
              const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
              const res = await apiFetch(`/api/orders/${updatedOrder.id as string}`);
              if (!res.ok) throw new Error('Failed to fetch order');
              const result = await res.json();
              const blob = await generateFullInvoicePdf({
                ...result.order,
                tax_invoice_number: updatedOrder.tax_invoice_number,
                tax_invoice_date: updatedOrder.tax_invoice_date,
                tax_invoice_name: updatedOrder.tax_invoice_name,
                tax_invoice_tax_id: updatedOrder.tax_invoice_tax_id,
                tax_invoice_address: updatedOrder.tax_invoice_address,
                tax_invoice_branch: updatedOrder.tax_invoice_branch,
              });
              showPdfPreview(blob, 'ใบกำกับแบบเต็ม/ใบเสร็จรับเงิน');
              markOrdersPrinted([updatedOrder.id as string], 'invoice');
              updateLocalPrintStatus(setOrders, [updatedOrder.id as string], 'invoice');
            } catch (err) {
              showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
            }
            fetchOrders();
          }}
        />
      )}

      {/* Hold Modal */}
      {holdModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !actionLoading && (setHoldModal(null), setHoldReason(''))}
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              พักออเดอร์
            </h3>
            <p className="text-gray-600 dark:text-slate-400 mb-4">
              ออเดอร์ <span className="font-medium">{holdModal.orderNumber}</span> จะถูกย้ายไปกลุ่ม &quot;พักไว้&quot;
            </p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                เหตุผล (ไม่บังคับ)
              </label>
              <input
                type="text"
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="ระบุเหตุผล เช่น รอสินค้า, รอลูกค้ายืนยัน..."
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setHoldModal(null); setHoldReason(''); }}
                disabled={actionLoading}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleHold}
                disabled={actionLoading}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>
                ) : (
                  <><Pause className="w-4 h-4" /> พักไว้</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TimeSlot Modal */}
      {timeSlotModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !actionLoading && (() => { setTimeSlotModal(null); setSelectedTimeSlotId(null); handleRefresh(); })()}
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-[#F4511E]" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                เลือกเวลารับพัสดุ
              </h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
              ออเดอร์ <span className="font-medium text-gray-700 dark:text-slate-300">{timeSlotModal.orderNumber}</span> ต้องเลือกรอบเวลารับพัสดุ
              {pendingTimeSlotOrders.length > 0 && (
                <span className="text-gray-400 dark:text-slate-500"> (เหลืออีก {pendingTimeSlotOrders.length + 1} รายการ)</span>
              )}
            </p>
            <div className="space-y-2 mb-6">
              {timeSlotModal.timeSlots.map((slot) => (
                <button
                  key={slot.pickup_time_id}
                  onClick={() => setSelectedTimeSlotId(slot.pickup_time_id)}
                  disabled={actionLoading}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors disabled:opacity-50 flex items-center justify-between ${
                    selectedTimeSlotId === slot.pickup_time_id
                      ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/20'
                      : slot.recommended
                        ? 'border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                        : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {slot.display}
                  </span>
                  <div className="flex items-center gap-2">
                    {slot.recommended && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#F4511E] text-white">
                        แนะนำ
                      </span>
                    )}
                    {selectedTimeSlotId === slot.pickup_time_id && (
                      <CheckCircle className="w-5 h-5 text-[#F4511E]" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  setSelectedTimeSlotId(null);
                  if (pendingTimeSlotOrders.length > 0) {
                    setTimeSlotModal(pendingTimeSlotOrders[0]);
                    setPendingTimeSlotOrders(prev => prev.slice(1));
                  } else {
                    setTimeSlotModal(null);
                    handleRefresh();
                  }
                }}
                disabled={actionLoading}
                className="text-sm text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
              >
                ยังไม่รับ
              </button>
              <button
                onClick={() => {
                  if (selectedTimeSlotId) {
                    handleSingleAcceptShopee(timeSlotModal.orderId, selectedTimeSlotId);
                    setSelectedTimeSlotId(null);
                  }
                }}
                disabled={actionLoading || !selectedTimeSlotId}
                className="px-6 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              >
                {actionLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>
                ) : (
                  'ตกลง'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF loading toast — only show when NOT in timeslot modal */}
      {actionLoading && !timeSlotModal && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-[#F4511E]" />
          กำลังดำเนินการ...
        </div>
      )}

      {/* Local toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm animate-fade-in">
          <CheckCircle className="w-4 h-4 text-green-400" />
          {toast}
        </div>
      )}

      {/* Split Parcel Modal */}
      {splitModal && (
        <SplitParcelModal
          show
          orderId={splitModal.orderId}
          orderNumber={splitModal.orderNumber}
          orderItems={splitModal.orderItems}
          isShopee={splitModal.isShopee}
          onClose={() => setSplitModal(null)}
          onSuccess={() => {
            setSplitModal(null);
            showToast('แบ่งกล่องสำเร็จ', 'success');
            handleRefresh();
          }}
        />
      )}

      {/* Slip Preview Modal */}
      {slipModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
          onClick={() => setSlipModal(null)}
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg max-w-md w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                สลิปโอนเงิน — {slipModal.orderNumber}
              </h3>
              <button onClick={() => setSlipModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
              <img
                src={slipModal.imageUrl}
                alt="สลิปโอนเงิน"
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
              />
            </div>
            <div className="flex gap-2 p-4 border-t border-gray-200 dark:border-slate-700">
              <button
                onClick={() => handleRejectSlip(slipModal.orderId)}
                disabled={actionLoading}
                className="flex-1 px-3 py-2.5 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 font-medium text-sm"
              >
                <XCircle className="w-4 h-4" /> ปฏิเสธ
              </button>
              <button
                onClick={() => { handleApproveSlip(slipModal.orderId); setSlipModal(null); }}
                disabled={actionLoading}
                className="flex-1 px-3 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 font-medium text-sm"
              >
                <CheckCircle className="w-4 h-4" /> ยืนยัน
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      <LoadingOverlay
        isOpen={overlayOpen}
        title={overlayTitle}
        message={overlayMessage}
        progress={overlayProgress}
      />
    </>
  );
}

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
  Printer,
  ClipboardList,
  Pause,
  Play,
  CheckCircle,
  CreditCard,
  Banknote,
} from 'lucide-react';
import { generatePackingPdf } from '@/lib/orders-packing-pdf';
import { generateShippingLabelPdf } from '@/lib/order-shipping-label-pdf';
import { generateOrderInvoicePdf } from '@/lib/order-invoice-pdf';
import { showPdfPreview, mergePdfBlobs } from '@/lib/print-pdf';
import OrderCard from './OrderCard';
import ActionMenu, { ActionItem } from './ActionMenu';
import Pagination from '@/app/components/Pagination';
import LoadingOverlay from '@/components/ui/LoadingOverlay';
import {
  Order,
  SHIPPING_CARRIERS,
} from './types';
import { isMarketplaceSource } from '@/lib/marketplace/types';

interface ProcessingTabProps {
  /** Carrier counts from parent's initial fetch: { "SPX Express": 14, "__none__": 3, ... } */
  carrierCounts: Record<string, number>;
  /** On hold count (separate from carrier counts) */
  onHoldCount: number;
  /** Search term from parent (passed through for filtering) */
  search?: string;
  userProfile: any;
  onRefresh: () => void;
  onImageClick: (url: string) => void;
  onStatusClick?: (order: Order) => void;
  onPaymentClick?: (order: Order) => void;
  onDeleteOrder: (e: React.MouseEvent, order: Order) => void;
}

const ON_HOLD_KEY = '__on_hold__';
const NONE_KEY = '__none__';

export default function ProcessingTab({
  carrierCounts,
  onHoldCount,
  search,
  userProfile,
  onRefresh,
  onImageClick,
  onPaymentClick,
  onDeleteOrder,
}: ProcessingTabProps) {
  const router = useRouter();
  const { showToast } = useToast();

  // Sub-tab state
  const [activeCarrierGroup, setActiveCarrierGroup] = useState<string>('');
  const isOnHoldTab = activeCarrierGroup === ON_HOLD_KEY;

  // Self-fetched orders for active carrier tab
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [holdModal, setHoldModal] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState<{ ids: string[] } | null>(null);
  const [toast, setToast] = useState('');

  // Loading overlay state
  const [overlayTitle, setOverlayTitle] = useState('กำลังดำเนินการ...');
  const [overlayMessage, setOverlayMessage] = useState<string | undefined>();
  const [overlayProgress, setOverlayProgress] = useState<number | undefined>();

  // Ship modal (single)
  const [shipModal, setShipModal] = useState<{ order: Order } | null>(null);
  const [shipCarrier, setShipCarrier] = useState('');
  const [shipTracking, setShipTracking] = useState('');

  // Bulk ship modal
  const [bulkShipModal, setBulkShipModal] = useState(false);
  const [bulkShipItems, setBulkShipItems] = useState<Array<{
    id: string;
    order_number: string;
    customer_name: string;
    tracking_number: string;
    shipping_carrier: string;
  }>>([]);

  // Build sorted carrier tabs from carrierCounts
  const carrierTabs = useMemo(() => {
    const tabs: { key: string; label: string; count: number }[] = [];

    // Sort carriers by count descending, "__none__" last
    const entries = Object.entries(carrierCounts).sort((a, b) => {
      if (a[0] === NONE_KEY) return 1;
      if (b[0] === NONE_KEY) return -1;
      return b[1] - a[1];
    });

    for (const [carrier, count] of entries) {
      if (count === 0) continue;
      tabs.push({
        key: carrier,
        label: carrier === NONE_KEY ? 'ไม่ระบุขนส่ง' : carrier,
        count,
      });
    }

    // On hold at the end
    if (onHoldCount > 0) {
      tabs.push({ key: ON_HOLD_KEY, label: 'พักไว้', count: onHoldCount });
    }

    return tabs;
  }, [carrierCounts, onHoldCount]);

  // Auto-select first tab
  useEffect(() => {
    if (carrierTabs.length > 0 && (!activeCarrierGroup || !carrierTabs.find(t => t.key === activeCarrierGroup))) {
      setActiveCarrierGroup(carrierTabs[0].key);
    }
  }, [carrierTabs]);

  // Fetch orders when carrier tab or page changes
  const fetchOrders = useCallback(async () => {
    if (!activeCarrierGroup) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('status', 'processing');
      params.set('source', 'exclude_pos');
      params.set('page', currentPage.toString());
      params.set('limit', recordsPerPage.toString());
      params.set('sort_by', 'created_at');
      params.set('sort_dir', 'desc');
      params.set('shipping_carrier', activeCarrierGroup);
      if (search) params.set('search', search);

      const response = await apiFetch(`/api/orders?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch orders');

      const result = await response.json();
      setOrders(result.orders || []);
      setTotalOrders(result.pagination?.total || 0);
      setTotalPages(result.pagination?.totalPages || 0);
    } catch (err) {
      console.error('ProcessingTab fetch error:', err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [activeCarrierGroup, currentPage, recordsPerPage, search]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Reset page when switching carrier tab or search changes
  useEffect(() => {
    setCurrentPage(1);
    setSelectedIds(new Set());
  }, [activeCarrierGroup, search]);

  // Refresh handler — refresh parent + re-fetch our tab
  const handleRefresh = useCallback(() => {
    onRefresh(); // refresh parent (updates carrierCounts)
    fetchOrders(); // refresh our tab
  }, [onRefresh, fetchOrders]);

  // Selection
  const selectableOrders = isOnHoldTab ? [] : orders;
  // Consider "all selected" if selected count >= total orders in this group (across all pages)
  const allGroupSelected = selectableOrders.length > 0 && (
    selectedIds.size >= totalOrders || selectableOrders.every(o => selectedIds.has(o.id))
  );

  const shippableSelectedIds = useMemo(() => {
    return orders.filter(o => selectedIds.has(o.id) && !isMarketplaceSource(o.source)).map(o => o.id);
  }, [orders, selectedIds]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectGroup = async () => {
    if (allGroupSelected) {
      // Deselect all
      setSelectedIds(new Set());
      return;
    }

    // If all current page orders are already showing, and total fits in one page, just select locally
    if (totalOrders <= orders.length) {
      setSelectedIds(new Set(selectableOrders.map(o => o.id)));
      return;
    }

    // Fetch ALL order IDs for this carrier group from server
    try {
      const params = new URLSearchParams();
      params.set('status', 'processing');
      params.set('source', 'exclude_pos');
      params.set('shipping_carrier', activeCarrierGroup);
      params.set('ids_only', 'true');
      if (search) params.set('search', search);

      const res = await apiFetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed');
      const result = await res.json();
      setSelectedIds(new Set(result.ids || []));
    } catch {
      // Fallback: select only current page
      setSelectedIds(new Set(selectableOrders.map(o => o.id)));
    }
  };

  // Actions
  const handleHold = async () => {
    if (!holdModal) return;
    setActionLoading(true);
    setOverlayTitle('กำลังพักออเดอร์...');
    setOverlayProgress(undefined);
    setOverlayMessage(undefined);
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
    setOverlayTitle('กำลังปลดการพัก...');
    setOverlayProgress(undefined);
    setOverlayMessage(undefined);
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

  const handleBulkCancel = async (ids: string[]) => {
    setActionLoading(true);
    setOverlayTitle('กำลังยกเลิกออเดอร์...');
    setOverlayProgress(undefined);
    setOverlayMessage(`${ids.length} รายการ`);
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
      setActionLoading(false);
      setCancelConfirm(null);
    }
  };

  const handleShip = async () => {
    if (!shipModal) return;
    setActionLoading(true);
    setOverlayTitle('กำลังจัดส่ง...');
    setOverlayProgress(undefined);
    setOverlayMessage(undefined);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: shipModal.order.id,
          order_status: 'shipping',
          tracking_number: shipTracking || null,
          shipping_carrier: shipCarrier || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      showToast('จัดส่งสำเร็จ', 'success');
      handleRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading(false);
      setShipModal(null);
      setShipCarrier('');
      setShipTracking('');
    }
  };

  const openBulkShipModal = () => {
    const items = orders
      .filter(o => selectedIds.has(o.id) && !isMarketplaceSource(o.source))
      .map(o => ({
        id: o.id,
        order_number: o.order_number,
        customer_name: o.customer_name || o.delivery_name || 'ลูกค้าทั่วไป',
        tracking_number: '',
        shipping_carrier: '',
      }));
    setBulkShipItems(items);
    setBulkShipModal(true);
  };

  const handleBulkShipWithTracking = async () => {
    setActionLoading(true);
    setOverlayTitle('กำลังจัดส่ง...');
    setOverlayProgress(undefined);
    setOverlayMessage(`${bulkShipItems.length} รายการ`);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_ship',
          items: bulkShipItems.map(item => ({
            id: item.id,
            tracking_number: item.tracking_number || null,
            shipping_carrier: item.shipping_carrier || null,
          })),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      const result = await res.json();
      showToast(`จัดส่งสำเร็จ ${result.shipped || bulkShipItems.length} รายการ`, 'success');
      setSelectedIds(new Set());
      setBulkShipModal(false);
      handleRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTrackingPaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/[\n\t\r]+/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      e.preventDefault();
      setBulkShipItems(prev => {
        const next = [...prev];
        for (let i = 0; i < lines.length && (index + i) < next.length; i++) {
          next[index + i] = { ...next[index + i], tracking_number: lines[i] };
        }
        return next;
      });
    }
  };

  const fetchOrderForPdf = async (orderId: string) => {
    const res = await apiFetch(`/api/orders/${orderId}`);
    if (!res.ok) throw new Error('Failed to fetch order');
    const result = await res.json();
    return result.order;
  };

  const handlePrintShopeeLabels = async (orderIds: string[]) => {
    const response = await apiFetch('/api/shopee/orders/bulk-shipping-document', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_ids: orderIds }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to generate Shopee labels');
    }

    // SSE stream — read progress events until done
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');

    const decoder = new TextDecoder();
    let buffer = '';
    let pdfBlob: Blob | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(line.slice(6)); } catch { continue; }

        if (event.type === 'progress') {
          setOverlayMessage(event.detail ? `${event.label}: ${event.detail}` : event.label);
          setOverlayProgress(event.progress);
        } else if (event.type === 'done' && event.pdf) {
          const bytes = Uint8Array.from(atob(event.pdf), c => c.charCodeAt(0));
          pdfBlob = new Blob([bytes], { type: 'application/pdf' });
          // Show warning for partial failures (some orders couldn't generate labels)
          if (event.warning) {
            setTimeout(() => alert(event.warning), 500);
          }
        } else if (event.type === 'error') {
          throw new Error(event.message || 'Shopee label generation failed');
        }
      }
    }

    if (pdfBlob) {
      showPdfPreview(pdfBlob, 'ใบปะหน้า Shopee');
    } else {
      throw new Error('ไม่ได้รับ PDF จาก Shopee');
    }
  };

  const handlePrintLabels = async (orderIds: string[]) => {
    setActionLoading(true);
    setOverlayTitle('กำลังสร้างใบปะหน้า...');
    setOverlayProgress(0);
    try {
      const shopeeIds = orderIds.filter(id => {
        const order = orders.find(o => o.id === id);
        return order?.source === 'shopee';
      });
      const otherIds = orderIds.filter(id => !shopeeIds.includes(id));

      if (shopeeIds.length > 0) {
        setOverlayMessage(`Shopee ${shopeeIds.length} รายการ`);
        await handlePrintShopeeLabels(shopeeIds);
      }

      if (otherIds.length > 0) {
        const blobs: Blob[] = [];
        for (let i = 0; i < otherIds.length; i++) {
          setOverlayMessage(`${shopeeIds.length + i + 1} / ${orderIds.length}`);
          setOverlayProgress(Math.round(((shopeeIds.length + i) / orderIds.length) * 100));
          const orderData = await fetchOrderForPdf(otherIds[i]);

          // Split orders: generate one label per parcel
          if (orderData.is_split && orderData.parcels?.length > 0) {
            for (const parcel of orderData.parcels) {
              const parcelItems = (parcel.items || []).map((pi: any) => ({
                product_name: pi.product_name,
                variation_label: pi.variation_label,
                quantity: pi.quantity,
              }));
              blobs.push(await generateShippingLabelPdf({
                data: {
                  ...orderData,
                  tracking_number: parcel.tracking_number || orderData.tracking_number,
                  shipping_carrier: parcel.shipping_carrier || orderData.shipping_carrier,
                  items: parcelItems.length > 0 ? parcelItems : orderData.items,
                  parcel_number: parcel.parcel_number,
                  total_parcels: orderData.parcels.length,
                },
              }));
            }
          } else {
            blobs.push(await generateShippingLabelPdf({ data: orderData }));
          }
        }
        const merged = await mergePdfBlobs(blobs);
        showPdfPreview(merged, 'ใบปะหน้า');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setActionLoading(false);
      setOverlayProgress(undefined);
      setOverlayMessage(undefined);
    }
  };

  const handlePrintPackingSlips = async (orderIds: string[]) => {
    setActionLoading(true);
    setOverlayProgress(0);
    const isMulti = orderIds.length > 1;
    setOverlayTitle(isMulti ? 'กำลังสร้างใบหยิบของ + ใบจัดของ...' : 'กำลังสร้างใบจัดของ...');

    try {
      const ordersData = [];
      for (let i = 0; i < orderIds.length; i++) {
        if (isMulti) setOverlayMessage(`โหลดข้อมูล ${i + 1} / ${orderIds.length}`);
        setOverlayProgress(Math.round((i / orderIds.length) * 80));
        const orderData = await fetchOrderForPdf(orderIds[i]);

        // Split orders: expand parcels as separate entries
        if (orderData.is_split && orderData.parcels?.length > 0) {
          for (const parcel of orderData.parcels) {
            const parcelItems = (parcel.items || []).map((pi: any) => {
              const fullItem = orderData.items?.find((i: any) => i.id === pi.order_item_id);
              return {
                product_name: pi.product_name || fullItem?.product_name || '',
                variation_label: pi.variation_label || fullItem?.variation_label || null,
                quantity: pi.quantity,
                image: pi.image || fullItem?.image || null,
                barcode: fullItem?.barcode || null,
                sku: fullItem?.sku || null,
                product_code: fullItem?.product_code || null,
              };
            });
            ordersData.push({
              ...orderData,
              items: parcelItems.length > 0 ? parcelItems : orderData.items,
              order_number: `${orderData.order_number} (กล่อง ${parcel.parcel_number}/${orderData.parcels.length})`,
            });
          }
        } else {
          ordersData.push(orderData);
        }
      }

      setOverlayMessage('กำลังสร้าง PDF...');
      setOverlayProgress(90);
      const blob = await generatePackingPdf(ordersData);
      setOverlayProgress(100);
      showPdfPreview(blob, isMulti ? 'ใบหยิบของ + ใบจัดของ' : 'ใบจัดของ');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setActionLoading(false);
      setOverlayProgress(undefined);
      setOverlayMessage(undefined);
    }
  };

  const handlePrintInvoice = async (orderId: string, paymentStatus?: string) => {
    setActionLoading(true);
    setOverlayTitle(paymentStatus === 'paid' ? 'กำลังสร้างใบเสร็จรับเงิน...' : 'กำลังสร้างใบแจ้งหนี้...');
    setOverlayProgress(undefined);
    setOverlayMessage(undefined);
    try {
      const orderData = await fetchOrderForPdf(orderId);
      const blob = await generateOrderInvoicePdf({ data: orderData });
      showPdfPreview(blob, orderData.payment_status === 'paid' ? 'ใบเสร็จรับเงิน' : 'ใบแจ้งหนี้');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
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

    if (!isMarketplace && !isOnHold && order.payment_status === 'pending') {
      primaryActions.push(
        <button key="pay" onClick={(e) => { e.stopPropagation(); onPaymentClick?.(order); }}
          className="px-2.5 py-1.5 md:px-3 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1" title="บันทึกชำระ">
          <CreditCard className="w-3.5 h-3.5" /> <span className="hidden md:inline">บันทึกชำระ</span>
        </button>
      );
    }

    if (!isMarketplace && !isOnHold) {
      primaryActions.push(
        <button key="ship" onClick={(e) => { e.stopPropagation(); setShipModal({ order }); }}
          className="px-2.5 py-1.5 md:px-3 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center gap-1" title="จัดส่งแล้ว">
          <Package className="w-3.5 h-3.5" /> <span className="hidden md:inline">จัดส่งแล้ว</span>
        </button>
      );
    }

    if (isOnHold) {
      primaryActions.push(
        <button key="unhold" onClick={(e) => { e.stopPropagation(); handleUnhold(order.id); }} disabled={actionLoading}
          className="px-2.5 py-1.5 md:px-3 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1 disabled:opacity-50" title="กลับมา">
          <Play className="w-3.5 h-3.5" /> <span className="hidden md:inline">กลับมา</span>
        </button>
      );
    }

    menuItems.push({
      key: 'invoice', label: order.payment_status === 'paid' ? 'ใบเสร็จรับเงิน' : 'ใบแจ้งหนี้', icon: <Banknote className="w-4 h-4" />,
      onClick: (e) => { e.stopPropagation(); handlePrintInvoice(order.id, order.payment_status); },
      className: 'p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30',
    });

    if (!isOnHold) {
      menuItems.push({
        key: 'packing', label: 'ใบจัดของ', icon: <ClipboardList className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintPackingSlips([order.id]); },
        className: 'p-1.5 text-gray-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
      });
      menuItems.push({
        key: 'print', label: 'ใบปะหน้า', icon: <Printer className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintLabels([order.id]); },
        className: 'p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
      });
      menuItems.push({
        key: 'hold', label: 'พักไว้', icon: <Pause className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); setHoldModal({ orderId: order.id, orderNumber: order.order_number }); },
        className: 'p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700',
      });
    }

    if (!isMarketplace) {
      menuItems.push({
        key: 'cancel', label: 'ยกเลิก', icon: <Trash2 className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); setCancelConfirm({ ids: [order.id] }); },
        className: 'p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30',
        danger: true,
      });
    }

    if (!order.source || order.source === 'manual') {
      menuItems.push({
        key: 'link', label: 'คัดลอกลิงก์', icon: <Link2 className="w-4 h-4" />,
        onClick: (e) => {
          e.stopPropagation();
          const billUrl = `${window.location.origin}/bills/${order.id}`;
          navigator.clipboard.writeText(billUrl).then(() => { setToast('คัดลอกลิงก์บิลออนไลน์แล้ว'); setTimeout(() => setToast(''), 2500); });
        },
        className: 'p-1.5 text-gray-400 hover:text-[#F4511E] transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700',
      });
      menuItems.push({
        key: 'edit', label: 'แก้ไข', icon: <Edit2 className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); router.push(`/orders/${order.id}/edit`); },
        className: 'p-1.5 text-blue-500 hover:text-blue-700 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
      });
    }

    return (
      <>
        {primaryActions}
        <ActionMenu items={menuItems} />
      </>
    );
  };

  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = Math.min(startIndex + orders.length, totalOrders);

  return (
    <>
      {/* Sub-tabs for carrier groups */}
      {carrierTabs.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto mb-4">
          {carrierTabs.map((tab) => {
            const isActive = activeCarrierGroup === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveCarrierGroup(tab.key)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? tab.key === ON_HOLD_KEY
                      ? 'bg-gray-200 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label} ({tab.count})
              </button>
            );
          })}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      )}

      {/* Orders list */}
      {!loading && orders.length > 0 && (
        <div className="space-y-3">
          {/* Select all */}
          {!isOnHoldTab && selectableOrders.length > 1 && (
            <label className="flex items-center gap-2 px-4 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allGroupSelected}
                onChange={toggleSelectGroup}
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
              statusFilter="processing"
              selected={selectedIds.has(order.id)}
              showCheckbox={!isOnHoldTab}
              onToggleSelect={toggleSelect}
              onImageClick={onImageClick}
              showPaymentStatus
              actions={renderCardActions(order)}
            />
          ))}

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalRecords={totalOrders}
              startIdx={startIndex}
              endIdx={endIndex}
              recordsPerPage={recordsPerPage}
              setRecordsPerPage={setRecordsPerPage}
              setPage={setCurrentPage}
            />
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && orders.length === 0 && carrierTabs.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 py-16 text-center">
          <Package className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400">ไม่มีออเดอร์ที่ต้องจัดส่ง</p>
        </div>
      )}

      {!loading && orders.length === 0 && carrierTabs.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 py-12 text-center">
          <Package className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-gray-400 dark:text-slate-500 text-sm">ไม่มีออเดอร์ในกลุ่มนี้</p>
        </div>
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
                onClick={() => handlePrintLabels(Array.from(selectedIds))}
                className="px-2.5 py-2 md:px-4 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden md:inline">ใบปะหน้า</span> ({selectedIds.size})
              </button>
              <button
                onClick={() => handlePrintPackingSlips(Array.from(selectedIds))}
                className="px-2.5 py-2 md:px-4 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
              >
                <ClipboardList className="w-4 h-4" />
                <span className="hidden md:inline">ใบจัดของ</span> ({selectedIds.size})
              </button>
              {shippableSelectedIds.length > 0 && (
                <button
                  onClick={openBulkShipModal}
                  disabled={actionLoading}
                  className="px-2.5 py-2 md:px-4 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Package className="w-4 h-4" />
                  <span className="hidden md:inline">จัดส่งแล้ว</span> ({shippableSelectedIds.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hold Modal */}
      {holdModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => !actionLoading && setHoldModal(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">พักออเดอร์</h3>
            <p className="text-gray-600 dark:text-slate-400 mb-4">ออเดอร์ <span className="font-medium">{holdModal.orderNumber}</span> จะถูกย้ายไปกลุ่ม "พักไว้"</p>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">เหตุผล (ไม่บังคับ)</label>
              <input type="text" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} placeholder="ระบุเหตุผล เช่น รอสินค้า, รอลูกค้ายืนยัน..."
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]" />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setHoldModal(null); setHoldReason(''); }} disabled={actionLoading}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50">ยกเลิก</button>
              <button onClick={handleHold} disabled={actionLoading}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2">
                {actionLoading ? (<><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>) : (<><Pause className="w-4 h-4" /> พักไว้</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ship Modal */}
      {shipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => !actionLoading && (setShipModal(null), setShipCarrier(''), setShipTracking(''))}>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">จัดส่งออเดอร์</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">{shipModal.order.order_number} — {shipModal.order.customer_name || shipModal.order.delivery_name || 'ลูกค้าทั่วไป'}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">ขนส่ง</label>
                <select value={shipCarrier} onChange={(e) => setShipCarrier(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm">
                  <option value="">-- เลือกขนส่ง --</option>
                  {SHIPPING_CARRIERS.map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">เลขพัสดุ</label>
                <input type="text" value={shipTracking} onChange={(e) => setShipTracking(e.target.value)} placeholder="กรอกเลขพัสดุ (ไม่บังคับ)"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm" />
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button onClick={() => { setShipModal(null); setShipCarrier(''); setShipTracking(''); }} disabled={actionLoading}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50">ยกเลิก</button>
              <button onClick={handleShip} disabled={actionLoading}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2">
                {actionLoading ? (<><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>) : (<><Package className="w-4 h-4" /> จัดส่งแล้ว</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {cancelConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => !actionLoading && setCancelConfirm(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">ยืนยันยกเลิกออเดอร์</h3>
            <p className="text-gray-600 dark:text-slate-400 mb-6">ยืนยันยกเลิก {cancelConfirm.ids.length} รายการ? การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCancelConfirm(null)} disabled={actionLoading}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50">ยกเลิก</button>
              <button onClick={() => handleBulkCancel(cancelConfirm.ids)} disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2">
                {actionLoading ? (<><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>) : (<span>ยืนยันยกเลิก</span>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Ship Modal */}
      {bulkShipModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => !actionLoading && setBulkShipModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">จัดส่งออเดอร์ ({bulkShipItems.length} รายการ)</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">กรอกเลขพัสดุสำหรับแต่ละออเดอร์ (ไม่บังคับ) หรือวางจาก Excel</p>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-500 dark:text-slate-400">ใช้ขนส่งเดียวกัน:</span>
              <select onChange={(e) => { if (!e.target.value) return; setBulkShipItems(prev => prev.map(item => ({ ...item, shipping_carrier: e.target.value }))); }}
                className="px-2 py-1 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded text-sm" defaultValue="">
                <option value="">-- เลือก --</option>
                {SHIPPING_CARRIERS.map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {bulkShipItems.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.order_number}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{item.customer_name}</p>
                  </div>
                  <select value={item.shipping_carrier} onChange={(e) => { setBulkShipItems(prev => { const next = [...prev]; next[idx] = { ...next[idx], shipping_carrier: e.target.value }; return next; }); }}
                    className="w-28 px-2 py-1.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-xs">
                    <option value="">ขนส่ง</option>
                    {SHIPPING_CARRIERS.map(c => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  </select>
                  <input type="text" value={item.tracking_number}
                    onChange={(e) => { setBulkShipItems(prev => { const next = [...prev]; next[idx] = { ...next[idx], tracking_number: e.target.value }; return next; }); }}
                    onPaste={(e) => handleTrackingPaste(idx, e)} placeholder="เลขพัสดุ"
                    className="w-40 px-2 py-1.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm font-mono" />
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end pt-4 border-t dark:border-slate-700">
              <button onClick={() => setBulkShipModal(false)} disabled={actionLoading}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50">ยกเลิก</button>
              <button onClick={handleBulkShipWithTracking} disabled={actionLoading}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2">
                {actionLoading ? (<><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>) : (<><Package className="w-4 h-4" /> จัดส่งทั้งหมด</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF / action loading overlay */}
      <LoadingOverlay
        isOpen={actionLoading}
        title={overlayTitle}
        message={overlayMessage}
        progress={overlayProgress}
        showWarning={false}
      />

      {/* Local toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm animate-fade-in">
          <CheckCircle className="w-4 h-4 text-green-400" />
          {toast}
        </div>
      )}
    </>
  );
}

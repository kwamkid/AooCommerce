'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { generatePackingListPdf } from '@/lib/order-packing-pdf';
import { generateShippingLabelPdf } from '@/lib/order-shipping-label-pdf';
import { generateOrderInvoicePdf } from '@/lib/order-invoice-pdf';
import { showPdfPreview, mergePdfBlobs } from '@/lib/print-pdf';
import OrderCard from './OrderCard';
import ActionMenu, { ActionItem } from './ActionMenu';
import {
  Order,
  SHIPPING_CARRIERS,
} from './types';
import { isMarketplaceSource } from '@/lib/marketplace/types';

interface ProcessingTabProps {
  orders: Order[];
  userProfile: any;
  onRefresh: () => void;
  onImageClick: (url: string) => void;
  onStatusClick?: (order: Order) => void;
  onPaymentClick?: (order: Order) => void;
  onDeleteOrder: (e: React.MouseEvent, order: Order) => void;
}

export default function ProcessingTab({
  orders,
  userProfile,
  onRefresh,
  onImageClick,
  onPaymentClick,
  onDeleteOrder,
}: ProcessingTabProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeCarrierGroup, setActiveCarrierGroup] = useState<string>('');
  const [holdModal, setHoldModal] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState<{ ids: string[] } | null>(null);
  const [toast, setToast] = useState('');

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

  // Group orders by shipping carrier
  const { carrierGroups, carrierOrder, onHoldOrders } = useMemo(() => {
    const groups = new Map<string, Order[]>();
    const holdOrders: Order[] = [];
    const ON_HOLD_KEY = '__on_hold__';
    const UNSPECIFIED_KEY = 'ไม่ระบุขนส่ง';

    for (const order of orders) {
      if (order.fulfillment_status === 'on_hold') {
        holdOrders.push(order);
        continue;
      }
      const carrier = order.shipping_carrier || UNSPECIFIED_KEY;
      if (!groups.has(carrier)) groups.set(carrier, []);
      groups.get(carrier)!.push(order);
    }

    // Sort: carriers with orders first, "ไม่ระบุขนส่ง" last
    const sortedKeys = [...groups.keys()].sort((a, b) => {
      if (a === UNSPECIFIED_KEY) return 1;
      if (b === UNSPECIFIED_KEY) return -1;
      return groups.get(b)!.length - groups.get(a)!.length;
    });

    // Add on_hold as last group if any
    if (holdOrders.length > 0) sortedKeys.push(ON_HOLD_KEY);

    return { carrierGroups: groups, carrierOrder: sortedKeys, onHoldOrders: holdOrders };
  }, [orders]);

  const ON_HOLD_KEY = '__on_hold__';
  const isOnHoldTab = activeCarrierGroup === ON_HOLD_KEY;

  // Auto-select first non-empty group
  useEffect(() => {
    if (carrierOrder.length === 0) return;
    const currentOrders = isOnHoldTab ? onHoldOrders : carrierGroups.get(activeCarrierGroup);
    if (!currentOrders || currentOrders.length === 0) {
      setActiveCarrierGroup(carrierOrder[0]);
    }
  }, [carrierOrder, activeCarrierGroup]);

  // Set initial group on mount
  useEffect(() => {
    if (activeCarrierGroup === '' && carrierOrder.length > 0) {
      setActiveCarrierGroup(carrierOrder[0]);
    }
  }, [carrierOrder]);

  // Active group orders
  const activeOrders = isOnHoldTab ? onHoldOrders : (carrierGroups.get(activeCarrierGroup) || []);
  const selectableInActiveGroup = isOnHoldTab ? [] : activeOrders;
  const allGroupSelected = selectableInActiveGroup.length > 0 && selectableInActiveGroup.every(o => selectedIds.has(o.id));

  // Count of selected non-marketplace orders (only these can be shipped manually)
  const shippableSelectedIds = useMemo(() => {
    return orders.filter(o => selectedIds.has(o.id) && !isMarketplaceSource(o.source)).map(o => o.id);
  }, [orders, selectedIds]);

  // Selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectGroup = () => {
    const groupIds = selectableInActiveGroup.map(o => o.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allGroupSelected) {
        groupIds.forEach(id => next.delete(id));
      } else {
        groupIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // Actions
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
      onRefresh();
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
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally { setActionLoading(false); }
  };

  const handleBulkCancel = async (ids: string[]) => {
    setActionLoading(true);
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
      onRefresh();
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
      onRefresh();
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
    // Only non-marketplace orders can be shipped manually — NEVER change marketplace status to shipping
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
      onRefresh();
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
    const blob = await response.blob();
    showPdfPreview(blob, 'ใบปะหน้า Shopee');
  };

  const handlePrintLabels = async (orderIds: string[]) => {
    setActionLoading(true);
    try {
      // Split by source: Shopee orders use bulk API, others use local PDF
      const shopeeIds = orderIds.filter(id => {
        const order = orders.find(o => o.id === id);
        return order?.source === 'shopee';
      });
      const otherIds = orderIds.filter(id => !shopeeIds.includes(id));

      // Print Shopee labels in one bulk call
      if (shopeeIds.length > 0) {
        await handlePrintShopeeLabels(shopeeIds);
      }

      // Print non-Shopee labels — merge into single PDF
      if (otherIds.length > 0) {
        const blobs: Blob[] = [];
        for (const id of otherIds) {
          const orderData = await fetchOrderForPdf(id);
          blobs.push(await generateShippingLabelPdf({ data: orderData }));
        }
        const merged = await mergePdfBlobs(blobs);
        showPdfPreview(merged, 'ใบปะหน้า');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrintPackingSlips = async (orderIds: string[]) => {
    setActionLoading(true);
    try {
      const blobs: Blob[] = [];
      for (const id of orderIds) {
        const orderData = await fetchOrderForPdf(id);
        blobs.push(await generatePackingListPdf({ data: orderData }));
      }
      const merged = await mergePdfBlobs(blobs);
      showPdfPreview(merged, 'ใบจัดของ');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrintInvoice = async (orderId: string) => {
    setActionLoading(true);
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

    // Primary: Payment (non-marketplace, unpaid, not on hold)
    if (!isMarketplace && !isOnHold && order.payment_status === 'pending') {
      primaryActions.push(
        <button
          key="pay"
          onClick={(e) => { e.stopPropagation(); onPaymentClick?.(order); }}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1"
          title="บันทึกชำระ"
        >
          <CreditCard className="w-3.5 h-3.5" />
          บันทึกชำระ
        </button>
      );
    }

    // Primary: Ship action (non-marketplace only, not on hold)
    if (!isMarketplace && !isOnHold) {
      primaryActions.push(
        <button
          key="ship"
          onClick={(e) => { e.stopPropagation(); setShipModal({ order }); }}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center gap-1"
          title="จัดส่งแล้ว"
        >
          <Package className="w-3.5 h-3.5" />
          จัดส่งแล้ว
        </button>
      );
    }

    // Primary: Unhold for on_hold
    if (isOnHold) {
      primaryActions.push(
        <button
          key="unhold"
          onClick={(e) => { e.stopPropagation(); handleUnhold(order.id); }}
          disabled={actionLoading}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1 disabled:opacity-50"
          title="กลับมา"
        >
          <Play className="w-3.5 h-3.5" />
          กลับมา
        </button>
      );
    }

    // Menu: Print invoice
    menuItems.push({
      key: 'invoice',
      label: order.payment_status === 'paid' ? 'ใบเสร็จรับเงิน' : 'ใบแจ้งหนี้',
      icon: <Banknote className="w-4 h-4" />,
      onClick: (e) => { e.stopPropagation(); handlePrintInvoice(order.id); },
      className: 'p-1.5 text-gray-400 hover:text-green-600 transition-colors rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30',
    });

    // Menu: Print packing slip
    if (!isOnHold) {
      menuItems.push({
        key: 'packing', label: 'ใบจัดของ', icon: <ClipboardList className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintPackingSlips([order.id]); },
        className: 'p-1.5 text-gray-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
      });
    }

    // Menu: Print label
    if (!isOnHold) {
      menuItems.push({
        key: 'print', label: 'ใบปะหน้า', icon: <Printer className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintLabels([order.id]); },
        className: 'p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
      });
    }

    // Menu: Hold (any order, not already on hold)
    if (!isOnHold) {
      menuItems.push({
        key: 'hold', label: 'พักไว้', icon: <Pause className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); setHoldModal({ orderId: order.id, orderNumber: order.order_number }); },
        className: 'p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700',
      });
    }

    // Menu: Cancel (non-marketplace only)
    if (!isMarketplace) {
      menuItems.push({
        key: 'cancel', label: 'ยกเลิก', icon: <Trash2 className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); setCancelConfirm({ ids: [order.id] }); },
        className: 'p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30',
        danger: true,
      });
    }

    // Menu: Bill link (manual)
    if (!order.source || order.source === 'manual') {
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
    }

    // Menu: Edit / Delete (manual only, no view icon — card click opens order)
    if (!order.source || order.source === 'manual') {
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

  return (
    <>
      {/* Sub-tabs for carrier groups */}
      {orders.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto mb-4">
          {carrierOrder.map((group) => {
            const isHold = group === ON_HOLD_KEY;
            const count = isHold ? onHoldOrders.length : (carrierGroups.get(group)?.length || 0);
            if (count === 0) return null;
            const isActive = activeCarrierGroup === group;
            const label = isHold ? 'พักไว้' : group;
            return (
              <button
                key={group}
                onClick={() => setActiveCarrierGroup(group)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? isHold
                      ? 'bg-gray-200 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400'
                      : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                    : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Active group cards */}
      {activeOrders.length > 0 && (
        <div className="space-y-3">
          {/* Select all for active group */}
          {!isOnHoldTab && selectableInActiveGroup.length > 1 && (
            <div className="flex items-center gap-2 px-4">
              <input
                type="checkbox"
                checked={allGroupSelected}
                onChange={toggleSelectGroup}
                className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-[#F4511E] focus:ring-[#F4511E]"
              />
              <span className="text-xs text-gray-400 dark:text-slate-500">เลือกทั้งหมด</span>
            </div>
          )}
          {activeOrders.map((order) => (
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
        </div>
      )}

      {orders.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 py-16 text-center">
          <Package className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400">ไม่มีออเดอร์ที่ต้องจัดส่ง</p>
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
                className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                ใบปะหน้า ({selectedIds.size})
              </button>
              <button
                onClick={() => handlePrintPackingSlips(Array.from(selectedIds))}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-1.5"
              >
                <ClipboardList className="w-4 h-4" />
                ใบจัดของ ({selectedIds.size})
              </button>
              {shippableSelectedIds.length > 0 && (
                <button
                  onClick={openBulkShipModal}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Package className="w-4 h-4" />
                  จัดส่งแล้ว ({shippableSelectedIds.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hold Modal */}
      {holdModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !actionLoading && setHoldModal(null)}
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              พักออเดอร์
            </h3>
            <p className="text-gray-600 dark:text-slate-400 mb-4">
              ออเดอร์ <span className="font-medium">{holdModal.orderNumber}</span> จะถูกย้ายไปกลุ่ม "พักไว้"
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

      {/* Ship Modal */}
      {shipModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !actionLoading && (setShipModal(null), setShipCarrier(''), setShipTracking(''))}
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              จัดส่งออเดอร์
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">
              {shipModal.order.order_number} — {shipModal.order.customer_name || shipModal.order.delivery_name || 'ลูกค้าทั่วไป'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  ขนส่ง
                </label>
                <select
                  value={shipCarrier}
                  onChange={(e) => setShipCarrier(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                >
                  <option value="">-- เลือกขนส่ง --</option>
                  {SHIPPING_CARRIERS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  เลขพัสดุ
                </label>
                <input
                  type="text"
                  value={shipTracking}
                  onChange={(e) => setShipTracking(e.target.value)}
                  placeholder="กรอกเลขพัสดุ (ไม่บังคับ)"
                  className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => { setShipModal(null); setShipCarrier(''); setShipTracking(''); }}
                disabled={actionLoading}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleShip}
                disabled={actionLoading}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>
                ) : (
                  <><Package className="w-4 h-4" /> จัดส่งแล้ว</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirm Modal */}
      {cancelConfirm && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !actionLoading && setCancelConfirm(null)}
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              ยืนยันยกเลิกออเดอร์
            </h3>
            <p className="text-gray-600 dark:text-slate-400 mb-6">
              ยืนยันยกเลิก {cancelConfirm.ids.length} รายการ? การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setCancelConfirm(null)}
                disabled={actionLoading}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => handleBulkCancel(cancelConfirm.ids)}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>
                ) : (
                  <span>ยืนยันยกเลิก</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Ship Modal */}
      {bulkShipModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => !actionLoading && setBulkShipModal(false)}
        >
          <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-2xl w-full max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              จัดส่งออเดอร์ ({bulkShipItems.length} รายการ)
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
              กรอกเลขพัสดุสำหรับแต่ละออเดอร์ (ไม่บังคับ) หรือวางจาก Excel
            </p>

            {/* Apply same carrier to all */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-500 dark:text-slate-400">ใช้ขนส่งเดียวกัน:</span>
              <select
                onChange={(e) => {
                  if (!e.target.value) return;
                  setBulkShipItems(prev => prev.map(item => ({ ...item, shipping_carrier: e.target.value })));
                }}
                className="px-2 py-1 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded text-sm"
                defaultValue=""
              >
                <option value="">-- เลือก --</option>
                {SHIPPING_CARRIERS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
              {bulkShipItems.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.order_number}</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{item.customer_name}</p>
                  </div>
                  <select
                    value={item.shipping_carrier}
                    onChange={(e) => {
                      setBulkShipItems(prev => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], shipping_carrier: e.target.value };
                        return next;
                      });
                    }}
                    className="w-28 px-2 py-1.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-xs"
                  >
                    <option value="">ขนส่ง</option>
                    {SHIPPING_CARRIERS.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={item.tracking_number}
                    onChange={(e) => {
                      setBulkShipItems(prev => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], tracking_number: e.target.value };
                        return next;
                      });
                    }}
                    onPaste={(e) => handleTrackingPaste(idx, e)}
                    placeholder="เลขพัสดุ"
                    className="w-40 px-2 py-1.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg text-sm font-mono"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t dark:border-slate-700">
              <button
                onClick={() => setBulkShipModal(false)}
                disabled={actionLoading}
                className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleBulkShipWithTracking}
                disabled={actionLoading}
                className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>
                ) : (
                  <><Package className="w-4 h-4" /> จัดส่งทั้งหมด</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF loading toast */}
      {actionLoading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-[#F4511E]" />
          กำลังสร้าง PDF...
        </div>
      )}

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

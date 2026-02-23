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
} from 'lucide-react';
import OrderCard from './OrderCard';
import ActionMenu, { ActionItem } from './ActionMenu';
import {
  Order,
  DeliveryGroup,
  classifyDeliveryGroup,
  DELIVERY_GROUP_CONFIG,
  SHIPPING_CARRIERS,
} from './types';

interface ProcessingTabProps {
  orders: Order[];
  userProfile: any;
  onRefresh: () => void;
  onImageClick: (url: string) => void;
  onStatusClick?: (order: Order) => void;
  onDeleteOrder: (e: React.MouseEvent, order: Order) => void;
}

export default function ProcessingTab({
  orders,
  userProfile,
  onRefresh,
  onImageClick,
  onDeleteOrder,
}: ProcessingTabProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeGroup, setActiveGroup] = useState<DeliveryGroup>('today');
  const [holdModal, setHoldModal] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState<{ ids: string[] } | null>(null);
  const [toast, setToast] = useState('');

  // Ship modal
  const [shipModal, setShipModal] = useState<{ order: Order } | null>(null);
  const [shipCarrier, setShipCarrier] = useState('');
  const [shipTracking, setShipTracking] = useState('');

  // Group orders by delivery date
  const groupedOrders = useMemo(() => {
    const groups: Record<DeliveryGroup, Order[]> = { today: [], tomorrow: [], other: [], on_hold: [] };
    for (const order of orders) {
      groups[classifyDeliveryGroup(order)].push(order);
    }
    return groups;
  }, [orders]);

  const groupOrder: DeliveryGroup[] = ['today', 'tomorrow', 'other', 'on_hold'];

  // Auto-select first non-empty group if active group becomes empty
  useEffect(() => {
    if (groupedOrders[activeGroup].length === 0) {
      const firstNonEmpty = groupOrder.find(g => groupedOrders[g].length > 0);
      if (firstNonEmpty) setActiveGroup(firstNonEmpty);
    }
  }, [groupedOrders, activeGroup]);

  // Active group orders
  const activeOrders = groupedOrders[activeGroup];
  const selectableInActiveGroup = activeGroup !== 'on_hold' ? activeOrders : [];
  const allGroupSelected = selectableInActiveGroup.length > 0 && selectableInActiveGroup.every(o => selectedIds.has(o.id));

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

  const handleBulkShip = async (ids: string[]) => {
    setActionLoading(true);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_ship', ids }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      const result = await res.json();
      showToast(`จัดส่งสำเร็จ ${result.shipped || ids.length} รายการ`, 'success');
      setSelectedIds(new Set());
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePrintLabels = (orderIds: string[]) => {
    // Open print page with selected order ids
    const params = new URLSearchParams();
    orderIds.forEach(id => params.append('ids', id));
    window.open(`/orders/print-labels?${params.toString()}`, '_blank');
  };

  const handlePrintPackingSlips = (orderIds: string[]) => {
    const params = new URLSearchParams();
    orderIds.forEach(id => params.append('ids', id));
    window.open(`/orders/print-packing?${params.toString()}`, '_blank');
  };

  const renderCardActions = (order: Order) => {
    const isShopee = order.source === 'shopee';
    const isOnHold = order.fulfillment_status === 'on_hold';
    const primaryActions: React.ReactNode[] = [];
    const menuItems: ActionItem[] = [];

    // Primary: Ship action (manual only, not on hold)
    if (!isShopee && !isOnHold) {
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

    // Menu: Print label
    if (!isOnHold) {
      menuItems.push({
        key: 'print', label: 'พิมพ์ใบปะหน้า', icon: <Printer className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintLabels([order.id]); },
        className: 'p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
      });
    }

    // Menu: Print packing slip
    if (!isOnHold) {
      menuItems.push({
        key: 'packing', label: 'พิมพ์ใบจัดของ', icon: <ClipboardList className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); handlePrintPackingSlips([order.id]); },
        className: 'p-1.5 text-gray-400 hover:text-indigo-600 transition-colors rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
      });
    }

    // Menu: Hold (manual, not on hold)
    if (!isShopee && !isOnHold) {
      menuItems.push({
        key: 'hold', label: 'พักไว้', icon: <Pause className="w-4 h-4" />,
        onClick: (e) => { e.stopPropagation(); setHoldModal({ orderId: order.id, orderNumber: order.order_number }); },
        className: 'p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700',
      });
    }

    // Menu: Cancel (manual only)
    if (!isShopee) {
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
      {/* Sub-tabs for delivery groups */}
      {orders.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto mb-4">
          {groupOrder.map((group) => {
            const count = groupedOrders[group].length;
            if (count === 0) return null;
            const config = DELIVERY_GROUP_CONFIG[group];
            const isActive = activeGroup === group;
            return (
              <button
                key={group}
                onClick={() => setActiveGroup(group)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? `${config.bgColor} ${config.color}`
                    : 'text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                {config.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Active group cards */}
      {activeOrders.length > 0 && (
        <div className="space-y-3">
          {/* Select all for active group */}
          {activeGroup !== 'on_hold' && selectableInActiveGroup.length > 1 && (
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
              showCheckbox={activeGroup !== 'on_hold'}
              onToggleSelect={toggleSelect}
              onImageClick={onImageClick}
              showPaymentStatus={order.payment_status !== 'paid'}
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
              <button
                onClick={() => handleBulkShip(Array.from(selectedIds))}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Package className="w-4 h-4" />
                จัดส่งแล้ว ({selectedIds.size})
              </button>
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

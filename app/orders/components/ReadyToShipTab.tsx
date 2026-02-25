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
  CreditCard,
  CheckCircle,
  Banknote,
  Pause,
  Play,
  Clock,
} from 'lucide-react';
import { generateOrderInvoicePdf } from '@/lib/order-invoice-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import OrderCard from './OrderCard';
import ActionMenu, { ActionItem } from './ActionMenu';
import { Order } from './types';
import { isMarketplaceSource } from '@/lib/marketplace/types';

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
  orders: Order[];
  userProfile: any;
  onRefresh: () => void;
  onImageClick: (url: string) => void;
  onPaymentClick: (order: Order) => void;
  onStatusClick: (order: Order) => void;
  onDeleteOrder: (e: React.MouseEvent, order: Order) => void;
}

export default function ReadyToShipTab({
  orders,
  userProfile,
  onRefresh,
  onImageClick,
  onPaymentClick,
  onStatusClick,
  onDeleteOrder,
}: ReadyToShipTabProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ type: 'accept' | 'cancel'; ids: string[] } | null>(null);
  const [holdModal, setHoldModal] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [toast, setToast] = useState('');
  const [timeSlotModal, setTimeSlotModal] = useState<TimeSlotModal | null>(null);
  const [selectedTimeSlotId, setSelectedTimeSlotId] = useState<string | null>(null);
  const [pendingTimeSlotOrders, setPendingTimeSlotOrders] = useState<TimeSlotModal[]>([]);

  // All orders can be bulk-selected (Shopee needs bulk accept too)
  const selectableOrders = useMemo(() => orders, [orders]);
  const allSelected = selectableOrders.length > 0 && selectableOrders.every(o => selectedIds.has(o.id));

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

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableOrders.map(o => o.id)));
    }
  };

  const handleBulkAccept = async (ids: string[]) => {
    setBulkLoading(true);
    try {
      // Split Shopee vs manual orders
      const shopeeIds = ids.filter(id => orders.find(o => o.id === id)?.source === 'shopee');
      const manualIds = ids.filter(id => !shopeeIds.includes(id));

      let successCount = 0;
      const timeSlotQueue: TimeSlotModal[] = [];
      const errors: string[] = [];

      // Process manual orders
      if (manualIds.length > 0) {
        const res = await apiFetch('/api/orders', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bulk_accept', ids: manualIds }),
        });
        if (res.ok) {
          const result = await res.json();
          successCount += result.updated || manualIds.length;
        } else {
          const d = await res.json();
          errors.push(d.error || 'Manual accept failed');
        }
      }

      // Process Shopee orders
      if (shopeeIds.length > 0) {
        const res = await apiFetch('/api/shopee/orders/bulk-ship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_ids: shopeeIds }),
        });
        if (res.ok) {
          const data = await res.json();
          for (const r of data.results || []) {
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
        onRefresh();
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setBulkLoading(false);
      setConfirmModal(null);
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
      onRefresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setBulkLoading(false);
      setConfirmModal(null);
    }
  };

  const [actionLoading, setActionLoading] = useState(false);

  const handlePrintInvoice = async (orderId: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error('Failed to fetch order');
      const result = await res.json();
      const blob = await generateOrderInvoicePdf({ data: result.order });
      const title = result.order.payment_status === 'paid' ? 'ใบเสร็จรับเงิน' : 'ใบแจ้งหนี้';
      showPdfPreview(blob, title);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSingleAcceptShopee = async (orderId: string, pickupTimeId?: string) => {
    setActionLoading(true);
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
          onRefresh();
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
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1 disabled:opacity-50"
          title="กลับมา"
        >
          <Play className="w-3.5 h-3.5" />
          กลับมา
        </button>
      );
    } else {
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
          className="px-4 py-2 text-sm font-medium rounded-lg bg-[#F4511E] text-white hover:bg-[#D63B0E] transition-colors flex items-center gap-1.5 disabled:opacity-50"
          title="รับออเดอร์"
        >
          <Package className="w-4 h-4" />
          รับออเดอร์
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
        onClick: (e) => { e.stopPropagation(); setConfirmModal({ type: 'cancel', ids: [order.id] }); },
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
      {/* Order Cards */}
      <div className="space-y-3">
        {selectableOrders.length > 1 && (
          <div className="flex items-center gap-2 px-4">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-[#F4511E] focus:ring-[#F4511E]"
            />
            <span className="text-xs text-gray-400 dark:text-slate-500">เลือกทั้งหมด</span>
          </div>
        )}
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            statusFilter="ready_to_ship"
            selected={selectedIds.has(order.id)}
            showCheckbox
            onToggleSelect={toggleSelect}
            onImageClick={onImageClick}
            showPaymentStatus
            actions={renderCardActions(order)}
          />
        ))}
      </div>

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
                className="px-4 py-2 text-sm font-medium rounded-lg bg-[#F4511E] text-white hover:bg-[#D63B0E] transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                <Package className="w-4 h-4" />
                รับออเดอร์ ({selectedIds.size})
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
          onClick={() => !actionLoading && (() => { setTimeSlotModal(null); setSelectedTimeSlotId(null); onRefresh(); })()}
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
                    onRefresh();
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
    </>
  );
}

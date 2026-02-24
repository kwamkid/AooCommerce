'use client';

import { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { generateOrderInvoicePdf } from '@/lib/order-invoice-pdf';
import OrderCard from './OrderCard';
import ActionMenu, { ActionItem } from './ActionMenu';
import { Order } from './types';

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
  const [toast, setToast] = useState('');

  // All orders can be bulk-selected (Shopee needs bulk accept too)
  const selectableOrders = useMemo(() => orders, [orders]);
  const allSelected = selectableOrders.length > 0 && selectableOrders.every(o => selectedIds.has(o.id));

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
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_accept', ids }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      const result = await res.json();
      showToast(`กดรับสำเร็จ ${result.updated || ids.length} รายการ`, 'success');
      setSelectedIds(new Set());
      onRefresh();
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
      await generateOrderInvoicePdf({ data: result.order });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const renderCardActions = (order: Order) => {
    const isShopee = order.source === 'shopee';
    const primaryActions: React.ReactNode[] = [];
    const menuItems: ActionItem[] = [];

    // Primary: Accept (manual only)
    if (!isShopee) {
      primaryActions.push(
        <button
          key="accept"
          onClick={(e) => { e.stopPropagation(); onStatusClick(order); }}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#F4511E] text-white hover:bg-[#D63B0E] transition-colors flex items-center gap-1"
          title="ดำเนินการ"
        >
          <Package className="w-3.5 h-3.5" />
          ดำเนินการ
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

    // Menu: Cancel (manual only)
    if (!isShopee) {
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
        {orders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            statusFilter="ready_to_ship"
            selected={selectedIds.has(order.id)}
            showCheckbox
            onToggleSelect={toggleSelect}
            onImageClick={onImageClick}
            showPaymentStatus={order.payment_status !== 'paid'}
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
                กดรับ ({selectedIds.size})
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

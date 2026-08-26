'use client';

import { useState } from 'react';
import { Loader2, CheckCircle, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useRouter } from 'next/navigation';
import { DEALER_ORDER_STATUS_LABEL } from '@/lib/order-status';
import { getBadgeColor } from '@/lib/status-tab-colors';
import StatusBadge from '@/components/ui/StatusBadge';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  new: { label: DEALER_ORDER_STATUS_LABEL.new, cls: `${getBadgeColor('new').bg} ${getBadgeColor('new').color}` },
  ready_to_ship: { label: DEALER_ORDER_STATUS_LABEL.ready_to_ship, cls: `${getBadgeColor('ready_to_ship').bg} ${getBadgeColor('ready_to_ship').color}` },
  processing: { label: DEALER_ORDER_STATUS_LABEL.processing, cls: `${getBadgeColor('processing').bg} ${getBadgeColor('processing').color}` },
  shipping: { label: DEALER_ORDER_STATUS_LABEL.shipping, cls: `${getBadgeColor('shipping').bg} ${getBadgeColor('shipping').color}` },
  completed: { label: DEALER_ORDER_STATUS_LABEL.completed, cls: `${getBadgeColor('completed').bg} ${getBadgeColor('completed').color}` },
  cancelled: { label: DEALER_ORDER_STATUS_LABEL.cancelled, cls: `${getBadgeColor('cancelled').bg} ${getBadgeColor('cancelled').color}` },
};

interface Props {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  backUrl: string;
  onStatusChange: (newStatus: string) => void;
}

export default function OrderStatusBar({ orderId, orderNumber, orderStatus, paymentStatus, backUrl, onStatusChange }: Props) {
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();
  const router = useRouter();
  const [updating, setUpdating] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    setUpdating(true);
    try {
      const res = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, order_status: newStatus }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      onStatusChange(newStatus);
      showToast('อัปเดตสถานะสำเร็จ');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setUpdating(false);
    }
  };

  const handleCancel = async () => {
    const ok = await confirm({ title: 'ยืนยันยกเลิกคำสั่งซื้อ?', variant: 'danger', confirmLabel: 'ยกเลิกออเดอร์' });
    if (!ok) return;
    await handleStatusChange('cancelled');
    router.push(backUrl);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-lg font-bold text-primary">{orderNumber}</span>
        <StatusBadge status={orderStatus} colors={STATUS_LABELS[orderStatus]?.cls || ''}>
          {STATUS_LABELS[orderStatus]?.label || orderStatus}
        </StatusBadge>
        {paymentStatus === 'paid' && (
          <StatusBadge status="paid" payment>ชำระแล้ว</StatusBadge>
        )}
        {paymentStatus === 'pending' && (
          <StatusBadge status="pending" colors="bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400">รอชำระ</StatusBadge>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {(orderStatus === 'new' || orderStatus === 'processing') && (
          <button onClick={() => handleStatusChange('completed')} disabled={updating}
            className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
            {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            จัดส่งแล้ว / เสร็จสิ้น
          </button>
        )}
        {!['completed', 'cancelled'].includes(orderStatus) && (
          <button onClick={handleCancel} disabled={updating}
            className="border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
            <Trash2 className="w-4 h-4" /> ยกเลิกออเดอร์
          </button>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}

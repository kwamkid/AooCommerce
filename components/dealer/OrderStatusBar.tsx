'use client';

import { useState } from 'react';
import { Loader2, CheckCircle, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useRouter } from 'next/navigation';

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  new: { label: 'ใหม่', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  processing: { label: 'กำลังจัดเตรียม', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  shipping: { label: 'จัดส่งแล้ว', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  completed: { label: 'เสร็จสิ้น', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
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
    if (!confirm('ยืนยันยกเลิกคำสั่งซื้อ?')) return;
    await handleStatusChange('cancelled');
    router.push(backUrl);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-lg font-bold text-primary">{orderNumber}</span>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_LABELS[orderStatus]?.cls || ''}`}>
          {STATUS_LABELS[orderStatus]?.label || orderStatus}
        </span>
        {paymentStatus === 'paid' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">ชำระแล้ว</span>
        )}
        {paymentStatus === 'pending' && (
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400">รอชำระ</span>
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
            <X className="w-4 h-4" /> ยกเลิกออเดอร์
          </button>
        )}
      </div>
    </div>
  );
}

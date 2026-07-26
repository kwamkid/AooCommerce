// Path: app/pos/components/PosOrderCard.tsx
'use client';

import { formatPrice } from '@/lib/utils/format';
import { useToast } from '@/lib/toast-context';
import { Eye, Printer, Ban, Loader2, Package, Store, Tag } from 'lucide-react';

const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; headerBg: string; headerText: string }> = {
  completed: { label: 'สำเร็จ', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40', headerBg: 'bg-green-50 dark:bg-green-950/40', headerText: 'text-green-800 dark:text-green-200' },
  cancelled: { label: 'Void', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/40', headerBg: 'bg-gray-50 dark:bg-gray-800/40', headerText: 'text-gray-600 dark:text-gray-300' },
};

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'เงินสด',
  transfer: 'โอน',
  credit_card: 'บัตร',
  promptpay: 'พร้อมเพย์',
  multi: 'หลายช่องทาง',
};

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อกี้';
  if (mins < 60) return `${mins}นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}ชม.ที่แล้ว`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}วันที่แล้ว`;
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export interface PosOrderItem {
  id: string;
  product_name: string;
  variation_label: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  product?: { image: string | null } | null;
}

export interface PosOrder {
  id: string;
  order_number: string;
  receipt_number: string;
  customer_id: string | null;
  total_amount: number;
  discount_amount?: number;
  payment_method: string;
  payment_status: string;
  order_status: string;
  warehouse_id: string | null;
  warehouse: { id: string; name: string } | null;
  pos_session?: { terminal: { id: string; name: string } | null } | null;
  created_at: string;
  created_by: string | null;
  customer: { id: string; name: string; customer_code: string; phone: string | null } | null;
  items: PosOrderItem[];
}

interface PosOrderCardProps {
  order: PosOrder;
  onViewReceipt: (orderId: string) => void;
  onVoid: (orderId: string) => void;
  voidingId: string | null;
  /** Whether the current user may void (pos.manage). Hides the button otherwise. */
  canVoid: boolean;
}

export default function PosOrderCard({ order, onViewReceipt, onVoid, voidingId, canVoid }: PosOrderCardProps) {
  const { showToast } = useToast();
  const statusCfg = ORDER_STATUS_CONFIG[order.order_status] || ORDER_STATUS_CONFIG.completed;
  const customerName = order.customer?.name || 'ลูกค้าทั่วไป';
  const isVoided = order.order_status === 'cancelled';
  const items = order.items || [];
  const previewItems = items.slice(0, 3);
  const remainingCount = items.length - 3;
  const hasDiscount = Number(order.discount_amount || 0) > 0;

  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl border transition-all overflow-hidden ${
      isVoided
        ? 'border-gray-200 dark:border-slate-700 opacity-60'
        : 'border-gray-200 dark:border-slate-700 hover:border-primary/40 dark:hover:border-primary/40 hover:shadow-md'
    }`}>
      {/* Header bar */}
      <div className={`px-4 py-2.5 ${statusCfg.headerBg}`}>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`id-text-clickable ${statusCfg.headerText}`}
            onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(order.receipt_number).then(() => showToast('คัดลอกเลขที่ใบเสร็จแล้ว')); }}
            title="คัดลอกเลขที่ใบเสร็จ"
          >
            {order.receipt_number}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusCfg.bg} ${statusCfg.color}`}>
            {statusCfg.label}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
            {PAYMENT_LABELS[order.payment_method] || order.payment_method || 'เงินสด'}
          </span>
          {hasDiscount && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300 flex items-center gap-0.5">
              <Tag className="w-3 h-3" />
              -฿{formatPrice(order.discount_amount!)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            {order.pos_session?.terminal && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300 flex items-center gap-1">
                <Store className="w-3 h-3" />
                {order.pos_session.terminal.name}
              </span>
            )}
            <span className="data-timestamp text-gray-400 dark:text-slate-500">
              {new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>

      {/* Body — 2 columns: items left, info+actions right */}
      <div className="flex">
        {/* Left: items preview */}
        <div className="flex-1 min-w-0 py-3">
          <div className="px-4 space-y-1.5">
            {previewItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-slate-700 overflow-hidden flex-shrink-0 flex items-center justify-center">
                  {item.product?.image ? (
                    <img src={item.product.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-4 h-4 text-gray-300 dark:text-slate-500" />
                  )}
                </div>
                <p className="data-primary text-gray-900 dark:text-slate-100 line-clamp-1 flex-1 min-w-0">
                  {item.product_name}
                  {item.variation_label && (
                    <span className="data-muted text-gray-400 dark:text-slate-500"> ({item.variation_label})</span>
                  )}
                </p>
                <span className="data-number-muted text-gray-500 dark:text-slate-400 flex-shrink-0">x{item.quantity}</span>
              </div>
            ))}
            {remainingCount > 0 && (
              <p className="data-muted text-gray-400 dark:text-slate-500 pl-[46px]">
                + อีก {remainingCount} รายการ
              </p>
            )}
          </div>
        </div>

        {/* Right: customer + total + actions */}
        <div className="w-48 flex-shrink-0 py-3 px-4 flex flex-col justify-center items-end gap-1.5 border-l border-gray-100 dark:border-slate-700/50">
          <span className="data-text text-gray-700 dark:text-slate-300 truncate max-w-full">
            {customerName}
          </span>
          <span className="data-number text-gray-900 dark:text-white text-xl font-bold">
            ฿{formatPrice(order.total_amount)}
          </span>
          {/* Actions */}
          <div className="flex items-center gap-1 mt-0.5">
            <button
              onClick={() => onViewReceipt(order.id)}
              className="p-1.5 text-gray-400 hover:text-primary transition-colors"
              title="ดูใบเสร็จ"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              onClick={() => onViewReceipt(order.id)}
              className="p-1.5 text-gray-400 hover:text-primary transition-colors"
              title="พิมพ์"
            >
              <Printer className="w-4 h-4" />
            </button>
            {canVoid && order.order_status === 'completed' && (
              <button
                onClick={() => onVoid(order.id)}
                disabled={voidingId === order.id}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                title="Void"
              >
                {voidingId === order.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Ban className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

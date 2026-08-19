'use client';

import { formatPrice } from '@/lib/utils/format';
import { useCopy } from '@/lib/useCopy';
import { useToast } from '@/lib/toast-context';
import {
  Phone,
  Clock,
  Package,
  Truck,
} from 'lucide-react';
import {
  Order,
  ORDER_STATUS_CONFIG,
  PAYMENT_STATUS_CONFIG,
  PLATFORM_ICONS,
  relativeTime,
  getDeadlineInfo,
  getCarrierLabel,
} from './types';
import PrintStatusDots from './PrintStatusDots';

// Channel badge
function ChannelBadge({ channel }: { channel: Order['channel'] }) {
  if (!channel) return null;
  const platformIcon = PLATFORM_ICONS[channel.platform];

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="relative">
        {channel.picture_url ? (
          <img src={channel.picture_url} alt="" className="w-6 h-6 rounded-full object-cover" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
            {platformIcon && <img src={platformIcon} alt="" className="w-3.5 h-3.5" />}
          </div>
        )}
        {channel.picture_url && platformIcon && (
          <img src={platformIcon} alt="" className="absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded bg-white dark:bg-slate-800 p-[1px]" />
        )}
      </div>
    </div>
  );
}

interface OrderCardProps {
  order: Order;
  statusFilter: string;
  selected?: boolean;
  showCheckbox?: boolean;
  onToggleSelect?: (id: string) => void;
  onImageClick?: (url: string) => void;
  actions?: React.ReactNode;
  /** Show order status badge */
  showOrderStatus?: boolean;
  /** Show payment status badge */
  showPaymentStatus?: boolean;
}

export default function OrderCard({
  order,
  statusFilter,
  selected,
  showCheckbox,
  onToggleSelect,
  onImageClick,
  actions,
  showOrderStatus,
  showPaymentStatus,
}: OrderCardProps) {
  const { showToast } = useToast();
  const copy = useCopy();
  const deadline = getDeadlineInfo(order.delivery_date);
  const customerName = order.customer_name || order.delivery_name || 'ลูกค้าทั่วไป';
  const customerPhone = order.customer_phone || order.delivery_phone;
  const orderStatusCfg = ORDER_STATUS_CONFIG[order.order_status] || ORDER_STATUS_CONFIG.new;
  const paymentStatusCfg = PAYMENT_STATUS_CONFIG[order.payment_status] || PAYMENT_STATUS_CONFIG.pending;

  // On hold indicator
  const isOnHold = order.fulfillment_status === 'on_hold';

  // Show status badge only if not on same-status tab (or if showOrderStatus explicitly set)
  const shouldShowStatus = showOrderStatus || order.order_status !== statusFilter;

  return (
    <div
      onClick={() => window.open(`/orders/${order.id}`, '_blank')}
      className={`bg-white dark:bg-slate-800 rounded-xl border transition-all cursor-pointer overflow-hidden ${
        selected
          ? 'border-primary ring-1 ring-primary/30'
          : isOnHold
          ? 'border-gray-300 dark:border-slate-600 opacity-70'
          : 'border-gray-200 dark:border-slate-700 hover:border-primary/40 dark:hover:border-primary/40 hover:shadow-md'
      }`}
    >
      {/* ── Header bar ── colored by order status, click to toggle checkbox */}
      <div
        className={`flex items-start gap-2 px-4 py-2 ${orderStatusCfg.headerBg}`}
        onClick={(e) => {
          if (showCheckbox && onToggleSelect) {
            e.stopPropagation();
            onToggleSelect(order.id);
          }
        }}
      >
        {/* Left side: 2 rows — line 1: order info, line 2: badges */}
        <div className="flex-1 min-w-0">
          {/* Line 1: order info */}
          <div className="flex items-center gap-2">
            {showCheckbox && (
              <div className="flex-shrink-0 -ml-0.5">
                <input
                  type="checkbox"
                  checked={selected || false}
                  readOnly
                  className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-primary focus:ring-primary pointer-events-none"
                />
              </div>
            )}
            <ChannelBadge channel={order.channel} />
            <span
              className={`id-text-clickable ${orderStatusCfg.headerText} truncate`}
              onClick={(e) => { e.stopPropagation(); copy(order.order_number, 'เลขคำสั่งซื้อ'); }}
              title="คัดลอกเลขคำสั่งซื้อ"
            >{order.order_number}</span>
            {order.source === 'pos' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400 flex-shrink-0">POS</span>
            )}
            {(order.flow_type === 'w_cash') && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 flex-shrink-0">ขายส่ง</span>
            )}
            {order.flow_type === 'w_credit' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex-shrink-0">เครดิต</span>
            )}
            {order.flow_type === 'c_consign' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 flex-shrink-0">ฝากขาย</span>
            )}
            {(order.flow_type === 'd_department' || order.flow_type === 'd_statement') && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 flex-shrink-0">ห้าง</span>
            )}
            {isOnHold && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400 flex-shrink-0">พักไว้</span>
            )}
          </div>
          {/* Line 2: time + badges */}
          <div className="flex items-center flex-wrap gap-1.5 mt-1">
            <span className="data-timestamp text-gray-400 dark:text-slate-500 flex-shrink-0">
              {relativeTime(order.created_at)}
            </span>
            {deadline && ['ready_to_ship', 'processing'].includes(order.order_status) && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-0.5 flex-shrink-0 ${deadline.color}`}>
                <Clock className="w-3 h-3" />
                {deadline.label}
              </span>
            )}
            {shouldShowStatus && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                order.cancellation_reason === 'expired'
                  ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                  : `${orderStatusCfg.bg} ${orderStatusCfg.color}`
              }`}>
                {order.cancellation_reason === 'expired' ? 'หมดอายุ' : orderStatusCfg.label}
              </span>
            )}
            {showPaymentStatus && order.order_status !== 'cancelled' && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${paymentStatusCfg.bg} ${paymentStatusCfg.color}`}>
                {paymentStatusCfg.label}
              </span>
            )}
            {showPaymentStatus && order.payment_status === 'verifying' && order.last_transfer_date && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300">
                โอน {new Date(order.last_transfer_date + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                {order.last_transfer_time ? ` ${order.last_transfer_time.slice(0, 5)}` : ''}
              </span>
            )}
            {order.is_split && order.parcel_count && order.parcel_count > 1 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 flex items-center gap-1">
                <Package className="w-3 h-3" />
                {order.parcel_count} กล่อง
              </span>
            )}
          </div>
        </div>

        {/* Right side: carrier + print dots — stacked, pinned right */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {['processing', 'shipping', 'completed'].includes(order.order_status) && (
            <PrintStatusDots
              printedLabelAt={order.printed_label_at}
              printedPackingAt={order.printed_packing_at}
              printedInvoiceAt={order.printed_invoice_at}
            />
          )}
          {order.shipping_carrier && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 flex items-center gap-1">
              <Truck className="w-3 h-3" />
              {getCarrierLabel(order.shipping_carrier)}
            </span>
          )}
        </div>
      </div>

      {/* ── Body ── 2-column: items left, customer/total/actions right */}
      <div className="flex">
        {/* Left column: items */}
        <div className="flex-[7] min-w-0 py-3">
          <div className="px-4 space-y-2">
            {(order.items_preview || []).map((item, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <div
                  className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-slate-700 overflow-hidden flex-shrink-0"
                  onClick={item.image ? (e) => { e.stopPropagation(); onImageClick?.(item.image!); } : undefined}
                  style={item.image ? { cursor: 'zoom-in' } : undefined}
                >
                  {item.image ? (
                    <img src={item.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-5 h-5 text-gray-300 dark:text-slate-500" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1.5">
                    <p className="data-primary text-gray-900 dark:text-slate-100 text-base line-clamp-2 min-w-0">
                      {item.product_name}
                      {item.variation_label && (
                        <span className="data-muted text-gray-400 dark:text-slate-500"> ({item.variation_label})</span>
                      )}
                    </p>
                    <span className="data-number-muted text-gray-500 dark:text-slate-400 text-base flex-shrink-0">x{item.quantity}</span>
                  </div>
                  {item.subtitle && (
                    <p className="data-secondary text-gray-500 dark:text-slate-400 mt-0.5 truncate">{item.subtitle}</p>
                  )}
                </div>
              </div>
            ))}
            {(order.item_line_count || 0) > 3 && (
              <p className="data-muted text-gray-400 dark:text-slate-500 text-sm pl-[60px]">
                + อีก {order.item_line_count - 3} รายการ
              </p>
            )}
          </div>

          {/* Tracking number (if exists, show below items) */}
          {order.tracking_number && (
            <div className="px-4 pt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
              <span
                className="code-text bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                onClick={(e) => { e.stopPropagation(); copy(order.tracking_number!, 'เลขพัสดุ'); }}
                title="คัดลอกเลขพัสดุ"
              >
                {order.tracking_number}
              </span>
            </div>
          )}
        </div>

        {/* Right column: customer / total / actions */}
        <div className="flex-[3] py-3 px-4 flex flex-col justify-center items-end gap-2">
          {/* Customer */}
          <div className="flex items-center gap-1.5 min-w-0">
            {order.customer_picture_url ? (
              <img src={order.customer_picture_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
            ) : null}
            <span className="data-text text-gray-700 dark:text-slate-300 truncate max-w-[80px] sm:max-w-none">{customerName}</span>
            {customerPhone && (
              <a
                href={`tel:${customerPhone}`}
                onClick={(e) => e.stopPropagation()}
                className="text-gray-400 hover:text-emerald-500 transition-colors flex-shrink-0"
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          {/* Total */}
          <span className="data-number text-gray-900 dark:text-white text-lg">
            ฿{formatPrice(order.total_amount)}
          </span>

          {/* Actions */}
          {actions && (
            <div className="flex items-center gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { formatPrice } from '@/lib/utils/format';
import {
  Phone,
  AlertTriangle,
  Clock,
  Package,
  Truck,
} from 'lucide-react';
import {
  Order,
  ORDER_STATUS_CONFIG,
  PAYMENT_STATUS_CONFIG,
  PLATFORM_ICONS,
  SHIPPING_CARRIERS,
  relativeTime,
  getDeadlineInfo,
} from './types';

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
  const deadline = getDeadlineInfo(order.delivery_date);
  const showUrgentStrip = deadline?.urgent && ['ready_to_ship', 'processing'].includes(order.order_status);
  const customerName = order.customer_name || order.delivery_name || 'ลูกค้าทั่วไป';
  const customerPhone = order.customer_phone || order.delivery_phone;
  const orderStatusCfg = ORDER_STATUS_CONFIG[order.order_status] || ORDER_STATUS_CONFIG.new;
  const paymentStatusCfg = PAYMENT_STATUS_CONFIG[order.payment_status] || PAYMENT_STATUS_CONFIG.pending;

  // On hold indicator
  const isOnHold = order.fulfillment_status === 'on_hold';

  return (
    <div
      onClick={() => window.open(`/orders/${order.id}`, '_blank')}
      className={`bg-white dark:bg-slate-800 rounded-xl border transition-all cursor-pointer overflow-hidden ${
        selected
          ? 'border-[#F4511E] ring-1 ring-[#F4511E]/30'
          : isOnHold
          ? 'border-gray-300 dark:border-slate-600 opacity-70'
          : 'border-gray-200 dark:border-slate-700 hover:border-[#F4511E]/40 dark:hover:border-[#F4511E]/40 hover:shadow-md'
      }`}
    >
      {/* Urgency strip */}
      {showUrgentStrip && deadline && (
        <div className={`px-4 py-1.5 flex items-center gap-1.5 text-xs font-medium ${deadline.color}`}>
          <AlertTriangle className="w-3.5 h-3.5" />
          {deadline.label}
        </div>
      )}

      {/* 2-column layout with optional checkbox */}
      <div className="flex">
        {/* Checkbox */}
        {showCheckbox && (
          <div
            className="flex items-center justify-center pl-3 pr-1 flex-shrink-0 min-w-[44px] cursor-pointer"
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleSelect?.(order.id); }}
          >
            <input
              type="checkbox"
              checked={selected || false}
              readOnly
              className="w-4 h-4 rounded border-gray-300 dark:border-slate-500 text-[#F4511E] focus:ring-[#F4511E] pointer-events-none"
            />
          </div>
        )}

        {/* Left column */}
        <div className="flex-[7] min-w-0 py-3">
          {/* Header: channel + order ID + date */}
          <div className="px-4 pb-2 flex items-center gap-2">
            <ChannelBadge channel={order.channel} />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">{order.order_number}</span>
            {order.source === 'pos' && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">POS</span>
            )}
            {isOnHold && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">พักไว้</span>
            )}
            <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">
              {relativeTime(order.created_at)}
            </span>
            {!showUrgentStrip && deadline && ['ready_to_ship', 'processing', 'shipping'].includes(order.order_status) && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-0.5 flex-shrink-0 ${deadline.color}`}>
                <Clock className="w-3 h-3" />
                {deadline.label}
              </span>
            )}
          </div>

          {/* Items preview */}
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
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-base text-gray-800 dark:text-slate-200 truncate min-w-0">
                      {item.product_name}
                      {item.variation_label && (
                        <span className="text-gray-400 dark:text-slate-500"> ({item.variation_label})</span>
                      )}
                    </p>
                    <span className="text-base text-gray-500 dark:text-slate-400 flex-shrink-0">x{item.quantity}</span>
                  </div>
                  {item.subtitle && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate">{item.subtitle}</p>
                  )}
                </div>
              </div>
            ))}
            {(order.item_line_count || 0) > 3 && (
              <p className="text-sm text-gray-400 dark:text-slate-500 pl-[60px]">
                + อีก {order.item_line_count - 3} รายการ
              </p>
            )}
          </div>

          {/* Tracking info */}
          {(order.tracking_number || order.shipping_carrier) && (
            <div className="px-4 pt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
              <Truck className="w-3.5 h-3.5 flex-shrink-0" />
              {order.shipping_carrier && (
                <span className="font-medium">
                  {SHIPPING_CARRIERS.find(c => c.value === order.shipping_carrier)?.label || order.shipping_carrier}
                </span>
              )}
              {order.tracking_number && (
                <span className="font-mono bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-[11px]">
                  {order.tracking_number}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right column: customer / total / status + actions */}
        <div className="flex-[3] py-3 px-4 flex flex-col justify-center items-end gap-2">
          {/* Customer */}
          <div className="flex items-center gap-1.5 min-w-0">
            {order.customer_picture_url ? (
              <img src={order.customer_picture_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
            ) : null}
            <span className="text-sm text-gray-700 dark:text-slate-300 truncate max-w-[80px] sm:max-w-none">{customerName}</span>
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
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            ฿{formatPrice(order.total_amount)}
          </span>

          {/* Badges + Actions */}
          <div className="flex items-center gap-1.5 flex-nowrap justify-end">
            {showOrderStatus && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${orderStatusCfg.bg} ${orderStatusCfg.color}`}>
                {orderStatusCfg.label}
              </span>
            )}

            {showPaymentStatus && order.order_status !== 'cancelled' && (
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${paymentStatusCfg.bg} ${paymentStatusCfg.color}`}>
                {paymentStatusCfg.label}
              </span>
            )}

            {actions && (
              <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

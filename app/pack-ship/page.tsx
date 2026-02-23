'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { getImageUrl } from '@/lib/utils/image';
import {
  Package,
  PackageCheck,
  Loader2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Pause,
  Play,
  Printer,
  ShoppingBag,
  Truck,
  X,
  MessageSquare,
  Star,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────

interface OrderItem {
  id: string;
  product_name: string;
  variation_label: string | null;
  product_code: string;
  quantity: number;
  unit_price: number;
  image: string | null;
}

interface Channel {
  platform: string;
  account_name: string;
  picture_url: string | null;
}

interface PackShipOrder {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  fulfillment_status: string;
  hold_reason: string | null;
  source: string;
  external_order_sn: string | null;
  external_status: string | null;
  delivery_date: string | null;
  delivery_name: string | null;
  delivery_phone: string | null;
  delivery_address: string | null;
  delivery_district: string | null;
  delivery_amphoe: string | null;
  delivery_province: string | null;
  delivery_postal_code: string | null;
  notes: string | null;
  internal_notes: string | null;
  total_amount: number;
  shipping_fee: number;
  created_at: string;
  packed_at: string | null;
  shipped_at: string | null;
  shipping_carrier: string | null;
  channel: Channel | null;
  customer: { id: string; name: string; contact_person: string | null; phone: string | null } | null;
  items: OrderItem[];
}

interface ProductSummary {
  productName: string;
  productCode: string;
  variationLabel: string | null;
  totalQuantity: number;
  image: string | null;
}

interface TimeSlot {
  pickup_time_id: string;
  date: number;
  display: string;
  recommended: boolean;
}

interface BulkShipResult {
  order_id: string;
  order_sn: string;
  success: boolean;
  error?: string;
  needs_time_slot?: boolean;
  time_slots?: TimeSlot[];
}

type ChannelTab = 'all' | 'shopee' | 'manual' | 'summary';
type UrgencyGroup = 'overdue' | 'today' | 'ready' | 'waiting';

// ─── Constants ───────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, string> = {
  line: '/social/line_oa.svg',
  facebook: '/social/facebook.svg',
  instagram: '/social/instagram.svg',
  shopee: '/marketplace/shopee.svg',
};

const URGENCY_CONFIG: Record<UrgencyGroup, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
  overdue: { label: 'ค้าง / มีปัญหา', color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-50 dark:bg-red-900/20', icon: <AlertTriangle className="w-5 h-5" /> },
  today: { label: 'ต้องส่งวันนี้', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-900/20', icon: <Clock className="w-5 h-5" /> },
  ready: { label: 'เตรียมแพ็คได้', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-900/20', icon: <Package className="w-5 h-5" /> },
  waiting: { label: 'รอชำระเงิน', color: 'text-gray-500 dark:text-gray-400', bgColor: 'bg-gray-50 dark:bg-gray-800', icon: <Pause className="w-5 h-5" /> },
};

// ─── Helpers ─────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชม.ที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

function classifyOrder(order: PackShipOrder): UrgencyGroup {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  if (order.fulfillment_status === 'on_hold') return 'overdue';
  if (order.delivery_date && order.delivery_date < today && order.fulfillment_status === 'pending') return 'overdue';
  if (['pending', 'verifying'].includes(order.payment_status)) return 'waiting';
  if (order.source === 'shopee' && order.external_status === 'UNPAID') return 'waiting';
  if (order.source === 'shopee' && ['READY_TO_SHIP', 'PROCESSED'].includes(order.external_status || '')) return 'today';

  if (order.payment_status === 'paid') {
    if (!order.delivery_date || order.delivery_date === today) return 'today';
    if (order.delivery_date === tomorrow) return 'ready';
  }

  return 'today';
}

// ─── Channel Badge (reuse same pattern as orders page) ───────────────

function ChannelBadge({ channel }: { channel: Channel | null }) {
  if (!channel) return null;
  const platformIcon = PLATFORM_ICONS[channel.platform];

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-shrink-0">
        {channel.picture_url ? (
          <img src={channel.picture_url} alt={channel.account_name} className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
            {platformIcon && <img src={platformIcon} alt={channel.platform} className="w-4 h-4" />}
          </div>
        )}
        {channel.picture_url && platformIcon && (
          <img src={platformIcon} alt={channel.platform} className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded bg-white dark:bg-slate-800 p-[1px]" />
        )}
      </div>
      <span className="text-sm text-gray-700 dark:text-slate-300 truncate max-w-[120px]">
        {channel.account_name}
      </span>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────

export default function PackShipPage() {
  const { session, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [orders, setOrders] = useState<PackShipOrder[]>([]);
  const [productSummary, setProductSummary] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<ChannelTab>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [collapsedSections, setCollapsedSections] = useState<Set<UrgencyGroup>>(new Set(['waiting']));

  // Modals
  const [holdModal, setHoldModal] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [holdReason, setHoldReason] = useState('');
  const [timeSlotModal, setTimeSlotModal] = useState<{ orders: BulkShipResult[] } | null>(null);
  const [selectedTimeSlots, setSelectedTimeSlots] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);

  const isAuthReady = !authLoading && !!session?.access_token;

  // ─── Data Fetching ─────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/pack-ship');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setOrders(data.orders || []);
      setProductSummary(data.productSummary || []);
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!isAuthReady) return;
    fetchData();
  }, [isAuthReady, fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    setSelectedIds(new Set());
    fetchData();
  };

  // ─── Filtered & Grouped Orders ─────────────────────────────────────

  const filteredOrders = useMemo(() => {
    if (activeTab === 'all' || activeTab === 'summary') return orders;
    if (activeTab === 'shopee') return orders.filter(o => o.source === 'shopee');
    if (activeTab === 'manual') return orders.filter(o => o.source !== 'shopee');
    return orders;
  }, [orders, activeTab]);

  const groupedOrders = useMemo(() => {
    const groups: Record<UrgencyGroup, PackShipOrder[]> = { overdue: [], today: [], ready: [], waiting: [] };
    for (const order of filteredOrders) {
      groups[classifyOrder(order)].push(order);
    }
    return groups;
  }, [filteredOrders]);

  const channelCounts = useMemo(() => ({
    all: orders.length,
    shopee: orders.filter(o => o.source === 'shopee').length,
    manual: orders.filter(o => o.source !== 'shopee').length,
  }), [orders]);

  // ─── Selection ─────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedOrders = useMemo(() => orders.filter(o => selectedIds.has(o.id)), [orders, selectedIds]);
  const selectedShopeeReadyToShip = selectedOrders.filter(o => o.source === 'shopee' && o.external_status === 'READY_TO_SHIP');
  const selectedShopeeProcessed = selectedOrders.filter(o => o.source === 'shopee' && o.external_status === 'PROCESSED');
  const selectedPackable = selectedOrders.filter(o => o.fulfillment_status === 'pending' && (o.source !== 'shopee' || o.external_status === 'PROCESSED'));
  const selectedShippable = selectedOrders.filter(o => o.fulfillment_status === 'packed');

  // ─── Actions ───────────────────────────────────────────────────────

  const handleFulfillmentAction = async (orderId: string, action: 'pack' | 'ship' | 'hold' | 'unhold', reason?: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetch('/api/pack-ship', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, action, hold_reason: reason }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      showToast(action === 'pack' ? 'แพ็คเสร็จแล้ว' : action === 'ship' ? 'จัดส่งแล้ว' : action === 'hold' ? 'พักไว้แล้ว' : 'ปลดการพักแล้ว', 'success');
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally { setActionLoading(false); setHoldModal(null); setHoldReason(''); }
  };

  const handleBulkPack = async () => {
    setActionLoading(true);
    try {
      for (const order of selectedPackable) {
        await apiFetch('/api/pack-ship', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: order.id, action: 'pack' }) });
      }
      showToast(`แพ็คเสร็จ ${selectedPackable.length} รายการ`, 'success');
      setSelectedIds(new Set()); fetchData();
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); } finally { setActionLoading(false); }
  };

  const handleBulkShip = async () => {
    setActionLoading(true);
    try {
      for (const order of selectedShippable) {
        await apiFetch('/api/pack-ship', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: order.id, action: 'ship' }) });
      }
      showToast(`จัดส่งแล้ว ${selectedShippable.length} รายการ`, 'success');
      setSelectedIds(new Set()); fetchData();
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); } finally { setActionLoading(false); }
  };

  const handleBulkAcceptShopee = async () => {
    setActionLoading(true);
    try {
      const res = await apiFetch('/api/shopee/orders/bulk-ship', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_ids: selectedShopeeReadyToShip.map(o => o.id) }) });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const results: BulkShipResult[] = data.results || [];
      const successCount = results.filter(r => r.success).length;
      const needsTimeSlot = results.filter(r => r.needs_time_slot);
      const errors = results.filter(r => !r.success && !r.needs_time_slot);

      if (successCount > 0) showToast(`รับออเดอร์สำเร็จ ${successCount} รายการ`, 'success');
      if (errors.length > 0) showToast(`${errors.length} รายการไม่สำเร็จ`, 'error');

      if (needsTimeSlot.length > 0) {
        const defaultSlots: Record<string, string> = {};
        for (const r of needsTimeSlot) {
          const rec = r.time_slots?.find(s => s.recommended);
          defaultSlots[r.order_id] = rec?.pickup_time_id || r.time_slots?.[0]?.pickup_time_id || '';
        }
        setSelectedTimeSlots(defaultSlots);
        setTimeSlotModal({ orders: needsTimeSlot });
      }
      setSelectedIds(new Set()); fetchData();
    } catch { showToast('เกิดข้อผิดพลาดในการรับออเดอร์', 'error'); } finally { setActionLoading(false); }
  };

  const handleConfirmTimeSlots = async () => {
    if (!timeSlotModal) return;
    setActionLoading(true);
    try {
      let successCount = 0;
      for (const result of timeSlotModal.orders) {
        const timeId = selectedTimeSlots[result.order_id];
        if (!timeId) continue;
        const res = await apiFetch('/api/shopee/orders/ship', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: result.order_id, pickup_time_id: timeId }) });
        if (res.ok) successCount++;
      }
      if (successCount > 0) showToast(`รับออเดอร์ส่งด่วนสำเร็จ ${successCount} รายการ`, 'success');
      setTimeSlotModal(null); setSelectedTimeSlots({}); fetchData();
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); } finally { setActionLoading(false); }
  };

  const handleBulkPrintLabels = async () => {
    setActionLoading(true);
    try {
      const res = await apiFetch('/api/shopee/orders/bulk-shipping-document', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_ids: selectedShopeeProcessed.map(o => o.id) }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), '_blank');
      showToast('เปิด PDF ใบปะหน้าแล้ว', 'success');
    } catch (err) { showToast(err instanceof Error ? err.message : 'พิมพ์ใบปะหน้าไม่สำเร็จ', 'error'); } finally { setActionLoading(false); }
  };

  const handleSingleAcceptShopee = async (orderId: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetch('/api/shopee/orders/bulk-ship', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_ids: [orderId] }) });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const r: BulkShipResult | undefined = data.results?.[0];
      if (r?.success) { showToast('รับออเดอร์สำเร็จ', 'success'); }
      else if (r?.needs_time_slot) {
        const defaultSlots: Record<string, string> = {};
        const rec = r.time_slots?.find(s => s.recommended);
        defaultSlots[r.order_id] = rec?.pickup_time_id || r.time_slots?.[0]?.pickup_time_id || '';
        setSelectedTimeSlots(defaultSlots);
        setTimeSlotModal({ orders: [r] });
      } else { showToast(r?.error || 'รับออเดอร์ไม่สำเร็จ', 'error'); }
      fetchData();
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); } finally { setActionLoading(false); }
  };

  const handleSinglePrintLabel = async (orderId: string) => {
    setActionLoading(true);
    try {
      const res = await apiFetch('/api/shopee/orders/shipping-document', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      window.open(URL.createObjectURL(await res.blob()), '_blank');
    } catch (err) { showToast(err instanceof Error ? err.message : 'พิมพ์ใบปะหน้าไม่สำเร็จ', 'error'); } finally { setActionLoading(false); }
  };

  // ─── Render Helpers ────────────────────────────────────────────────

  const toggleSection = (group: UrgencyGroup) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  };

  const renderOrderCard = (order: PackShipOrder) => {
    const isSelected = selectedIds.has(order.id);
    const customerName = order.customer?.contact_person || order.customer?.name || order.delivery_name || '-';
    const phone = order.customer?.phone || order.delivery_phone || '';
    const isShopee = order.source === 'shopee';
    const isHold = order.fulfillment_status === 'on_hold';
    const isPacked = order.fulfillment_status === 'packed';

    return (
      <div
        key={order.id}
        className={`border rounded-xl bg-white dark:bg-slate-800 transition-all ${
          isSelected ? 'border-blue-400 ring-2 ring-blue-200 dark:ring-blue-800' : 'border-gray-200 dark:border-slate-700'
        } ${isHold ? 'opacity-75' : ''}`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-4 pb-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggleSelect(order.id)}
            className="mt-1.5 w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-base">{order.order_number}</span>
              <span className="text-sm text-gray-400">{timeAgo(order.created_at)}</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {customerName}
              {phone && <span className="text-gray-400 ml-2">{phone}</span>}
            </div>
            {/* Channel badge (shop name + logo) */}
            {order.channel && (
              <div className="mt-1.5">
                <ChannelBadge channel={order.channel} />
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
          {order.items.slice(0, 4).map((item, idx) => (
            <div key={idx} className="flex items-center gap-2.5 py-1">
              {item.image ? (
                <img src={getImageUrl(item.image)} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex-shrink-0" />
              )}
              <span className="text-sm truncate flex-1">
                {item.product_name}
                {item.variation_label && <span className="text-gray-400 ml-1">({item.variation_label})</span>}
              </span>
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex-shrink-0">x{item.quantity}</span>
            </div>
          ))}
          {order.items.length > 4 && (
            <div className="text-xs text-gray-400 mt-1">+ อีก {order.items.length - 4} รายการ</div>
          )}
        </div>

        {/* Address + Notes */}
        {(order.delivery_province || order.notes || (isHold && order.hold_reason)) && (
          <div className="px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 text-sm text-gray-500 dark:text-gray-400 space-y-1">
            {order.delivery_province && (
              <div className="truncate">
                {[order.delivery_amphoe, order.delivery_province, order.delivery_postal_code].filter(Boolean).join(' ')}
              </div>
            )}
            {order.notes && (
              <div className="flex items-start gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span className="truncate">&quot;{order.notes}&quot;</span>
              </div>
            )}
            {isHold && order.hold_reason && (
              <div className="flex items-start gap-1.5 text-red-500">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>พักไว้: {order.hold_reason}</span>
              </div>
            )}
          </div>
        )}

        {/* Status badges + Carrier */}
        {(isShopee || order.shipping_carrier || isPacked) && (
          <div className="px-4 py-2 border-t border-gray-100 dark:border-slate-700 flex items-center gap-2 flex-wrap text-sm">
            {isShopee && order.external_status && (
              <span className={`px-2.5 py-1 rounded-full font-medium ${
                order.external_status === 'READY_TO_SHIP' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                : order.external_status === 'PROCESSED' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                : 'bg-gray-100 text-gray-600'
              }`}>
                {order.external_status}
              </span>
            )}
            {order.shipping_carrier && (
              <span className="text-gray-400">{order.shipping_carrier}</span>
            )}
            {isPacked && (
              <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 font-medium">
                แพ็คแล้ว
              </span>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700 flex items-center gap-2 flex-wrap">
          {isHold ? (
            <button
              onClick={() => handleFulfillmentAction(order.id, 'unhold')}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Play className="w-4 h-4" /> กลับมาแพ็ค
            </button>
          ) : isPacked ? (
            <button
              onClick={() => handleFulfillmentAction(order.id, 'ship')}
              disabled={actionLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Truck className="w-4 h-4" /> จัดส่งแล้ว
            </button>
          ) : (
            <>
              {isShopee && order.external_status === 'READY_TO_SHIP' && (
                <button
                  onClick={() => handleSingleAcceptShopee(order.id)}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ShoppingBag className="w-4 h-4" /> รับออเดอร์
                </button>
              )}
              {isShopee && order.external_status === 'PROCESSED' && (
                <button
                  onClick={() => handleSinglePrintLabel(order.id)}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> ใบปะหน้า
                </button>
              )}
              {(!isShopee || order.external_status === 'PROCESSED') && (
                <button
                  onClick={() => handleFulfillmentAction(order.id, 'pack')}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> แพ็คเสร็จ
                </button>
              )}
              <button
                onClick={() => setHoldModal({ orderId: order.id, orderNumber: order.order_number })}
                disabled={actionLoading}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Pause className="w-4 h-4" /> พักไว้
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderUrgencySection = (group: UrgencyGroup) => {
    const sectionOrders = groupedOrders[group];
    if (sectionOrders.length === 0) return null;
    const config = URGENCY_CONFIG[group];
    const isCollapsed = collapsedSections.has(group);

    return (
      <div key={group} className="mb-6">
        <button
          onClick={() => toggleSection(group)}
          className={`w-full flex items-center gap-2 px-4 py-3 rounded-lg ${config.bgColor} ${config.color} text-base font-semibold`}
        >
          {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          {config.icon}
          <span>{config.label}</span>
          <span className="ml-auto bg-white/60 dark:bg-black/20 px-2.5 py-0.5 rounded-full text-sm font-bold">{sectionOrders.length}</span>
        </button>
        {!isCollapsed && (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sectionOrders.map(renderOrderCard)}
          </div>
        )}
      </div>
    );
  };

  const renderProductSummary = () => (
    <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">#</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สินค้า</th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-28">จำนวน</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
          {productSummary.map((product, index) => (
            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
              <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  {product.image ? (
                    <img src={getImageUrl(product.image)} alt="" className="w-10 h-10 rounded-lg object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                      <Package className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium">{product.productName}</div>
                    {product.variationLabel && <div className="text-xs text-gray-400">{product.variationLabel}</div>}
                    {product.productCode && <div className="text-xs text-gray-400">{product.productCode}</div>}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-3 py-1 rounded-full">
                  <span className="text-lg font-bold">{product.totalQuantity}</span>
                  <span className="text-xs">ชิ้น</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900">
            <td colSpan={2} className="px-4 py-3 text-sm font-medium">{productSummary.length} รายการ</td>
            <td className="px-4 py-3 text-right text-sm font-bold">
              รวม {productSummary.reduce((sum, p) => sum + p.totalQuantity, 0)} ชิ้น
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  // ─── Loading State ─────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  // ─── Main Render ───────────────────────────────────────────────────

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header — same pattern as orders/inventory pages */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PackageCheck className="w-8 h-8 text-[#F4511E]" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">แพ็ค & จัดส่ง</h1>
              <p className="text-gray-600 dark:text-slate-400 mt-1">
                {orders.length} ออเดอร์ที่ต้องดำเนินการ
              </p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>

        {/* Channel Tabs — inside a card like delivery-summary */}
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-3">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
            {([
              { key: 'all' as ChannelTab, label: 'ทั้งหมด', count: channelCounts.all },
              { key: 'shopee' as ChannelTab, label: 'Shopee', count: channelCounts.shopee },
              { key: 'manual' as ChannelTab, label: 'Manual', count: channelCounts.manual },
              { key: 'summary' as ChannelTab, label: 'สรุปรายการ', count: null },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()); }}
                className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium rounded-md transition-all ${
                  activeTab === tab.key
                    ? 'bg-[#F4511E] text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
                {tab.count !== null && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-gray-400'
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'summary' ? (
          productSummary.length > 0 ? renderProductSummary() : (
            <div className="text-center py-16 text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-base">ไม่มีรายการ</p>
            </div>
          )
        ) : (
          <>
            {filteredOrders.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-base">ไม่มีออเดอร์ที่ต้องดำเนินการ</p>
              </div>
            ) : (
              <>
                {(['overdue', 'today', 'ready', 'waiting'] as UrgencyGroup[]).map(renderUrgencySection)}
              </>
            )}
          </>
        )}

        {/* Floating Action Bar */}
        {selectedIds.size > 0 && activeTab !== 'summary' && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-600">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                เลือก {selectedIds.size} รายการ
              </span>
              <div className="w-px h-7 bg-gray-200 dark:bg-slate-600" />

              {selectedShopeeReadyToShip.length > 0 && (
                <button
                  onClick={handleBulkAcceptShopee}
                  disabled={actionLoading}
                  className="px-5 py-2.5 text-sm font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2"
                >
                  <ShoppingBag className="w-4 h-4" />
                  รับออเดอร์ Shopee ({selectedShopeeReadyToShip.length})
                </button>
              )}

              {selectedShopeeProcessed.length > 0 && (
                <button
                  onClick={handleBulkPrintLabels}
                  disabled={actionLoading}
                  className="px-5 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Printer className="w-4 h-4" />
                  พิมพ์ใบปะหน้า ({selectedShopeeProcessed.length})
                </button>
              )}

              {selectedPackable.length > 0 && (
                <button
                  onClick={handleBulkPack}
                  disabled={actionLoading}
                  className="px-5 py-2.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  แพ็คเสร็จ ({selectedPackable.length})
                </button>
              )}

              {selectedShippable.length > 0 && (
                <button
                  onClick={handleBulkShip}
                  disabled={actionLoading}
                  className="px-5 py-2.5 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Truck className="w-4 h-4" />
                  จัดส่งแล้ว ({selectedShippable.length})
                </button>
              )}

              <button
                onClick={() => setSelectedIds(new Set())}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Hold Modal */}
        {holdModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setHoldModal(null)}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
              <h3 className="text-lg font-bold mb-4">พักออเดอร์ {holdModal.orderNumber}</h3>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">เหตุผล (ไม่บังคับ)</label>
              <textarea
                value={holdReason}
                onChange={e => setHoldReason(e.target.value)}
                placeholder="เช่น ของหมด, สินค้าเสีย, ลูกค้าขอพัก"
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex justify-end gap-3 mt-5">
                <button
                  onClick={() => { setHoldModal(null); setHoldReason(''); }}
                  className="px-5 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => handleFulfillmentAction(holdModal.orderId, 'hold', holdReason)}
                  disabled={actionLoading}
                  className="px-5 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  พักไว้ก่อน
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Time Slot Modal */}
        {timeSlotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setTimeSlotModal(null)}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 mb-5">
                <Truck className="w-5 h-5 text-orange-500" />
                <h3 className="text-lg font-bold">เลือกเวลารับพัสดุ (ส่งด่วน)</h3>
              </div>

              {timeSlotModal.orders.map((result, idx) => (
                <div key={result.order_id} className={idx > 0 ? 'mt-5 pt-5 border-t border-gray-200 dark:border-slate-700' : ''}>
                  <div className="text-sm font-semibold mb-3">ออเดอร์ {result.order_sn}</div>
                  <div className="space-y-2">
                    {result.time_slots?.map(slot => (
                      <label
                        key={slot.pickup_time_id}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                          selectedTimeSlots[result.order_id] === slot.pickup_time_id
                            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600'
                            : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`timeslot-${result.order_id}`}
                          value={slot.pickup_time_id}
                          checked={selectedTimeSlots[result.order_id] === slot.pickup_time_id}
                          onChange={() => setSelectedTimeSlots(prev => ({ ...prev, [result.order_id]: slot.pickup_time_id }))}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm">{slot.display}</span>
                        {slot.recommended && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400">
                            <Star className="w-3.5 h-3.5" /> แนะนำ
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => { setTimeSlotModal(null); setSelectedTimeSlots({}); }}
                  className="px-5 py-2.5 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleConfirmTimeSlots}
                  disabled={actionLoading || timeSlotModal.orders.some(r => !selectedTimeSlots[r.order_id])}
                  className="px-5 py-2.5 text-sm font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                >
                  รับออเดอร์ ({timeSlotModal.orders.length})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

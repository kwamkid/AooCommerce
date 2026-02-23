'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput, { SearchInputHandle } from '@/components/ui/SearchInput';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { DateValueType } from 'react-tailwindcss-datepicker';
import {
  ShoppingCart,
  Plus,
  Loader2,
  Trash2,
  Edit2,
  Phone,
  ChevronRight,
  Link2,
  CheckCircle,
  X,
  ChevronDown,
  AlertTriangle,
  Clock,
  Package,
  CreditCard,
  User,
  Store,
  Truck,
  Copy,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import SearchableDropdown, { DropdownOption } from '@/components/ui/SearchableDropdown';

// Shared types & helpers
import {
  Order,
  ChannelOption,
  CreatedByOption,
  ORDER_STATUS_CONFIG,
  PAYMENT_STATUS_CONFIG,
  PLATFORM_ICONS,
  SHIPPING_CARRIERS,
  relativeTime,
  getDeadlineInfo,
} from './components/types';

// Tab components
import ReadyToShipTab from './components/ReadyToShipTab';
import ProcessingTab from './components/ProcessingTab';
import ActionMenu, { ActionItem } from './components/ActionMenu';

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

// Sort options
const SORT_OPTIONS = [
  { value: 'created_at:desc', label: 'ล่าสุด' },
  { value: 'created_at:asc', label: 'เก่าสุด' },
  { value: 'delivery_date:asc', label: 'ส่งเร็วสุด' },
  { value: 'delivery_date:desc', label: 'ส่งช้าสุด' },
  { value: 'total_amount:desc', label: 'ยอดมากสุด' },
  { value: 'total_amount:asc', label: 'ยอดน้อยสุด' },
];

const VALID_TABS = ['all', 'new', 'ready_to_ship', 'processing', 'shipping', 'completed', 'cancelled'];

function getInitialTab(): string {
  if (typeof window === 'undefined') return 'all';
  const hash = window.location.hash.replace('#', '');
  return VALID_TABS.includes(hash) ? hash : 'all';
}

export default function OrdersPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(getInitialTab);
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [channelDropdownOptions, setChannelDropdownOptions] = useState<DropdownOption[]>([]);
  const [createdByFilter, setCreatedByFilter] = useState('all');
  const [createdByDropdownOptions, setCreatedByDropdownOptions] = useState<DropdownOption[]>([]);
  const [deliveryDateRange, setDeliveryDateRange] = useState<DateValueType>({
    startDate: null,
    endDate: null,
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

  // Sort
  const [sortValue, setSortValue] = useState('created_at:desc');
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const sortBy = sortValue.split(':')[0];
  const sortDir = sortValue.split(':')[1] as 'asc' | 'desc';

  // Status update modal
  const [statusUpdateModal, setStatusUpdateModal] = useState<{
    show: boolean;
    order: Order | null;
    nextStatus: string;
    statusType: 'order' | 'payment';
  }>({ show: false, order: null, nextStatus: '', statusType: 'order' });
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Shipping details (for processing → shipping)
  const [shippingDetails, setShippingDetails] = useState({ carrier: '', trackingNumber: '' });

  // Payment details
  const [paymentDetails, setPaymentDetails] = useState({
    paymentMethod: 'cash',
    collectedBy: '',
    transferDate: '',
    transferTime: '',
    notes: ''
  });

  // Server-side pagination
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [toast, setToast] = useState('');

  // Status counts
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({ all: 0, new: 0, ready_to_ship: 0, processing: 0, shipping: 0, completed: 0, cancelled: 0 });
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [paymentCounts, setPaymentCounts] = useState<Record<string, number>>({ all: 0, pending: 0, verifying: 0, paid: 0, cancelled: 0 });
  const searchInputRef = useRef<SearchInputHandle>(null);

  // Close lightbox on ESC
  useEffect(() => {
    if (!lightboxImage) return;
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxImage(null); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [lightboxImage]);

  // Close modal on ESC
  useEffect(() => {
    if (!statusUpdateModal.show) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' });
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [statusUpdateModal.show]);

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!showSortDropdown) return;
    const handleClick = () => setShowSortDropdown(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showSortDropdown]);

  // Search on Enter
  const handleSearchSubmit = useCallback(() => {
    setDebouncedSearch(searchTerm);
    setCurrentPage(1);
  }, [searchTerm]);

  // Sync hash with statusFilter
  useEffect(() => {
    const newHash = statusFilter === 'all' ? '' : `#${statusFilter}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${newHash}`);
    }
  }, [statusFilter]);

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (VALID_TABS.includes(hash)) setStatusFilter(hash);
      else if (!hash) setStatusFilter('all');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, paymentFilter, channelFilter, createdByFilter, recordsPerPage]);

  // Fetch orders
  const isAuthReady = !authLoading && !!userProfile;
  useEffect(() => {
    if (!isAuthReady) return;
    fetchOrders();
  }, [isAuthReady, currentPage, recordsPerPage, statusFilter, paymentFilter, channelFilter, createdByFilter, debouncedSearch, sortBy, sortDir]);

  const fetchOrders = async () => {
    try {
      if (orders.length === 0) setLoading(true);
      setFetching(true);

      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('limit', recordsPerPage.toString());
      params.set('sort_by', sortBy);
      params.set('sort_dir', sortDir);
      params.set('source', 'exclude_pos');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (paymentFilter !== 'all') params.set('payment_status', paymentFilter);
      if (createdByFilter !== 'all') params.set('created_by', createdByFilter);
      if (channelFilter !== 'all') params.set('channel', channelFilter);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      const response = await apiFetch(`/api/orders?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch orders');

      const result = await response.json();
      setOrders(result.orders || []);
      setTotalOrders(result.pagination?.total || 0);
      setTotalPages(result.pagination?.totalPages || 0);
      if (result.statusCounts) setStatusCounts(result.statusCounts);
      if (result.paymentCounts) setPaymentCounts(result.paymentCounts);
      if (result.channelOptions) {
        setChannelDropdownOptions(result.channelOptions.map((ch: ChannelOption) => ({
          id: ch.id,
          label: ch.name,
          icon: ch.picture_url || undefined,
          platformIcon: PLATFORM_ICONS[ch.platform] || undefined,
        })));
      }
      if (result.createdByOptions) {
        setCreatedByDropdownOptions(result.createdByOptions.map((u: CreatedByOption) => ({
          id: u.id,
          label: u.name,
        })));
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      setError('ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้');
    } finally {
      setLoading(false);
      setFetching(false);
      searchInputRef.current?.focus();
    }
  };

  // Status flow helpers
  const getNextOrderStatus = (currentStatus: string): string | null => {
    const flow: Record<string, string> = { new: 'ready_to_ship', ready_to_ship: 'processing', processing: 'shipping', shipping: 'completed' };
    return flow[currentStatus] || null;
  };

  const getNextPaymentStatus = (currentStatus: string): string | null => {
    return currentStatus === 'pending' ? 'paid' : null;
  };

  // Handle status click
  const handleOrderStatusClick = (order: Order) => {
    const nextStatus = getNextOrderStatus(order.order_status);
    if (!nextStatus) return;
    setShippingDetails({ carrier: '', trackingNumber: '' });
    setStatusUpdateModal({ show: true, order, nextStatus, statusType: 'order' });
  };

  const handlePaymentStatusClick = (order: Order) => {
    const nextStatus = getNextPaymentStatus(order.payment_status);
    if (!nextStatus) return;
    setPaymentDetails({
      paymentMethod: order.payment_method || 'cash',
      collectedBy: '', transferDate: '', transferTime: '', notes: ''
    });
    setStatusUpdateModal({ show: true, order, nextStatus, statusType: 'payment' });
  };

  const confirmStatusUpdate = async () => {
    if (!statusUpdateModal.order) return;

    if (statusUpdateModal.statusType === 'payment' && statusUpdateModal.nextStatus === 'paid') {
      if (paymentDetails.paymentMethod === 'cash' && !paymentDetails.collectedBy.trim()) {
        showToast('กรุณาระบุชื่อคนเก็บเงิน', 'error');
        return;
      }
      if (paymentDetails.paymentMethod === 'transfer' && (!paymentDetails.transferDate || !paymentDetails.transferTime)) {
        showToast('กรุณาระบุวันที่และเวลาจากสลิป', 'error');
        return;
      }
    }

    try {
      setUpdatingStatus(true);
      const updateData: any = { id: statusUpdateModal.order.id };
      if (statusUpdateModal.statusType === 'order') {
        updateData.order_status = statusUpdateModal.nextStatus;
        // Include tracking info when shipping
        if (statusUpdateModal.nextStatus === 'shipping') {
          if (shippingDetails.carrier) updateData.shipping_carrier = shippingDetails.carrier;
          if (shippingDetails.trackingNumber) updateData.tracking_number = shippingDetails.trackingNumber;
        }
      } else {
        updateData.payment_status = statusUpdateModal.nextStatus;
      }

      const response = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      if (!response.ok) throw new Error('Failed to update status');

      if (statusUpdateModal.statusType === 'payment' && statusUpdateModal.nextStatus === 'paid') {
        const paymentRecordData = {
          order_id: statusUpdateModal.order.id,
          payment_method: paymentDetails.paymentMethod,
          amount: statusUpdateModal.order.total_amount,
          collected_by: paymentDetails.paymentMethod === 'cash' ? paymentDetails.collectedBy : null,
          transfer_date: paymentDetails.paymentMethod === 'transfer' ? paymentDetails.transferDate : null,
          transfer_time: paymentDetails.paymentMethod === 'transfer' ? paymentDetails.transferTime : null,
          notes: paymentDetails.notes || null
        };
        const paymentResponse = await apiFetch('/api/payment-records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(paymentRecordData)
        });
        if (!paymentResponse.ok) {
          const errorData = await paymentResponse.json();
          throw new Error(errorData.error || 'Failed to create payment record');
        }
      }

      await fetchOrders();
      setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' });
    } catch (error) {
      console.error('Error updating status:', error);
      showToast(error instanceof Error ? error.message : 'ไม่สามารถอัพเดทสถานะได้', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeleteOrder = async (e: React.MouseEvent, order: Order) => {
    e.stopPropagation();
    if (!confirm(`คุณต้องการลบคำสั่งซื้อ "${order.order_number}" หรือไม่?\n\nการลบจะเป็นการลบถาวร ไม่สามารถกู้คืนได้`)) return;

    try {
      const response = await apiFetch(`/api/orders?id=${order.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'ไม่สามารถลบคำสั่งซื้อได้');
      }
      fetchOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      showToast(error instanceof Error ? error.message : 'ไม่สามารถลบคำสั่งซื้อได้', 'error');
    }
  };

  // Client-side date filter
  const checkDateFilter = (order: Order): boolean => {
    if (!deliveryDateRange?.startDate && !deliveryDateRange?.endDate) return true;
    if (!order.delivery_date) return false;
    const deliveryDate = new Date(order.delivery_date);
    deliveryDate.setHours(0, 0, 0, 0);
    const startDate = deliveryDateRange.startDate ? new Date(String(deliveryDateRange.startDate)) : null;
    const endDate = deliveryDateRange.endDate ? new Date(String(deliveryDateRange.endDate)) : null;
    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);
    if (startDate && endDate) return deliveryDate >= startDate && deliveryDate <= endDate;
    if (startDate) return deliveryDate >= startDate;
    if (endDate) return deliveryDate <= endDate;
    return true;
  };

  const displayedOrders = orders.filter(checkDateFilter);
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = Math.min(startIndex + displayedOrders.length, totalOrders);

  // === Render Default Order Card (for tabs without special components) ===
  const renderDefaultOrderCard = (order: Order) => {
    const deadline = getDeadlineInfo(order.delivery_date);
    const showUrgentStrip = deadline?.urgent && ['ready_to_ship', 'processing'].includes(order.order_status);
    const isShopee = order.source === 'shopee';
    const customerName = order.customer_name || order.delivery_name || 'ลูกค้าทั่วไป';
    const customerPhone = order.customer_phone || order.delivery_phone;
    const orderStatusCfg = ORDER_STATUS_CONFIG[order.order_status] || ORDER_STATUS_CONFIG.new;
    const paymentStatusCfg = PAYMENT_STATUS_CONFIG[order.payment_status] || PAYMENT_STATUS_CONFIG.pending;

    const renderActions = () => {
      const primaryActions: React.ReactNode[] = [];
      const menuItems: ActionItem[] = [];

      // Primary: Payment action (manual, new tab, pending payment)
      if (statusFilter === 'new' && !isShopee && order.payment_status === 'pending') {
        primaryActions.push(
          <button
            key="pay"
            onClick={(e) => { e.stopPropagation(); handlePaymentStatusClick(order); }}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1.5"
          >
            <CreditCard className="w-4 h-4" />
            บันทึกชำระ
          </button>
        );
      }

      // Primary: Complete action (shipping tab)
      if (statusFilter === 'shipping' && !isShopee) {
        primaryActions.push(
          <button
            key="complete"
            onClick={(e) => { e.stopPropagation(); handleOrderStatusClick(order); }}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-1.5"
          >
            <Package className="w-4 h-4" />
            สำเร็จ
          </button>
        );
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

      // Menu: Edit, Duplicate, Cancel (manual only)
      if (!order.source || order.source === 'manual') {
        // Edit (non-cancelled only)
        if (order.order_status !== 'cancelled') {
          menuItems.push({
            key: 'edit', label: 'แก้ไข', icon: <Edit2 className="w-4 h-4" />,
            onClick: (e) => { e.stopPropagation(); router.push(`/orders/${order.id}/edit`); },
            className: 'p-1.5 text-blue-500 hover:text-blue-700 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
          });
        }
        // Duplicate (exclude shipping tab — ready_to_ship & processing have their own tabs)
        if (!['ready_to_ship', 'processing', 'shipping'].includes(statusFilter)) {
          menuItems.push({
            key: 'duplicate', label: 'สั่งซ้ำ', icon: <Copy className="w-4 h-4" />,
            onClick: (e) => { e.stopPropagation(); router.push(`/orders/new?duplicate=${order.id}`); },
            className: 'p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30',
          });
        }
        // Cancel (non-cancelled, non-completed only)
        if (!['cancelled', 'completed'].includes(order.order_status)) {
          menuItems.push({
            key: 'cancel', label: 'ยกเลิก', icon: <Trash2 className="w-4 h-4" />,
            onClick: (e) => {
              e.stopPropagation();
              setStatusUpdateModal({ show: true, order, nextStatus: 'cancelled', statusType: 'order' });
            },
            className: 'p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30',
            danger: true,
          });
        }
        // Delete (cancelled only, owner/admin)
        if (order.order_status === 'cancelled' && (userProfile?.roles?.includes('owner') || userProfile?.roles?.includes('admin'))) {
          menuItems.push({
            key: 'del', label: 'ลบ', icon: <Trash2 className="w-4 h-4" />,
            onClick: (e) => handleDeleteOrder(e, order),
            className: 'p-1.5 text-red-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30',
            danger: true,
          });
        }
      }

      return (
        <>
          {primaryActions}
          <ActionMenu items={menuItems} />
        </>
      );
    };

    return (
      <div
        key={order.id}
        onClick={() => window.open(`/orders/${order.id}`, '_blank')}
        className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-[#F4511E]/40 dark:hover:border-[#F4511E]/40 hover:shadow-md transition-all cursor-pointer overflow-hidden"
      >
        {showUrgentStrip && deadline && (
          <div className={`px-4 py-1.5 flex items-center gap-1.5 text-xs font-medium ${deadline.color}`}>
            <AlertTriangle className="w-3.5 h-3.5" />
            {deadline.label}
          </div>
        )}

        <div className="flex">
          <div className="flex-[7] min-w-0 py-3">
            <div className="px-4 pb-2 flex items-center gap-2">
              <ChannelBadge channel={order.channel} />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{order.order_number}</span>
              {order.source === 'pos' && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">POS</span>
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

            <div className="px-4 space-y-2">
              {(order.items_preview || []).map((item, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div
                    className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-slate-700 overflow-hidden flex-shrink-0"
                    onClick={item.image ? (e) => { e.stopPropagation(); setLightboxImage(item.image!); } : undefined}
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

          <div className="flex-[3] py-3 px-4 flex flex-col justify-center items-end gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {order.customer_picture_url ? (
                <img src={order.customer_picture_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
              ) : null}
              <span className="text-sm text-gray-700 dark:text-slate-300 truncate max-w-[80px] sm:max-w-none">{customerName}</span>
              {customerPhone && (
                <a href={`tel:${customerPhone}`} onClick={(e) => e.stopPropagation()}
                  className="text-gray-400 hover:text-emerald-500 transition-colors flex-shrink-0"
                ><Phone className="w-3.5 h-3.5" /></a>
              )}
            </div>

            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              ฿{formatPrice(order.total_amount)}
            </span>

            <div className="flex items-center gap-1.5 flex-nowrap justify-end">
              {(statusFilter === 'all' || statusFilter === 'shipping' || statusFilter === 'completed' || statusFilter === 'cancelled') && (
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${orderStatusCfg.bg} ${orderStatusCfg.color}`}>
                  {orderStatusCfg.label}
                </span>
              )}

              {order.order_status !== 'cancelled' && (statusFilter === 'all' || statusFilter === 'new' || statusFilter === 'shipping' || statusFilter === 'completed' || order.payment_status !== 'paid') && (
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${paymentStatusCfg.bg} ${paymentStatusCfg.color}`}>
                  {paymentStatusCfg.label}
                </span>
              )}

              <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
                {renderActions()}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Decide which content to render based on active tab
  const renderOrderList = () => {
    if (displayedOrders.length === 0) {
      return (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 py-16 text-center">
          <ShoppingCart className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400">
            {searchTerm || statusFilter !== 'all' || paymentFilter !== 'all' || channelFilter !== 'all' || createdByFilter !== 'all' || deliveryDateRange?.startDate
              ? 'ไม่พบคำสั่งซื้อที่ค้นหา'
              : 'ยังไม่มีคำสั่งซื้อ'}
          </p>
        </div>
      );
    }

    // Tab-specific components
    if (statusFilter === 'ready_to_ship') {
      return (
        <ReadyToShipTab
          orders={displayedOrders}
          userProfile={userProfile}
          onRefresh={fetchOrders}
          onImageClick={(url) => setLightboxImage(url)}
          onPaymentClick={handlePaymentStatusClick}
          onStatusClick={handleOrderStatusClick}
          onDeleteOrder={handleDeleteOrder}
        />
      );
    }

    if (statusFilter === 'processing') {
      return (
        <ProcessingTab
          orders={displayedOrders}
          userProfile={userProfile}
          onRefresh={fetchOrders}
          onImageClick={(url) => setLightboxImage(url)}
          onStatusClick={handleOrderStatusClick}
          onDeleteOrder={handleDeleteOrder}
        />
      );
    }

    // Default: all / new / shipping / completed / cancelled tabs
    return (
      <div className="space-y-3">
        {displayedOrders.map(renderDefaultOrderCard)}
      </div>
    );
  };

  // Loading state
  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-8 h-8 text-[#F4511E]" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">คำสั่งซื้อ</h1>
          </div>
          <button
            onClick={() => router.push('/orders/new')}
            className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            สร้างคำสั่งซื้อ
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
        )}

        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'all', label: 'ทั้งหมด', active: 'bg-indigo-600', inactive: 'bg-indigo-50 dark:bg-indigo-950/50', labelColor: 'text-indigo-600 dark:text-indigo-400', countColor: 'text-indigo-700 dark:text-indigo-300' },
            { key: 'new', label: 'ใหม่', active: 'bg-blue-600', inactive: 'bg-blue-50 dark:bg-blue-950/50', labelColor: 'text-blue-600 dark:text-blue-400', countColor: 'text-blue-700 dark:text-blue-300' },
            { key: 'ready_to_ship', label: 'รอกดรับ', active: 'bg-orange-500', inactive: 'bg-orange-50 dark:bg-orange-950/50', labelColor: 'text-orange-600 dark:text-orange-400', countColor: 'text-orange-700 dark:text-orange-300' },
            { key: 'processing', label: 'ที่ต้องจัดส่ง', active: 'bg-indigo-500', inactive: 'bg-indigo-50 dark:bg-indigo-950/50', labelColor: 'text-indigo-500 dark:text-indigo-400', countColor: 'text-indigo-700 dark:text-indigo-300' },
            { key: 'shipping', label: 'กำลังส่ง', active: 'bg-amber-500', inactive: 'bg-amber-50 dark:bg-amber-950/50', labelColor: 'text-amber-600 dark:text-amber-400', countColor: 'text-amber-700 dark:text-amber-300' },
            { key: 'completed', label: 'สำเร็จ', active: 'bg-emerald-600', inactive: 'bg-emerald-50 dark:bg-emerald-950/50', labelColor: 'text-emerald-600 dark:text-emerald-400', countColor: 'text-emerald-700 dark:text-emerald-300' },
            { key: 'cancelled', label: 'ยกเลิก', active: 'bg-gray-500', inactive: 'bg-gray-100 dark:bg-gray-800', labelColor: 'text-gray-500 dark:text-gray-400', countColor: 'text-gray-600 dark:text-gray-300' },
          ].map((s) => {
            const isActive = statusFilter === s.key;
            const count = statusCounts[s.key] || 0;
            return (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`flex-shrink-0 rounded-xl px-4 py-2 min-w-[80px] text-center transition-all ${
                  isActive ? `${s.active} text-white shadow-md` : `${s.inactive} hover:opacity-80`
                }`}
              >
                <div className={`text-xs font-medium ${isActive ? 'text-white/80' : s.labelColor}`}>{s.label}</div>
                <div className={`text-xl font-bold ${isActive ? 'text-white' : s.countColor}`}>{count}</div>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="data-filter-card">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SearchInput
                ref={searchInputRef}
                value={searchTerm}
                onChange={(v) => { setSearchTerm(v); if (!v) { setDebouncedSearch(''); setCurrentPage(1); } }}
                onSubmit={handleSearchSubmit}
                placeholder="ค้นหาเลขที่, ชื่อลูกค้า... (Enter)"
                className="py-2.5"
              />
            </div>
            {features.delivery_date.enabled && (
              <div className="w-64 flex-shrink-0">
                <DateRangePicker
                  value={deliveryDateRange}
                  onChange={(val) => setDeliveryDateRange(val)}
                  placeholder="วันที่ส่ง - ทั้งหมด"
                />
              </div>
            )}
            {channelDropdownOptions.length > 0 && (
              <SearchableDropdown
                value={channelFilter}
                onChange={setChannelFilter}
                options={channelDropdownOptions}
                placeholder="ช่องทาง"
                searchPlaceholder="ค้นหาช่องทาง..."
                defaultIcon={<Store className="w-4 h-4" />}
                extraOptions={[
                  { id: 'none', label: 'เปิดบิลตรง', icon: <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center flex-shrink-0"><X className="w-3.5 h-3.5 text-gray-400 dark:text-slate-400" /></div> },
                ]}
              />
            )}
            {createdByDropdownOptions.length > 0 && (
              <SearchableDropdown
                value={createdByFilter}
                onChange={setCreatedByFilter}
                options={createdByDropdownOptions}
                placeholder="ผู้เปิดบิล"
                searchPlaceholder="ค้นหาชื่อ..."
                defaultIcon={<User className="w-4 h-4" />}
              />
            )}
          </div>
        </div>

        {fetching ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
          </div>
        ) : (
        <>
          {/* Sort bar + count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {totalOrders > 0 ? `${startIndex + 1}-${endIndex} จาก ${totalOrders} รายการ` : 'ไม่พบรายการ'}
            </p>
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSortDropdown(!showSortDropdown); }}
                className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600 transition-colors"
              >
                {SORT_OPTIONS.find(o => o.value === sortValue)?.label || 'เรียงตาม'}
                <ChevronDown className="w-4 h-4" />
              </button>
              {showSortDropdown && (
                <div className="absolute right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-20 min-w-[140px]">
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortValue(opt.value); setShowSortDropdown(false); setCurrentPage(1); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                        sortValue === opt.value ? 'text-[#F4511E] font-medium' : 'text-gray-700 dark:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Order list — tab-specific or default */}
          {renderOrderList()}

          {/* Pagination */}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalOrders}
            startIdx={startIndex}
            endIdx={endIndex}
            recordsPerPage={recordsPerPage}
            setRecordsPerPage={setRecordsPerPage}
            setPage={setCurrentPage}
          />
        </>
        )}

        {/* Status Update Modal */}
        {statusUpdateModal.show && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
          >
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  ยืนยันการเปลี่ยน{statusUpdateModal.statusType === 'order' ? 'สถานะคำสั่งซื้อ' : 'สถานะการชำระเงิน'}
                </h3>
                <button
                  onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="mb-6 space-y-3">
                <p className="text-gray-700 dark:text-slate-300">
                  คำสั่งซื้อ: <span className="font-medium">{statusUpdateModal.order?.order_number}</span>
                </p>
                <p className="text-gray-700 dark:text-slate-300">
                  ลูกค้า: <span className="font-medium">{statusUpdateModal.order?.customer_name || statusUpdateModal.order?.delivery_name}</span>
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 dark:text-slate-400">เปลี่ยนจาก:</span>
                  {statusUpdateModal.statusType === 'order' ? (
                    <>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_CONFIG[statusUpdateModal.order?.order_status || '']?.bg || ''} ${ORDER_STATUS_CONFIG[statusUpdateModal.order?.order_status || '']?.color || ''}`}>
                        {ORDER_STATUS_CONFIG[statusUpdateModal.order?.order_status || '']?.label || ''}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${ORDER_STATUS_CONFIG[statusUpdateModal.nextStatus]?.bg || ''} ${ORDER_STATUS_CONFIG[statusUpdateModal.nextStatus]?.color || ''}`}>
                        {ORDER_STATUS_CONFIG[statusUpdateModal.nextStatus]?.label || ''}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PAYMENT_STATUS_CONFIG[statusUpdateModal.order?.payment_status || '']?.bg || ''} ${PAYMENT_STATUS_CONFIG[statusUpdateModal.order?.payment_status || '']?.color || ''}`}>
                        {PAYMENT_STATUS_CONFIG[statusUpdateModal.order?.payment_status || '']?.label || ''}
                      </span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PAYMENT_STATUS_CONFIG[statusUpdateModal.nextStatus]?.bg || ''} ${PAYMENT_STATUS_CONFIG[statusUpdateModal.nextStatus]?.color || ''}`}>
                        {PAYMENT_STATUS_CONFIG[statusUpdateModal.nextStatus]?.label || ''}
                      </span>
                    </>
                  )}
                </div>

                {/* Shipping Details Form (processing → shipping) */}
                {statusUpdateModal.statusType === 'order' && statusUpdateModal.nextStatus === 'shipping' && (
                  <div className="mt-6 pt-6 border-t dark:border-slate-700 space-y-4">
                    <h4 className="font-medium text-gray-900 dark:text-white">ข้อมูลจัดส่ง</h4>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">ขนส่ง</label>
                      <select
                        value={shippingDetails.carrier}
                        onChange={(e) => setShippingDetails({ ...shippingDetails, carrier: e.target.value })}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      >
                        <option value="">-- เลือกขนส่ง --</option>
                        {SHIPPING_CARRIERS.map(c => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">เลขพัสดุ</label>
                      <input
                        type="text"
                        value={shippingDetails.trackingNumber}
                        onChange={(e) => setShippingDetails({ ...shippingDetails, trackingNumber: e.target.value })}
                        placeholder="กรอกเลขพัสดุ (ไม่บังคับ)"
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                      />
                    </div>
                  </div>
                )}

                {/* Payment Details Form */}
                {statusUpdateModal.statusType === 'payment' && statusUpdateModal.nextStatus === 'paid' && (
                  <div className="mt-6 pt-6 border-t dark:border-slate-700 space-y-4">
                    <h4 className="font-medium text-gray-900 dark:text-white">รายละเอียดการชำระเงิน</h4>
                    <p className="text-sm text-gray-600 dark:text-slate-400">
                      ยอดชำระ: <span className="font-semibold text-[#F4511E]">฿{formatPrice(statusUpdateModal.order?.total_amount)}</span>
                    </p>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                        วิธีการชำระเงิน <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setPaymentDetails({ ...paymentDetails, paymentMethod: 'cash' })}
                          className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                            paymentDetails.paymentMethod === 'cash'
                              ? 'border-[#F4511E] bg-[#F4511E] bg-opacity-10 text-[#F4511E] font-medium'
                              : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-gray-400'
                          }`}
                        >
                          เงินสด
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentDetails({ ...paymentDetails, paymentMethod: 'transfer' })}
                          className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                            paymentDetails.paymentMethod === 'transfer'
                              ? 'border-[#F4511E] bg-[#F4511E] bg-opacity-10 text-[#F4511E] font-medium'
                              : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:border-gray-400'
                          }`}
                        >
                          โอนเงิน
                        </button>
                      </div>
                    </div>

                    {paymentDetails.paymentMethod === 'cash' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                          ชื่อคนเก็บเงิน <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={paymentDetails.collectedBy}
                          onChange={(e) => setPaymentDetails({ ...paymentDetails, collectedBy: e.target.value })}
                          placeholder="ระบุชื่อคนเก็บเงิน"
                          className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                        />
                      </div>
                    )}

                    {paymentDetails.paymentMethod === 'transfer' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                              วันที่จากสลิป <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={paymentDetails.transferDate}
                              onChange={(e) => setPaymentDetails({ ...paymentDetails, transferDate: e.target.value })}
                              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                              เวลาจากสลิป <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="time"
                              value={paymentDetails.transferTime}
                              onChange={(e) => setPaymentDetails({ ...paymentDetails, transferTime: e.target.value })}
                              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">หมายเหตุ</label>
                      <textarea
                        value={paymentDetails.notes}
                        onChange={(e) => setPaymentDetails({ ...paymentDetails, notes: e.target.value })}
                        placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                        rows={2}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 dark:bg-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
                  disabled={updatingStatus}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={confirmStatusUpdate}
                  disabled={updatingStatus}
                  className="px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {updatingStatus ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <span>ยืนยัน</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm animate-fade-in">
          <CheckCircle className="w-4 h-4 text-green-400" />
          {toast}
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
          onClick={() => setLightboxImage(null)}
          role="dialog"
        >
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxImage}
            alt="Product"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Layout>
  );
}

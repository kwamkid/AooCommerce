'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
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
  Search,
  Loader2,
  Trash2,
  Edit2,
  Eye,
  Phone,
  ChevronRight,
  Link2,
  CheckCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  ChevronDown,
  Filter,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';

// Order interface
interface Order {
  id: string;
  order_number: string;
  order_date: string;
  created_at: string;
  delivery_date?: string;
  total_amount: number;
  payment_status: string;
  payment_method?: string;
  order_status: string;
  customer_id: string;
  customer_code: string;
  customer_name: string;
  contact_person?: string;
  customer_phone?: string;
  item_count: number;
  branch_count: number;
  branch_names?: string[];
  source?: string;
  external_status?: string;
  external_order_sn?: string;
  channel?: {
    platform: string;
    account_name: string;
    account_id: string;
    picture_url: string | null;
  } | null;
}

interface ChannelOption {
  id: string;
  platform: string;
  name: string;
  picture_url: string | null;
}

// Platform icon SVG map
const PLATFORM_ICONS: Record<string, string> = {
  line: '/social/line_oa.svg',
  facebook: '/social/facebook.svg',
  instagram: '/social/instagram.svg',
  shopee: '/marketplace/shopee.svg',
};

// Source badge component
function SourceBadge({ source }: { source?: string }) {
  if (!source || source === 'manual' || source === 'shopee') return null;
  if (source === 'pos') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
        POS
      </span>
    );
  }
  return null;
}

// Channel badge: profile pic with platform icon overlay at bottom-left + shop name
function ChannelBadge({ channel }: { channel: Order['channel'] }) {
  if (!channel) {
    return <span className="text-xs text-gray-400 dark:text-slate-500">-</span>;
  }

  const platformIcon = PLATFORM_ICONS[channel.platform];

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-shrink-0">
        {channel.picture_url ? (
          <img
            src={channel.picture_url}
            alt={channel.account_name}
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
            {platformIcon && <img src={platformIcon} alt={channel.platform} className="w-4 h-4" />}
          </div>
        )}
        {/* Platform icon overlay (bottom-left) */}
        {channel.picture_url && platformIcon && (
          <img
            src={platformIcon}
            alt={channel.platform}
            className="absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded bg-white dark:bg-slate-800 p-[1px]"
          />
        )}
      </div>
      <span className="text-xs text-gray-700 dark:text-slate-300 truncate max-w-[100px]">
        {channel.account_name}
      </span>
    </div>
  );
}

// Column toggle system
type ColumnKey = 'orderInfo' | 'channel' | 'deliveryDate' | 'customer' | 'branches' | 'total' | 'status' | 'payment' | 'actions';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
}

const COLUMN_CONFIGS: ColumnConfig[] = [
  { key: 'orderInfo', label: 'คำสั่งซื้อ', defaultVisible: true, alwaysVisible: true },
  { key: 'channel', label: 'ช่องทาง', defaultVisible: true },
  { key: 'deliveryDate', label: 'วันจัดส่ง', defaultVisible: true },
  { key: 'customer', label: 'ลูกค้า', defaultVisible: true },
  { key: 'branches', label: 'สาขา', defaultVisible: true },
  { key: 'total', label: 'ยอดรวม', defaultVisible: true },
  { key: 'status', label: 'สถานะ', defaultVisible: true },
  { key: 'payment', label: 'การชำระ', defaultVisible: true },
  { key: 'actions', label: 'จัดการ', defaultVisible: true, alwaysVisible: true },
];

const ORDERS_STORAGE_KEY = 'orders-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

// Status badge components
function OrderStatusBadge({ status, clickable = false }: { status: string; clickable?: boolean }) {
  const statusConfig = {
    new: { label: 'ใหม่', color: 'bg-blue-100 text-blue-700', hoverColor: 'hover:bg-blue-200' },
    shipping: { label: 'กำลังส่ง', color: 'bg-yellow-100 text-yellow-700', hoverColor: 'hover:bg-yellow-200' },
    completed: { label: 'สำเร็จ', color: 'bg-green-100 text-green-700', hoverColor: '' },
    cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700', hoverColor: '' }
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.new;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${config.color} ${clickable ? `${config.hoverColor} cursor-pointer transition-colors` : ''}`}>
      {config.label}
      {clickable && <ChevronRight className="w-3 h-3" />}
    </span>
  );
}

function PaymentStatusBadge({ status, clickable = false }: { status: string; clickable?: boolean }) {
  const statusConfig = {
    pending: { label: 'รอชำระ', color: 'bg-orange-100 text-orange-700', hoverColor: 'hover:bg-orange-200' },
    verifying: { label: 'รอตรวจสอบ', color: 'bg-purple-100 text-purple-700', hoverColor: '' },
    paid: { label: 'ชำระแล้ว', color: 'bg-green-100 text-green-700', hoverColor: '' },
    cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700', hoverColor: '' }
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${config.color} ${clickable ? `${config.hoverColor} cursor-pointer transition-colors` : ''}`}>
      {config.label}
      {clickable && <ChevronRight className="w-3 h-3" />}
    </span>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { features } = useFeatures();

  const disabledColumns = new Set<ColumnKey>();
  if (!features.delivery_date.enabled) disabledColumns.add('deliveryDate');
  if (!features.customer_branches) disabledColumns.add('branches');

  const activeColumnConfigs = COLUMN_CONFIGS.filter(col => !disabledColumns.has(col.key));

  // Check if a column should render: must be enabled by feature AND toggled on by user
  const isColVisible = (key: ColumnKey) => !disabledColumns.has(key) && visibleColumns.has(key);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(ORDERS_STORAGE_KEY);
      if (stored) {
        try { return new Set(JSON.parse(stored) as ColumnKey[]); } catch { /* defaults */ }
      }
    }
    return new Set(getDefaultColumns());
  });
  const toggleColumn = (key: ColumnKey) => {
    const config = activeColumnConfigs.find(c => c.key === key);
    if (config?.alwaysVisible) return;
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);  // initial full-page load
  const [fetching, setFetching] = useState(false);  // background fetch (no UI flash)
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [channelOptions, setChannelOptions] = useState<ChannelOption[]>([]);
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const channelDropdownRef = useRef<HTMLDivElement>(null);
  const [deliveryDateRange, setDeliveryDateRange] = useState<DateValueType>({
    startDate: null,
    endDate: null,
  });

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

  // Status update modal
  const [statusUpdateModal, setStatusUpdateModal] = useState<{
    show: boolean;
    order: Order | null;
    nextStatus: string;
    statusType: 'order' | 'payment';
  }>({
    show: false,
    order: null,
    nextStatus: '',
    statusType: 'order'
  });
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Payment details state (for when updating payment status to 'paid')
  const [paymentDetails, setPaymentDetails] = useState({
    paymentMethod: 'cash', // cash or transfer
    collectedBy: '', // for cash
    transferDate: '', // for transfer
    transferTime: '', // for transfer
    notes: ''
  });

  // Server-side pagination state
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [toast, setToast] = useState('');

  // Sort state
  const [sortBy, setSortBy] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Status counts from API (independent of current filter)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({ all: 0, new: 0, shipping: 0, completed: 0, cancelled: 0 });
  const [paymentCounts, setPaymentCounts] = useState<Record<string, number>>({ all: 0, pending: 0, verifying: 0, paid: 0, cancelled: 0 });

  // Close channel dropdown on click outside
  useEffect(() => {
    if (!channelDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (channelDropdownRef.current && !channelDropdownRef.current.contains(e.target as Node)) {
        setChannelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [channelDropdownOpen]);

  // Close modal on ESC key
  useEffect(() => {
    if (!statusUpdateModal.show) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' });
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [statusUpdateModal.show]);

  // Debounce search term (500ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to page 1 when search changes
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, paymentFilter, channelFilter, recordsPerPage]);

  // Fetch orders with server-side filtering and pagination
  // isAuthReady is a boolean (false→true once), so it won't re-trigger from object reference changes
  const isAuthReady = !authLoading && !!userProfile;
  useEffect(() => {
    if (!isAuthReady) return;
    fetchOrders();
  }, [isAuthReady, currentPage, recordsPerPage, statusFilter, paymentFilter, channelFilter, debouncedSearch, sortBy, sortDir]);

  const fetchOrders = async () => {
    try {
      // Use fetching (no UI flash) for subsequent loads; loading for initial
      if (orders.length === 0) setLoading(true);
      setFetching(true);

      // Build query params for server-side filtering
      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('limit', recordsPerPage.toString());
      params.set('sort_by', sortBy);
      params.set('sort_dir', sortDir);
      params.set('source', 'exclude_pos');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (paymentFilter !== 'all') params.set('payment_status', paymentFilter);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      const response = await apiFetch(`/api/orders?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }

      const result = await response.json();
      setOrders(result.orders || []);
      setTotalOrders(result.pagination?.total || 0);
      setTotalPages(result.pagination?.totalPages || 0);
      if (result.statusCounts) setStatusCounts(result.statusCounts);
      if (result.paymentCounts) setPaymentCounts(result.paymentCounts);
      if (result.channelOptions) setChannelOptions(result.channelOptions);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setError('ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้');
    } finally {
      setLoading(false);
      setFetching(false);
    }
  };

  // Get next order status in flow
  const getNextOrderStatus = (currentStatus: string): string | null => {
    const statusFlow: { [key: string]: string } = {
      'new': 'shipping',
      'shipping': 'completed'
    };
    return statusFlow[currentStatus] || null;
  };

  // Get next payment status (now only pending -> paid)
  const getNextPaymentStatus = (currentStatus: string): string | null => {
    if (currentStatus === 'pending') return 'paid';
    return null; // No next status if already paid
  };

  // Get order status label in Thai
  const getOrderStatusLabel = (status: string): string => {
    const labels: { [key: string]: string } = {
      'new': 'ใหม่',
      'shipping': 'กำลังส่ง',
      'completed': 'สำเร็จ',
      'cancelled': 'ยกเลิก'
    };
    return labels[status] || status;
  };

  // Get payment status label in Thai
  const getPaymentStatusLabel = (status: string): string => {
    const labels: { [key: string]: string } = {
      'pending': 'รอชำระ',
      'verifying': 'รอตรวจสอบ',
      'paid': 'ชำระแล้ว'
    };
    return labels[status] || status;
  };

  // Handle order status click
  const handleOrderStatusClick = (e: React.MouseEvent, order: Order) => {
    e.stopPropagation(); // Prevent row click

    const nextStatus = getNextOrderStatus(order.order_status);
    if (!nextStatus) return;

    setStatusUpdateModal({
      show: true,
      order,
      nextStatus,
      statusType: 'order'
    });
  };

  // Handle payment status click
  const handlePaymentStatusClick = (e: React.MouseEvent, order: Order) => {
    e.stopPropagation(); // Prevent row click

    const nextStatus = getNextPaymentStatus(order.payment_status);
    if (!nextStatus) return;

    // Reset payment details form
    setPaymentDetails({
      paymentMethod: order.payment_method || 'cash',
      collectedBy: '',
      transferDate: '',
      transferTime: '',
      notes: ''
    });

    setStatusUpdateModal({
      show: true,
      order,
      nextStatus,
      statusType: 'payment'
    });
  };

  // Confirm and update status
  const confirmStatusUpdate = async () => {
    if (!statusUpdateModal.order) return;

    // If updating payment status to 'paid', validate payment details
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
      } else {
        updateData.payment_status = statusUpdateModal.nextStatus;
      }

      // Update order status
      const response = await apiFetch('/api/orders', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      // If updating payment status to 'paid', create payment record
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
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(paymentRecordData)
        });

        if (!paymentResponse.ok) {
          const errorData = await paymentResponse.json();
          throw new Error(errorData.error || 'Failed to create payment record');
        }
      }

      // Refresh orders list
      await fetchOrders();

      // Close modal
      setStatusUpdateModal({
        show: false,
        order: null,
        nextStatus: '',
        statusType: 'order'
      });
    } catch (error) {
      console.error('Error updating status:', error);
      showToast(error instanceof Error ? error.message : 'ไม่สามารถอัพเดทสถานะได้', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Handle delete order (admin only)
  const handleDeleteOrder = async (e: React.MouseEvent, order: Order) => {
    e.stopPropagation(); // Prevent row click

    if (!confirm(`คุณต้องการลบคำสั่งซื้อ "${order.order_number}" หรือไม่?\n\nการลบจะเป็นการลบถาวร ไม่สามารถกู้คืนได้`)) return;

    try {
      const response = await apiFetch(`/api/orders?id=${order.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'ไม่สามารถลบคำสั่งซื้อได้');
      }

      // Refresh orders list
      fetchOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      showToast(error instanceof Error ? error.message : 'ไม่สามารถลบคำสั่งซื้อได้', 'error');
    }
  };

  // Helper function to check if date matches filter
  const checkDateFilter = (order: Order): boolean => {
    if (!deliveryDateRange?.startDate && !deliveryDateRange?.endDate) return true;
    if (!order.delivery_date) return false;

    const deliveryDate = new Date(order.delivery_date);
    deliveryDate.setHours(0, 0, 0, 0);

    const startDate = deliveryDateRange.startDate ? new Date(String(deliveryDateRange.startDate)) : null;
    const endDate = deliveryDateRange.endDate ? new Date(String(deliveryDateRange.endDate)) : null;
    if (startDate) startDate.setHours(0, 0, 0, 0);
    if (endDate) endDate.setHours(23, 59, 59, 999);

    if (startDate && endDate) {
      return deliveryDate >= startDate && deliveryDate <= endDate;
    } else if (startDate) {
      return deliveryDate >= startDate;
    } else if (endDate) {
      return deliveryDate <= endDate;
    }
    return true;
  };

  // Toggle sort column
  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(column);
      setSortDir('desc');
    }
    setCurrentPage(1);
  };

  // Sort icon component
  const SortIcon = ({ column }: { column: string }) => {
    if (sortBy !== column) return <ArrowUpDown className="w-3 h-3 text-gray-400" />;
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 text-[#F4511E]" />
      : <ArrowDown className="w-3 h-3 text-[#F4511E]" />;
  };

  // Client-side filters: date range + channel
  const filteredOrders = orders.filter(order => {
    if (!checkDateFilter(order)) return false;
    if (channelFilter !== 'all') {
      if (channelFilter === 'none') return !order.channel;
      return order.channel?.account_id === channelFilter;
    }
    return true;
  });

  const displayedOrders = filteredOrders;

  // Calculate display indices for pagination info
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = Math.min(startIndex + displayedOrders.length, totalOrders);
  const totalRecords = totalOrders;

  // Only show full-page spinner on very first load
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

        {/* Error message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Filters Section */}
        <div className="data-filter-card">
          <div className="space-y-3">
            {/* Row 1: Search + Date Range + Channel filter */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                {fetching ? (
                  <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#F4511E] w-4 h-4 animate-spin" />
                ) : (
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                )}
                <input
                  type="text"
                  placeholder="ค้นหาเลขที่, ชื่อลูกค้า..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
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
              {channelOptions.length > 0 && (
                <div className="relative flex-shrink-0" ref={channelDropdownRef}>
                  <button
                    onClick={() => setChannelDropdownOpen(!channelDropdownOpen)}
                    className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      channelFilter !== 'all'
                        ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/20 text-[#F4511E]'
                        : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:border-gray-400 dark:hover:border-slate-500'
                    }`}
                  >
                    {channelFilter !== 'all' && channelFilter !== 'none' ? (
                      (() => {
                        const selected = channelOptions.find(ch => ch.id === channelFilter);
                        if (!selected) return <Filter className="w-4 h-4" />;
                        return (
                          <div className="relative flex-shrink-0">
                            {selected.picture_url ? (
                              <img src={selected.picture_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
                                {PLATFORM_ICONS[selected.platform] && (
                                  <img src={PLATFORM_ICONS[selected.platform]} alt="" className="w-3 h-3" />
                                )}
                              </div>
                            )}
                            {selected.picture_url && PLATFORM_ICONS[selected.platform] && (
                              <img src={PLATFORM_ICONS[selected.platform]} alt="" className="absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded bg-white dark:bg-slate-800 p-[0.5px]" />
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <Filter className="w-4 h-4" />
                    )}
                    <span className="whitespace-nowrap">
                      {channelFilter === 'all' ? 'ช่องทาง' : channelFilter === 'none' ? 'เปิดบิลตรง' : (channelOptions.find(ch => ch.id === channelFilter)?.name || 'ช่องทาง')}
                    </span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${channelDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {channelDropdownOpen && (
                    <div className="absolute top-full mt-1 right-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-30 min-w-[220px] max-h-[320px] overflow-y-auto py-1">
                      {/* All */}
                      <button
                        onClick={() => { setChannelFilter('all'); setChannelDropdownOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${channelFilter === 'all' ? 'bg-orange-50 dark:bg-orange-900/20 text-[#F4511E] font-medium' : 'text-gray-700 dark:text-slate-300'}`}
                      >
                        <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                          <Filter className="w-3.5 h-3.5 text-gray-400 dark:text-slate-400" />
                        </div>
                        <span>ทั้งหมด</span>
                      </button>
                      {/* No channel */}
                      <button
                        onClick={() => { setChannelFilter('none'); setChannelDropdownOpen(false); }}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${channelFilter === 'none' ? 'bg-orange-50 dark:bg-orange-900/20 text-[#F4511E] font-medium' : 'text-gray-700 dark:text-slate-300'}`}
                      >
                        <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                          <X className="w-3.5 h-3.5 text-gray-400 dark:text-slate-400" />
                        </div>
                        <span>เปิดบิลตรง</span>
                      </button>
                      {/* Divider */}
                      <div className="h-px bg-gray-200 dark:bg-slate-600 my-1" />
                      {/* Channel options */}
                      {channelOptions.map(ch => (
                        <button
                          key={ch.id}
                          onClick={() => { setChannelFilter(ch.id); setChannelDropdownOpen(false); }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${channelFilter === ch.id ? 'bg-orange-50 dark:bg-orange-900/20 text-[#F4511E] font-medium' : 'text-gray-700 dark:text-slate-300'}`}
                        >
                          <div className="relative flex-shrink-0">
                            {ch.picture_url ? (
                              <img src={ch.picture_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
                                {PLATFORM_ICONS[ch.platform] && (
                                  <img src={PLATFORM_ICONS[ch.platform]} alt="" className="w-3.5 h-3.5" />
                                )}
                              </div>
                            )}
                            {ch.picture_url && PLATFORM_ICONS[ch.platform] && (
                              <img src={PLATFORM_ICONS[ch.platform]} alt="" className="absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded bg-white dark:bg-slate-800 p-[0.5px]" />
                            )}
                          </div>
                          <span className="truncate">{ch.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Order Status Filter Cards */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {/* Order Status */}
          {[
            { key: 'all', label: 'ทั้งหมด', active: 'bg-indigo-600', inactive: 'bg-indigo-50 dark:bg-indigo-950/50', labelColor: 'text-indigo-600 dark:text-indigo-400', countColor: 'text-indigo-700 dark:text-indigo-300' },
            { key: 'new', label: 'ใหม่', active: 'bg-blue-600', inactive: 'bg-blue-50 dark:bg-blue-950/50', labelColor: 'text-blue-600 dark:text-blue-400', countColor: 'text-blue-700 dark:text-blue-300' },
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
                  isActive
                    ? `${s.active} text-white shadow-md`
                    : `${s.inactive} hover:opacity-80`
                }`}
              >
                <div className={`text-xs font-medium ${isActive ? 'text-white/80' : s.labelColor}`}>{s.label}</div>
                <div className={`text-xl font-bold ${isActive ? 'text-white' : s.countColor}`}>{count}</div>
              </button>
            );
          })}

          {/* Divider */}
          <div className="w-px bg-gray-300 dark:bg-slate-600 self-stretch flex-shrink-0 mx-1" />

          {/* Payment Status */}
          {[
            { key: 'all', label: 'ชำระทั้งหมด', active: 'bg-slate-600', inactive: 'bg-slate-50 dark:bg-slate-800', labelColor: 'text-slate-500 dark:text-slate-400', countColor: 'text-slate-700 dark:text-slate-300' },
            { key: 'pending', label: 'รอชำระ', active: 'bg-orange-500', inactive: 'bg-orange-50 dark:bg-orange-950/50', labelColor: 'text-orange-500 dark:text-orange-400', countColor: 'text-orange-700 dark:text-orange-300' },
            { key: 'verifying', label: 'รอตรวจสอบ', active: 'bg-purple-500', inactive: 'bg-purple-50 dark:bg-purple-950/50', labelColor: 'text-purple-500 dark:text-purple-400', countColor: 'text-purple-700 dark:text-purple-300' },
            { key: 'paid', label: 'ชำระแล้ว', active: 'bg-teal-600', inactive: 'bg-teal-50 dark:bg-teal-950/50', labelColor: 'text-teal-600 dark:text-teal-400', countColor: 'text-teal-700 dark:text-teal-300' },
          ].map((s) => {
            const isActive = paymentFilter === s.key;
            const count = paymentCounts[s.key] || 0;
            return (
              <button
                key={`pay-${s.key}`}
                onClick={() => setPaymentFilter(s.key)}
                className={`flex-shrink-0 rounded-xl px-4 py-2 min-w-[80px] text-center transition-all ${
                  isActive
                    ? `${s.active} text-white shadow-md`
                    : `${s.inactive} hover:opacity-80`
                }`}
              >
                <div className={`text-xs font-medium ${isActive ? 'text-white/80' : s.labelColor}`}>{s.label}</div>
                <div className={`text-xl font-bold ${isActive ? 'text-white' : s.countColor}`}>{count}</div>
              </button>
            );
          })}
        </div>

        {/* Orders Table */}
        <div className={`data-table-wrap transition-opacity duration-150 ${fetching ? 'opacity-60' : 'opacity-100'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  {isColVisible('orderInfo') && (
                    <th className="data-th cursor-pointer select-none" onClick={() => handleSort('created_at')}>
                      <div className="flex items-center gap-1">คำสั่งซื้อ <SortIcon column="created_at" /></div>
                    </th>
                  )}
                  {isColVisible('channel') && <th className="data-th">ช่องทาง</th>}
                  {isColVisible('deliveryDate') && (
                    <th className="data-th whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort('delivery_date')}>
                      <div className="flex items-center gap-1">วันจัดส่ง <SortIcon column="delivery_date" /></div>
                    </th>
                  )}
                  {isColVisible('customer') && <th className="data-th">ลูกค้า</th>}
                  {isColVisible('branches') && <th className="data-th">สาขา</th>}
                  {isColVisible('total') && (
                    <th className="data-th text-right cursor-pointer select-none" onClick={() => handleSort('total_amount')}>
                      <div className="flex items-center gap-1 justify-end">ยอดรวม <SortIcon column="total_amount" /></div>
                    </th>
                  )}
                  {isColVisible('status') && <th className="data-th">สถานะ</th>}
                  {isColVisible('payment') && <th className="data-th whitespace-nowrap">การชำระ</th>}
                  {isColVisible('actions') && <th className="data-th text-center">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="data-tbody">
                {displayedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={activeColumnConfigs.filter(c => visibleColumns.has(c.key)).length} className="px-6 py-12 text-center text-gray-500 dark:text-slate-400">
                      {searchTerm || statusFilter !== 'all' || paymentFilter !== 'all' || channelFilter !== 'all' || deliveryDateRange?.startDate ? 'ไม่พบคำสั่งซื้อที่ค้นหา' : 'ยังไม่มีคำสั่งซื้อ'}
                    </td>
                  </tr>
                ) : (
                  displayedOrders.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/orders/${order.id}`)}
                      className="data-tr cursor-pointer"
                    >
                      {/* คำสั่งซื้อ: order_number + วันเปิดบิล + เวลา */}
                      {isColVisible('orderInfo') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{order.order_number}</span>
                            <SourceBadge source={order.source} />
                          </div>
                          <div className="text-xs text-gray-400 dark:text-slate-500">
                            {new Date(order.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                            {' '}
                            {new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                      )}

                      {/* ช่องทาง */}
                      {isColVisible('channel') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <ChannelBadge channel={order.channel} />
                        </td>
                      )}

                      {/* วันจัดส่ง */}
                      {isColVisible('deliveryDate') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {order.delivery_date ? (
                            <div className="text-sm text-gray-900 dark:text-white">
                              {new Date(order.delivery_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 dark:text-slate-500">ไม่ระบุ</span>
                          )}
                        </td>
                      )}

                      {/* ลูกค้า: ชื่อ (กดไปหน้า detail) + เบอร์โทร (กดโทร) */}
                      {isColVisible('customer') && (
                        <td className="px-6 py-4">
                          <div>
                            {order.customer_id ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); router.push(`/customers/${order.customer_id}`); }}
                                className="text-sm font-medium text-[#F4511E] hover:text-[#D63B0E] hover:underline text-left"
                              >
                                {order.customer_name}
                              </button>
                            ) : (
                              <span className="text-sm text-gray-500 dark:text-slate-400">ลูกค้าทั่วไป</span>
                            )}
                            {order.customer_phone && (
                              <div className="mt-1">
                                <a
                                  href={`tel:${order.customer_phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400 hover:text-emerald-600"
                                >
                                  <Phone className="w-3 h-3" />
                                  {order.customer_phone}
                                </a>
                              </div>
                            )}
                          </div>
                        </td>
                      )}

                      {/* สาขา */}
                      {isColVisible('branches') && (
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {order.branch_names && order.branch_names.length > 0 ? (
                              order.branch_names.map((branchName, index) => (
                                <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {branchName}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-gray-400 dark:text-slate-500">-</span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* ยอดรวม */}
                      {isColVisible('total') && (
                        <td className="px-6 py-4 text-right">
                          <div className="text-sm text-gray-900 dark:text-white">
                            ฿{formatPrice(order.total_amount)}
                          </div>
                        </td>
                      )}

                      {/* สถานะ */}
                      {isColVisible('status') && (
                        <td className="px-6 py-4">
                          {order.source !== 'shopee' && getNextOrderStatus(order.order_status) ? (
                            <button
                              onClick={(e) => handleOrderStatusClick(e, order)}
                              title={`คลิกเพื่อเปลี่ยนเป็น "${getOrderStatusLabel(getNextOrderStatus(order.order_status) || '')}"`}
                            >
                              <OrderStatusBadge status={order.order_status} clickable />
                            </button>
                          ) : (
                            <OrderStatusBadge status={order.order_status} />
                          )}
                        </td>
                      )}

                      {/* การชำระ */}
                      {isColVisible('payment') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {order.order_status === 'cancelled' ? (
                            <span className="text-gray-400 dark:text-slate-500">-</span>
                          ) : order.source === 'shopee' ? (
                            <PaymentStatusBadge status={order.payment_status} />
                          ) : getNextPaymentStatus(order.payment_status) ? (
                            <button
                              onClick={(e) => handlePaymentStatusClick(e, order)}
                              title={`คลิกเพื่อเปลี่ยนเป็น "${getPaymentStatusLabel(getNextPaymentStatus(order.payment_status) || '')}"`}
                            >
                              <PaymentStatusBadge status={order.payment_status} clickable />
                            </button>
                          ) : (
                            <PaymentStatusBadge status={order.payment_status} />
                          )}
                        </td>
                      )}

                      {/* จัดการ: edit (ทุก role) + delete (admin only) */}
                      {isColVisible('actions') && (
                        <td className="px-6 py-4">
                          <div className="flex justify-center gap-1">
                            {(!order.source || order.source === 'manual') && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const billUrl = `${window.location.origin}/bills/${order.id}`;
                                  navigator.clipboard.writeText(billUrl).then(() => {
                                    setToast('คัดลอกลิงก์บิลออนไลน์แล้ว');
                                    setTimeout(() => setToast(''), 2500);
                                  });
                                }}
                                className="text-gray-500 hover:text-[#F4511E] p-1"
                                title="คัดลอกลิงก์บิลออนไลน์"
                              >
                                <Link2 className="w-4 h-4" />
                              </button>
                            )}
                            {order.source && order.source !== 'manual' ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); router.push(`/orders/${order.id}`); }}
                                className="text-gray-500 hover:text-gray-700 p-1"
                                title="ดูคำสั่งซื้อ"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={(e) => { e.stopPropagation(); router.push(`/orders/${order.id}/edit`); }}
                                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 p-1"
                                  title="แก้ไขคำสั่งซื้อ"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                {(userProfile?.roles?.includes('owner') || userProfile?.roles?.includes('admin')) && (
                                  <button
                                    onClick={(e) => handleDeleteOrder(e, order)}
                                    className="text-red-600 hover:text-red-900 p-1"
                                    title="ลบ"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalRecords}
            startIdx={startIndex}
            endIdx={endIndex}
            recordsPerPage={recordsPerPage}
            setRecordsPerPage={setRecordsPerPage}
            setPage={setCurrentPage}
          >
            <ColumnSettingsDropdown
              configs={activeColumnConfigs}
              visible={visibleColumns}
              toggle={toggleColumn}
              buttonClassName="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              dropUp
            />
          </Pagination>
        </div>

        {/* Status Update Confirmation Modal */}
        {statusUpdateModal.show && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
          >
            <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
                  ลูกค้า: <span className="font-medium">{statusUpdateModal.order?.customer_name}</span>
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 dark:text-slate-400">เปลี่ยนจาก:</span>
                  {statusUpdateModal.statusType === 'order' ? (
                    <>
                      <OrderStatusBadge status={statusUpdateModal.order?.order_status || ''} />
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <OrderStatusBadge status={statusUpdateModal.nextStatus} />
                    </>
                  ) : (
                    <>
                      <PaymentStatusBadge status={statusUpdateModal.order?.payment_status || ''} />
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                      <PaymentStatusBadge status={statusUpdateModal.nextStatus} />
                    </>
                  )}
                </div>

                {/* Payment Details Form (only show when updating payment status to 'paid') */}
                {statusUpdateModal.statusType === 'payment' && statusUpdateModal.nextStatus === 'paid' && (
                  <div className="mt-6 pt-6 border-t space-y-4">
                    <h4 className="font-medium text-gray-900 dark:text-white">รายละเอียดการชำระเงิน</h4>

                    <p className="text-sm text-gray-600 dark:text-slate-400">
                      ยอดชำระ: <span className="font-semibold text-[#F4511E]">
                        ฿{formatPrice(statusUpdateModal.order?.total_amount)}
                      </span>
                    </p>

                    {/* Payment Method Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        วิธีการชำระเงิน <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => setPaymentDetails({ ...paymentDetails, paymentMethod: 'cash' })}
                          className={`flex-1 px-4 py-2 rounded-lg border-2 transition-colors ${
                            paymentDetails.paymentMethod === 'cash'
                              ? 'border-[#F4511E] bg-[#F4511E] bg-opacity-10 text-[#F4511E] font-medium'
                              : 'border-gray-300 text-gray-700 hover:border-gray-400'
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
                              : 'border-gray-300 text-gray-700 hover:border-gray-400'
                          }`}
                        >
                          โอนเงิน
                        </button>
                      </div>
                    </div>

                    {/* Cash Payment Fields */}
                    {paymentDetails.paymentMethod === 'cash' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ชื่อคนเก็บเงิน <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={paymentDetails.collectedBy}
                          onChange={(e) => setPaymentDetails({ ...paymentDetails, collectedBy: e.target.value })}
                          placeholder="ระบุชื่อคนเก็บเงิน"
                          className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                        />
                      </div>
                    )}

                    {/* Transfer Payment Fields */}
                    {paymentDetails.paymentMethod === 'transfer' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              วันที่จากสลิป <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={paymentDetails.transferDate}
                              onChange={(e) => setPaymentDetails({ ...paymentDetails, transferDate: e.target.value })}
                              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              เวลาจากสลิป <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="time"
                              value={paymentDetails.transferTime}
                              onChange={(e) => setPaymentDetails({ ...paymentDetails, transferTime: e.target.value })}
                              className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        หมายเหตุ
                      </label>
                      <textarea
                        value={paymentDetails.notes}
                        onChange={(e) => setPaymentDetails({ ...paymentDetails, notes: e.target.value })}
                        placeholder="หมายเหตุเพิ่มเติม (ถ้ามี)"
                        rows={2}
                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
                  disabled={updatingStatus}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors disabled:opacity-50"
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
    </Layout>
  );
}

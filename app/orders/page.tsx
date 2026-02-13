'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { supabase } from '@/lib/supabase';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { DateValueType } from 'react-tailwindcss-datepicker';
import {
  ShoppingCart,
  Plus,
  Search,
  Loader2,
  Trash2,
  Edit2,
  Phone,
  Columns3,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Link2,
  CheckCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from 'lucide-react';

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
}

// Column toggle system
type ColumnKey = 'orderInfo' | 'deliveryDate' | 'customer' | 'branches' | 'total' | 'status' | 'payment' | 'actions';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
}

const COLUMN_CONFIGS: ColumnConfig[] = [
  { key: 'orderInfo', label: 'คำสั่งซื้อ', defaultVisible: true, alwaysVisible: true },
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
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const columnSettingsRef = useRef<HTMLDivElement>(null);

  // Close column settings on click outside
  useEffect(() => {
    if (!showColumnSettings) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (columnSettingsRef.current && !columnSettingsRef.current.contains(e.target as Node)) {
        setShowColumnSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColumnSettings]);

  const toggleColumn = (key: ColumnKey) => {
    const config = COLUMN_CONFIGS.find(c => c.key === key);
    if (config?.alwaysVisible) return;
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
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

  // Debounce search term (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to page 1 when search changes
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, paymentFilter, recordsPerPage]);

  // Fetch orders with server-side filtering and pagination
  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchOrders();
    }
  }, [authLoading, userProfile, currentPage, recordsPerPage, statusFilter, paymentFilter, debouncedSearch, sortBy, sortDir]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No session');
      }

      // Build query params for server-side filtering
      const params = new URLSearchParams();
      params.set('page', currentPage.toString());
      params.set('limit', recordsPerPage.toString());
      params.set('sort_by', sortBy);
      params.set('sort_dir', sortDir);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (paymentFilter !== 'all') params.set('payment_status', paymentFilter);
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

      const response = await fetch(`/api/orders?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }

      const result = await response.json();
      setOrders(result.orders || []);
      setTotalOrders(result.pagination?.total || 0);
      setTotalPages(result.pagination?.totalPages || 0);
      if (result.statusCounts) setStatusCounts(result.statusCounts);
      if (result.paymentCounts) setPaymentCounts(result.paymentCounts);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setError('ไม่สามารถโหลดข้อมูลคำสั่งซื้อได้');
    } finally {
      setLoading(false);
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
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No session');
      }

      const updateData: any = { id: statusUpdateModal.order.id };

      if (statusUpdateModal.statusType === 'order') {
        updateData.order_status = statusUpdateModal.nextStatus;
      } else {
        updateData.payment_status = statusUpdateModal.nextStatus;
      }

      // Update order status
      const response = await fetch('/api/orders', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
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

        const paymentResponse = await fetch('/api/payment-records', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
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
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('No session');
      }

      const response = await fetch(`/api/orders?id=${order.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
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
      ? <ArrowUp className="w-3 h-3 text-[#E9B308]" />
      : <ArrowDown className="w-3 h-3 text-[#E9B308]" />;
  };

  // Client-side date filter only (server doesn't support date range yet)
  const filteredOrders = orders.filter(order => checkDateFilter(order));

  // Pagination is now handled by server, but we still filter by date client-side
  const displayedOrders = filteredOrders;

  // Calculate display indices for pagination info
  const startIndex = (currentPage - 1) * recordsPerPage;
  const endIndex = Math.min(startIndex + displayedOrders.length, totalOrders);
  const totalRecords = totalOrders;

  // Page navigation functions
  const goToFirstPage = () => setCurrentPage(1);
  const goToLastPage = () => setCurrentPage(totalPages);
  const goToPreviousPage = () => setCurrentPage(prev => Math.max(1, prev - 1));
  const goToNextPage = () => setCurrentPage(prev => Math.min(totalPages, prev + 1));
  const goToPage = (page: number) => setCurrentPage(page);

  // Generate page numbers to display (compact: current +-1, ..., last)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];

    if (totalPages <= 3) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      const start = Math.max(1, currentPage - 1);
      const end = Math.min(totalPages, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages - 1) pages.push('...');
      if (end < totalPages) pages.push(totalPages);
      if (start > 2) pages.unshift('...');
      if (start > 1) pages.unshift(1);
    }

    return pages;
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#E9B308] animate-spin" />
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
            <ShoppingCart className="w-8 h-8 text-[#E9B308]" />
            <h1 className="text-3xl font-bold text-gray-900">คำสั่งซื้อ</h1>
          </div>
          <button
            onClick={() => router.push('/orders/new')}
            className="bg-[#E9B308] text-[#00231F] px-4 py-2 rounded-lg hover:bg-[#d4a307] transition-colors flex items-center gap-2"
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
            {/* Row 1: Search + Date Range */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="ค้นหาเลขที่, ชื่อลูกค้า..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#E9B308]"
                />
              </div>
              <div className="w-64 flex-shrink-0">
                <DateRangePicker
                  value={deliveryDateRange}
                  onChange={(val) => setDeliveryDateRange(val)}
                  placeholder="วันที่ส่ง - ทั้งหมด"
                />
              </div>
              <div className="relative" ref={columnSettingsRef}>
                <button
                  onClick={() => setShowColumnSettings(!showColumnSettings)}
                  className="btn-filter-icon"
                  title="ตั้งค่าคอลัมน์"
                >
                  <Columns3 className="w-5 h-5 text-gray-500" />
                </button>
                {showColumnSettings && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                    <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase border-b border-gray-100">
                      แสดงคอลัมน์
                    </div>
                    {COLUMN_CONFIGS.filter(c => !c.alwaysVisible).map(col => (
                      <label key={col.key} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleColumns.has(col.key)}
                          onChange={() => toggleColumn(col.key)}
                          className="w-3.5 h-3.5 text-[#E9B308] border-gray-300 rounded focus:ring-[#E9B308]"
                        />
                        <span className="text-sm text-gray-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Order Status Filter Cards */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {/* Order Status */}
          {[
            { key: 'all', label: 'ทั้งหมด', active: 'bg-indigo-600 border-indigo-600 ring-indigo-600/30', inactive: 'bg-indigo-50 border-indigo-200 hover:border-indigo-300', labelColor: 'text-indigo-600', countColor: 'text-indigo-700' },
            { key: 'new', label: 'ใหม่', active: 'bg-blue-600 border-blue-600 ring-blue-600/30', inactive: 'bg-blue-50 border-blue-200 hover:border-blue-300', labelColor: 'text-blue-600', countColor: 'text-blue-700' },
            { key: 'shipping', label: 'กำลังส่ง', active: 'bg-amber-500 border-amber-500 ring-amber-500/30', inactive: 'bg-amber-50 border-amber-200 hover:border-amber-300', labelColor: 'text-amber-600', countColor: 'text-amber-700' },
            { key: 'completed', label: 'สำเร็จ', active: 'bg-emerald-600 border-emerald-600 ring-emerald-600/30', inactive: 'bg-emerald-50 border-emerald-200 hover:border-emerald-300', labelColor: 'text-emerald-600', countColor: 'text-emerald-700' },
            { key: 'cancelled', label: 'ยกเลิก', active: 'bg-gray-500 border-gray-500 ring-gray-500/30', inactive: 'bg-gray-100 border-gray-200 hover:border-gray-300', labelColor: 'text-gray-500', countColor: 'text-gray-600' },
          ].map((s) => {
            const isActive = statusFilter === s.key;
            const count = statusCounts[s.key] || 0;
            return (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`flex-shrink-0 rounded-xl border-2 px-4 py-2 min-w-[80px] text-center transition-all ${
                  isActive
                    ? `${s.active} text-white shadow-md ring-2 ring-offset-1`
                    : `${s.inactive} hover:shadow-sm`
                }`}
              >
                <div className={`text-xs font-medium ${isActive ? 'text-white/80' : s.labelColor}`}>{s.label}</div>
                <div className={`text-xl font-bold ${isActive ? 'text-white' : s.countColor}`}>{count}</div>
              </button>
            );
          })}

          {/* Divider */}
          <div className="w-px bg-gray-300 self-stretch flex-shrink-0 mx-1" />

          {/* Payment Status — tonal shift to warm/slate */}
          {[
            { key: 'all', label: 'ชำระทั้งหมด', active: 'bg-slate-600 border-slate-600 ring-slate-600/30', inactive: 'bg-slate-50 border-slate-200 hover:border-slate-300', labelColor: 'text-slate-500', countColor: 'text-slate-700' },
            { key: 'pending', label: 'รอชำระ', active: 'bg-orange-500 border-orange-500 ring-orange-500/30', inactive: 'bg-orange-50 border-orange-200 hover:border-orange-300', labelColor: 'text-orange-500', countColor: 'text-orange-700' },
            { key: 'verifying', label: 'รอตรวจสอบ', active: 'bg-purple-500 border-purple-500 ring-purple-500/30', inactive: 'bg-purple-50 border-purple-200 hover:border-purple-300', labelColor: 'text-purple-500', countColor: 'text-purple-700' },
            { key: 'paid', label: 'ชำระแล้ว', active: 'bg-teal-600 border-teal-600 ring-teal-600/30', inactive: 'bg-teal-50 border-teal-200 hover:border-teal-300', labelColor: 'text-teal-600', countColor: 'text-teal-700' },
          ].map((s) => {
            const isActive = paymentFilter === s.key;
            const count = paymentCounts[s.key] || 0;
            return (
              <button
                key={`pay-${s.key}`}
                onClick={() => setPaymentFilter(s.key)}
                className={`flex-shrink-0 rounded-xl border-2 px-4 py-2 min-w-[80px] text-center transition-all ${
                  isActive
                    ? `${s.active} text-white shadow-md ring-2 ring-offset-1`
                    : `${s.inactive} hover:shadow-sm`
                }`}
              >
                <div className={`text-xs font-medium ${isActive ? 'text-white/80' : s.labelColor}`}>{s.label}</div>
                <div className={`text-xl font-bold ${isActive ? 'text-white' : s.countColor}`}>{count}</div>
              </button>
            );
          })}
        </div>

        {/* Orders Table */}
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  {visibleColumns.has('orderInfo') && (
                    <th className="data-th cursor-pointer select-none" onClick={() => handleSort('created_at')}>
                      <div className="flex items-center gap-1">คำสั่งซื้อ <SortIcon column="created_at" /></div>
                    </th>
                  )}
                  {visibleColumns.has('deliveryDate') && (
                    <th className="data-th whitespace-nowrap cursor-pointer select-none" onClick={() => handleSort('delivery_date')}>
                      <div className="flex items-center gap-1">วันจัดส่ง <SortIcon column="delivery_date" /></div>
                    </th>
                  )}
                  {visibleColumns.has('customer') && <th className="data-th">ลูกค้า</th>}
                  {visibleColumns.has('branches') && <th className="data-th">สาขา</th>}
                  {visibleColumns.has('total') && (
                    <th className="data-th text-right cursor-pointer select-none" onClick={() => handleSort('total_amount')}>
                      <div className="flex items-center gap-1 justify-end">ยอดรวม <SortIcon column="total_amount" /></div>
                    </th>
                  )}
                  {visibleColumns.has('status') && <th className="data-th">สถานะ</th>}
                  {visibleColumns.has('payment') && <th className="data-th whitespace-nowrap">การชำระ</th>}
                  {visibleColumns.has('actions') && <th className="data-th text-center">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="data-tbody">
                {displayedOrders.length === 0 ? (
                  <tr>
                    <td colSpan={visibleColumns.size} className="px-6 py-12 text-center text-gray-500">
                      {searchTerm || statusFilter !== 'all' || paymentFilter !== 'all' || deliveryDateRange?.startDate ? 'ไม่พบคำสั่งซื้อที่ค้นหา' : 'ยังไม่มีคำสั่งซื้อ'}
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
                      {visibleColumns.has('orderInfo') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{order.order_number}</div>
                          <div className="text-xs text-gray-400">
                            {new Date(order.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                            {' '}
                            {new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                      )}

                      {/* วันจัดส่ง */}
                      {visibleColumns.has('deliveryDate') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {order.delivery_date ? (
                            <div className="text-sm text-gray-900">
                              {new Date(order.delivery_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">ไม่ระบุ</span>
                          )}
                        </td>
                      )}

                      {/* ลูกค้า: ชื่อ (กดไปหน้า edit) + เบอร์โทร (กดโทร) */}
                      {visibleColumns.has('customer') && (
                        <td className="px-6 py-4">
                          <div>
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/customers/${order.customer_id}`); }}
                              className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline text-left"
                            >
                              {order.customer_name}
                            </button>
                            {order.customer_phone && (
                              <a
                                href={`tel:${order.customer_phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center gap-1 text-xs text-gray-500 hover:text-emerald-600 mt-0.5"
                              >
                                <Phone className="w-3 h-3" />
                                {order.customer_phone}
                              </a>
                            )}
                          </div>
                        </td>
                      )}

                      {/* สาขา */}
                      {visibleColumns.has('branches') && (
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {order.branch_names && order.branch_names.length > 0 ? (
                              order.branch_names.map((branchName, index) => (
                                <span key={index} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  {branchName}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </div>
                        </td>
                      )}

                      {/* ยอดรวม */}
                      {visibleColumns.has('total') && (
                        <td className="px-6 py-4 text-right">
                          <div className="text-sm font-semibold text-gray-900">
                            ฿{order.total_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </div>
                        </td>
                      )}

                      {/* สถานะ */}
                      {visibleColumns.has('status') && (
                        <td className="px-6 py-4">
                          {getNextOrderStatus(order.order_status) ? (
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
                      {visibleColumns.has('payment') && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {order.order_status === 'cancelled' ? (
                            <span className="text-gray-400">-</span>
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
                      {visibleColumns.has('actions') && (
                        <td className="px-6 py-4">
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const billUrl = `${window.location.origin}/bills/${order.id}`;
                                navigator.clipboard.writeText(billUrl).then(() => {
                                  setToast('คัดลอกลิงก์บิลออนไลน์แล้ว');
                                  setTimeout(() => setToast(''), 2500);
                                });
                              }}
                              className="text-gray-500 hover:text-[#E9B308] p-1"
                              title="คัดลอกลิงก์บิลออนไลน์"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); router.push(`/orders/${order.id}/edit`); }}
                              className="text-blue-600 hover:text-blue-800 p-1"
                              title="แก้ไขคำสั่งซื้อ"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {userProfile?.role === 'admin' && (
                              <button
                                onClick={(e) => handleDeleteOrder(e, order)}
                                className="text-red-600 hover:text-red-900 p-1"
                                title="ลบ"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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

          {/* Pagination */}
          {totalRecords > 0 && (
            <div className="data-pagination">
              <div className="flex items-center gap-1 text-sm text-gray-600">
                <span>{startIndex + 1} - {endIndex} จาก {totalRecords} รายการ</span>
                <select
                  value={recordsPerPage}
                  onChange={(e) => {
                    setRecordsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="mx-1 px-1 py-0.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#E9B308] focus:border-transparent"
                >
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span>/หน้า</span>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button onClick={goToFirstPage} disabled={currentPage === 1} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าแรก">
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button onClick={goToPreviousPage} disabled={currentPage === 1} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าก่อน">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    {getPageNumbers().map((page, index) => {
                      if (page === '...') {
                        return (
                          <span key={`ellipsis-${index}`} className="px-2 text-gray-500">
                            ...
                          </span>
                        );
                      }
                      return (
                        <button
                          key={page}
                          onClick={() => goToPage(page as number)}
                          className={`w-8 h-8 rounded text-sm font-medium ${
                            currentPage === page
                              ? 'bg-[#E9B308] text-[#00231F]'
                              : 'hover:bg-gray-100 text-gray-700'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={goToNextPage} disabled={currentPage === totalPages} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าถัดไป">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button onClick={goToLastPage} disabled={currentPage === totalPages} className="p-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed" title="หน้าสุดท้าย">
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status Update Confirmation Modal */}
        {statusUpdateModal.show && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
          >
            <div className="bg-white rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  ยืนยันการเปลี่ยน{statusUpdateModal.statusType === 'order' ? 'สถานะคำสั่งซื้อ' : 'สถานะการชำระเงิน'}
                </h3>
                <button
                  onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="mb-6 space-y-3">
                <p className="text-gray-700">
                  คำสั่งซื้อ: <span className="font-medium">{statusUpdateModal.order?.order_number}</span>
                </p>
                <p className="text-gray-700">
                  ลูกค้า: <span className="font-medium">{statusUpdateModal.order?.customer_name}</span>
                </p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">เปลี่ยนจาก:</span>
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
                    <h4 className="font-medium text-gray-900">รายละเอียดการชำระเงิน</h4>

                    <p className="text-sm text-gray-600">
                      ยอดชำระ: <span className="font-semibold text-[#E9B308]">
                        ฿{statusUpdateModal.order?.total_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
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
                              ? 'border-[#E9B308] bg-[#E9B308] bg-opacity-10 text-[#00231F] font-medium'
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
                              ? 'border-[#E9B308] bg-[#E9B308] bg-opacity-10 text-[#00231F] font-medium'
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
                          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E9B308]"
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
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E9B308]"
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
                              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E9B308]"
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
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E9B308]"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setStatusUpdateModal({ show: false, order: null, nextStatus: '', statusType: 'order' })}
                  disabled={updatingStatus}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={confirmStatusUpdate}
                  disabled={updatingStatus}
                  className="px-4 py-2 bg-[#E9B308] text-[#00231F] rounded-lg hover:bg-[#d4a307] transition-colors disabled:opacity-50 flex items-center gap-2"
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

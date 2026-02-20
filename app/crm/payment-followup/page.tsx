'use client';

import { useState, useEffect, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { DateValueType } from 'react-tailwindcss-datepicker';
import {
  DollarSign,
  Loader2,
  Phone,
  Calendar,
  AlertTriangle,
  Clock,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MessageCircle,
  Users,
  FileText,
  ExternalLink,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';

// Column toggle system
type ColumnKey = 'customer' | 'daysOverdue' | 'orderCount' | 'dateRange' | 'totalPending' | 'actions';

const COLUMN_CONFIGS: { key: ColumnKey; label: string; defaultVisible: boolean; alwaysVisible?: boolean }[] = [
  { key: 'customer', label: 'ลูกค้า', defaultVisible: true, alwaysVisible: true },
  { key: 'daysOverdue', label: 'ค้างมา', defaultVisible: true },
  { key: 'orderCount', label: 'จำนวนบิล', defaultVisible: true },
  { key: 'dateRange', label: 'ช่วงบิล', defaultVisible: true },
  { key: 'totalPending', label: 'ยอดค้าง', defaultVisible: true },
  { key: 'actions', label: 'ดำเนินการ', defaultVisible: true, alwaysVisible: true },
];

const STORAGE_KEY = 'crm-payment-followup-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

interface PendingOrder {
  id: string;
  orderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  daysAgo: number;
}

interface CustomerWithPending {
  customerId: string;
  customerCode: string;
  customerName: string;
  contactPerson: string;
  phone: string;
  creditDays: number;
  totalPending: number;
  orderCount: number;
  oldestOrderDate: string;
  newestOrderDate: string;
  daysOverdue: number;
  lineUserId: string | null;
  lineDisplayName: string | null;
  orders: PendingOrder[];
}

interface DayRange {
  minDays: number;
  maxDays: number | null;
  label: string;
  color: string;
}

interface Summary {
  totalCustomers: number;
  totalOrders: number;
  totalPending: number;
  customersWithLine: number;
  rangeCounts: Record<string, number>;
  dayRanges: DayRange[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Sortable header component
function SortableHeader({
  label,
  field,
  currentSort,
  currentOrder,
  onSort,
  className = ''
}: {
  label: string;
  field: string;
  currentSort: string;
  currentOrder: 'asc' | 'desc';
  onSort: (field: string) => void;
  className?: string;
}) {
  const isActive = currentSort === field;

  return (
    <th
      className={`data-th cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 select-none ${className}`}
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className="inline-flex flex-col">
          {isActive ? (
            currentOrder === 'asc' ? (
              <ArrowUp className="w-3 h-3 text-[#F4511E]" />
            ) : (
              <ArrowDown className="w-3 h-3 text-[#F4511E]" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-300" />
          )}
        </span>
      </div>
    </th>
  );
}

// Aging badge - shows how long payment is overdue
function AgingBadge({ days }: { days: number }) {
  let colorClass = 'bg-green-100 text-green-800';
  let icon = <Clock className="w-3 h-3" />;

  if (days > 60) {
    colorClass = 'bg-purple-100 text-purple-800';
    icon = <AlertTriangle className="w-3 h-3" />;
  } else if (days > 30) {
    colorClass = 'bg-red-100 text-red-800';
    icon = <AlertTriangle className="w-3 h-3" />;
  } else if (days > 14) {
    colorClass = 'bg-orange-100 text-orange-800';
  } else if (days > 7) {
    colorClass = 'bg-yellow-100 text-yellow-800';
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {icon}
      {days} วัน
    </span>
  );
}

// Order status badge
function OrderStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    new: { label: 'ใหม่', color: 'bg-blue-100 text-blue-700' },
    shipping: { label: 'กำลังส่ง', color: 'bg-yellow-100 text-yellow-700' },
    completed: { label: 'ส่งแล้ว', color: 'bg-green-100 text-green-700' }
  };
  const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700' };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

// Payment status badge
function PaymentStatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; color: string }> = {
    pending: { label: 'รอชำระ', color: 'bg-orange-100 text-orange-700' },
    verifying: { label: 'รอตรวจสอบ', color: 'bg-purple-100 text-purple-700' },
  };
  const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700' };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

export default function PaymentFollowupPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();

  const [customers, setCustomers] = useState<CustomerWithPending[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterDays, setFilterDays] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateValueType>({ startDate: null, endDate: null });
  const [sortBy, setSortBy] = useState<string>('days_overdue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try { return new Set(JSON.parse(stored) as ColumnKey[]); } catch { /* use defaults */ }
      }
    }
    return new Set(getDefaultColumns());
  });

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const isCol = (key: ColumnKey) => visibleColumns.has(key);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch data
  const isAuthReady = !authLoading && !!userProfile;
  useEffect(() => {
    if (!isAuthReady) return;
    fetchCustomers();
  }, [isAuthReady, debouncedSearch, filterDays, dateRange, sortBy, sortOrder, currentPage, rowsPerPage]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      params.set('sort_by', sortBy);
      params.set('sort_order', sortOrder);
      params.set('page', currentPage.toString());
      params.set('limit', rowsPerPage.toString());

      // Apply filter
      if (filterDays !== 'all') {
        const [minStr, maxStr] = filterDays.split('-');
        params.set('min_days', minStr);
        if (maxStr !== 'null') {
          params.set('max_days', maxStr);
        }
      }

      // Apply date range filter
      if (dateRange?.startDate) {
        params.set('date_from', typeof dateRange.startDate === 'string' ? dateRange.startDate : dateRange.startDate.toISOString().split('T')[0]);
      }
      if (dateRange?.endDate) {
        params.set('date_to', typeof dateRange.endDate === 'string' ? dateRange.endDate : dateRange.endDate.toISOString().split('T')[0]);
      }

      const response = await apiFetch(`/api/crm/payment-followup?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const result = await response.json();
      setCustomers(result.customers || []);
      setSummary(result.summary || null);
      setPagination(result.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (error) {
      console.error('Error fetching customers:', error);
      setError('ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };


  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleContactLine = (lineUserId: string) => {
    // Navigate to LINE chat with this user
    router.push(`/line-chat?user=${lineUserId}`);
  };

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  if (authLoading) {
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-7 h-7 text-[#F4511E]" />
              ติดตามหนี้
            </h1>
            <p className="text-gray-500 mt-1">ติดตามยอดค้างชำระจากลูกค้า</p>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Total pending */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-2 text-red-600 mb-1">
                <DollarSign className="w-4 h-4" />
                <span className="text-xs">ยอดค้างรวม</span>
              </div>
              <div className="text-2xl font-bold text-red-600">
                ฿{formatPrice(summary.totalPending)}
              </div>
            </div>

            {/* Total customers */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <Users className="w-4 h-4" />
                <span className="text-xs">ลูกค้าค้างชำระ</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalCustomers} ราย</div>
            </div>

            {/* Total orders */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-2 text-gray-500 mb-1">
                <FileText className="w-4 h-4" />
                <span className="text-xs">บิลค้างชำระ</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalOrders} บิล</div>
            </div>

            {/* Customers with LINE */}
            <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <div className="flex items-center gap-2 text-green-600 mb-1">
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs">เชื่อม LINE แล้ว</span>
              </div>
              <div className="text-2xl font-bold text-green-600">{summary.customersWithLine} ราย</div>
            </div>
          </div>
        )}

        {/* Aging Filter Cards */}
        {summary && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {/* All */}
            <button
              onClick={() => { setFilterDays('all'); setCurrentPage(1); }}
              className={`bg-white dark:bg-slate-800 rounded-lg border p-3 text-left transition-all hover:shadow-md ${filterDays === 'all' ? 'border-[#F4511E] ring-2 ring-[#F4511E]/20' : 'border-gray-200 dark:border-slate-700'}`}
            >
              <div className="text-xs text-gray-500 dark:text-slate-400 mb-1">ทั้งหมด</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">{summary.totalCustomers}</div>
            </button>

            {/* Dynamic range cards */}
            {summary.dayRanges.map((range) => {
              const colorClasses: Record<string, { text: string; border: string; ring: string }> = {
                green: { text: 'text-green-600', border: 'border-green-500', ring: 'ring-green-500/20' },
                yellow: { text: 'text-yellow-600', border: 'border-yellow-500', ring: 'ring-yellow-500/20' },
                orange: { text: 'text-orange-600', border: 'border-orange-500', ring: 'ring-orange-500/20' },
                red: { text: 'text-red-600', border: 'border-red-500', ring: 'ring-red-500/20' },
                purple: { text: 'text-purple-600', border: 'border-purple-500', ring: 'ring-purple-500/20' }
              };
              const colors = colorClasses[range.color] || colorClasses.green;
              const rangeKey = `${range.minDays}-${range.maxDays ?? 'null'}`;
              const isActive = filterDays === rangeKey;
              const count = summary.rangeCounts[rangeKey] || 0;

              return (
                <button
                  key={rangeKey}
                  onClick={() => { setFilterDays(rangeKey); setCurrentPage(1); }}
                  className={`bg-white dark:bg-slate-800 rounded-lg border p-3 text-left transition-all hover:shadow-md ${isActive ? `${colors.border} ring-2 ${colors.ring}` : 'border-gray-200 dark:border-slate-700'}`}
                >
                  <div className={`text-xs ${colors.text} mb-1`}>{range.label}</div>
                  <div className={`text-xl font-bold ${colors.text}`}>{count}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="data-filter-card">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="ค้นหาชื่อลูกค้า, รหัส, เบอร์โทร..." className="py-2" />
            </div>

            {/* Date range filter */}
            <div className="w-full md:w-64">
              <DateRangePicker
                value={dateRange}
                onChange={(val) => { setDateRange(val); setCurrentPage(1); }}
                placeholder="ช่วงวันที่สั่งซื้อ"
                showShortcuts={true}
                showFooter={true}
              />
            </div>

            {/* Filter by days */}
            <div className="flex items-center gap-2">
              <select
                value={filterDays}
                onChange={(e) => { setFilterDays(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] text-sm"
              >
                <option value="all">ทั้งหมด</option>
                {summary?.dayRanges.map((range) => {
                  const rangeKey = `${range.minDays}-${range.maxDays ?? 'null'}`;
                  return (
                    <option key={rangeKey} value={rangeKey}>
                      {range.label}
                    </option>
                  );
                })}
              </select>
            </div>

          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Customer List */}
        <div className="data-table-wrap">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
            </div>
          ) : customers.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg">ไม่มียอดค้างชำระ</p>
              <p className="text-gray-400 text-sm">ลูกค้าทุกรายชำระเงินครบถ้วนแล้ว</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="data-thead">
                  <tr>
                    {isCol('customer') && <SortableHeader label="ลูกค้า" field="name" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="text-left" />}
                    {isCol('daysOverdue') && <SortableHeader label="ค้างมา" field="days_overdue" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="text-center" />}
                    {isCol('orderCount') && <SortableHeader label="จำนวนบิล" field="order_count" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="text-center" />}
                    {isCol('dateRange') && <SortableHeader label="ช่วงบิล" field="oldest_order" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="text-left" />}
                    {isCol('totalPending') && <SortableHeader label="ยอดค้าง" field="total_pending" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="text-right" />}
                    {isCol('actions') && <th className="data-th text-center">ดำเนินการ</th>}
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase w-10"></th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {customers.map((customer) => (
                    <Fragment key={customer.customerId}>
                      {/* Customer Row */}
                      <tr
                        className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                        onClick={() => toggleRow(customer.customerId)}
                      >
                        {/* Customer Info */}
                        {isCol('customer') && (
                        <td className="px-6 py-4">
                          <div>
                            <div className="text-xs text-gray-400 mb-0.5">{customer.customerCode}</div>
                            <div className="font-medium text-gray-900 dark:text-white">{customer.customerName}</div>
                            {customer.phone !== '-' && (
                              <a
                                href={`tel:${customer.phone}`}
                                className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mt-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="w-3 h-3" />
                                {customer.phone}
                              </a>
                            )}
                          </div>
                        </td>
                        )}

                        {/* Days Overdue */}
                        {isCol('daysOverdue') && (
                        <td className="px-6 py-4 text-center">
                          <AgingBadge days={customer.daysOverdue} />
                        </td>
                        )}

                        {/* Order Count */}
                        {isCol('orderCount') && (
                        <td className="px-6 py-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-700">
                            {customer.orderCount} บิล
                          </span>
                        </td>
                        )}

                        {/* Date Range */}
                        {isCol('dateRange') && (
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-slate-400">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatDate(customer.oldestOrderDate)}</span>
                            {customer.orderCount > 1 && (
                              <>
                                <span className="text-gray-400 dark:text-slate-500">-</span>
                                <span>{formatDate(customer.newestOrderDate)}</span>
                              </>
                            )}
                          </div>
                        </td>
                        )}

                        {/* Total Pending */}
                        {isCol('totalPending') && (
                        <td className="px-6 py-4 text-right">
                          <span className="font-bold text-red-600">฿{formatPrice(customer.totalPending)}</span>
                        </td>
                        )}

                        {/* Actions */}
                        {isCol('actions') && (
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {customer.lineUserId ? (
                              <button
                                onClick={() => handleContactLine(customer.lineUserId!)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium transition-colors"
                                title={`ทักใน LINE: ${customer.lineDisplayName}`}
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                ทัก LINE
                              </button>
                            ) : (
                              <span className="text-gray-400 text-xs">ไม่มี LINE</span>
                            )}
                            <button
                              onClick={() => router.push(`/customers/${customer.customerId}`)}
                              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                              title="ดูรายละเอียดลูกค้า"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                        )}

                        {/* Expand */}
                        <td className="px-6 py-4 text-center">
                          {expandedRows.has(customer.customerId) ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          )}
                        </td>
                      </tr>

                      {/* Expanded Order Details */}
                      {expandedRows.has(customer.customerId) && customer.orders.map((order) => (
                        <tr
                          key={order.id}
                          className="bg-gray-50 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
                          onClick={() => router.push(`/orders/${order.id}`)}
                        >
                          {isCol('customer') && (
                          <td className="px-6 py-3 pl-12">
                            <div>
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{order.orderNumber}</span>
                              <div className="text-xs text-gray-500 dark:text-slate-400">สั่ง: {formatDate(order.orderDate)}</div>
                            </div>
                          </td>
                          )}
                          {isCol('daysOverdue') && (
                          <td className="px-6 py-3 text-center">
                            <span className="text-sm text-gray-600 dark:text-slate-400">{order.daysAgo} วัน</span>
                          </td>
                          )}
                          {isCol('orderCount') && (
                          <td className="px-6 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <OrderStatusBadge status={order.orderStatus} />
                              <PaymentStatusBadge status={order.paymentStatus} />
                            </div>
                          </td>
                          )}
                          {isCol('dateRange') && (
                          <td className="px-6 py-3">
                            <div className="text-sm text-gray-600 dark:text-slate-400">
                              ส่ง: {formatDate(order.deliveryDate)}
                            </div>
                          </td>
                          )}
                          {isCol('totalPending') && (
                          <td className="px-6 py-3 text-right">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">฿{formatPrice(order.totalAmount)}</span>
                          </td>
                          )}
                          <td colSpan={(isCol('actions') ? 1 : 0) + 1} className="px-6 py-3 text-center">
                            <ChevronRight className="w-4 h-4 text-gray-400 inline" />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>

                {/* Total Footer */}
                <tfoot className="data-tfoot">
                  <tr>
                    <td colSpan={[isCol('customer'), isCol('daysOverdue'), isCol('orderCount'), isCol('dateRange')].filter(Boolean).length || 1} className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                      รวมทั้งหมด ({summary?.totalOrders || 0} บิล จาก {summary?.totalCustomers || 0} ลูกค้า)
                    </td>
                    {isCol('totalPending') && (
                    <td className="px-6 py-4 text-right font-bold text-red-600">
                      ฿{formatPrice(summary?.totalPending || 0)}
                    </td>
                    )}
                    <td colSpan={(isCol('actions') ? 1 : 0) + 1}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {!loading && (
            <Pagination
              currentPage={currentPage}
              totalPages={pagination.totalPages}
              totalRecords={pagination.total}
              startIdx={(currentPage - 1) * rowsPerPage}
              endIdx={Math.min(currentPage * rowsPerPage, pagination.total)}
              recordsPerPage={rowsPerPage}
              setRecordsPerPage={setRowsPerPage}
              setPage={setCurrentPage}
            >
              <ColumnSettingsDropdown
                configs={COLUMN_CONFIGS}
                visible={visibleColumns}
                toggle={toggleColumn}
                buttonClassName="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
                dropUp
              />
            </Pagination>
          )}
        </div>
      </div>
    </Layout>
  );
}

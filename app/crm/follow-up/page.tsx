'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import {
  Users,
  Search,
  Loader2,
  Phone,
  Calendar,
  AlertTriangle,
  Clock,
  Plus,
  ChevronRight,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MessageCircle,
  ExternalLink,
  X,
  ArrowRight,
  FileText
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';

// Column toggle system
type ColumnKey = 'customer' | 'type' | 'lastOrder' | 'daysSince' | 'frequency' | 'totalOrders' | 'totalSpent' | 'actions';

const COLUMN_CONFIGS: { key: ColumnKey; label: string; defaultVisible: boolean; alwaysVisible?: boolean }[] = [
  { key: 'customer', label: 'ลูกค้า', defaultVisible: true, alwaysVisible: true },
  { key: 'type', label: 'ประเภท', defaultVisible: true },
  { key: 'lastOrder', label: 'สั่งล่าสุด', defaultVisible: true },
  { key: 'daysSince', label: 'สั่งไปแล้ว', defaultVisible: true },
  { key: 'frequency', label: 'รอบสั่งซื้อ', defaultVisible: true },
  { key: 'totalOrders', label: 'ออเดอร์', defaultVisible: true },
  { key: 'totalSpent', label: 'ยอดซื้อรวม', defaultVisible: true },
  { key: 'actions', label: 'ดำเนินการ', defaultVisible: true, alwaysVisible: true },
];

const STORAGE_KEY = 'crm-followup-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

interface CRMCustomer {
  id: string;
  customer_code: string;
  name: string;
  contact_person?: string;
  phone?: string;
  province?: string;
  customer_type: 'retail' | 'wholesale' | 'distributor';
  last_order_date: string | null;
  days_since_last_order: number | null;
  avg_order_frequency: number | null;
  total_orders: number;
  total_spent: number;
  line_user_id: string | null;
  line_display_name: string | null;
}

interface DayRange {
  minDays: number;
  maxDays: number | null;
  label: string;
  color: string;
}

interface Summary {
  totalCustomers: number;
  customersWithOrders: number;
  customersNeverOrdered: number;
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

// Customer type badge
function CustomerTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    retail: 'bg-blue-100 text-blue-800',
    wholesale: 'bg-purple-100 text-purple-800',
    distributor: 'bg-green-100 text-green-800'
  };

  const labels: Record<string, string> = {
    retail: 'ขายปลีก',
    wholesale: 'ขายส่ง',
    distributor: 'ตัวแทนจำหน่าย'
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colors[type] || 'bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-slate-300'}`}>
      {labels[type] || type}
    </span>
  );
}

// Days since last order badge
function DaysBadge({ days, avgFrequency }: { days: number | null; avgFrequency: number | null }) {
  if (days === null) {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-400">
        ยังไม่เคยสั่ง
      </span>
    );
  }

  let colorClass = 'bg-green-100 text-green-800';
  let isOverdue = false;

  if (avgFrequency && days > avgFrequency) {
    isOverdue = true;
    const overdueRatio = days / avgFrequency;
    if (overdueRatio >= 2) {
      colorClass = 'bg-red-100 text-red-800';
    } else if (overdueRatio >= 1.5) {
      colorClass = 'bg-orange-100 text-orange-800';
    } else {
      colorClass = 'bg-yellow-100 text-yellow-800';
    }
  } else {
    if (days >= 30) {
      colorClass = 'bg-red-100 text-red-800';
    } else if (days >= 14) {
      colorClass = 'bg-orange-100 text-orange-800';
    } else if (days >= 7) {
      colorClass = 'bg-yellow-100 text-yellow-800';
    }
  }

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${colorClass}`}>
      {days} วัน {isOverdue && avgFrequency && <span className="opacity-75">(เกิน)</span>}
    </span>
  );
}

// Frequency badge (clickable to show order history)
function FrequencyBadge({ frequency, onClick }: { frequency: number | null; onClick?: () => void }) {
  if (frequency === null) {
    return <span className="text-gray-400 text-sm">-</span>;
  }

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 hover:underline cursor-pointer transition-colors"
      title="ดูประวัติการสั่งซื้อ"
    >
      ทุก ~{frequency} วัน
    </button>
  );
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

export default function CRMFollowUpPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();

  const [customers, setCustomers] = useState<CRMCustomer[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterDays, setFilterDays] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('days_since_last_order');
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

  // Order history modal
  const [orderHistoryModal, setOrderHistoryModal] = useState<{
    show: boolean;
    customer: CRMCustomer | null;
    orders: Array<{ order_number: string; order_date: string; total_amount: number; order_status: string }>;
    loading: boolean;
  }>({ show: false, customer: null, orders: [], loading: false });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to page 1 on search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch customers
  const isAuthReady = !authLoading && !!userProfile;
  useEffect(() => {
    if (!isAuthReady) return;
    fetchCustomers();
  }, [isAuthReady, debouncedSearch, filterDays, sortBy, sortOrder, currentPage, rowsPerPage]);

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
      if (filterDays === 'never') {
        params.set('has_orders', 'false');
      } else if (filterDays !== 'all') {
        const [minStr, maxStr] = filterDays.split('-');
        params.set('min_days', minStr);
        if (maxStr !== 'null') {
          params.set('max_days', maxStr);
        }
        params.set('has_orders', 'true');
      }

      const response = await apiFetch(`/api/crm/customers?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch customers');
      }

      const result = await response.json();
      setCustomers(result.customers || []);
      setSummary(result.summary || null);
      setPagination(result.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
    } catch (error) {
      console.error('Error fetching customers:', error);
      setError('ไม่สามารถโหลดข้อมูลลูกค้าได้');
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

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setCurrentPage(1);
  };

  const handleCreateOrder = (customerId: string) => {
    router.push(`/orders/new?customer=${customerId}`);
  };

  const handleContactLine = (lineUserId: string) => {
    router.push(`/line-chat?user=${lineUserId}`);
  };

  const handleShowOrderHistory = async (customer: CRMCustomer) => {
    setOrderHistoryModal({ show: true, customer, orders: [], loading: true });

    try {
      const res = await apiFetch(`/api/orders?customer_id=${customer.id}&limit=20&sort_by=order_date&sort_dir=desc`);
      const data = await res.json();
      const orders = (data.orders || [])
        .filter((o: { order_status: string }) => o.order_status !== 'cancelled')
        .map((o: { order_number: string; order_date: string; total_amount: number; order_status: string }) => ({
          order_number: o.order_number,
          order_date: o.order_date,
          total_amount: o.total_amount,
          order_status: o.order_status,
        }));

      setOrderHistoryModal(prev => ({ ...prev, orders, loading: false }));
    } catch {
      setOrderHistoryModal(prev => ({ ...prev, loading: false }));
    }
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
              <Users className="w-7 h-7 text-[#F4511E]" />
              ติดตามลูกค้า
            </h1>
            <p className="text-gray-500 mt-1">ติดตามลูกค้าที่ไม่ได้สั่งซื้อนาน</p>
          </div>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {/* Total customers */}
            <button
              onClick={() => { setFilterDays('all'); setCurrentPage(1); }}
              className={`bg-white dark:bg-slate-800 rounded-lg border p-4 text-left transition-all hover:shadow-md ${filterDays === 'all' ? 'border-[#F4511E] ring-2 ring-[#F4511E]/20' : 'border-gray-200 dark:border-slate-700'}`}
            >
              <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 mb-1">
                <Users className="w-4 h-4" />
                <span className="text-xs">ทั้งหมด</span>
              </div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{summary.totalCustomers}</div>
            </button>

            {/* Never ordered */}
            <button
              onClick={() => { setFilterDays('never'); setCurrentPage(1); }}
              className={`bg-white dark:bg-slate-800 rounded-lg border p-4 text-left transition-all hover:shadow-md ${filterDays === 'never' ? 'border-gray-500 ring-2 ring-gray-500/20' : 'border-gray-200 dark:border-slate-700'}`}
            >
              <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs">ยังไม่เคยสั่ง</span>
              </div>
              <div className="text-2xl font-bold text-gray-600 dark:text-slate-400">{summary.customersNeverOrdered}</div>
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
              const colors = colorClasses[range.color] || { text: 'text-gray-600', border: 'border-gray-500', ring: 'ring-gray-500/20' };
              const rangeKey = `${range.minDays}-${range.maxDays ?? 'null'}`;
              const isActive = filterDays === rangeKey;
              const count = summary.rangeCounts[rangeKey] || 0;
              const isWarning = range.color === 'orange' || range.color === 'red';

              return (
                <button
                  key={rangeKey}
                  onClick={() => { setFilterDays(rangeKey); setCurrentPage(1); }}
                  className={`bg-white dark:bg-slate-800 rounded-lg border p-4 text-left transition-all hover:shadow-md ${isActive ? `${colors.border} ring-2 ${colors.ring}` : 'border-gray-200 dark:border-slate-700'}`}
                >
                  <div className={`flex items-center gap-2 ${colors.text} mb-1`}>
                    {isWarning ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    <span className="text-xs">{range.label}</span>
                  </div>
                  <div className={`text-2xl font-bold ${colors.text}`}>{count}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="data-filter-card">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาชื่อลูกค้า, รหัส, เบอร์โทร..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] text-sm"
              />
            </div>

            {/* Filter by days */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={filterDays}
                onChange={(e) => { setFilterDays(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F4511E] text-sm"
              >
                <option value="all">ทั้งหมด</option>
                <option value="never">ยังไม่เคยสั่ง</option>
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
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-slate-400">ไม่พบลูกค้าตามเงื่อนไขที่เลือก</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="data-thead">
                  <tr>
                    {isCol('customer') && <SortableHeader label="ลูกค้า" field="name" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="text-left" />}
                    {isCol('type') && <th className="data-th">ประเภท</th>}
                    {isCol('lastOrder') && <SortableHeader label="สั่งล่าสุด" field="last_order_date" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="text-left" />}
                    {isCol('daysSince') && <SortableHeader label="สั่งไปแล้ว" field="days_since_last_order" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="text-center" />}
                    {isCol('frequency') && <th className="data-th text-center">รอบสั่งซื้อ</th>}
                    {isCol('totalOrders') && <SortableHeader label="ออเดอร์" field="total_orders" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="text-center" />}
                    {isCol('totalSpent') && <SortableHeader label="ยอดซื้อรวม" field="total_spent" currentSort={sortBy} currentOrder={sortOrder} onSort={handleSort} className="text-right" />}
                    {isCol('actions') && <th className="data-th text-center">ดำเนินการ</th>}
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="data-tr">
                      {/* Customer Info */}
                      {isCol('customer') && (
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-xs text-gray-400 mb-0.5">{customer.customer_code}</div>
                          <div className="font-medium text-gray-900 dark:text-white">{customer.name}</div>
                          {customer.phone && (
                            <a
                              href={`tel:${customer.phone}`}
                              className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 mt-1"
                            >
                              <Phone className="w-3 h-3" />
                              {customer.phone}
                            </a>
                          )}
                        </div>
                      </td>
                      )}

                      {/* Type */}
                      {isCol('type') && (
                      <td className="px-6 py-4">
                        <CustomerTypeBadge type={customer.customer_type || 'retail'} />
                      </td>
                      )}

                      {/* Last Order Date */}
                      {isCol('lastOrder') && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-slate-400">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(customer.last_order_date)}
                        </div>
                      </td>
                      )}

                      {/* Days Since Last Order */}
                      {isCol('daysSince') && (
                      <td className="px-6 py-4 text-center">
                        <DaysBadge days={customer.days_since_last_order} avgFrequency={customer.avg_order_frequency} />
                      </td>
                      )}

                      {/* Order Frequency */}
                      {isCol('frequency') && (
                      <td className="px-6 py-4 text-center">
                        <FrequencyBadge
                          frequency={customer.avg_order_frequency}
                          onClick={() => customer.total_orders >= 2 && handleShowOrderHistory(customer)}
                        />
                      </td>
                      )}

                      {/* Total Orders */}
                      {isCol('totalOrders') && (
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{customer.total_orders}</span>
                      </td>
                      )}

                      {/* Total Spent */}
                      {isCol('totalSpent') && (
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          ฿{formatPrice(customer.total_spent)}
                        </span>
                      </td>
                      )}

                      {/* Actions */}
                      {isCol('actions') && (
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          {customer.line_user_id ? (
                            <button
                              onClick={() => handleContactLine(customer.line_user_id!)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm font-medium transition-colors"
                              title={`ทักใน LINE: ${customer.line_display_name}`}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              ทัก LINE
                            </button>
                          ) : (
                            <button
                              onClick={() => handleCreateOrder(customer.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] text-sm font-medium transition-colors"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              สร้างออเดอร์
                            </button>
                          )}
                          <button
                            onClick={() => router.push(`/customers/${customer.id}`)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
                            title="ดูรายละเอียด"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      )}
                    </tr>
                  ))}
                </tbody>
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

      {/* Order History Modal */}
      {orderHistoryModal.show && orderHistoryModal.customer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setOrderHistoryModal({ show: false, customer: null, orders: [], loading: false })}>
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">{orderHistoryModal.customer.name}</h3>
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  ประวัติการสั่งซื้อ {orderHistoryModal.orders.length > 0 ? `(${orderHistoryModal.orders.length} รายการ)` : ''}
                  {orderHistoryModal.customer.avg_order_frequency && (
                    <span className="ml-2 text-blue-600 dark:text-blue-400 font-medium">เฉลี่ยทุก ~{orderHistoryModal.customer.avg_order_frequency} วัน</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setOrderHistoryModal({ show: false, customer: null, orders: [], loading: false })}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[60vh] px-5 py-4">
              {orderHistoryModal.loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
                </div>
              ) : orderHistoryModal.orders.length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-slate-500">
                  <FileText className="w-10 h-10 mx-auto mb-2" />
                  <p className="text-sm">ไม่มีประวัติการสั่งซื้อ</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {orderHistoryModal.orders.map((order, idx) => {
                    const nextOrder = orderHistoryModal.orders[idx + 1];
                    let gap: number | null = null;
                    if (nextOrder) {
                      const d1 = new Date(order.order_date).getTime();
                      const d2 = new Date(nextOrder.order_date).getTime();
                      gap = Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
                    }

                    const statusConfig: Record<string, { label: string; color: string }> = {
                      new: { label: 'ใหม่', color: 'bg-blue-100 text-blue-700' },
                      shipping: { label: 'กำลังส่ง', color: 'bg-yellow-100 text-yellow-700' },
                      completed: { label: 'สำเร็จ', color: 'bg-green-100 text-green-700' },
                    };
                    const status = statusConfig[order.order_status] || { label: order.order_status, color: 'bg-gray-100 text-gray-700' };

                    return (
                      <div key={idx}>
                        {/* Order row */}
                        <div className="flex items-center gap-3 py-2.5">
                          <div className="w-6 text-center text-xs text-gray-400 font-medium">{idx + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{order.order_number}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${status.color}`}>{status.label}</span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-slate-400">
                              {new Date(order.order_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </div>
                          </div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                            ฿{formatPrice(order.total_amount)}
                          </div>
                        </div>

                        {/* Gap indicator */}
                        {gap !== null && (
                          <div className="flex items-center gap-3 py-1">
                            <div className="w-6" />
                            <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-500">
                              <div className="w-px h-3 bg-gray-200 ml-1" />
                              <ArrowRight className="w-3 h-3" />
                              <span className={gap > (orderHistoryModal.customer?.avg_order_frequency || 999) ? 'text-orange-500 font-medium' : ''}>
                                {gap} วัน
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

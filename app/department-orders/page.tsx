'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  Building2, Plus, Loader2, RefreshCw,
  ChevronRight, Package, Truck, Receipt, UserPlus,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';

interface DeptOrder {
  id: string;
  department_order_number: string;
  status: string;
  total_amount: number;
  tax_invoice_number?: string | null;
  shipping_carrier?: string | null;
  tracking_number?: string | null;
  created_at: string;
  shipped_at?: string | null;
  paid_at?: string | null;
  customer: { id: string; name: string; customer_code: string | null } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: 'แบบร่าง', color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/40' },
  confirmed: { label: 'ยืนยันแล้ว', color: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-100 dark:bg-blue-900/40' },
  shipped: { label: 'จัดส่งแล้ว', color: 'text-amber-700 dark:text-amber-300', bg: 'bg-amber-100 dark:bg-amber-900/40' },
  invoiced: { label: 'ออก Invoice แล้ว', color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  paid: { label: 'ได้รับเงินแล้ว', color: 'text-green-700 dark:text-green-300', bg: 'bg-green-100 dark:bg-green-900/40' },
  cancelled: { label: 'ยกเลิก', color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-700/40' },
};

const STATUS_TABS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'draft', label: 'แบบร่าง' },
  { key: 'confirmed', label: 'ยืนยันแล้ว' },
  { key: 'shipped', label: 'จัดส่งแล้ว' },
  { key: 'invoiced', label: 'Invoice' },
  { key: 'paid', label: 'ได้รับเงิน' },
];

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อกี้';
  if (mins < 60) return `${mins}นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}ชม.ที่แล้ว`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}วันที่แล้ว`;
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export default function DepartmentOrdersPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [activeStatus, setActiveStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [orders, setOrders] = useState<DeptOrder[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true); else setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(recordsPerPage),
      });
      if (activeStatus !== 'all') params.set('status', activeStatus);
      if (search) params.set('search', search);

      const res = await apiFetch(`/api/department-orders?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setOrders(data.orders || []);
      setTotalRecords(data.pagination?.total || 0);
      setTotalPages(data.pagination?.totalPages || 0);
      setStatusCounts(data.status_counts || {});
    } catch {
      showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeStatus, search, currentPage, recordsPerPage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusChange = (s: string) => { setActiveStatus(s); setCurrentPage(1); };
  const handleSearchChange = (val: string) => { setSearch(val); setCurrentPage(1); };

  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const getTabCount = (key: string) => key === 'all' ? totalCount : (statusCounts[key] || 0);

  const startIdx = (currentPage - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + orders.length, totalRecords);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 text-[#F4511E]" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">ส่งห้าง</h1>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Department Store Orders</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => router.push('/customers/new?type=department_store')}
              className="px-4 py-2 rounded-lg border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              <UserPlus className="w-4 h-4" /> เพิ่มลูกค้าห้าง
            </button>
            <button
              onClick={() => router.push('/department-orders/new')}
              className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> สร้างใบส่งห้าง
            </button>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_TABS.map(tab => {
            const count = getTabCount(tab.key);
            const isActive = activeStatus === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => handleStatusChange(tab.key)}
                className={`flex-shrink-0 rounded-xl px-4 py-2 min-w-[80px] text-center transition-all ${
                  isActive ? 'bg-[#F4511E] text-white shadow-md' : 'bg-gray-50 dark:bg-slate-800/50 hover:opacity-80'
                }`}
              >
                <div className={`text-xs font-medium ${isActive ? 'text-white/80' : 'text-gray-500 dark:text-slate-400'}`}>
                  {tab.label}
                </div>
                <div className={`text-xl font-bold ${isActive ? 'text-white' : 'text-gray-700 dark:text-slate-200'}`}>
                  {count}
                </div>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="data-filter-card">
          <SearchInput
            value={search}
            onChange={handleSearchChange}
            placeholder="ค้นหาเลขใบส่งห้าง, ชื่อห้าง..."
          />
        </div>

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 flex flex-col items-center py-16 text-gray-400 dark:text-slate-500">
            <Package className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">ไม่มีรายการ</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => {
              const statusCfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.draft;
              return (
                <div
                  key={order.id}
                  onClick={() => router.push(`/department-orders/${order.id}`)}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 cursor-pointer hover:shadow-md hover:border-[#F4511E]/30 transition-all"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[#F4511E] text-sm">{order.department_order_number}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 dark:text-slate-300 mt-0.5 truncate">{order.customer?.name || 'ไม่ระบุ'}</p>
                      <p className="text-xs text-gray-400 dark:text-slate-500">{relativeTime(order.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-base font-semibold text-gray-900 dark:text-white">
                          ฿{order.total_amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </p>
                        {order.tax_invoice_number && (
                          <p className="text-xs text-indigo-500 flex items-center gap-1 justify-end">
                            <Receipt className="w-3 h-3" /> {order.tax_invoice_number}
                          </p>
                        )}
                        {order.shipping_carrier && (
                          <p className="text-xs text-gray-400 flex items-center gap-1 justify-end">
                            <Truck className="w-3 h-3" /> {order.shipping_carrier}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 dark:text-slate-600" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalRecords}
            startIdx={startIdx}
            endIdx={endIdx}
            recordsPerPage={recordsPerPage}
            setRecordsPerPage={(v) => { setRecordsPerPage(v); setCurrentPage(1); }}
            setPage={setCurrentPage}
          />
        )}
      </div>
    </Layout>
  );
}

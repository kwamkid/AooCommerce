'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import Pagination from '@/app/components/Pagination';
import {
  Loader2, ArrowRightLeft, Plus, Warehouse, Package, Eye,
  CheckCircle2, Clock, XCircle, AlertTriangle, Truck, Search, Filter,
} from 'lucide-react';

interface Transfer {
  id: string;
  transfer_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
  from_warehouse: { id: string; name: string; code: string | null } | null;
  to_warehouse: { id: string; name: string; code: string | null } | null;
  created_by_user: { id: string; name: string } | null;
  items: { id: string }[];
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  draft: { label: 'แบบร่าง', color: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300', icon: Clock },
  shipped: { label: 'จัดส่งแล้ว', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Truck },
  received: { label: 'รับครบแล้ว', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  partial: { label: 'รับไม่ครบ', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: AlertTriangle },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

export default function TransferListPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchTransfers();
      fetchWarehouses();
    }
  }, [authLoading, userProfile]);

  const fetchWarehouses = async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        setWarehouses(data.warehouses || []);
      }
    } catch { /* silent */ }
  };

  const fetchTransfers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch(`/api/inventory/transfers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTransfers(data.transfers || []);
      }
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchTransfers();
    }
  }, [statusFilter]);

  // Filter by warehouse and search
  const filtered = transfers.filter(t => {
    if (warehouseFilter && t.from_warehouse?.id !== warehouseFilter && t.to_warehouse?.id !== warehouseFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      t.transfer_number.toLowerCase().includes(s) ||
      t.from_warehouse?.name.toLowerCase().includes(s) ||
      t.to_warehouse?.name.toLowerCase().includes(s) ||
      t.notes?.toLowerCase().includes(s)
    );
  });

  const totalRecords = filtered.length;
  const totalPages = Math.ceil(totalRecords / recordsPerPage);
  const startIdx = (page - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + recordsPerPage, totalRecords);
  const paginatedTransfers = filtered.slice(startIdx, endIdx);

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (authLoading || loading) {
    return (
      <Layout
        title="รายการโอนย้ายสินค้า"
        breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการโอนย้าย' }]}
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="รายการโอนย้ายสินค้า"
      breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการโอนย้าย' }]}
    >
      <div className="space-y-4">
        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="ค้นหาเลขที่, คลัง..."
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            />
          </div>
          <div className="flex items-center gap-2">
            {warehouses.length > 1 && (
              <div className="relative">
                <select
                  value={warehouseFilter}
                  onChange={e => { setWarehouseFilter(e.target.value); setPage(1); }}
                  className="pl-8 pr-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E]/50 appearance-none"
                >
                  <option value="">ทุกคลัง</option>
                  {warehouses.map(wh => (
                    <option key={wh.id} value={wh.id}>{wh.name}</option>
                  ))}
                </select>
                <Warehouse className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}
            <div className="relative">
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="pl-8 pr-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E]/50 appearance-none"
              >
                <option value="">ทุกสถานะ</option>
                <option value="shipped">จัดส่งแล้ว</option>
                <option value="received">รับครบแล้ว</option>
                <option value="partial">รับไม่ครบ</option>
                <option value="cancelled">ยกเลิก</option>
              </select>
              <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
            <button
              onClick={() => router.push('/inventory/transfer')}
              className="bg-[#F4511E] text-white px-4 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              สร้างใบโอนย้าย
            </button>
          </div>
        </div>

        {/* Transfer List */}
        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-center py-16">
            <ArrowRightLeft className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 text-sm">
              {transfers.length === 0 ? 'ยังไม่มีรายการโอนย้าย' : 'ไม่พบรายการที่ค้นหา'}
            </p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <div className="overflow-x-auto">
              {/* Desktop Table */}
              <table className="data-table hidden md:table">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">เลขที่</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">คลังต้นทาง</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">คลังปลายทาง</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">รายการ</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สถานะ</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">วันที่สร้าง</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {paginatedTransfers.map(t => {
                    const st = STATUS_MAP[t.status] || STATUS_MAP.draft;
                    const StIcon = st.icon;
                    return (
                      <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                            {t.transfer_number}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Warehouse className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-700 dark:text-slate-300">
                              {t.from_warehouse?.name || '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Warehouse className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-700 dark:text-slate-300">
                              {t.to_warehouse?.name || '-'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-gray-600 dark:text-slate-400">
                            {t.items?.length || 0}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>
                            <StIcon className="w-3 h-3" />
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-600 dark:text-slate-400">
                            {formatDate(t.created_at)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => router.push(`/inventory/transfers/${t.id}`)}
                            className="p-1.5 text-gray-400 hover:text-[#F4511E] hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                            title="ดูรายละเอียด"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
                {paginatedTransfers.map(t => {
                  const st = STATUS_MAP[t.status] || STATUS_MAP.draft;
                  const StIcon = st.icon;
                  return (
                    <div
                      key={t.id}
                      className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer"
                      onClick={() => router.push(`/inventory/transfers/${t.id}`)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                          {t.transfer_number}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                          <StIcon className="w-3 h-3" />
                          {st.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 mb-1">
                        <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                        <span>{t.from_warehouse?.name || '-'}</span>
                        <ArrowRightLeft className="w-3 h-3 text-gray-400" />
                        <span>{t.to_warehouse?.name || '-'}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-slate-500">
                        <span>{t.items?.length || 0} รายการ</span>
                        <span>{formatDate(t.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalRecords={totalRecords}
              startIdx={startIdx}
              endIdx={endIdx}
              recordsPerPage={recordsPerPage}
              setRecordsPerPage={setRecordsPerPage}
              setPage={setPage}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}

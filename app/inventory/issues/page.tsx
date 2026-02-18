'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import Pagination from '@/app/components/Pagination';
import {
  Loader2, ArrowUpFromLine, Plus, Warehouse, Eye, Search,
  CheckCircle2, XCircle, Filter,
} from 'lucide-react';

interface Issue {
  id: string;
  issue_number: string;
  reason: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  warehouse: { id: string; name: string; code: string | null } | null;
  created_by_user: { id: string; name: string } | null;
  items: { id: string }[];
}

export default function IssueListPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

  useFetchOnce(() => {
    fetchData();
    fetchWarehouses();
  }, !authLoading && !!userProfile);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/inventory/issues');
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues || []);
      }
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        setWarehouses(data.warehouses || []);
      }
    } catch { /* silent */ }
  };

  const filtered = issues.filter(r => {
    if (warehouseFilter && r.warehouse?.id !== warehouseFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.issue_number.toLowerCase().includes(s) ||
      r.warehouse?.name.toLowerCase().includes(s) ||
      r.reason?.toLowerCase().includes(s) ||
      r.notes?.toLowerCase().includes(s) ||
      r.created_by_user?.name.toLowerCase().includes(s)
    );
  });

  const totalRecords = filtered.length;
  const totalPages = Math.ceil(totalRecords / recordsPerPage);
  const startIdx = (page - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + recordsPerPage, totalRecords);
  const paginated = filtered.slice(startIdx, endIdx);

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  if (authLoading || loading) {
    return (
      <Layout title="รายการเบิกออก" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการเบิกออก' }]}>
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" /></div>
      </Layout>
    );
  }

  return (
    <Layout title="รายการเบิกออก" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการเบิกออก' }]}>
      <div className="space-y-4">
        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="ค้นหาเลขที่, คลัง, เหตุผล..."
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
                <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}
            <button
              onClick={() => router.push('/inventory/issue')}
              className="bg-[#F4511E] text-white px-4 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              เบิกออกสินค้า
            </button>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 text-center py-16">
            <ArrowUpFromLine className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 text-sm">
              {issues.length === 0 ? 'ยังไม่มีรายการเบิกออก' : 'ไม่พบรายการที่ค้นหา'}
            </p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <div className="overflow-x-auto">
              {/* Desktop */}
              <table className="data-table hidden md:table">
                <thead>
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">เลขที่</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">คลัง</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">เหตุผล</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">รายการ</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">ผู้สร้าง</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">วันที่</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สถานะ</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {paginated.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                      <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900 dark:text-white">{r.issue_number}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Warehouse className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="text-sm text-gray-700 dark:text-slate-300">{r.warehouse?.name || '-'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-400 max-w-[200px] truncate">{r.reason || '-'}</td>
                      <td className="px-4 py-3 text-center text-sm text-gray-600 dark:text-slate-400">{r.items?.length || 0}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-400">{r.created_by_user?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-400">{formatDate(r.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                          r.status === 'completed'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {r.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          {r.status === 'completed' ? 'สำเร็จ' : 'ยกเลิก'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => router.push(`/inventory/issues/${r.id}`)}
                          className="p-1.5 text-gray-400 hover:text-[#F4511E] hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                          title="ดูรายละเอียด"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile */}
              <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
                {paginated.map(r => (
                  <div key={r.id} className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer" onClick={() => router.push(`/inventory/issues/${r.id}`)}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">{r.issue_number}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        r.status === 'completed'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {r.status === 'completed' ? 'สำเร็จ' : 'ยกเลิก'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400 mb-1">
                      <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                      <span>{r.warehouse?.name || '-'}</span>
                    </div>
                    {r.reason && <p className="text-xs text-gray-500 dark:text-slate-400 mb-1 truncate">{r.reason}</p>}
                    <div className="flex items-center justify-between text-xs text-gray-400 dark:text-slate-500">
                      <span>{r.items?.length || 0} รายการ | {r.created_by_user?.name || '-'}</span>
                      <span>{formatDate(r.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Pagination
              currentPage={page} totalPages={totalPages} totalRecords={totalRecords}
              startIdx={startIdx} endIdx={endIdx} recordsPerPage={recordsPerPage}
              setRecordsPerPage={setRecordsPerPage} setPage={setPage}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generateInventoryPdf } from '@/lib/inventory-pdf';
import Pagination from '@/app/components/Pagination';
import ColumnSettingsDropdown from '@/app/components/ColumnSettingsDropdown';
import {
  Loader2, ArrowDownToLine, Plus, Warehouse, Eye, Search,
  CheckCircle2, XCircle, Filter, Printer, User,
} from 'lucide-react';

interface Receive {
  id: string;
  receive_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  warehouse: { id: string; name: string; code: string | null } | null;
  created_by_user: { id: string; name: string } | null;
  items: { id: string }[];
}

// ─── Column config ──────────────────────────────
type ColumnKey = 'receiveInfo' | 'warehouse' | 'itemCount' | 'createdBy' | 'status' | 'notes' | 'actions';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
}

const COLUMN_CONFIGS: ColumnConfig[] = [
  { key: 'receiveInfo', label: 'เลขที่', defaultVisible: true, alwaysVisible: true },
  { key: 'warehouse', label: 'คลัง', defaultVisible: true },
  { key: 'itemCount', label: 'รายการ', defaultVisible: true },
  { key: 'createdBy', label: 'ผู้ทำรายการ', defaultVisible: true },
  { key: 'status', label: 'สถานะ', defaultVisible: true },
  { key: 'notes', label: 'หมายเหตุ', defaultVisible: true },
  { key: 'actions', label: 'จัดการ', defaultVisible: true, alwaysVisible: true },
];

const STORAGE_KEY = 'receives-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

export default function ReceiveListPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [receives, setReceives] = useState<Receive[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [printingId, setPrintingId] = useState<string | null>(null);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try { return new Set(JSON.parse(stored) as ColumnKey[]); } catch { /* defaults */ }
      }
    }
    return new Set(getDefaultColumns());
  });
  const toggleColumn = (key: ColumnKey) => {
    const config = COLUMN_CONFIGS.find(c => c.key === key);
    if (config?.alwaysVisible) return;
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };
  const isCol = (key: ColumnKey) => visibleColumns.has(key);

  useFetchOnce(() => {
    fetchData();
    fetchWarehouses();
  }, !authLoading && !!userProfile);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/inventory/receives');
      if (res.ok) {
        const data = await res.json();
        setReceives(data.receives || []);
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

  const handlePrint = async (id: string) => {
    setPrintingId(id);
    try {
      const res = await apiFetch(`/api/inventory/receives?id=${id}`);
      if (!res.ok) { showToast('โหลดข้อมูลไม่สำเร็จ', 'error'); return; }
      const result = await res.json();
      const detail = result.receive;
      if (!detail) { showToast('ไม่พบรายการ', 'error'); return; }
      await generateInventoryPdf({
        type: 'receive',
        data: { ...detail, doc_number: detail.receive_number },
      });
    } catch {
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
    }
  };

  // Unique users for filter
  const users = [...new Map(
    receives.filter(r => r.created_by_user).map(r => [r.created_by_user!.id, r.created_by_user!])
  ).values()];

  const filtered = receives.filter(r => {
    if (warehouseFilter && r.warehouse?.id !== warehouseFilter) return false;
    if (userFilter && r.created_by_user?.id !== userFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.receive_number.toLowerCase().includes(s) ||
      r.warehouse?.name.toLowerCase().includes(s) ||
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

  const visibleCount = COLUMN_CONFIGS.filter(c => visibleColumns.has(c.key)).length;

  if (authLoading || loading) {
    return (
      <Layout title="รายการรับเข้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า' }]}>
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" /></div>
      </Layout>
    );
  }

  return (
    <Layout title="รายการรับเข้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า' }]}>
      <div className="space-y-4">
        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="ค้นหาเลขที่, คลัง, ผู้สร้าง..."
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
            {users.length > 1 && (
              <div className="relative">
                <select
                  value={userFilter}
                  onChange={e => { setUserFilter(e.target.value); setPage(1); }}
                  className="pl-8 pr-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E]/50 appearance-none"
                >
                  <option value="">ทุกคน</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              </div>
            )}
            <button
              onClick={() => router.push('/inventory/receive')}
              className="bg-[#F4511E] text-white px-4 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              รับเข้าสินค้า
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="data-table-wrap hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  {isCol('receiveInfo') && <th className="data-th">เลขที่</th>}
                  {isCol('warehouse') && <th className="data-th">คลัง</th>}
                  {isCol('itemCount') && <th className="data-th text-center">รายการ</th>}
                  {isCol('createdBy') && <th className="data-th">ผู้ทำรายการ</th>}
                  {isCol('status') && <th className="data-th text-center">สถานะ</th>}
                  {isCol('notes') && <th className="data-th">หมายเหตุ</th>}
                  {isCol('actions') && <th className="data-th text-center">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="data-tbody">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCount} className="px-6 py-12 text-center">
                      <ArrowDownToLine className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-gray-500 dark:text-slate-400 text-sm">
                        {receives.length === 0 ? 'ยังไม่มีรายการรับเข้า' : 'ไม่พบรายการที่ค้นหา'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginated.map(r => (
                    <tr key={r.id} className="data-tr cursor-pointer" onClick={() => router.push(`/inventory/receives/${r.id}`)}>
                      {isCol('receiveInfo') && (
                        <td className="data-td">
                          <p className="font-mono text-sm font-medium text-gray-900 dark:text-white">{r.receive_number}</p>
                          <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(r.created_at)}</p>
                        </td>
                      )}
                      {isCol('warehouse') && (
                        <td className="data-td">
                          <div className="flex items-center gap-1.5">
                            <Warehouse className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-700 dark:text-slate-300">{r.warehouse?.name || '-'}</span>
                          </div>
                        </td>
                      )}
                      {isCol('itemCount') && (
                        <td className="data-td text-center text-sm text-gray-600 dark:text-slate-400">{r.items?.length || 0}</td>
                      )}
                      {isCol('createdBy') && (
                        <td className="data-td text-sm text-gray-600 dark:text-slate-400">{r.created_by_user?.name || '-'}</td>
                      )}
                      {isCol('status') && (
                        <td className="data-td text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                            r.status === 'completed'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                            {r.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {r.status === 'completed' ? 'สำเร็จ' : 'ยกเลิก'}
                          </span>
                        </td>
                      )}
                      {isCol('notes') && (
                        <td className="data-td text-sm text-gray-500 dark:text-slate-400 max-w-[200px] truncate">{r.notes || '-'}</td>
                      )}
                      {isCol('actions') && (
                        <td className="data-td" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => router.push(`/inventory/receives/${r.id}`)}
                              className="p-1.5 text-gray-400 hover:text-[#F4511E] hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                              title="ดูรายละเอียด"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePrint(r.id)}
                              disabled={printingId === r.id}
                              className="p-1.5 text-gray-400 hover:text-[#F4511E] hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors disabled:opacity-50"
                              title="พิมพ์"
                            >
                              {printingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                            </button>
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
            currentPage={page} totalPages={totalPages} totalRecords={totalRecords}
            startIdx={startIdx} endIdx={endIdx} recordsPerPage={recordsPerPage}
            setRecordsPerPage={setRecordsPerPage} setPage={setPage}
          >
            <ColumnSettingsDropdown
              configs={COLUMN_CONFIGS}
              visible={visibleColumns}
              toggle={toggleColumn}
              buttonClassName="p-1.5 text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors"
              dropUp
            />
          </Pagination>
        </div>

        {/* Mobile */}
        <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
          {paginated.length === 0 ? (
            <div className="text-center py-16">
              <ArrowDownToLine className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-slate-400 text-sm">
                {receives.length === 0 ? 'ยังไม่มีรายการรับเข้า' : 'ไม่พบรายการที่ค้นหา'}
              </p>
            </div>
          ) : paginated.map(r => (
            <div key={r.id} className="p-4 border-b border-gray-100 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer" onClick={() => router.push(`/inventory/receives/${r.id}`)}>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">{r.receive_number}</span>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(r.created_at)}</p>
                </div>
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
              <div className="flex items-center justify-between text-xs text-gray-400 dark:text-slate-500">
                <span>{r.items?.length || 0} รายการ | {r.created_by_user?.name || '-'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}

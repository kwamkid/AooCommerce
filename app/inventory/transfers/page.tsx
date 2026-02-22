'use client';

import { useState, useEffect } from 'react';
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
  Loader2, ArrowRightLeft, Plus, Warehouse, Pencil, Printer, User,
  CheckCircle2, Clock, XCircle, AlertTriangle, Truck, Search,
} from 'lucide-react';

interface Transfer {
  id: string;
  transfer_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  shipped_at: string | null;
  received_at: string | null;
  receiver_name: string | null;
  receive_photo_url: string | null;
  from_warehouse: { id: string; name: string; code: string | null } | null;
  to_warehouse: { id: string; name: string; code: string | null } | null;
  created_by_user: { id: string; name: string } | null;
  items: { id: string }[];
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pending: { label: 'ที่ต้องจัดส่ง', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  shipping: { label: 'กำลังส่ง', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Truck },
  received: { label: 'รับสินค้าแล้ว', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};

// ─── Column config ──────────────────────────────
type ColumnKey = 'transferInfo' | 'fromWarehouse' | 'toWarehouse' | 'itemCount' | 'status' | 'createdBy' | 'receiver' | 'actions';

interface ColumnConfig {
  key: ColumnKey;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
}

const COLUMN_CONFIGS: ColumnConfig[] = [
  { key: 'transferInfo', label: 'เลขที่', defaultVisible: true, alwaysVisible: true },
  { key: 'fromWarehouse', label: 'คลังต้นทาง', defaultVisible: true },
  { key: 'toWarehouse', label: 'คลังปลายทาง', defaultVisible: true },
  { key: 'itemCount', label: 'รายการ', defaultVisible: true },
  { key: 'status', label: 'สถานะ', defaultVisible: true },
  { key: 'createdBy', label: 'ผู้ทำรายการ', defaultVisible: true },
  { key: 'receiver', label: 'ผู้รับ', defaultVisible: true },
  { key: 'actions', label: 'จัดการ', defaultVisible: true, alwaysVisible: true },
];

const STORAGE_KEY = 'transfers-visible-columns';

function getDefaultColumns(): ColumnKey[] {
  return COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key);
}

export default function TransferListPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({ all: 0, pending: 0, shipping: 0, received: 0, cancelled: 0 });
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

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
  const visibleCount = COLUMN_CONFIGS.filter(c => visibleColumns.has(c.key)).length;

  useFetchOnce(() => {
    fetchWarehouses();
    fetchTransfers();
  }, !authLoading && !!userProfile);

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
      const res = await apiFetch('/api/inventory/transfers');
      if (res.ok) {
        const data = await res.json();
        const list: Transfer[] = data.transfers || [];
        setTransfers(list);
        // Calculate counts
        const counts: Record<string, number> = { all: list.length, pending: 0, shipping: 0, received: 0, cancelled: 0 };
        list.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
        setStatusCounts(counts);
      }
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (id: string) => {
    setPrintingId(id);
    try {
      const res = await apiFetch(`/api/inventory/transfers?id=${id}`);
      if (!res.ok) { showToast('โหลดข้อมูลไม่สำเร็จ', 'error'); return; }
      const result = await res.json();
      const detail = result.transfer;
      if (!detail) { showToast('ไม่พบรายการ', 'error'); return; }
      await generateInventoryPdf({
        type: 'transfer',
        data: {
          id: detail.id,
          doc_number: detail.transfer_number,
          status: detail.status,
          notes: detail.notes,
          created_at: detail.created_at,
          warehouse: detail.from_warehouse,
          to_warehouse: detail.to_warehouse,
          created_by_user: detail.created_by_user,
          receive_token: detail.receive_token,
          items: (detail.items || []).map((item: any) => ({
            ...item,
            quantity: item.qty_sent,
          })),
        },
      });
    } catch {
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
    }
  };

  const isAuthReady = !authLoading && !!userProfile;
  useEffect(() => {
    if (!isAuthReady) return;
    fetchTransfers();
  }, [isAuthReady]);

  // Unique users for filter
  const users = [...new Map(
    transfers.filter(t => t.created_by_user).map(t => [t.created_by_user!.id, t.created_by_user!])
  ).values()];

  // Filter by status, warehouse, user, and search
  const filtered = transfers.filter(t => {
    if (statusFilter && statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (warehouseFilter && t.from_warehouse?.id !== warehouseFilter && t.to_warehouse?.id !== warehouseFilter) return false;
    if (userFilter && t.created_by_user?.id !== userFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      t.transfer_number.toLowerCase().includes(s) ||
      t.from_warehouse?.name.toLowerCase().includes(s) ||
      t.to_warehouse?.name.toLowerCase().includes(s) ||
      t.notes?.toLowerCase().includes(s) ||
      t.created_by_user?.name.toLowerCase().includes(s)
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
        {/* Status Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { key: 'all', label: 'ทั้งหมด', active: 'bg-indigo-600', inactive: 'bg-indigo-50 dark:bg-indigo-950/50', labelColor: 'text-indigo-600 dark:text-indigo-400', countColor: 'text-indigo-700 dark:text-indigo-300' },
            { key: 'pending', label: 'ที่ต้องจัดส่ง', active: 'bg-yellow-500', inactive: 'bg-yellow-50 dark:bg-yellow-950/50', labelColor: 'text-yellow-600 dark:text-yellow-400', countColor: 'text-yellow-700 dark:text-yellow-300' },
            { key: 'shipping', label: 'กำลังส่ง', active: 'bg-blue-600', inactive: 'bg-blue-50 dark:bg-blue-950/50', labelColor: 'text-blue-600 dark:text-blue-400', countColor: 'text-blue-700 dark:text-blue-300' },
            { key: 'received', label: 'รับสินค้าแล้ว', active: 'bg-emerald-600', inactive: 'bg-emerald-50 dark:bg-emerald-950/50', labelColor: 'text-emerald-600 dark:text-emerald-400', countColor: 'text-emerald-700 dark:text-emerald-300' },
            { key: 'cancelled', label: 'ยกเลิก', active: 'bg-gray-500', inactive: 'bg-gray-100 dark:bg-gray-800', labelColor: 'text-gray-500 dark:text-gray-400', countColor: 'text-gray-600 dark:text-gray-300' },
          ].map((s) => {
            const isActive = statusFilter === s.key;
            const count = statusCounts[s.key] || 0;
            return (
              <button
                key={s.key}
                onClick={() => { setStatusFilter(s.key); setPage(1); }}
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

        {/* Search & Filters */}
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
              onClick={() => router.push('/inventory/transfer')}
              className="bg-[#F4511E] text-white px-4 py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              สร้างใบโอนย้าย
            </button>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="data-table-wrap hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  {isCol('transferInfo') && <th className="data-th">เลขที่</th>}
                  {isCol('fromWarehouse') && <th className="data-th">คลังต้นทาง</th>}
                  {isCol('toWarehouse') && <th className="data-th">คลังปลายทาง</th>}
                  {isCol('itemCount') && <th className="data-th text-center">รายการ</th>}
                  {isCol('status') && <th className="data-th text-center">สถานะ</th>}
                  {isCol('createdBy') && <th className="data-th">ผู้ทำรายการ</th>}
                  {isCol('receiver') && <th className="data-th">ผู้รับ</th>}
                  {isCol('actions') && <th className="data-th text-center">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="data-tbody">
                {paginatedTransfers.length === 0 ? (
                  <tr>
                    <td colSpan={visibleCount} className="px-6 py-12 text-center">
                      <ArrowRightLeft className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-gray-500 dark:text-slate-400 text-sm">
                        {transfers.length === 0 ? 'ยังไม่มีรายการโอนย้าย' : 'ไม่พบรายการที่ค้นหา'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  paginatedTransfers.map(t => {
                    const st = STATUS_MAP[t.status] || STATUS_MAP.pending;
                    const StIcon = st.icon;
                    return (
                      <tr key={t.id} className="data-tr cursor-pointer" onClick={() => router.push(`/inventory/transfers/${t.id}`)}>
                        {isCol('transferInfo') && (
                          <td className="data-td">
                            <p className="font-mono text-sm font-medium text-gray-900 dark:text-white">{t.transfer_number}</p>
                            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(t.created_at)}</p>
                          </td>
                        )}
                        {isCol('fromWarehouse') && (
                          <td className="data-td">
                            <div className="flex items-center gap-1.5">
                              <Warehouse className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-700 dark:text-slate-300">
                                {t.from_warehouse?.name || '-'}
                              </span>
                            </div>
                          </td>
                        )}
                        {isCol('toWarehouse') && (
                          <td className="data-td">
                            <div className="flex items-center gap-1.5">
                              <Warehouse className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                              <span className="text-sm text-gray-700 dark:text-slate-300">
                                {t.to_warehouse?.name || '-'}
                              </span>
                            </div>
                          </td>
                        )}
                        {isCol('itemCount') && (
                          <td className="data-td text-center text-sm text-gray-600 dark:text-slate-400">
                            {t.items?.length || 0}
                          </td>
                        )}
                        {isCol('status') && (
                          <td className="data-td text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>
                              <StIcon className="w-3 h-3" />
                              {st.label}
                            </span>
                          </td>
                        )}
                        {isCol('createdBy') && (
                          <td className="data-td text-sm text-gray-600 dark:text-slate-400">{t.created_by_user?.name || '-'}</td>
                        )}
                        {isCol('receiver') && (
                          <td className="data-td" onClick={e => e.stopPropagation()}>
                            {t.receiver_name ? (
                              <div className="flex items-center gap-2">
                                {t.receive_photo_url && (
                                  <img
                                    src={t.receive_photo_url}
                                    alt="รูปรับสินค้า"
                                    className="w-8 h-8 rounded object-cover cursor-pointer hover:opacity-80 flex-shrink-0"
                                    onClick={() => setLightboxSrc(t.receive_photo_url)}
                                  />
                                )}
                                <span className="text-sm text-gray-600 dark:text-slate-400">{t.receiver_name}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-slate-500">-</span>
                            )}
                          </td>
                        )}
                        {isCol('actions') && (
                          <td className="data-td" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => router.push(`/inventory/transfers/${t.id}`)}
                                className="p-1.5 text-gray-400 hover:text-[#F4511E] hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                                title="แก้ไข"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handlePrint(t.id)}
                                disabled={printingId === t.id}
                                className="p-1.5 text-gray-400 hover:text-[#F4511E] hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors disabled:opacity-50"
                                title="พิมพ์"
                              >
                                {printingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
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

        {/* Mobile Cards */}
        <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          {paginatedTransfers.length === 0 ? (
            <div className="text-center py-16">
              <ArrowRightLeft className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-slate-400 text-sm">
                {transfers.length === 0 ? 'ยังไม่มีรายการโอนย้าย' : 'ไม่พบรายการที่ค้นหา'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {paginatedTransfers.map(t => {
                const st = STATUS_MAP[t.status] || STATUS_MAP.pending;
                const StIcon = st.icon;
                return (
                  <div
                    key={t.id}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-slate-700/30 cursor-pointer"
                    onClick={() => router.push(`/inventory/transfers/${t.id}`)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                          {t.transfer_number}
                        </span>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(t.created_at)}</p>
                      </div>
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
                      <span>{t.items?.length || 0} รายการ | {t.created_by_user?.name || '-'}</span>
                      {t.receiver_name && (
                        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                          {t.receive_photo_url && (
                            <img
                              src={t.receive_photo_url}
                              alt="รูปรับสินค้า"
                              className="w-6 h-6 rounded object-cover cursor-pointer"
                              onClick={() => setLightboxSrc(t.receive_photo_url)}
                            />
                          )}
                          <span>ผู้รับ: {t.receiver_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Image Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <img
            src={lightboxSrc}
            alt="รูปรับสินค้า"
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Layout>
  );
}

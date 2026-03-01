'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import Pagination from '@/app/components/Pagination';
import {
  Loader2, FileText, Factory, Calendar, CheckCircle2, Clock, Send,
  Plus, Trash2, Filter,
} from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';

interface Supplier {
  id: string;
  name: string;
  supplier_type: string;
}

interface Snapshot {
  id: string;
  supplier_id: string;
  supplier_type: string;
  period_year: number;
  period_month: number;
  snapshot_date: string;
  status: string;
  total_stock_remaining: number;
  total_sold_quantity: number;
  total_sold_amount: number;
  total_received_quantity: number;
  total_received_amount: number;
  notes: string | null;
  created_at: string;
  supplier: { id: string; name: string; supplier_type: string } | null;
  created_by_user: { id: string; name: string } | null;
}

const MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function statusBadge(status: string) {
  switch (status) {
    case 'draft': return { label: 'ร่าง', color: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300', icon: <Clock className="w-3.5 h-3.5" /> };
    case 'confirmed': return { label: 'ยืนยัน', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
    case 'sent': return { label: 'ส่งแล้ว', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: <Send className="w-3.5 h-3.5" /> };
    default: return { label: status, color: 'bg-gray-100 text-gray-600', icon: null };
  }
}

function supplierTypeBadge(type: string) {
  switch (type) {
    case 'cash': return { label: 'เงินสด', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
    case 'credit': return { label: 'เครดิต', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
    case 'consignment': return { label: 'ฝากขาย', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    default: return { label: type, color: 'bg-gray-100 text-gray-600' };
  }
}

export default function SupplierReportsPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features, fetched: featuresFetched } = useFeatures();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Filters
  const [selectedSupplier, setSelectedSupplier] = useState('');
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | ''>(0); // 0 = all

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createSupplierId, setCreateSupplierId] = useState('');
  const [createYear, setCreateYear] = useState(now.getFullYear());
  const [createMonth, setCreateMonth] = useState(now.getMonth() + 1);

  // Pagination
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

  useFetchOnce(() => {
    if (!features.supplier) {
      router.replace('/inventory/receives');
      return;
    }
    fetchAll();
  }, !authLoading && !!userProfile && featuresFetched);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [suppRes, snapRes] = await Promise.all([
        apiFetch('/api/suppliers'),
        apiFetch('/api/reports/supplier'),
      ]);

      if (suppRes.ok) {
        const data = await suppRes.json();
        // Only credit and consignment need reports
        setSuppliers((data.suppliers || []).filter((s: Supplier) => s.supplier_type !== 'cash'));
      }
      if (snapRes.ok) {
        const data = await snapRes.json();
        setSnapshots(data.snapshots || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createSupplierId || !createYear || !createMonth) {
      showToast('กรุณาเลือก supplier และเดือน/ปี', 'error');
      return;
    }
    try {
      setCreating(true);
      const res = await apiFetch('/api/reports/supplier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: createSupplierId,
          year: createYear,
          month: createMonth,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        if (res.status === 409 && result.existing_id) {
          showToast('มีรายงานของเดือนนี้แล้ว — ไปที่รายงาน', 'success');
          router.push(`/reports/supplier/${result.existing_id}`);
          return;
        }
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }

      showToast('สร้างรายงานสำเร็จ', 'success');
      setShowCreateForm(false);
      router.push(`/reports/supplier/${result.snapshot_id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({ title: 'ลบรายงาน (ร่าง) นี้?', variant: 'danger' }); if (!ok) return;
    try {
      const res = await apiFetch(`/api/reports/supplier/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const result = await res.json();
        throw new Error(result.error || 'เกิดข้อผิดพลาด');
      }
      showToast('ลบรายงานเรียบร้อย', 'success');
      setSnapshots(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'เกิดข้อผิดพลาด', 'error');
    }
  };

  // Filter snapshots
  const filtered = snapshots.filter(s => {
    if (selectedSupplier && s.supplier_id !== selectedSupplier) return false;
    if (selectedYear && s.period_year !== selectedYear) return false;
    if (selectedMonth && s.period_month !== selectedMonth) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / recordsPerPage);
  const paged = filtered.slice((page - 1) * recordsPerPage, page * recordsPerPage);

  const formatCurrency = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  if (authLoading || loading) {
    return (
      <Layout title="รายงานซัพพลายเออร์">
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" /></div>
      </Layout>
    );
  }

  return (
    <Layout
      title="รายงานซัพพลายเออร์"
      breadcrumbs={[{ label: 'รายงาน' }, { label: 'รายงานซัพพลายเออร์' }]}
    >
      <div className="space-y-4">
        {/* Action bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-48">
              <FormSelect
                value={selectedSupplier}
                onChange={value => { setSelectedSupplier(value); setPage(1); }}
                options={suppliers.map(s => ({ id: s.id, label: s.name }))}
                clearLabel="ทุก Supplier"
                icon={<Filter className="w-4 h-4" />}
              />
            </div>
            <div className="w-36">
              <FormSelect
                value={String(selectedYear)}
                onChange={value => { setSelectedYear(parseInt(value)); setPage(1); }}
                options={years.map(y => ({ id: String(y), label: String(y + 543) }))}
                searchThreshold={99}
              />
            </div>
            <div className="w-36">
              <FormSelect
                value={selectedMonth ? String(selectedMonth) : ''}
                onChange={value => { setSelectedMonth(value ? parseInt(value) : 0); setPage(1); }}
                options={MONTHS.map((m, i) => ({ id: String(i + 1), label: m }))}
                clearLabel="ทุกเดือน"
                searchThreshold={99}
              />
            </div>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            สร้าง<span className="hidden md:inline">รายงาน</span>
          </button>
        </div>

        {/* Create form */}
        {showCreateForm && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">สร้างรายงานใหม่</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 block mb-1">Supplier</label>
                <FormSelect
                  value={createSupplierId}
                  onChange={value => setCreateSupplierId(value)}
                  options={suppliers.map(s => ({ id: s.id, label: s.name, subtitle: supplierTypeBadge(s.supplier_type).label }))}
                  placeholder="เลือก..."
                  icon={<Factory className="w-4 h-4" />}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 block mb-1">ปี</label>
                <FormSelect
                  value={String(createYear)}
                  onChange={value => setCreateYear(parseInt(value))}
                  options={years.map(y => ({ id: String(y), label: String(y + 543) }))}
                  searchThreshold={99}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-slate-400 block mb-1">เดือน</label>
                <FormSelect
                  value={String(createMonth)}
                  onChange={value => setCreateMonth(parseInt(value))}
                  options={MONTHS.map((m, i) => ({ id: String(i + 1), label: m }))}
                  searchThreshold={99}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleCreate}
                  disabled={creating || !createSupplierId}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {creating ? 'กำลังสร้าง...' : 'สร้าง Snapshot'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Count */}
        <p className="text-sm text-gray-500 dark:text-slate-400">{filtered.length} รายการ</p>

        {/* Table */}
        {paged.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{selectedSupplier || selectedMonth ? 'ไม่พบรายงานที่ตรงกัน' : 'ยังไม่มีรายงาน'}</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden sm:block bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <table className="data-table-fixed">
                <thead>
                  <tr className="data-thead-tr">
                    <th className="data-th">Supplier</th>
                    <th className="data-th">ประเภท</th>
                    <th className="data-th">เดือน/ปี</th>
                    <th className="data-th text-right">ยอดรวม</th>
                    <th className="data-th">สถานะ</th>
                    <th className="data-th w-16"></th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {paged.map(s => {
                    const badge = statusBadge(s.status);
                    const typeBadge = supplierTypeBadge(s.supplier_type);
                    const amount = s.supplier_type === 'consignment' ? s.total_sold_amount : s.total_received_amount;
                    return (
                      <tr
                        key={s.id}
                        onClick={() => router.push(`/reports/supplier/${s.id}`)}
                        className="data-tr cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Factory className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{s.supplier?.name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge.color}`}>
                            {typeBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-700 dark:text-slate-300">
                              {MONTHS[s.period_month - 1]} {s.period_year + 543}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            ฿{formatCurrency(amount)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                            {badge.icon}
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {s.status === 'draft' && (
                            <button
                              onClick={e => handleDelete(s.id, e)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="sm:hidden space-y-3">
              {paged.map(s => {
                const badge = statusBadge(s.status);
                const typeBadge = supplierTypeBadge(s.supplier_type);
                const amount = s.supplier_type === 'consignment' ? s.total_sold_amount : s.total_received_amount;
                return (
                  <div
                    key={s.id}
                    onClick={() => router.push(`/reports/supplier/${s.id}`)}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 cursor-pointer active:bg-gray-50 dark:active:bg-slate-700/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{s.supplier?.name || '-'}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        {badge.icon}
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-slate-400 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeBadge.color}`}>
                          {typeBadge.label}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">฿{formatCurrency(amount)}</span>
                      </div>
                      <div className="text-xs">{MONTHS[s.period_month - 1]} {s.period_year + 543}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                totalRecords={filtered.length}
                startIdx={(page - 1) * recordsPerPage}
                endIdx={Math.min(page * recordsPerPage, filtered.length)}
                recordsPerPage={recordsPerPage}
                setRecordsPerPage={v => { setRecordsPerPage(v); setPage(1); }}
                setPage={setPage}
              />
            )}
          </>
        )}
      </div>
      {confirmDialog}
    </Layout>
  );
}

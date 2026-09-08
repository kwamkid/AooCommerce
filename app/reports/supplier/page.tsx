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
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import {
  Loader2, FileText, Factory, Calendar, Plus, Trash2, Filter
} from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import { statusLabel } from '@/lib/status-labels';

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
          month: createMonth
        })
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
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-primary animate-spin" /></div>
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
          <Button onClick={() => setShowCreateForm(!showCreateForm)} icon={<Plus className="w-4 h-4" />}>
            สร้าง<span className="hidden md:inline">รายงาน</span>
          </Button>
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
                  options={suppliers.map(s => ({ id: s.id, label: s.name, subtitle: statusLabel('supplierType', s.supplier_type) }))}
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
                <Button
                  fullWidth
                  loading={creating}
                  disabled={!createSupplierId}
                  onClick={handleCreate}
                  icon={<Plus className="w-4 h-4" />}
                >
                  สร้าง Snapshot
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Count */}
        <p className="text-sm text-gray-500 dark:text-slate-400">{filtered.length} รายการ</p>

        {/* Table */}
        {(() => {
          const supplierColumns: DataTableColumn<Snapshot>[] = [
            {
              key: 'supplier',
              label: 'Supplier',
              alwaysVisible: true,
              render: (s) => (
                <div className="flex items-center gap-2">
                  <Factory className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{s.supplier?.name || '-'}</span>
                </div>
              )
            },
            {
              key: 'type',
              label: 'ประเภท',
              render: (s) => {
                return (
                  <StatusBadge domain="supplierType" status={s.supplier_type} />
                );
              }
            },
            {
              key: 'period',
              label: 'เดือน/ปี',
              render: (s) => (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-sm text-gray-700 dark:text-slate-300">
                    {MONTHS[s.period_month - 1]} {s.period_year + 543}
                  </span>
                </div>
              )
            },
            {
              key: 'amount',
              label: 'ยอดรวม',
              headerClassName: 'text-right',
              cellClassName: 'text-right',
              render: (s) => {
                const amount = s.supplier_type === 'consignment' ? s.total_sold_amount : s.total_received_amount;
                return (
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    ฿{formatCurrency(amount)}
                  </span>
                );
              }
            },
            {
              key: 'status',
              label: 'สถานะ',
              render: (s) => {
                return (
                  <StatusBadge domain="supplierReport" status={s.status} />
                );
              }
            },
            {
              key: 'actions',
              label: '',
              headerClassName: 'w-16',
              stopPropagation: true,
              render: (s) =>
                s.status === 'draft' ? (
                  <button
                    onClick={e => handleDelete(s.id, e)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                ) : null
            },
          ];

          return (
            <DataTable<Snapshot>
              storageKey="supplier-reports"
              columns={supplierColumns}
              data={paged}
              loading={false}
              getRowId={(s) => s.id}
              onRowClick={(s) => router.push(`/reports/supplier/${s.id}`)}
              emptyMessage={selectedSupplier || selectedMonth ? 'ไม่พบรายงานที่ตรงกัน' : 'ยังไม่มีรายงาน'}
              emptyIcon={<FileText className="w-12 h-12 text-gray-300 dark:text-slate-600 opacity-50" />}
              currentPage={page}
              totalPages={totalPages}
              totalRecords={filtered.length}
              recordsPerPage={recordsPerPage}
              onPageChange={setPage}
              onRecordsPerPageChange={v => { setRecordsPerPage(v); setPage(1); }}
              mobileCardRender={(s) => {
                const amount = s.supplier_type === 'consignment' ? s.total_sold_amount : s.total_received_amount;
                return (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{s.supplier?.name || '-'}</span>
                      <StatusBadge domain="supplierReport" status={s.status} />
                    </div>
                    <div className="text-sm text-gray-600 dark:text-slate-400 space-y-1">
                      <div className="flex items-center justify-between">
                        <StatusBadge domain="supplierType" status={s.supplier_type} />
                        <span className="font-medium text-gray-900 dark:text-white">฿{formatCurrency(amount)}</span>
                      </div>
                      <div className="text-xs">{MONTHS[s.period_month - 1]} {s.period_year + 543}</div>
                    </div>
                  </>
                );
              }}
            />
          );
        })()}
      </div>
      {confirmDialog}
    </Layout>
  );
}

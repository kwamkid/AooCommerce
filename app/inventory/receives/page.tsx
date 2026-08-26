'use client';

import { useState } from 'react';
import { useCopy } from '@/lib/useCopy';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generateInventoryPdf } from '@/lib/inventory-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import DataTable from '@/components/ui/DataTable';
import FormSelect from '@/components/ui/FormSelect';
import ActionMenu from '@/components/ui/ActionMenu';
import { LoadingCard } from '@/components/ui/StateCard';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  Loader2, ArrowDownToLine, Plus, Warehouse, Eye, Search,
  CheckCircle2, XCircle, Printer, User,
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


export default function ReceiveListPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const copy = useCopy();

  const [receives, setReceives] = useState<Receive[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [printingId, setPrintingId] = useState<string | null>(null);


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
      const blob = await generateInventoryPdf({
        type: 'receive',
        data: { ...detail, doc_number: detail.receive_number },
      });
      showPdfPreview(blob, 'ใบรับสินค้า');
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

  if (authLoading || loading) {
    return (
      <Layout title="รายการรับเข้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า' }]}>
        <LoadingCard />
      </Layout>
    );
  }

  return (
    <Layout title="รายการรับเข้า" breadcrumbs={[{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า' }]}>
      <div className="space-y-4">
        {/* Action Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="ค้นหา..."
              className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>
          {warehouses.length > 1 && (
            <div className="w-28 md:w-40 flex-shrink-0">
              <FormSelect
                value={warehouseFilter}
                onChange={v => { setWarehouseFilter(v); setPage(1); }}
                options={warehouses.map(wh => ({ id: wh.id, label: wh.name }))}
                clearLabel="ทุกคลัง"
                icon={<Warehouse className="w-4 h-4" />}
              />
            </div>
          )}
          {users.length > 1 && (
            <div className="hidden md:block w-40 flex-shrink-0">
              <FormSelect
                value={userFilter}
                onChange={v => { setUserFilter(v); setPage(1); }}
                options={users.map(u => ({ id: u.id, label: u.name }))}
                clearLabel="ทุกคน"
                icon={<User className="w-4 h-4" />}
              />
            </div>
          )}
          <Button
            variant="primary"
            onClick={() => router.push('/inventory/receive')}
            title="รับเข้าสินค้า"
            icon={<Plus className="w-4 h-4" />}
            className="whitespace-nowrap flex-shrink-0"
          >
            <span className="hidden md:inline">รับเข้าสินค้า</span>
          </Button>
        </div>

        <DataTable<Receive>
          storageKey="receives-visible-columns"
          columns={[
            {
              key: 'receiveInfo', label: 'เลขที่', alwaysVisible: true,
              render: (r) => (
                <>
                  <p className="id-text-clickable text-gray-900 dark:text-white" title="คัดลอก" onClick={(e) => { e.stopPropagation(); copy(r.receive_number, 'เลขที่ใบรับ'); }}>{r.receive_number}</p>
                  <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(r.created_at)}</p>
                </>
              ),
            },
            {
              key: 'warehouse', label: 'คลัง',
              render: (r) => (
                <div className="flex items-center gap-1.5">
                  <Warehouse className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                  <span className="data-text text-gray-700 dark:text-slate-300">{r.warehouse?.name || '-'}</span>
                </div>
              ),
            },
            {
              key: 'itemCount', label: 'รายการ', headerClassName: 'text-center', cellClassName: 'text-center',
              render: (r) => <span className="data-text text-gray-700 dark:text-slate-300">{r.items?.length || 0}</span>,
            },
            {
              key: 'status', label: 'สถานะ', headerClassName: 'text-center', cellClassName: 'text-center',
              render: (r) => (
                <StatusBadge status={r.status} colors={r.status === 'completed'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}>
                  {r.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {r.status === 'completed' ? 'สำเร็จ' : 'ยกเลิก'}
                </StatusBadge>
              ),
            },
            {
              key: 'notes', label: 'หมายเหตุ', cellClassName: 'max-w-[200px] truncate',
              render: (r) => <span className="data-secondary text-gray-500 dark:text-slate-400">{r.notes || '-'}</span>,
            },
            {
              key: 'createdBy', label: 'ผู้ทำรายการ',
              render: (r) => <span className="data-text text-gray-700 dark:text-slate-300">{r.created_by_user?.name || '-'}</span>,
            },
            {
              key: 'actions', label: 'จัดการ', alwaysVisible: true, headerClassName: 'text-center', stopPropagation: true, hideMobile: true,
              render: (r) => (
                <div className="flex items-center justify-center">
                  <ActionMenu items={[
                    {
                      key: 'view',
                      label: 'ดูรายละเอียด',
                      icon: <Eye className="w-4 h-4" />,
                      onClick: () => router.push(`/inventory/receives/${r.id}`),
                    },
                    {
                      key: 'print',
                      label: 'พิมพ์',
                      icon: printingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />,
                      onClick: () => handlePrint(r.id),
                      disabled: printingId === r.id,
                    },
                  ]} />
                </div>
              ),
            },
          ]}
          data={paginated}
          loading={false}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/inventory/receives/${r.id}`)}
          emptyMessage={receives.length === 0 ? 'ยังไม่มีรายการรับเข้า' : 'ไม่พบรายการที่ค้นหา'}
          emptyIcon={<ArrowDownToLine className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          currentPage={page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          recordsPerPage={recordsPerPage}
          onPageChange={setPage}
          onRecordsPerPageChange={setRecordsPerPage}
          mobileCardRender={(r) => (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <span className="id-text-clickable text-gray-900 dark:text-white" title="คัดลอก" onClick={(e) => { e.stopPropagation(); copy(r.receive_number, 'เลขที่ใบรับ'); }}>{r.receive_number}</span>
                  <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(r.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={r.status} colors={r.status === 'completed'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}>
                    {r.status === 'completed' ? 'สำเร็จ' : 'ยกเลิก'}
                  </StatusBadge>
                  <ActionMenu items={[
                    { key: 'view', label: 'ดูรายละเอียด', icon: <Eye className="w-4 h-4" />, onClick: () => router.push(`/inventory/receives/${r.id}`) },
                    { key: 'print', label: 'พิมพ์', icon: <Printer className="w-4 h-4" />, onClick: () => handlePrint(r.id) },
                  ]} />
                </div>
              </div>
              <div className="flex items-center gap-2 mb-1">
                <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                <span className="data-text text-gray-700 dark:text-slate-300">{r.warehouse?.name || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="data-muted text-gray-400 dark:text-slate-500">{r.items?.length || 0} รายการ | {r.created_by_user?.name || '-'}</span>
              </div>
            </>
          )}
        />
      </div>
    </Layout>
  );
}

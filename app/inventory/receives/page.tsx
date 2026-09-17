'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { useAuth } from '@/lib/auth-context';
import { useCopy } from '@/lib/useCopy';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generateInventoryPdf } from '@/lib/inventory-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import Badge from '@/components/ui/Badge';
import DataTable from '@/components/ui/DataTable';
import StatusTabs from '@/components/ui/StatusTabs';
import ActionMenu from '@/components/ui/ActionMenu';
import { EmptyCard, LoadingCard } from '@/components/ui/StateCard';
import StatusBadge from '@/components/ui/StatusBadge';
import DocListFilters, { type DocListUser, type DocListWarehouse } from '../components/DocListFilters';
import { useDocListParams } from '../components/useDocListParams';
import {
  Loader2, ArrowDownToLine, Plus, Warehouse, Eye, Printer, X,
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
  supplier?: { id: string; name: string } | null;
  /** ดีลของล็อต — null = ใบก่อนมีระบบดีล (17 ก.ย. 2569) */
  deal_type?: 'cash' | 'credit' | 'consignment' | null;
}

const DEAL_LABEL: Record<string, { label: string; tone: 'gray' | 'amber' | 'purple' }> = {
  cash: { label: 'ซื้อสด', tone: 'gray' },
  credit: { label: 'เครดิต', tone: 'amber' },
  consignment: { label: 'ฝากขาย', tone: 'purple' },
};

const BREADCRUMBS = [{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการรับเข้า' }];

function ReceiveListContent() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const copy = useCopy();

  const {
    search, warehouseId, status, userId, page, limit,
    dateRange, effectiveFrom, effectiveTo,
    hasActiveFilters, depsKey, setParams, clearAll,
  } = useDocListParams('/inventory/receives');

  const [rows, setRows] = useState<Receive[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<DocListUser[]>([]);
  const [warehouses, setWarehouses] = useState<DocListWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);

  const isAuthReady = !authLoading && !!userProfile;

  useFetchOnce(async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        setWarehouses(data.warehouses || []);
      }
    } catch { /* ตัวกรองโหลดไม่ได้ = ไม่ต้องขึ้น error ทั้งหน้า */ }
  }, isAuthReady);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setFetching(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), status });
      if (search) params.set('search', search);
      if (warehouseId) params.set('warehouse_id', warehouseId);
      if (userId) params.set('created_by', userId);
      if (effectiveFrom) params.set('date_from', effectiveFrom);
      if (effectiveTo) params.set('date_to', effectiveTo);

      const res = await apiFetch(`/api/inventory/receives?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRows(data.items || []);
      setTotal(data.total || 0);
      setCounts(data.status_counts || {});
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching receives:', error);
      if (!quiet) showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
      if (!quiet) setFetching(false);
    }
  }, [page, limit, status, search, warehouseId, userId, effectiveFrom, effectiveTo, showToast]);

  // ยิงครั้งแรก + ทุกครั้งที่ค่าใน URL เปลี่ยนจริง (กัน re-render ซ้ำไม่ให้ยิงซ้ำ)
  const fetchedRef = useRef(false);
  const prevDepsRef = useRef(depsKey);
  const fetchRef = useRef(fetchData);
  useEffect(() => { fetchRef.current = fetchData; }, [fetchData]);
  useEffect(() => {
    if (!isAuthReady) return;
    const changed = prevDepsRef.current !== depsKey;
    prevDepsRef.current = depsKey;
    if (fetchedRef.current && !changed) return;
    fetchedRef.current = true;
    void fetchRef.current();
  }, [depsKey, isAuthReady]);

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

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  const menuItems = (r: Receive) => [
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
  ];

  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (loading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          variant="primary"
          onClick={() => router.push('/inventory/receive')}
          icon={<Plus className="w-4 h-4" />}
          aria-label="รับเข้าสินค้า"
          className="whitespace-nowrap flex-shrink-0"
        >
          <span className="hidden md:inline">รับเข้าสินค้า</span>
        </Button>
      </div>

      <StatusTabs
        activeKey={status}
        onSelect={(key) => setParams({ status: key })}
        tabs={[
          { key: 'all', label: 'ทั้งหมด', count: counts.all ?? 0 },
          { key: 'completed', label: 'สำเร็จ', count: counts.completed ?? 0, colorKey: 'completed' },
          { key: 'cancelled', label: 'ยกเลิก', count: counts.cancelled ?? 0 },
        ]}
      />

      <DocListFilters
        search={search}
        onSearch={(v) => setParams({ q: v || null })}
        searchPlaceholder="ค้นหาเลขที่ใบรับ, หมายเหตุ..."
        dateRange={dateRange}
        onDateRange={(from, to) => setParams({ from: from || null, to: to || null })}
        warehouses={warehouses}
        warehouseId={warehouseId}
        onWarehouse={(v) => setParams({ wh: v || null })}
        users={users}
        userId={userId}
        onUser={(v) => setParams({ by: v || null })}
        onClear={clearAll}
        hasActiveFilters={hasActiveFilters}
      />

      {rows.length === 0 ? (
        <EmptyCard
          icon={<ArrowDownToLine className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          title={hasActiveFilters ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีรายการรับเข้า'}
          subtitle={hasActiveFilters ? 'ลองขยายช่วงวันที่หรือล้างตัวกรอง' : undefined}
          actions={hasActiveFilters
            ? <Button variant="secondary" icon={<X className="w-4 h-4" />} onClick={clearAll}>ล้างตัวกรอง</Button>
            : undefined}
        />
      ) : (
        <div className="relative">
          {fetching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 dark:bg-slate-900/60 pointer-events-none">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
          <DataTable<Receive>
            storageKey="receives-visible-columns-v2"
            columns={[
              {
                key: 'receiveInfo', label: 'เลขที่', alwaysVisible: true,
                render: (r) => (
                  <>
                    <Tooltip text="คัดลอก"><p className="id-text-clickable text-gray-900 dark:text-white" onClick={(e) => { e.stopPropagation(); copy(r.receive_number, 'เลขที่ใบรับ'); }}>{r.receive_number}</p></Tooltip>
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
                key: 'supplierDeal', label: 'Supplier / ดีล',
                render: (r) => (
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="data-text truncate text-gray-700 dark:text-slate-300">{r.supplier?.name || '-'}</span>
                    {r.deal_type && DEAL_LABEL[r.deal_type] && (
                      <Badge tone={DEAL_LABEL[r.deal_type].tone} size="sm">{DEAL_LABEL[r.deal_type].label}</Badge>
                    )}
                  </div>
                ),
              },
              {
                key: 'itemCount', label: 'รายการ', headerClassName: 'text-center', cellClassName: 'text-center',
                render: (r) => <span className="data-text text-gray-700 dark:text-slate-300">{r.items?.length || 0}</span>,
              },
              {
                key: 'status', label: 'สถานะ', headerClassName: 'text-center', cellClassName: 'text-center',
                render: (r) => <StatusBadge domain="stockDoc" status={r.status} />,
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
                    <ActionMenu items={menuItems(r)} />
                  </div>
                ),
              },
            ]}
            data={rows}
            loading={false}
            getRowId={(r) => r.id}
            onRowClick={(r) => router.push(`/inventory/receives/${r.id}`)}
            emptyMessage="ไม่พบรายการที่ค้นหา"
            emptyIcon={<ArrowDownToLine className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            currentPage={page}
            totalPages={totalPages}
            totalRecords={total}
            recordsPerPage={limit}
            onPageChange={(p) => setParams({ page: String(p) })}
            onRecordsPerPageChange={(l) => setParams({ limit: String(l), page: '1' })}
            onLimitChange={(l, p) => setParams({ limit: String(l), page: String(p) })}
            mobileCardRender={(r) => (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <Tooltip text="คัดลอก"><span className="id-text-clickable text-gray-900 dark:text-white" onClick={(e) => { e.stopPropagation(); copy(r.receive_number, 'เลขที่ใบรับ'); }}>{r.receive_number}</span></Tooltip>
                    <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge domain="stockDoc" status={r.status} />
                    <ActionMenu items={menuItems(r)} />
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
      )}
    </div>
  );
}

export default function ReceiveListPage() {
  // ทั้งหน้าอ่าน useSearchParams → ต้องอยู่ใต้ Suspense (กฎ CSR bailout ของ Next 16)
  return (
    <Layout title="รายการรับเข้า" breadcrumbs={BREADCRUMBS}>
      <Suspense fallback={<LoadingCard />}>
        <ReceiveListContent />
      </Suspense>
    </Layout>
  );
}

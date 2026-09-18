'use client';

// รายการใบคืนของให้ Supplier — โครงเดียวกับหน้าเอกสารคลังอื่น (รับเข้า/เบิกออก/โอนย้าย)
// ⛔ คนละเรื่องกับ /returns ที่เป็น "ลูกค้าคืนของให้เรา"

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { useAuth } from '@/lib/auth-context';
import { useCopy } from '@/lib/useCopy';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import DataTable from '@/components/ui/DataTable';
import StatusTabs from '@/components/ui/StatusTabs';
import ActionMenu from '@/components/ui/ActionMenu';
import { EmptyCard, LoadingCard } from '@/components/ui/StateCard';
import StatusBadge from '@/components/ui/StatusBadge';
import ListFilters from '@/components/ui/ListFilters';
import { FilterDateRange, FilterUser, FilterWarehouse } from '@/components/ui/ListFilterFields';
import { useListFilterParams } from '@/lib/useListFilterParams';
import { DOC_LIST_FIELDS, DOC_LIST_RANGE_DAYS, docListUserOptions, type DocListUser } from '../components/doc-list-filters';
import { AddIcon, CloseIcon, LoadingIcon, SupplierIcon, SupplierReturnIcon, ViewIcon, WarehouseIcon } from '@/lib/icons';
import { useAuthGuard } from '@/lib/useAuthGuard';

interface SupplierReturn {
  id: string;
  return_number: string;
  reason: string | null;
  status: string;
  notes: string | null;
  total_amount: number | null;
  deal_type: 'cash' | 'credit' | 'consignment' | null;
  return_date: string | null;
  created_at: string;
  supplier: { id: string; name: string } | null;
  warehouse: { id: string; name: string; code: string | null } | null;
  created_by_user: { id: string; name: string } | null;
  items: { id: string }[];
}

/** ผลต่อเงินต่างกันตามดีลของล็อตที่คืน — กติกาเต็มใน .claude/rules/domains/inventory.md */
const DEAL_LABEL: Record<string, { label: string; tone: 'gray' | 'amber' | 'purple' }> = {
  cash: { label: 'ซื้อสด', tone: 'gray' },
  credit: { label: 'เครดิต', tone: 'amber' },
  consignment: { label: 'ฝากขาย', tone: 'purple' },
};

const BREADCRUMBS = [{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการคืนของ Supplier' }];

function SupplierReturnListContent() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const copy = useCopy();

  const filters = useListFilterParams('/inventory/supplier-returns', {
    fields: DOC_LIST_FIELDS,
    defaultRange: DOC_LIST_RANGE_DAYS,
  });
  const { page, limit, effectiveFrom, effectiveTo, hasActiveFilters, depsKey, clearAll } = filters;
  const { q: search, wh: warehouseId, status, by: userId } = filters.values;

  const [rows, setRows] = useState<SupplierReturn[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<DocListUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  const isAuthReady = !authLoading && !!userProfile;

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setFetching(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), status });
      if (search) params.set('search', search);
      if (warehouseId) params.set('warehouse_id', warehouseId);
      if (userId) params.set('created_by', userId);
      if (effectiveFrom) params.set('date_from', effectiveFrom);
      if (effectiveTo) params.set('date_to', effectiveTo);

      const res = await apiFetch(`/api/inventory/supplier-returns?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRows(data.items || []);
      setTotal(data.total || 0);
      setCounts(data.status_counts || {});
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching supplier returns:', error);
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

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  const menuItems = (r: SupplierReturn) => [
    {
      key: 'view',
      label: 'ดูรายละเอียด',
      icon: <ViewIcon className="w-4 h-4" />,
      onClick: () => router.push(`/inventory/supplier-returns/${r.id}`),
    },
  ];

  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (loading) return <LoadingCard />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          variant="primary"
          onClick={() => router.push('/inventory/supplier-return')}
          icon={<AddIcon className="w-4 h-4" />}
          aria-label="คืนของให้ Supplier"
          className="whitespace-nowrap flex-shrink-0"
        >
          <span className="hidden md:inline">คืนของให้ Supplier</span>
        </Button>
      </div>

      <StatusTabs
        activeKey={status}
        onSelect={(key) => filters.set({ status: key })}
        tabs={[
          { key: 'all', label: 'ทั้งหมด', count: counts.all ?? 0 },
          { key: 'issued', label: 'ออกใบแล้ว', count: counts.issued ?? 0, colorKey: 'completed' },
          { key: 'cancelled', label: 'ยกเลิก', count: counts.cancelled ?? 0 },
        ]}
      />

      <ListFilters
        search={search}
        onSearch={(v) => filters.set({ q: v })}
        searchPlaceholder="ค้นหาเลขที่ใบคืน, หมายเหตุ..."
        hasActiveFilters={hasActiveFilters}
        onClear={clearAll}
      >
        <FilterDateRange filters={filters} />
        <FilterWarehouse value={warehouseId} onChange={(v) => filters.set({ wh: v })} />
        <FilterUser value={userId} onChange={(v) => filters.set({ by: v })} options={docListUserOptions(users)} />
      </ListFilters>

      {rows.length === 0 ? (
        <EmptyCard
          icon={<SupplierReturnIcon className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          title={hasActiveFilters ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีใบคืนของ Supplier'}
          subtitle={hasActiveFilters ? 'ลองขยายช่วงวันที่หรือล้างตัวกรอง' : undefined}
          actions={hasActiveFilters
            ? <Button variant="secondary" icon={<CloseIcon className="w-4 h-4" />} onClick={clearAll}>ล้างตัวกรอง</Button>
            : undefined}
        />
      ) : (
        <div className="relative">
          {fetching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 dark:bg-slate-900/60 pointer-events-none">
              <LoadingIcon className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
          <DataTable<SupplierReturn>
            storageKey="supplier-returns-visible-columns"
            columns={[
              {
                key: 'returnInfo', label: 'เลขที่', alwaysVisible: true,
                render: (r) => (
                  <>
                    <Tooltip text="คัดลอก"><p className="id-text-clickable text-gray-900 dark:text-white" onClick={(e) => { e.stopPropagation(); copy(r.return_number, 'เลขที่ใบคืน'); }}>{r.return_number}</p></Tooltip>
                    <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(r.created_at)}</p>
                  </>
                ),
              },
              {
                key: 'supplier', label: 'Supplier / ดีล', grow: true,
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
                key: 'warehouse', label: 'คลัง',
                render: (r) => (
                  <div className="flex items-center gap-1.5">
                    <WarehouseIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="data-text text-gray-700 dark:text-slate-300">{r.warehouse?.name || '-'}</span>
                  </div>
                ),
              },
              {
                key: 'itemCount', label: 'รายการ', headerClassName: 'text-center', cellClassName: 'text-center',
                render: (r) => <span className="data-text text-gray-700 dark:text-slate-300">{r.items?.length || 0}</span>,
              },
              {
                key: 'amount', label: 'มูลค่าที่คืน', headerClassName: 'text-right', cellClassName: 'text-right',
                render: (r) => (
                  <span className="data-number text-gray-700 dark:text-slate-300">
                    {r.total_amount ? `฿${Number(r.total_amount).toLocaleString('th-TH', { maximumFractionDigits: 2 })}` : '-'}
                  </span>
                ),
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
            onRowClick={(r) => router.push(`/inventory/supplier-returns/${r.id}`)}
            emptyMessage="ไม่พบรายการที่ค้นหา"
            emptyIcon={<SupplierReturnIcon className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            currentPage={page}
            totalPages={totalPages}
            totalRecords={total}
            recordsPerPage={limit}
            onPageChange={filters.setPage}
            onRecordsPerPageChange={filters.setLimit}
            onLimitChange={(l, p) => filters.set({ limit: l, page: p })}
            mobileCardRender={(r) => (
              <>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <Tooltip text="คัดลอก"><span className="id-text-clickable text-gray-900 dark:text-white" onClick={(e) => { e.stopPropagation(); copy(r.return_number, 'เลขที่ใบคืน'); }}>{r.return_number}</span></Tooltip>
                    <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge domain="stockDoc" status={r.status} />
                    <ActionMenu items={menuItems(r)} />
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <SupplierIcon className="w-3.5 h-3.5 text-gray-400" />
                  <span className="data-text text-gray-700 dark:text-slate-300">{r.supplier?.name || '-'}</span>
                  {r.deal_type && DEAL_LABEL[r.deal_type] && (
                    <Badge tone={DEAL_LABEL[r.deal_type].tone} size="sm">{DEAL_LABEL[r.deal_type].label}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <WarehouseIcon className="w-3.5 h-3.5 text-gray-400" />
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

export default function SupplierReturnListPage() {
  // ทั้งหน้าอ่าน useSearchParams → ต้องอยู่ใต้ Suspense (กฎ CSR bailout ของ Next 16)
  const { allowed, loading: permLoading } = useAuthGuard('inventory.view');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  return (
    <Layout title="รายการคืนของ Supplier" breadcrumbs={BREADCRUMBS}>
      <Suspense fallback={<LoadingCard />}>
        <SupplierReturnListContent />
      </Suspense>
    </Layout>
  );
}

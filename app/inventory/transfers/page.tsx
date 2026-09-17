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
import DataTable from '@/components/ui/DataTable';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import StatusTabs from '@/components/ui/StatusTabs';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { EmptyCard, LoadingCard } from '@/components/ui/StateCard';
import StatusBadge from '@/components/ui/StatusBadge';
import DocListFilters, { type DocListUser, type DocListWarehouse } from '../components/DocListFilters';
import { useDocListParams } from '../components/useDocListParams';
import {
  Loader2, ArrowRightLeft, Plus, Warehouse, Eye, Printer, Ban, X,
} from 'lucide-react';
import { useAuthGuard } from '@/lib/useAuthGuard';

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

// สีจากคลังกลาง lib/status-tab-colors — 'received' ของ transfer = สำเร็จ จึง map ไป 'completed'
// (key 'received' ในคลังกลางเป็นของ consignment "รอยืนยัน" คนละความหมาย)

const BREADCRUMBS = [{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'รายการโอนย้าย' }];

function TransferListContent() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const copy = useCopy();

  const {
    search, warehouseId, status, userId, page, limit,
    dateRange, effectiveFrom, effectiveTo,
    hasActiveFilters, depsKey, setParams, clearAll,
  } = useDocListParams('/inventory/transfers', { defaultStatus: 'pending' });

  const [rows, setRows] = useState<Transfer[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<DocListUser[]>([]);
  const [warehouses, setWarehouses] = useState<DocListWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Transfer | null>(null);

  const isAuthReady = !authLoading && !!userProfile;

  useFetchOnce(async () => {
    try {
      const res = await apiFetch('/api/warehouses?include_consignment=true');
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

      const res = await apiFetch(`/api/inventory/transfers?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRows(data.items || []);
      setTotal(data.total || 0);
      setCounts(data.status_counts || {});
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching transfers:', error);
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
      const res = await apiFetch(`/api/inventory/transfers?id=${id}`);
      if (!res.ok) { showToast('โหลดข้อมูลไม่สำเร็จ', 'error'); return; }
      const result = await res.json();
      const detail = result.transfer;
      if (!detail) { showToast('ไม่พบรายการ', 'error'); return; }
      const blob = await generateInventoryPdf({
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
          items: (detail.items || []).map((item: Record<string, unknown>) => ({
            ...item,
            quantity: item.qty_sent,
          })),
        },
      });
      showPdfPreview(blob, 'ใบโอนย้ายสินค้า');
    } catch {
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
    }
  };

  const handleCancel = async (transfer: Transfer) => {
    setCancellingId(transfer.id);
    try {
      const res = await apiFetch('/api/inventory/transfers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transfer.id, action: 'cancel' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'ยกเลิกไม่สำเร็จ');
      }
      showToast('ยกเลิกใบโอนย้ายสำเร็จ', 'success');
      void fetchData(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setCancellingId(null);
      setConfirmCancel(null);
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', {
      day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  };

  const menuItems = (t: Transfer): ActionItem[] => [
    {
      key: 'view',
      label: 'ดูรายละเอียด',
      icon: <Eye className="w-4 h-4" />,
      onClick: () => router.push(`/inventory/transfers/${t.id}`),
    },
    {
      key: 'print',
      label: 'พิมพ์',
      icon: printingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />,
      onClick: () => handlePrint(t.id),
      disabled: printingId === t.id,
    },
    ...((t.status === 'pending' || t.status === 'shipping') ? [{
      key: 'cancel',
      label: 'ยกเลิก',
      icon: <Ban className="w-4 h-4" />,
      danger: true,
      dividerBefore: true,
      onClick: () => setConfirmCancel(t),
    }] : []),
  ];

  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (loading) return <LoadingCard />;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Button
            variant="primary"
            onClick={() => router.push('/inventory/transfer')}
            icon={<Plus className="w-4 h-4" />}
            aria-label="สร้างใบโอนย้าย"
            className="whitespace-nowrap flex-shrink-0"
          >
            <span className="hidden md:inline">สร้างใบโอนย้าย</span>
          </Button>
        </div>

        <StatusTabs
          activeKey={status}
          onSelect={(key) => setParams({ status: key })}
          tabs={[
            { key: 'all', label: 'ทั้งหมด', count: counts.all ?? 0 },
            { key: 'pending', label: 'ที่ต้องจัดส่ง', count: counts.pending ?? 0 },
            { key: 'shipping', label: 'กำลังส่ง', count: counts.shipping ?? 0 },
            { key: 'pending_confirm', label: 'รอยืนยัน', count: counts.pending_confirm ?? 0 },
            { key: 'received', label: 'รับสินค้าแล้ว', count: counts.received ?? 0, colorKey: 'completed' },
            { key: 'cancelled', label: 'ยกเลิก', count: counts.cancelled ?? 0 },
          ]}
        />

        <DocListFilters
          search={search}
          onSearch={(v) => setParams({ q: v || null })}
          searchPlaceholder="ค้นหาเลขที่ใบโอน, หมายเหตุ..."
          dateRange={dateRange}
          onDateRange={(from, to) => setParams({ from: from || null, to: to || null })}
          warehouses={warehouses}
          warehouseId={warehouseId}
          onWarehouse={(v) => setParams({ wh: v || null })}
          warehouseLabel="ทุกคลัง (ต้นทาง/ปลายทาง)"
          users={users}
          userId={userId}
          onUser={(v) => setParams({ by: v || null })}
          onClear={clearAll}
          hasActiveFilters={hasActiveFilters}
        />

        {rows.length === 0 ? (
          <EmptyCard
            icon={<ArrowRightLeft className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            title={hasActiveFilters ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีรายการโอนย้ายในแท็บนี้'}
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
            <DataTable<Transfer>
              storageKey="transfers-visible-columns"
              columns={[
                {
                  key: 'transferInfo', label: 'เลขที่', alwaysVisible: true,
                  render: (t) => (
                    <>
                      <Tooltip text="คัดลอก"><p className="id-text-clickable text-gray-900 dark:text-white" onClick={(e) => { e.stopPropagation(); copy(t.transfer_number, 'เลขที่ใบโอน'); }}>{t.transfer_number}</p></Tooltip>
                      <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(t.created_at)}</p>
                    </>
                  ),
                },
                {
                  key: 'fromWarehouse', label: 'คลังต้นทาง',
                  render: (t) => (
                    <div className="flex items-center gap-1.5">
                      <Warehouse className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="data-text text-gray-700 dark:text-slate-300">{t.from_warehouse?.name || '-'}</span>
                    </div>
                  ),
                },
                {
                  key: 'toWarehouse', label: 'คลังปลายทาง',
                  render: (t) => (
                    <div className="flex items-center gap-1.5">
                      <Warehouse className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="data-text text-gray-700 dark:text-slate-300">{t.to_warehouse?.name || '-'}</span>
                    </div>
                  ),
                },
                {
                  key: 'itemCount', label: 'รายการ', headerClassName: 'text-center', cellClassName: 'text-center',
                  render: (t) => <span className="data-text text-gray-700 dark:text-slate-300">{t.items?.length || 0}</span>,
                },
                {
                  key: 'status', label: 'สถานะ', headerClassName: 'text-center', cellClassName: 'text-center',
                  render: (t) => <StatusBadge domain="transfer" status={t.status} />,
                },
                {
                  key: 'createdBy', label: 'ผู้ทำรายการ',
                  render: (t) => <span className="data-text text-gray-700 dark:text-slate-300">{t.created_by_user?.name || '-'}</span>,
                },
                {
                  key: 'receiver', label: 'ผู้รับ', stopPropagation: true,
                  render: (t) => t.receiver_name ? (
                    <div className="flex items-center gap-2">
                      {t.receive_photo_url && (
                        <ProductImageThumb src={t.receive_photo_url} alt="รูปรับสินค้า" size="xs" />
                      )}
                      <span className="data-text text-gray-700 dark:text-slate-300">{t.receiver_name}</span>
                    </div>
                  ) : (
                    <span className="data-muted text-gray-400 dark:text-slate-500">-</span>
                  ),
                },
                {
                  key: 'actions', label: 'จัดการ', alwaysVisible: true, headerClassName: 'text-center', stopPropagation: true, hideMobile: true,
                  render: (t) => (
                    <div className="flex items-center justify-center">
                      <ActionMenu items={menuItems(t)} />
                    </div>
                  ),
                },
              ]}
              data={rows}
              loading={false}
              getRowId={(t) => t.id}
              onRowClick={(t) => router.push(`/inventory/transfers/${t.id}`)}
              emptyMessage="ไม่พบรายการที่ค้นหา"
              emptyIcon={<ArrowRightLeft className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
              currentPage={page}
              totalPages={totalPages}
              totalRecords={total}
              recordsPerPage={limit}
              onPageChange={(p) => setParams({ page: String(p) })}
              onRecordsPerPageChange={(l) => setParams({ limit: String(l), page: '1' })}
              onLimitChange={(l, p) => setParams({ limit: String(l), page: String(p) })}
              mobileCardRender={(t) => (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <Tooltip text="คัดลอก"><span className="id-text-clickable text-gray-900 dark:text-white" onClick={(e) => { e.stopPropagation(); copy(t.transfer_number, 'เลขที่ใบโอน'); }}>
                        {t.transfer_number}
                      </span></Tooltip>
                      <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(t.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <StatusBadge domain="transfer" status={t.status} />
                      <ActionMenu items={menuItems(t)} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                    <span className="data-text text-gray-700 dark:text-slate-300">{t.from_warehouse?.name || '-'}</span>
                    <ArrowRightLeft className="w-3 h-3 text-gray-400" />
                    <span className="data-text text-gray-700 dark:text-slate-300">{t.to_warehouse?.name || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="data-muted text-gray-400 dark:text-slate-500">{t.items?.length || 0} รายการ | {t.created_by_user?.name || '-'}</span>
                    {t.receiver_name && (
                      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                        {t.receive_photo_url && (
                          <ProductImageThumb src={t.receive_photo_url} alt="รูปรับสินค้า" size="xs" />
                        )}
                        <span>ผู้รับ: {t.receiver_name}</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            />
          </div>
        )}
      </div>

      {confirmCancel && (
        <ConfirmDialog
          open={!!confirmCancel}
          onClose={() => setConfirmCancel(null)}
          onConfirm={() => handleCancel(confirmCancel)}
          title="ยืนยันยกเลิกใบโอนย้าย"
          description={`ยืนยันยกเลิก ${confirmCancel.transfer_number}? ${confirmCancel.status === 'shipping' ? 'สต็อกจะถูกคืนกลับไปที่คลังต้นทาง' : 'สต็อกที่จองไว้จะถูกปลดล็อค'}`}
          confirmLabel="ยืนยันยกเลิก"
          variant="danger"
          loading={cancellingId === confirmCancel.id}
        />
      )}
    </>
  );
}

export default function TransferListPage() {
  // ทั้งหน้าอ่าน useSearchParams → ต้องอยู่ใต้ Suspense (กฎ CSR bailout ของ Next 16)
  const { allowed, loading: permLoading } = useAuthGuard('inventory.view');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  return (
    <Layout title="รายการโอนย้ายสินค้า" breadcrumbs={BREADCRUMBS}>
      <Suspense fallback={<LoadingCard />}>
        <TransferListContent />
      </Suspense>
    </Layout>
  );
}

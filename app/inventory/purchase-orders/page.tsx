'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import { useCopy } from '@/lib/useCopy';
import { useFeatures } from '@/lib/features-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generatePOPdf } from '@/lib/supplier-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import { statusLabel } from '@/lib/status-labels';
import DataTable from '@/components/ui/DataTable';
import FormSelect from '@/components/ui/FormSelect';
import StatusTabs from '@/components/ui/StatusTabs';
import ActionMenu, { ActionItem } from '@/components/ui/ActionMenu';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { EmptyCard, LoadingCard } from '@/components/ui/StateCard';
import StatusBadge from '@/components/ui/StatusBadge';
import DocListFilters, { type DocListUser, type DocListWarehouse } from '../components/DocListFilters';
import { useDocListParams } from '../components/useDocListParams';
import { Lock } from 'lucide-react';
import { AddIcon, BanIcon, ChecklistIcon, CloseIcon, EditIcon, LinkIcon, LoadingIcon, PrintIcon, SupplierIcon, WarehouseIcon } from '@/lib/icons';
import { useAuthGuard } from '@/lib/useAuthGuard';

interface PurchaseOrder {
  id: string;
  po_number: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  notes: string | null;
  total_amount: number;
  created_at: string;
  created_by_name: string | null;
  supplier: { id: string; name: string; supplier_type: string } | null;
  warehouse: { id: string; name: string; code: string | null } | null;
  items: { id: string; quantity: number; received_quantity: number }[];
}

/** แท็บสถานะ — คำเรียกมาจากทะเบียนกลาง `lib/status-labels.ts` โดเมน purchaseOrder */
const STATUS_TABS: { key: string; colorKey?: string }[] = [
  { key: 'draft' },
  { key: 'sent' },
  { key: 'partial_received', colorKey: 'partially_paid' },
  { key: 'received', colorKey: 'completed' },
  { key: 'received_mismatch', colorKey: 'overdue' },
  { key: 'closed', colorKey: 'cancelled' },
  { key: 'cancelled' },
];

const BREADCRUMBS = [{ label: 'คลังสินค้า', href: '/inventory' }, { label: 'ใบสั่งซื้อ (PO)' }];

function PurchaseOrdersContent() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features, fetched: featuresFetched } = useFeatures();
  const { showToast } = useToast();
  const copy = useCopy();
  const { confirmDialog, confirm } = useConfirmDialog();

  const {
    search, warehouseId, status, userId, extra, page, limit,
    dateRange, effectiveFrom, effectiveTo,
    hasActiveFilters, depsKey, setParams, clearAll,
  } = useDocListParams('/inventory/purchase-orders', { extraKeys: ['sup'] });
  const supplierId = extra.sup || '';

  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<DocListUser[]>([]);
  const [warehouses, setWarehouses] = useState<DocListWarehouse[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const isAuthReady = !authLoading && !!userProfile && featuresFetched;
  const featureOk = !featuresFetched || features.supplier;

  // ด่านฟีเจอร์ — ร้านที่ไม่ได้เปิดระบบซัพพลายเออร์ไม่มีหน้านี้
  useEffect(() => {
    if (featuresFetched && !features.supplier) router.replace('/inventory/receives');
  }, [featuresFetched, features.supplier, router]);

  useFetchOnce(async () => {
    try {
      const [whRes, supRes] = await Promise.all([
        apiFetch('/api/warehouses'),
        apiFetch('/api/suppliers'),
      ]);
      if (whRes.ok) {
        const data = await whRes.json();
        setWarehouses(data.warehouses || []);
      }
      if (supRes.ok) {
        const data = await supRes.json();
        setSuppliers((data.data || []).map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })));
      }
    } catch { /* ตัวกรองโหลดไม่ได้ = ไม่ต้องขึ้น error ทั้งหน้า */ }
  }, isAuthReady && featureOk);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setFetching(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit), status });
      if (search) params.set('search', search);
      if (warehouseId) params.set('warehouse_id', warehouseId);
      if (supplierId) params.set('supplier_id', supplierId);
      if (userId) params.set('created_by', userId);
      if (effectiveFrom) params.set('date_from', effectiveFrom);
      if (effectiveTo) params.set('date_to', effectiveTo);

      const res = await apiFetch(`/api/inventory/purchase-orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRows(data.items || []);
      setTotal(data.total || 0);
      setCounts(data.status_counts || {});
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      if (!quiet) showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
      if (!quiet) setFetching(false);
    }
  }, [page, limit, status, search, warehouseId, supplierId, userId, effectiveFrom, effectiveTo, showToast]);

  // ยิงครั้งแรก + ทุกครั้งที่ค่าใน URL เปลี่ยนจริง (กัน re-render ซ้ำไม่ให้ยิงซ้ำ)
  const fetchedRef = useRef(false);
  const prevDepsRef = useRef(depsKey);
  const fetchRef = useRef(fetchData);
  useEffect(() => { fetchRef.current = fetchData; }, [fetchData]);
  useEffect(() => {
    if (!isAuthReady || !featureOk) return;
    const changed = prevDepsRef.current !== depsKey;
    prevDepsRef.current = depsKey;
    if (fetchedRef.current && !changed) return;
    fetchedRef.current = true;
    void fetchRef.current();
  }, [depsKey, isAuthReady, featureOk]);

  // Auto-send draft PO → returns share_token or null
  const autoSendIfDraft = async (poId: string, currentStatus: string): Promise<string | null> => {
    if (currentStatus !== 'draft') return null;
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent' }),
      });
      if (res.ok) {
        const d = await res.json();
        void fetchData(true); // refresh list
        return d.share_token || null;
      }
    } catch { /* */ }
    return null;
  };

  const handlePrint = async (id: string, poStatus: string) => {
    setPrintingId(id);
    try {
      // Auto-send draft before printing
      if (poStatus === 'draft') await autoSendIfDraft(id, poStatus);
      const res = await apiFetch(`/api/inventory/purchase-orders/${id}`);
      if (!res.ok) { showToast('โหลดข้อมูลไม่สำเร็จ', 'error'); return; }
      const result = await res.json();
      const po = result.purchase_order;
      if (!po) { showToast('ไม่พบรายการ', 'error'); return; }
      const blob = await generatePOPdf(po);
      showPdfPreview(blob, 'ใบสั่งซื้อ');
    } catch {
      showToast('สร้าง PDF ไม่สำเร็จ', 'error');
    } finally {
      setPrintingId(null);
    }
  };

  const handleCopyLink = async (poId: string, poStatus: string) => {
    setActionLoadingId(poId);
    try {
      // Auto-send draft before generating link
      if (poStatus === 'draft') {
        const token = await autoSendIfDraft(poId, poStatus);
        if (token) {
          showToast('แจ้ง Sup สำเร็จ');
          await copy(`${window.location.origin}/po/${token}`, 'ลิงก์');
          setActionLoadingId(null);
          return;
        }
      }
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generate_token: true }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.share_token) {
          await copy(`${window.location.origin}/po/${d.share_token}`, 'ลิงก์ PO ออนไลน์');
        }
      }
    } catch { showToast('สร้างลิงก์ไม่สำเร็จ', 'error'); }
    finally { setActionLoadingId(null); }
  };

  const patchStatus = async (poId: string, next: string, okMessage: string, confirmTitle: string, danger = false) => {
    const ok = await confirm(danger ? { title: confirmTitle, variant: 'danger' } : { title: confirmTitle });
    if (!ok) return;
    setActionLoadingId(poId);
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) { showToast(okMessage); void fetchData(true); }
      else { const d = await res.json(); showToast(d.error || 'ไม่สำเร็จ', 'error'); }
    } catch { showToast('เกิดข้อผิดพลาด', 'error'); }
    finally { setActionLoadingId(null); }
  };

  const getMenuItems = (po: PurchaseOrder): ActionItem[] => {
    const items: ActionItem[] = [
      { key: 'edit', label: 'แก้ไข', icon: <EditIcon className="w-4 h-4" />, onClick: () => router.push(`/inventory/purchase-orders/${po.id}`) },
      {
        key: 'print',
        label: 'พิมพ์',
        icon: printingId === po.id ? <LoadingIcon className="w-4 h-4 animate-spin" /> : <PrintIcon className="w-4 h-4" />,
        onClick: () => handlePrint(po.id, po.status),
        disabled: printingId === po.id,
      },
      {
        key: 'copyLink',
        label: 'คัดลอกลิงก์ PO',
        icon: <LinkIcon className="w-4 h-4" />,
        onClick: () => handleCopyLink(po.id, po.status),
        disabled: actionLoadingId === po.id,
      },
    ];
    if (po.status === 'draft' || po.status === 'sent') {
      items.push({
        key: 'cancel', label: 'ยกเลิก', icon: <BanIcon className="w-4 h-4" />, danger: true, dividerBefore: true,
        onClick: () => patchStatus(po.id, 'cancelled', 'ยกเลิก PO สำเร็จ', 'ต้องการยกเลิก PO นี้?', true),
      });
    }
    if (po.status === 'partial_received' || po.status === 'received' || po.status === 'received_mismatch') {
      items.push({
        key: 'close', label: 'ปิด PO', description: 'จบ PO นี้ ไม่รอรับของเพิ่ม', icon: <Lock className="w-4 h-4" />, dividerBefore: true,
        onClick: () => patchStatus(po.id, 'closed', 'ปิด PO สำเร็จ', 'ต้องการปิด PO นี้?'),
      });
    }
    return items;
  };

  const formatDate = (d: string) => {
    const isDateOnly = d.length <= 10;
    const date = new Date(isDateOnly ? d + 'T00:00:00' : d);
    if (isDateOnly) {
      return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
    }
    return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (n: number) =>
    n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (loading) return <LoadingCard />;

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Button
            variant="primary"
            onClick={() => router.push('/inventory/purchase-order')}
            icon={<AddIcon className="w-4 h-4" />}
            aria-label="สร้างใบสั่งซื้อ"
            className="whitespace-nowrap flex-shrink-0"
          >
            <span className="hidden md:inline">สร้างใบสั่งซื้อ</span>
          </Button>
        </div>

        <StatusTabs
          activeKey={status}
          onSelect={(key) => setParams({ status: key })}
          tabs={[
            { key: 'all', label: 'ทั้งหมด', count: counts.all ?? 0 },
            ...STATUS_TABS.map(t => ({
              key: t.key,
              label: statusLabel('purchaseOrder', t.key),
              count: counts[t.key] ?? 0,
              colorKey: t.colorKey,
            })),
          ]}
        />

        <DocListFilters
          search={search}
          onSearch={(v) => setParams({ q: v || null })}
          searchPlaceholder="ค้นหาเลขที่ PO, หมายเหตุ..."
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
          extra={suppliers.length > 1 ? (
            <div className="w-full md:w-44">
              <FormSelect
                value={supplierId}
                onChange={(v) => setParams({ sup: v || null })}
                options={suppliers}
                clearLabel="ทุก Supplier"
                placeholder="Supplier"
                icon={<SupplierIcon className="w-4 h-4" />}
                searchPlaceholder="ค้นหา Supplier..."
              />
            </div>
          ) : undefined}
        />

        {rows.length === 0 ? (
          <EmptyCard
            icon={<ChecklistIcon className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            title={hasActiveFilters ? 'ไม่พบใบสั่งซื้อที่ตรงกับตัวกรอง' : 'ยังไม่มีใบสั่งซื้อในแท็บนี้'}
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
            <DataTable<PurchaseOrder>
              storageKey="po-visible-columns"
              columns={[
                {
                  key: 'poInfo', label: 'เลขที่ PO', alwaysVisible: true,
                  render: (po) => (
                    <>
                      <p
                        className="id-text-clickable text-gray-900 dark:text-white"
                        onClick={(e) => { e.stopPropagation(); copy(po.po_number, 'เลข PO'); }}
                      >{po.po_number}</p>
                      <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(po.created_at)}</p>
                    </>
                  ),
                },
                {
                  key: 'supplier', label: 'Supplier',
                  render: (po) => (
                    <div className="flex items-center gap-1.5">
                      <SupplierIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="data-primary text-gray-900 dark:text-slate-100">{po.supplier?.name || '-'}</span>
                    </div>
                  ),
                },
                {
                  key: 'warehouse', label: 'คลัง',
                  render: (po) => (
                    <div className="flex items-center gap-1.5">
                      <WarehouseIcon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="data-text text-gray-700 dark:text-slate-300">{po.warehouse?.name || '-'}</span>
                    </div>
                  ),
                },
                {
                  key: 'itemCount', label: 'รายการ', headerClassName: 'text-center', cellClassName: 'text-center',
                  render: (po) => {
                    const totalQty = po.items.reduce((s, i) => s + i.quantity, 0);
                    const totalReceived = po.items.reduce((s, i) => s + i.received_quantity, 0);
                    return (
                      <>
                        <span className="data-text text-gray-700 dark:text-slate-300">{po.items.length}</span>
                        {totalReceived > 0 && (
                          <span className="data-number-muted text-gray-500 dark:text-slate-400 ml-1">({totalReceived}/{totalQty})</span>
                        )}
                      </>
                    );
                  },
                },
                {
                  key: 'amount', label: 'มูลค่า', headerClassName: 'text-right', cellClassName: 'text-right',
                  render: (po) => <span className="data-number text-gray-900 dark:text-white">฿{formatCurrency(po.total_amount)}</span>,
                },
                {
                  key: 'status', label: 'สถานะ', headerClassName: 'text-center', cellClassName: 'text-center',
                  render: (po) => <StatusBadge domain="purchaseOrder" status={po.status} />,
                },
                {
                  key: 'createdBy', label: 'ผู้สร้าง',
                  render: (po) => <span className="data-text text-gray-700 dark:text-slate-300">{po.created_by_name || '-'}</span>,
                },
                {
                  key: 'actions', label: 'จัดการ', alwaysVisible: true, headerClassName: 'text-center', stopPropagation: true, hideMobile: true,
                  render: (po) => (
                    <div className="flex items-center justify-center">
                      <ActionMenu items={getMenuItems(po)} />
                    </div>
                  ),
                },
              ]}
              data={rows}
              loading={false}
              getRowId={(po) => po.id}
              onRowClick={(po) => router.push(`/inventory/purchase-orders/${po.id}`)}
              emptyMessage="ไม่พบรายการที่ค้นหา"
              emptyIcon={<ChecklistIcon className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
              currentPage={page}
              totalPages={totalPages}
              totalRecords={total}
              recordsPerPage={limit}
              onPageChange={(p) => setParams({ page: String(p) })}
              onRecordsPerPageChange={(l) => setParams({ limit: String(l), page: '1' })}
              onLimitChange={(l, p) => setParams({ limit: String(l), page: String(p) })}
              mobileCardRender={(po) => (
                <>
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <span
                        className="id-text-clickable text-gray-900 dark:text-white"
                        onClick={(e) => { e.stopPropagation(); copy(po.po_number, 'เลข PO'); }}
                      >{po.po_number}</span>
                      <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(po.created_at)}</p>
                    </div>
                    <StatusBadge domain="purchaseOrder" status={po.status} />
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <SupplierIcon className="w-3.5 h-3.5 text-gray-400" />
                    <span className="data-text text-gray-700 dark:text-slate-300">{po.supplier?.name || '-'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="data-muted text-gray-400 dark:text-slate-500">{po.items.length} รายการ | {po.created_by_name || '-'}</span>
                    <span className="data-number text-gray-900 dark:text-white">฿{formatCurrency(po.total_amount)}</span>
                  </div>
                </>
              )}
            />
          </div>
        )}
      </div>
      {confirmDialog}
    </>
  );
}

export default function PurchaseOrdersPage() {
  // ทั้งหน้าอ่าน useSearchParams → ต้องอยู่ใต้ Suspense (กฎ CSR bailout ของ Next 16)
  const { allowed, loading: permLoading } = useAuthGuard('inventory.view');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  return (
    <Layout title="ใบสั่งซื้อ (PO)" breadcrumbs={BREADCRUMBS}>
      <Suspense fallback={<LoadingCard />}>
        <PurchaseOrdersContent />
      </Suspense>
    </Layout>
  );
}

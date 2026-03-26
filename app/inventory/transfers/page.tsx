'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { generateInventoryPdf } from '@/lib/inventory-pdf';
import { showPdfPreview } from '@/lib/print-pdf';
import DataTable from '@/components/ui/DataTable';
import FormSelect from '@/components/ui/FormSelect';
import ActionMenu from '@/app/orders/components/ActionMenu';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  Loader2, ArrowRightLeft, Plus, Warehouse, Eye, Printer, User,
  CheckCircle2, Clock, XCircle, AlertTriangle, Truck, Search, Ban,
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
  pending_confirm: { label: 'รอยืนยัน', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: AlertTriangle },
  received: { label: 'รับสินค้าแล้ว', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle2 },
  cancelled: { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
};


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
  useEffect(() => {
    if (!lightboxSrc) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxSrc(null); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [lightboxSrc]);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<Transfer | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);


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
          items: (detail.items || []).map((item: any) => ({
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
      const res = await apiFetch(`/api/inventory/transfers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transfer.id, action: 'cancel' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'ยกเลิกไม่สำเร็จ');
      }
      showToast('ยกเลิกใบโอนย้ายสำเร็จ', 'success');
      fetchTransfers();
    } catch (err: any) {
      showToast(err.message || 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setCancellingId(null);
      setConfirmCancel(null);
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
            { key: 'pending_confirm', label: 'รอยืนยัน', active: 'bg-orange-500', inactive: 'bg-orange-50 dark:bg-orange-950/50', labelColor: 'text-orange-600 dark:text-orange-400', countColor: 'text-orange-700 dark:text-orange-300' },
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
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="ค้นหา..."
              className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
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
          <button
            onClick={() => router.push('/inventory/transfer')}
            className="bg-[#F4511E] text-white p-2.5 md:px-4 md:py-2.5 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2 text-sm font-medium whitespace-nowrap flex-shrink-0"
            title="สร้างใบโอนย้าย"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden md:inline">สร้างใบโอนย้าย</span>
          </button>
        </div>

        <DataTable<Transfer>
          storageKey="transfers-visible-columns"
          columns={[
            {
              key: 'transferInfo', label: 'เลขที่', alwaysVisible: true,
              render: (t) => (
                <>
                  <p className="id-text-clickable text-gray-900 dark:text-white" title="คัดลอก" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(t.transfer_number).then(() => showToast('คัดลอกเลขที่ใบโอนแล้ว')); }}>{t.transfer_number}</p>
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
              render: (t) => {
                const st = STATUS_MAP[t.status] || STATUS_MAP.pending;
                const StIcon = st.icon;
                return (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${st.color}`}>
                    <StIcon className="w-3 h-3" />
                    {st.label}
                  </span>
                );
              },
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
                    <img
                      src={t.receive_photo_url}
                      alt="รูปรับสินค้า"
                      className="w-8 h-8 rounded object-cover cursor-pointer hover:opacity-80 flex-shrink-0"
                      onClick={() => setLightboxSrc(t.receive_photo_url)}
                    />
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
                  <ActionMenu items={[
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
                  ]} />
                </div>
              ),
            },
          ]}
          data={paginatedTransfers}
          loading={false}
          getRowId={(t) => t.id}
          onRowClick={(t) => router.push(`/inventory/transfers/${t.id}`)}
          emptyMessage={transfers.length === 0 ? 'ยังไม่มีรายการโอนย้าย' : 'ไม่พบรายการที่ค้นหา'}
          emptyIcon={<ArrowRightLeft className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          currentPage={page}
          totalPages={totalPages}
          totalRecords={totalRecords}
          recordsPerPage={recordsPerPage}
          onPageChange={setPage}
          onRecordsPerPageChange={setRecordsPerPage}
          mobileCardRender={(t) => {
            const st = STATUS_MAP[t.status] || STATUS_MAP.pending;
            const StIcon = st.icon;
            return (
              <>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="id-text-clickable text-gray-900 dark:text-white" title="คัดลอก" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(t.transfer_number).then(() => showToast('คัดลอกเลขที่ใบโอนแล้ว')); }}>
                      {t.transfer_number}
                    </span>
                    <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(t.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                      <StIcon className="w-3 h-3" />
                      {st.label}
                    </span>
                    <ActionMenu items={[
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
                    ]} />
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
              </>
            );
          }}
        />
      </div>

      {/* Image Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[999] bg-black/80 flex items-center justify-center p-4"
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
    </Layout>
  );
}

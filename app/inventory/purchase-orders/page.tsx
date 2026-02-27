'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useFeatures } from '@/lib/features-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import Pagination from '@/app/components/Pagination';
import {
  Loader2, Plus, Search, ClipboardList, Factory, Warehouse,
  CheckCircle2, Clock, Package, XCircle, Filter, Send,
} from 'lucide-react';

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

const STATUS_OPTIONS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'draft', label: 'ร่าง' },
  { value: 'sent', label: 'ส่งแล้ว' },
  { value: 'partial_received', label: 'รับบางส่วน' },
  { value: 'received', label: 'รับครบ' },
  { value: 'closed', label: 'ปิด' },
  { value: 'cancelled', label: 'ยกเลิก' },
];

function statusBadge(status: string) {
  switch (status) {
    case 'draft': return { label: 'ร่าง', color: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-slate-300' };
    case 'sent': return { label: 'ส่งแล้ว', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
    case 'partial_received': return { label: 'รับบางส่วน', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' };
    case 'received': return { label: 'รับครบ', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' };
    case 'closed': return { label: 'ปิด', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' };
    case 'cancelled': return { label: 'ยกเลิก', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' };
    default: return { label: status, color: 'bg-gray-100 text-gray-600' };
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'draft': return <ClipboardList className="w-3.5 h-3.5" />;
    case 'sent': return <Send className="w-3.5 h-3.5" />;
    case 'partial_received': return <Clock className="w-3.5 h-3.5" />;
    case 'received': return <CheckCircle2 className="w-3.5 h-3.5" />;
    case 'closed': return <Package className="w-3.5 h-3.5" />;
    case 'cancelled': return <XCircle className="w-3.5 h-3.5" />;
    default: return null;
  }
}

export default function PurchaseOrdersPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const { features } = useFeatures();
  const { showToast } = useToast();

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

  // Feature gate redirect
  useFetchOnce(() => {
    if (!features.supplier) {
      router.replace('/inventory/receives');
      return;
    }
    fetchData();
  }, !authLoading && !!userProfile);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/inventory/purchase-orders');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setPurchaseOrders(data.purchase_orders || []);
    } catch (error) {
      console.error('Error fetching POs:', error);
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Filter
  const filtered = purchaseOrders.filter(po => {
    if (statusFilter !== 'all' && po.status !== statusFilter) return false;
    if (search) {
      const term = search.toLowerCase();
      const matchPO = po.po_number.toLowerCase().includes(term);
      const matchSupplier = po.supplier?.name.toLowerCase().includes(term);
      const matchNotes = po.notes?.toLowerCase().includes(term);
      if (!matchPO && !matchSupplier && !matchNotes) return false;
    }
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filtered.length / recordsPerPage);
  const paged = filtered.slice((page - 1) * recordsPerPage, page * recordsPerPage);

  const formatDate = (d: string) => {
    return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  };

  const formatCurrency = (n: number) => {
    return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  if (authLoading || loading) {
    return (
      <Layout title="ใบสั่งซื้อ (PO)">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="ใบสั่งซื้อ (PO)"
      breadcrumbs={[
        { label: 'คลังสินค้า', href: '/inventory' },
        { label: 'ใบสั่งซื้อ (PO)' },
      ]}
    >
      <div className="space-y-4">
        {/* Action bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="ค้นหา PO, supplier..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <select
                value={statusFilter}
                onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
                className="pl-10 pr-8 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E] focus:border-transparent appearance-none"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={() => router.push('/inventory/purchase-order')}
            className="flex items-center gap-2 px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            สร้างใบสั่งซื้อ
          </button>
        </div>

        {/* Count */}
        <p className="text-sm text-gray-500 dark:text-slate-400">
          {filtered.length} รายการ
        </p>

        {/* Table */}
        {paged.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-slate-500">
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">{search || statusFilter !== 'all' ? 'ไม่พบรายการที่ตรงกัน' : 'ยังไม่มีใบสั่งซื้อ'}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <table className="data-table-fixed">
                <thead>
                  <tr className="data-thead-tr">
                    <th className="data-th">เลขที่ PO</th>
                    <th className="data-th">Supplier</th>
                    <th className="data-th">คลัง</th>
                    <th className="data-th text-center">รายการ</th>
                    <th className="data-th text-right">มูลค่า</th>
                    <th className="data-th">สถานะ</th>
                    <th className="data-th">วันที่</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {paged.map(po => {
                    const badge = statusBadge(po.status);
                    const totalQty = po.items.reduce((s, i) => s + i.quantity, 0);
                    const totalReceived = po.items.reduce((s, i) => s + i.received_quantity, 0);
                    return (
                      <tr
                        key={po.id}
                        onClick={() => router.push(`/inventory/purchase-orders/${po.id}`)}
                        className="data-tr cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50"
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">{po.po_number}</div>
                          {po.created_by_name && (
                            <div className="text-xs text-gray-500 dark:text-slate-400">{po.created_by_name}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Factory className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-900 dark:text-white">{po.supplier?.name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Warehouse className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm text-gray-700 dark:text-slate-300">{po.warehouse?.name || '-'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-sm text-gray-900 dark:text-white">{po.items.length}</span>
                          {totalReceived > 0 && (
                            <span className="text-xs text-gray-500 dark:text-slate-400 ml-1">
                              ({totalReceived}/{totalQty})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            ฿{formatCurrency(po.total_amount)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                            {statusIcon(po.status)}
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                          {formatDate(po.order_date || po.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {paged.map(po => {
                const badge = statusBadge(po.status);
                return (
                  <div
                    key={po.id}
                    onClick={() => router.push(`/inventory/purchase-orders/${po.id}`)}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 cursor-pointer active:bg-gray-50 dark:active:bg-slate-700/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{po.po_number}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>
                        {statusIcon(po.status)}
                        {badge.label}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 dark:text-slate-400 space-y-1">
                      <div className="flex items-center gap-2">
                        <Factory className="w-3.5 h-3.5 flex-shrink-0" />
                        {po.supplier?.name || '-'}
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{po.items.length} รายการ</span>
                        <span className="font-medium text-gray-900 dark:text-white">฿{formatCurrency(po.total_amount)}</span>
                      </div>
                      <div className="text-xs">{formatDate(po.order_date || po.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
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
    </Layout>
  );
}

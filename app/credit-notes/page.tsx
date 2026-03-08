'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import {
  ReceiptText,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';
import SearchInput from '@/components/ui/SearchInput';

interface CreditNote {
  id: string;
  cn_number: string;
  order_id: string | null;
  source_type: 'order' | 'replenishment';
  source_id: string | null;
  type: 'void' | 'refund' | 'exchange';
  status: 'issued' | 'cancelled';
  reason: string | null;
  subtotal: number;
  discount_amount: number;
  vat_amount: number;
  total_amount: number;
  issued_at: string;
  order?: { order_number: string; source: string } | null;
  replenishment?: { replenishment_number: string } | null;
  creator?: { email: string } | null;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  void: { label: 'ยกเลิกบิล', color: 'bg-red-100 text-red-700 dark:bg-red-500/30 dark:text-red-200' },
  refund: { label: 'คืนสินค้า', color: 'bg-orange-100 text-orange-700 dark:bg-orange-500/30 dark:text-orange-200' },
  exchange: { label: 'เปลี่ยนสินค้า', color: 'bg-blue-100 text-blue-700 dark:bg-blue-500/30 dark:text-blue-200' },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  issued: { label: 'ออกแล้ว', color: 'bg-green-100 text-green-700 dark:bg-green-500/30 dark:text-green-200' },
  cancelled: { label: 'ยกเลิก', color: 'bg-gray-100 text-gray-500 dark:bg-gray-500/30 dark:text-gray-300' },
};

export default function CreditNotesPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();
  const [data, setData] = useState<CreditNote[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(rowsPerPage) });
      if (typeFilter) params.set('type', typeFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await apiFetch(`/api/credit-notes?${params}`);
      if (res.ok) {
        const result = await res.json();
        setData(result.data || []);
        setTotal(result.total || 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchData();
    }
  }, [authLoading, userProfile, page, rowsPerPage, typeFilter, debouncedSearch]);

  const totalPages = Math.ceil(total / rowsPerPage);
  const startIndex = (page - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, total);

  if (authLoading || (loading && data.length === 0)) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center">
              <ReceiptText className="w-8 h-8 mr-3 text-red-500" />
              ใบลดหนี้
            </h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">รายการใบลดหนี้ทั้งหมด</p>
          </div>
        </div>

        {/* Filters */}
        <div className="data-filter-card">
          <div className="flex flex-col gap-3">
            <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="ค้นหาเลขที่, เลขบิล..." className="py-2" />

            {/* Type chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: '', label: 'ทั้งหมด' },
                { id: 'void', label: 'ยกเลิกบิล' },
                { id: 'refund', label: 'คืนสินค้า' },
                { id: 'exchange', label: 'เปลี่ยนสินค้า' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => { setTypeFilter(t.id); setPage(1); }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                    typeFilter === t.id
                      ? 'border-gray-800 dark:border-white bg-gray-800 dark:bg-white text-white dark:text-gray-900'
                      : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="data-table-wrap">
          {loading && (
            <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 z-10 flex items-center justify-center rounded-xl">
              <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
            </div>
          )}

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  <th className="data-th min-w-[140px]">เลขที่</th>
                  <th className="data-th w-[140px]">วันที่</th>
                  <th className="data-th min-w-[120px]">อ้างอิงบิล</th>
                  <th className="data-th w-[120px]">ประเภท</th>
                  <th className="data-th text-right w-[130px]">ยอดเงิน</th>
                  <th className="data-th w-[100px]">สถานะ</th>
                </tr>
              </thead>
              <tbody className="data-tbody">
                {data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <ReceiptText className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-gray-400 dark:text-slate-500">ยังไม่มีใบลดหนี้</p>
                    </td>
                  </tr>
                ) : (
                  data.map(cn => {
                    const typeConfig = TYPE_LABELS[cn.type] || TYPE_LABELS.void;
                    const statusConfig = STATUS_LABELS[cn.status] || STATUS_LABELS.issued;
                    return (
                      <tr
                        key={cn.id}
                        onClick={() => router.push(`/credit-notes/${cn.id}`)}
                        className="data-tr cursor-pointer"
                      >
                        <td className="data-td">
                          <span className="id-text text-gray-900 dark:text-white">{cn.cn_number}</span>
                        </td>
                        <td className="data-td whitespace-nowrap">
                          <span className="data-text text-gray-500 dark:text-slate-400">
                            {new Date(cn.issued_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </td>
                        <td className="data-td">
                          {cn.source_type === 'replenishment' && cn.replenishment ? (
                            <span className="id-text text-amber-600 dark:text-amber-400">{cn.replenishment.replenishment_number}</span>
                          ) : (
                            <span className="id-text text-blue-600 dark:text-blue-400">{cn.order?.order_number || '-'}</span>
                          )}
                        </td>
                        <td className="data-td whitespace-nowrap">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${typeConfig.color}`}>
                            {typeConfig.label}
                          </span>
                        </td>
                        <td className="data-td text-right whitespace-nowrap">
                          <span className="data-number text-gray-900 dark:text-white">฿{formatPrice(cn.total_amount)}</span>
                        </td>
                        <td className="data-td whitespace-nowrap">
                          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${statusConfig.color}`}>
                            {statusConfig.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
            {data.length === 0 ? (
              <div className="text-center py-12">
                <ReceiptText className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-gray-400 dark:text-slate-500">ยังไม่มีใบลดหนี้</p>
              </div>
            ) : (
              data.map(cn => {
                const typeConfig = TYPE_LABELS[cn.type] || TYPE_LABELS.void;
                return (
                  <button
                    key={cn.id}
                    onClick={() => router.push(`/credit-notes/${cn.id}`)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{cn.cn_number}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${typeConfig.color}`}>
                          {typeConfig.label}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 dark:text-slate-500">
                        {cn.source_type === 'replenishment' ? cn.replenishment?.replenishment_number : cn.order?.order_number || '-'} · {new Date(cn.issued_at).toLocaleDateString('th-TH')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">฿{formatPrice(cn.total_amount)}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalRecords={total}
            startIdx={startIndex}
            endIdx={endIndex}
            recordsPerPage={rowsPerPage}
            setRecordsPerPage={setRowsPerPage}
            setPage={setPage}
          />
        </div>
      </div>
    </Layout>
  );
}

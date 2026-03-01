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
  ChevronLeft,
} from 'lucide-react';

interface CreditNote {
  id: string;
  cn_number: string;
  order_id: string;
  type: 'void' | 'refund' | 'exchange';
  status: 'issued' | 'cancelled';
  reason: string | null;
  subtotal: number;
  discount_amount: number;
  vat_amount: number;
  total_amount: number;
  issued_at: string;
  order?: { order_number: string; source: string } | null;
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
  const [typeFilter, setTypeFilter] = useState('');
  const limit = 20;

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (typeFilter) params.set('type', typeFilter);
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
  }, [authLoading, userProfile, page, typeFilter]);

  const totalPages = Math.ceil(total / limit);

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <ReceiptText className="w-6 h-6 text-red-500" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">ใบลดหนี้</h1>
            {total > 0 && (
              <span className="text-sm text-gray-400 dark:text-slate-500">({total})</span>
            )}
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 flex-wrap">
          {['', 'void', 'refund', 'exchange'].map(t => (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-[#F4511E] text-white'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
              }`}
            >
              {t === '' ? 'ทั้งหมด' : TYPE_LABELS[t]?.label || t}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-12">
              <ReceiptText className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-gray-400 dark:text-slate-500">ยังไม่มีใบลดหนี้</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">เลขที่</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">วันที่</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">อ้างอิงบิล</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">ประเภท</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">ยอดเงิน</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {data.map(cn => {
                      const typeConfig = TYPE_LABELS[cn.type] || TYPE_LABELS.void;
                      const statusConfig = STATUS_LABELS[cn.status] || STATUS_LABELS.issued;
                      return (
                        <tr
                          key={cn.id}
                          onClick={() => router.push(`/credit-notes/${cn.id}`)}
                          className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{cn.cn_number}</td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                            {new Date(cn.issued_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
                            {cn.order?.order_number || '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeConfig.color}`}>
                              {typeConfig.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                            ฿{formatPrice(cn.total_amount)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusConfig.color}`}>
                              {statusConfig.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
                {data.map(cn => {
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
                          {cn.order?.order_number || '-'} · {new Date(cn.issued_at).toLocaleDateString('th-TH')}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">฿{formatPrice(cn.total_amount)}</span>
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg border border-gray-300 dark:border-slate-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-slate-300" />
            </button>
            <span className="text-sm text-gray-600 dark:text-slate-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-lg border border-gray-300 dark:border-slate-600 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-600 dark:text-slate-300" />
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}

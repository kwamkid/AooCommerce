'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { RotateCcw, Search, Plus } from 'lucide-react';
import Pagination from '@/app/components/Pagination';

interface ReturnNoteRow {
  id: string;
  rn_number: string;
  rn_date: string;
  status: string;
  total_amount: number;
  reference_doc_number: string | null;
  reason: string | null;
  credit_note_id: string | null;
  customer: { id: string; name: string; customer_code: string | null } | null;
}

function formatDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMoney(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  issued: { label: 'ออกแล้ว', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export default function ReturnNotesPage() {
  const [rows, setRows] = useState<ReturnNoteRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [loadTime, setLoadTime] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const t0 = Date.now();
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(recordsPerPage) });
      if (search) params.set('search', search);
      const res = await apiFetch(`/api/return-notes?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.return_notes || []);
        setTotal(data.total || 0);
        setLoadTime((Date.now() - t0) / 1000);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, recordsPerPage, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / recordsPerPage);
  const startIdx = (page - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + rows.length, total);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <RotateCcw className="w-8 h-8 text-[#F4511E]" />
              ใบรับคืนสินค้า
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">RN-YYYYMM-NNNN — คืนสินค้าจากตัวแทน/ห้าง</p>
          </div>
          <Link
            href="/return-notes/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#E64A19] transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> สร้างใบรับคืน
          </Link>
        </div>

        <div className="data-filter-card">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="ค้นหาเลขที่..."
                className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><RotateCcw className="w-8 h-8 text-gray-300 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-slate-400 text-sm">ไม่พบใบรับคืนสินค้า</div>
        ) : (
          <>
          <div className="data-table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th">เลขที่</th>
                    <th className="data-th">วันที่</th>
                    <th className="data-th">ลูกค้า</th>
                    <th className="data-th">อ้างอิง</th>
                    <th className="data-th">เหตุผล</th>
                    <th className="data-th text-right">ยอด (บาท)</th>
                    <th className="data-th text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {rows.map(row => {
                    const badge = STATUS_BADGE[row.status] || STATUS_BADGE.issued;
                    return (
                      <tr key={row.id} className="data-tr">
                        <td className="px-6 py-4">
                          <Link href={`/return-notes/${row.id}`} className="font-mono text-sm font-medium text-[#F4511E] hover:underline">
                            {row.rn_number}
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">{formatDate(row.rn_date)}</td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{row.customer?.name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400">{row.reference_doc_number || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400 truncate max-w-[200px]">{row.reason || '-'}</td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900 dark:text-white">{formatMoney(row.total_amount)}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              startIdx={startIdx + 1}
              endIdx={endIdx}
              total={total}
              recordsPerPage={recordsPerPage}
              onRecordsPerPageChange={(v) => { setRecordsPerPage(v); setPage(1); }}
              loadTime={loadTime}
            />
          </div>

          {/* Mobile card layout */}
          <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {rows.map(row => {
                const badge = STATUS_BADGE[row.status] || STATUS_BADGE.issued;
                return (
                  <Link key={row.id} href={`/return-notes/${row.id}`} className="block p-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-[#F4511E]">{row.rn_number}</span>
                        <span className="text-xs text-gray-400 dark:text-slate-500">{formatDate(row.rn_date)}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <div className="text-sm text-gray-900 dark:text-white mb-1">{row.customer?.name || '-'}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 mb-1">
                      {row.reference_doc_number && <span>อ้างอิง: {row.reference_doc_number}</span>}
                      {row.reason && <span className="truncate">เหตุผล: {row.reason}</span>}
                    </div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white text-right">{formatMoney(row.total_amount)} บาท</div>
                  </Link>
                );
              })}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              startIdx={startIdx + 1}
              endIdx={endIdx}
              total={total}
              recordsPerPage={recordsPerPage}
              onRecordsPerPageChange={(v) => { setRecordsPerPage(v); setPage(1); }}
              loadTime={loadTime}
            />
          </div>
          </>
        )}
      </div>
    </Layout>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { FileText, Search, ExternalLink } from 'lucide-react';
import Pagination from '@/app/components/Pagination';

interface InvRow {
  doc_id: string;
  source_type: string;
  source_id: string;
  source_number: string | null;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  customer_name: string | null;
  customer: { id: string; name: string } | null;
  voided_at: string | null;
}

function formatDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMoney(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getMonthOptions() {
  const opts: { value: string; label: string }[] = [{ value: '', label: 'ทุกเดือน' }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    opts.push({ value: `${y}${m}`, label: d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' }) });
  }
  return opts;
}

function getSourceLink(row: InvRow): { href: string; label: string; subtitle?: string } {
  switch (row.source_type) {
    case 'order':
      return { href: `/orders/${row.source_id}`, label: row.source_number || '-' };
    case 'consignment_report':
      return { href: `/consignment/reports/${row.source_id}`, label: row.source_number || '-', subtitle: 'ยอดขายตัวแทน' };
    case 'department_store_report':
      return { href: `/department-store/reports/${row.source_id}`, label: row.source_number || '-', subtitle: 'ยอดขายห้าง' };
    default:
      return { href: '#', label: row.source_number || '-' };
  }
}

export default function BillingInvoicesPage() {
  const [rows, setRows] = useState<InvRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [loadTime, setLoadTime] = useState<number | null>(null);

  const monthOptions = getMonthOptions();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const t0 = Date.now();
    try {
      const params = new URLSearchParams({ type: 'invoice', page: String(page), limit: String(recordsPerPage) });
      if (search) params.set('search', search);
      if (month) params.set('month', month);
      const res = await apiFetch(`/api/invoices?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.invoices || []);
        setTotal(data.total || 0);
        setLoadTime((Date.now() - t0) / 1000);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, recordsPerPage, search, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / recordsPerPage);
  const startIdx = (page - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + rows.length, total);

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <FileText className="w-8 h-8 text-[#F4511E]" />
            ใบแจ้งหนี้
          </h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">INV-YYYYMM-NNNN</p>
        </div>

        <div className="data-filter-card">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={month}
              onChange={e => { setMonth(e.target.value); setPage(1); }}
              className="h-[42px] px-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
            >
              {monthOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="ค้นหาเลขที่, ชื่อ..."
                className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><FileText className="w-8 h-8 text-gray-300 animate-pulse" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-slate-400 text-sm">ไม่พบใบแจ้งหนี้</div>
        ) : (
          <>
          <div className="data-table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th">เลขที่</th>
                    <th className="data-th">วันที่ออก</th>
                    <th className="data-th">อ้างอิง</th>
                    <th className="data-th">ลูกค้า</th>
                    <th className="data-th text-right">ยอด (บาท)</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {rows.map(row => {
                    const link = getSourceLink(row);
                    return (
                      <tr key={row.doc_id} className="data-tr">
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm font-medium text-[#F4511E]">{row.invoice_number}</span>
                          {row.voided_at && (
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">VOID</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">{formatDate(row.invoice_date)}</td>
                        <td className="px-6 py-4">
                          <Link href={link.href} className="text-sm text-[#F4511E] hover:underline inline-flex items-center gap-1">
                            {link.label} <ExternalLink className="w-3 h-3" />
                          </Link>
                          {link.subtitle && <div className="text-xs text-gray-400">{link.subtitle}</div>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{row.customer_name || row.customer?.name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900 dark:text-white">{formatMoney(row.total_amount)}</td>
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
                const link = getSourceLink(row);
                return (
                  <div key={row.doc_id} className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-[#F4511E]">{row.invoice_number}</span>
                      {row.voided_at && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">VOID</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{formatDate(row.invoice_date)}</div>
                    <div className="mt-1">
                      <Link href={link.href} className="text-sm text-[#F4511E] hover:underline inline-flex items-center gap-1">
                        {link.label} <ExternalLink className="w-3 h-3" />
                      </Link>
                      {link.subtitle && <span className="text-xs text-gray-400 ml-1">{link.subtitle}</span>}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-sm text-gray-600 dark:text-slate-300">{row.customer_name || row.customer?.name || '-'}</div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{formatMoney(row.total_amount)} บาท</div>
                    </div>
                  </div>
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

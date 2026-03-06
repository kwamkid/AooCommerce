'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { FileText, Search, Printer, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { showPdfPreview } from '@/lib/print-pdf';
import Pagination from '@/app/components/Pagination';

interface Invoice {
  id: string;
  order_number: string;
  tax_invoice_number: string;
  tax_invoice_date: string;
  tax_invoice_name: string | null;
  tax_invoice_tax_id: string | null;
  tax_invoice_branch: string | null;
  tax_invoice_replaced_abbrev_number: string | null;
  vat_registered_at_issue: boolean | null;
  is_retroactive: boolean | null;
  total_amount: number;
  vat_amount: number;
  customer: { id: string; name: string; contact_person: string | null } | null;
}

function formatDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMoney(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Generate month options (last 12 months + current)
function getMonthOptions() {
  const opts: { value: string; label: string }[] = [{ value: '', label: 'ทุกเดือน' }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const label = d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
    opts.push({ value: `${y}${m}`, label });
  }
  return opts;
}

export default function TaxInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [loadTime, setLoadTime] = useState<number | null>(null);

  const monthOptions = getMonthOptions();

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const t0 = Date.now();
    try {
      const params = new URLSearchParams({ type: 'tax', page: String(page), limit: String(recordsPerPage) });
      if (search) params.set('search', search);
      if (month) params.set('month', month);
      const res = await apiFetch(`/api/invoices?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.invoices || []);
        setTotal(data.total || 0);
        setLoadTime((Date.now() - t0) / 1000);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, recordsPerPage, search, month]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handlePrint = async (inv: Invoice) => {
    try {
      const res = await apiFetch(`/api/orders/${inv.id}?include_items=true`);
      if (!res.ok) return;
      const orderData = await res.json();
      const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
      const blob = await generateFullInvoicePdf({
        ...orderData,
        tax_invoice_number: inv.tax_invoice_number,
        tax_invoice_date: inv.tax_invoice_date,
        tax_invoice_name: inv.tax_invoice_name,
        tax_invoice_tax_id: inv.tax_invoice_tax_id,
        tax_invoice_branch: inv.tax_invoice_branch,
        tax_invoice_doc_type: 'tax',
        tax_invoice_replaced_abbrev_number: inv.tax_invoice_replaced_abbrev_number,
      });
      showPdfPreview(blob, `ใบกำกับภาษี ${inv.tax_invoice_number}`);
    } catch (e) {
      console.error(e);
    }
  };

  const totalPages = Math.ceil(total / recordsPerPage);
  const startIdx = (page - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + invoices.length, total);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <FileText className="w-8 h-8 text-[#F4511E]" />
              ใบกำกับภาษี
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">TAX-YYYYMM-NNNN — เรียงต่อเนื่องตลอดเดือน</p>
          </div>
        </div>

        {/* Filters */}
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
                placeholder="ค้นหาเลขที่, ชื่อ, เลขภาษี..."
                className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16"><FileText className="w-8 h-8 text-gray-300 animate-pulse" /></div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-slate-400 text-sm">ไม่พบใบกำกับภาษี</div>
        ) : (
          <div className="data-table-wrap">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th">เลขที่ใบกำกับ</th>
                    <th className="data-th">วันที่ออก</th>
                    <th className="data-th">คำสั่งซื้อ</th>
                    <th className="data-th">ชื่อผู้ซื้อ</th>
                    <th className="data-th">เลขผู้เสียภาษี</th>
                    <th className="data-th text-right">ยอด (บาท)</th>
                    <th className="data-th text-center">พิมพ์</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {invoices.map(inv => (
                    <tr key={inv.id} className="data-tr">
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-medium text-[#F4511E]">{inv.tax_invoice_number}</span>
                        {inv.tax_invoice_replaced_abbrev_number && (
                          <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                            แทน {inv.tax_invoice_replaced_abbrev_number}
                          </div>
                        )}
                        {inv.is_retroactive && (
                          <span className="ml-1 text-xs text-orange-500">ย้อนหลัง</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">{formatDate(inv.tax_invoice_date)}</td>
                      <td className="px-6 py-4">
                        <Link href={`/orders/${inv.id}`} className="text-sm text-[#F4511E] hover:underline inline-flex items-center gap-1">
                          {inv.order_number} <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 dark:text-white">{inv.tax_invoice_name || '-'}</div>
                        {inv.tax_invoice_branch && (
                          <div className="text-xs text-gray-400">{inv.tax_invoice_branch}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-gray-600 dark:text-slate-300">{inv.tax_invoice_tax_id || '-'}</td>
                      <td className="px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-white">{formatMoney(inv.total_amount)}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => handlePrint(inv)}
                          className="p-1.5 text-gray-400 hover:text-[#F4511E] transition-colors"
                          title="พิมพ์"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page} totalPages={totalPages} totalRecords={total}
              startIdx={startIdx} endIdx={endIdx} recordsPerPage={recordsPerPage}
              setRecordsPerPage={setRecordsPerPage} setPage={setPage} loadTime={loadTime}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}

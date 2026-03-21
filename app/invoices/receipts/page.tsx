'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { Receipt, Search, Printer, ExternalLink } from 'lucide-react';
import { showPdfPreview } from '@/lib/print-pdf';
import Pagination from '@/app/components/Pagination';

interface InvoiceRow {
  id: string;
  doc_id: string;
  source_type: 'order' | 'statement' | 'replenishment';
  source_id: string;
  source_number: string | null;
  order_number: string | null;
  tax_invoice_number: string; // receipt_number aliased
  tax_invoice_date: string;
  tax_invoice_name: string | null;
  tax_invoice_address: string | null;
  total_amount: number;
  voided_at: string | null;
  customer: { id: string; name: string } | null;
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

function getSourceLink(inv: InvoiceRow): { href: string; label: string } {
  switch (inv.source_type) {
    case 'order':
      return { href: `/orders/${inv.source_id}`, label: inv.source_number || '-' };
    case 'statement':
      return { href: `/consignment/reports`, label: inv.source_number || 'ใบวางบิล' };
    case 'replenishment':
      return { href: `/inventory`, label: inv.source_number || 'เติมสินค้า' };
    default:
      return { href: '#', label: '-' };
  }
}

export default function ReceiptsPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
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
      const params = new URLSearchParams({ type: 'receipt', page: String(page), limit: String(recordsPerPage) });
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

  const handlePrint = async (inv: InvoiceRow) => {
    try {
      if (inv.source_type === 'order') {
        const res = await apiFetch(`/api/orders/${inv.source_id}?include_items=true`);
        if (!res.ok) return;
        const orderData = await res.json();
        const order = orderData.order || orderData;
        const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
        const blob = await generateFullInvoicePdf({
          ...order,
          tax_invoice_number: inv.tax_invoice_number,
          tax_invoice_date: inv.tax_invoice_date,
          tax_invoice_name: inv.tax_invoice_name,
          tax_invoice_doc_type: 'receipt',
        });
        showPdfPreview(blob, `ใบเสร็จรับเงิน ${inv.tax_invoice_number}`);
      }
      // statement/replenishment REC — TODO: add print support when needed
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
              <Receipt className="w-8 h-8 text-[#F4511E]" />
              ใบเสร็จรับเงิน
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">REC-YYYYMM-NNNN — สำหรับร้านที่ไม่จด VAT</p>
          </div>
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
          <div className="flex justify-center py-16"><Receipt className="w-8 h-8 text-gray-300 animate-pulse" /></div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-slate-400 text-sm">ไม่พบใบเสร็จรับเงิน</div>
        ) : (
          <>
          <div className="data-table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th">เลขที่ใบเสร็จ</th>
                    <th className="data-th">วันที่ออก</th>
                    <th className="data-th">อ้างอิง</th>
                    <th className="data-th">ชื่อ / ที่อยู่</th>
                    <th className="data-th text-right">ยอด (บาท)</th>
                    <th className="data-th text-center">พิมพ์</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {invoices.map(inv => {
                    const link = getSourceLink(inv);
                    return (
                      <tr key={inv.doc_id} className="data-tr">
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm font-medium text-[#F4511E]">{inv.tax_invoice_number}</span>
                          {inv.voided_at && (
                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">VOID</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">{formatDate(inv.tax_invoice_date)}</td>
                        <td className="px-6 py-4">
                          <Link href={link.href} className="text-sm text-[#F4511E] hover:underline inline-flex items-center gap-1">
                            {link.label} <ExternalLink className="w-3 h-3" />
                          </Link>
                          {inv.source_type !== 'order' && (
                            <div className="text-xs text-gray-400">
                              {inv.source_type === 'statement' ? 'ใบวางบิล' : 'เติมสินค้า'}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900 dark:text-white">{inv.tax_invoice_name || inv.customer?.name || '-'}</div>
                          {inv.tax_invoice_address && (
                            <div className="text-xs text-gray-400 truncate max-w-[200px]">{inv.tax_invoice_address}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-gray-900 dark:text-white">{formatMoney(inv.total_amount)}</td>
                        <td className="px-6 py-4 text-center">
                          <button onClick={() => handlePrint(inv)} className="p-1.5 text-gray-400 hover:text-[#F4511E] transition-colors" title="พิมพ์">
                            <Printer className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page} totalPages={totalPages} totalRecords={total}
              startIdx={startIdx} endIdx={endIdx} recordsPerPage={recordsPerPage}
              setRecordsPerPage={setRecordsPerPage} setPage={setPage} loadTime={loadTime}
            />
          </div>

          {/* Mobile card layout */}
          <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {invoices.map(inv => {
                const link = getSourceLink(inv);
                return (
                  <div key={inv.doc_id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-[#F4511E]">{inv.tax_invoice_number}</span>
                        {inv.voided_at && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">VOID</span>
                        )}
                      </div>
                      <button onClick={() => handlePrint(inv)} className="p-1.5 text-gray-400 hover:text-[#F4511E] transition-colors" title="พิมพ์">
                        <Printer className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{formatDate(inv.tax_invoice_date)}</div>
                    <div className="mt-1">
                      <Link href={link.href} className="text-sm text-[#F4511E] hover:underline inline-flex items-center gap-1">
                        {link.label} <ExternalLink className="w-3 h-3" />
                      </Link>
                      {inv.source_type !== 'order' && (
                        <span className="text-xs text-gray-400 ml-1">
                          {inv.source_type === 'statement' ? 'ใบวางบิล' : 'เติมสินค้า'}
                        </span>
                      )}
                    </div>
                    {(inv.tax_invoice_name || inv.customer?.name) && (
                      <div className="text-sm text-gray-600 dark:text-slate-300 mt-1">{inv.tax_invoice_name || inv.customer?.name}</div>
                    )}
                    <div className="text-right text-sm font-medium text-gray-900 dark:text-white mt-2">{formatMoney(inv.total_amount)} บาท</div>
                  </div>
                );
              })}
            </div>
            <Pagination
              currentPage={page} totalPages={totalPages} totalRecords={total}
              startIdx={startIdx} endIdx={endIdx} recordsPerPage={recordsPerPage}
              setRecordsPerPage={setRecordsPerPage} setPage={setPage} loadTime={loadTime}
            />
          </div>
          </>
        )}
      </div>
    </Layout>
  );
}

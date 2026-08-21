'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import PageHeader from '@/components/ui/PageHeader';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { Receipt, Search, Printer, ExternalLink } from 'lucide-react';
import { showPdfPreview } from '@/lib/print-pdf';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';

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

  const columns: DataTableColumn<InvoiceRow>[] = [
    {
      key: 'tax_invoice_number',
      label: 'เลขที่ใบเสร็จ',
      alwaysVisible: true,
      render: (inv) => (
        <>
          <span className="font-mono text-sm font-medium text-primary">{inv.tax_invoice_number}</span>
          {inv.voided_at && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">VOID</span>
          )}
        </>
      ),
    },
    {
      key: 'tax_invoice_date',
      label: 'วันที่ออก',
      render: (inv) => (
        <span className="text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">{formatDate(inv.tax_invoice_date)}</span>
      ),
    },
    {
      key: 'source',
      label: 'อ้างอิง',
      render: (inv) => {
        const link = getSourceLink(inv);
        return (
          <>
            <Link href={link.href} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              {link.label} <ExternalLink className="w-3 h-3" />
            </Link>
            {inv.source_type !== 'order' && (
              <div className="text-xs text-gray-400">
                {inv.source_type === 'statement' ? 'ใบวางบิล' : 'เติมสินค้า'}
              </div>
            )}
          </>
        );
      },
    },
    {
      key: 'name',
      label: 'ชื่อ / ที่อยู่',
      render: (inv) => (
        <>
          <div className="text-sm text-gray-900 dark:text-white">{inv.tax_invoice_name || inv.customer?.name || '-'}</div>
          {inv.tax_invoice_address && (
            <div className="text-xs text-gray-400 truncate max-w-[200px]">{inv.tax_invoice_address}</div>
          )}
        </>
      ),
    },
    {
      key: 'total_amount',
      label: 'ยอด (บาท)',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (inv) => (
        <span className="text-sm font-medium text-gray-900 dark:text-white">{formatMoney(inv.total_amount)}</span>
      ),
    },
    {
      key: 'actions',
      label: 'พิมพ์',
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      stopPropagation: true,
      hideMobile: true,
      render: (inv) => (
        <button onClick={() => handlePrint(inv)} className="p-1.5 text-gray-400 hover:text-primary transition-colors" title="พิมพ์">
          <Printer className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          icon={<Receipt />}
          title="ใบเสร็จรับเงิน"
          subtitle="REC-YYYYMM-NNNN — สำหรับร้านที่ไม่จด VAT"
        />

        <div className="data-filter-card">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={month}
              onChange={e => { setMonth(e.target.value); setPage(1); }}
              className="h-[42px] px-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
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
                className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>
          </div>
        </div>

        <DataTable<InvoiceRow>
          storageKey="receipts-cols"
          columns={columns}
          data={invoices}
          loading={loading}
          getRowId={(inv) => inv.doc_id}
          emptyMessage="ไม่พบใบเสร็จรับเงิน"
          emptyIcon={<Receipt className="w-10 h-10 text-gray-300 dark:text-slate-600" />}
          currentPage={page}
          totalPages={totalPages}
          totalRecords={total}
          recordsPerPage={recordsPerPage}
          onPageChange={setPage}
          onRecordsPerPageChange={setRecordsPerPage}
          loadTime={loadTime}
          mobileCardRender={(inv) => {
            const link = getSourceLink(inv);
            return (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-primary">{inv.tax_invoice_number}</span>
                    {inv.voided_at && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">VOID</span>
                    )}
                  </div>
                  <button onClick={() => handlePrint(inv)} className="p-1.5 text-gray-400 hover:text-primary transition-colors" title="พิมพ์">
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{formatDate(inv.tax_invoice_date)}</div>
                <div className="mt-1">
                  <Link href={link.href} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
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
              </>
            );
          }}
        />
      </div>
    </Layout>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { FileText, Search, Printer, ExternalLink } from 'lucide-react';
import { showPdfPreview } from '@/lib/print-pdf';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';

interface Invoice {
  id: string;
  doc_id: string;
  source_type: 'order' | 'statement' | 'consignment_report' | 'department_order' | 'department_store_report' | 'replenishment';
  source_id: string;
  source_number: string | null;
  order_number: string | null;
  tax_invoice_number: string;
  tax_invoice_date: string;
  tax_invoice_name: string | null;
  tax_invoice_tax_id: string | null;
  tax_invoice_branch: string | null;
  tax_invoice_replaced_abbrev_number: string | null;
  is_receipt: boolean;
  document_subtype: 'tax_only' | 'tax_receipt' | 'tax_invoice' | null;
  total_amount: number;
  vat_amount: number;
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
    const label = d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });
    opts.push({ value: `${y}${m}`, label });
  }
  return opts;
}

function getSourceLink(inv: Invoice): { href: string; label: string; subtitle?: string } {
  switch (inv.source_type) {
    case 'order':
      return { href: `/orders/${inv.source_id}`, label: inv.source_number || '-' };
    case 'statement':
      return { href: `/consignment/reports`, label: inv.source_number || 'ใบวางบิล', subtitle: 'ใบวางบิล' };
    case 'consignment_report':
      return { href: `/consignment/reports/${inv.source_id}`, label: inv.source_number || '-', subtitle: 'ยอดขายตัวแทน' };
    case 'department_order':
      return { href: `/department-orders/${inv.source_id}`, label: inv.source_number || '-', subtitle: 'ออเดอร์ห้าง' };
    case 'department_store_report':
      return { href: `/department-store/reports/${inv.source_id}`, label: inv.source_number || '-', subtitle: 'รายงานห้าง' };
    case 'replenishment':
      return { href: `/replenishments?id=${inv.source_id}`, label: inv.source_number || '-', subtitle: 'เติมสินค้า' };
    default:
      return { href: '#', label: '-' };
  }
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
          tax_invoice_tax_id: inv.tax_invoice_tax_id,
          tax_invoice_branch: inv.tax_invoice_branch,
          tax_invoice_doc_type: 'tax',
          tax_invoice_replaced_abbrev_number: inv.tax_invoice_replaced_abbrev_number,
        });
        showPdfPreview(blob, `ใบกำกับภาษี ${inv.tax_invoice_number}`);
      } else if (inv.source_type === 'statement') {
        // Statement TAX — fetch statement + reports, map to invoice format
        const res = await apiFetch(`/api/statements/${inv.source_id}`);
        if (!res.ok) return;
        const stData = await res.json();
        const st = stData.statement;
        const reports = stData.reports || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = reports.flatMap((r: any) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (r.items || []).map((item: any) => ({
            product_name: item.variation?.products?.name || '-',
            variation_label: item.variation?.variation_label || '',
            product_code: item.variation?.sku || '',
            quantity: item.qty_sold || 0,
            unit_price: item.unit_price || 0,
            subtotal: (item.qty_sold || 0) * (item.unit_price || 0),
            total: item.our_amount || 0,
          }))
        );
        const total = st.total_amount || 0;
        const vatAmount = Math.round((total / 107) * 7 * 100) / 100;
        const { generateFullInvoicePdf } = await import('@/lib/order-invoice-full-pdf');
        const blob = await generateFullInvoicePdf({
          order_number: st.statement_number,
          created_at: st.statement_date || st.created_at,
          payment_status: 'paid',
          subtotal: total - vatAmount,
          discount_amount: 0,
          shipping_fee: 0,
          vat_amount: vatAmount,
          total_amount: total,
          customer: st.customer ? { name: st.customer.name } : null,
          tax_invoice_number: inv.tax_invoice_number,
          tax_invoice_date: inv.tax_invoice_date,
          tax_invoice_name: inv.tax_invoice_name,
          tax_invoice_tax_id: inv.tax_invoice_tax_id,
          tax_invoice_branch: inv.tax_invoice_branch,
          tax_invoice_doc_type: 'tax',
          items,
          voided_at: inv.voided_at,
        });
        showPdfPreview(blob, `ใบกำกับภาษี ${inv.tax_invoice_number}`);
      } else if (inv.source_type === 'consignment_report') {
        // Consignment report TAX — use consignment report PDF
        const res = await apiFetch(`/api/consignment/reports/${inv.source_id}`);
        if (!res.ok) return;
        const data = await res.json();
        const r = data.report;
        const { generateConsignmentReportPdf } = await import('@/lib/consignment-report-pdf');
        const blob = await generateConsignmentReportPdf({
          report_number: r.report_number,
          period_year: r.period_year,
          period_month: r.period_month,
          status: r.status,
          created_at: r.created_at,
          due_date: r.due_date,
          notes: r.notes,
          customer: r.customer ? {
            name: r.customer.name,
            customer_code: r.customer.customer_code,
            phone: r.customer.phone,
            tax_company_name: r.customer.tax_company_name,
            tax_id: r.customer.tax_id,
            tax_branch: r.customer.tax_branch,
            billing_address: [r.customer.billing_address, r.customer.billing_district, r.customer.billing_amphoe, r.customer.billing_province, r.customer.billing_postal_code].filter(Boolean).join(', ') || null,
          } : null,
          items: (r.items || []).map((i: any) => ({
            product_name: i.variation?.products?.name || '',
            variation_label: i.variation?.variation_label || null,
            sku: i.variation?.sku || null,
            qty_sold: i.qty_sold,
            unit_price: i.unit_price,
            gp_rate: i.gp_rate,
            our_amount: i.our_amount,
          })),
          total_qty_sold: r.total_qty_sold,
          total_sales: r.our_amount,
          total_gp_share: 0,
          our_amount: r.our_amount,
          tax_invoice_number: r.tax_invoice_number || null,
          tax_invoice_date: r.tax_invoice_date || null,
          invoice_number: r.invoice_number || null,
          invoice_date: r.invoice_date || null,
          document_subtype: r.document_subtype || null,
          vat_registered: r.vat_registered ?? false,
          voided_at: inv.voided_at,
        });
        showPdfPreview(blob, `ใบกำกับภาษี/ใบแจ้งหนี้ ${inv.tax_invoice_number}`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const totalPages = Math.ceil(total / recordsPerPage);

  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'tax_invoice_number',
      label: 'เลขที่ใบกำกับ',
      alwaysVisible: true,
      render: (inv) => (
        <>
          <span className="font-mono text-sm font-medium text-primary">{inv.tax_invoice_number}</span>
          {inv.tax_invoice_replaced_abbrev_number && (
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              แทน {inv.tax_invoice_replaced_abbrev_number}
            </div>
          )}
          {inv.voided_at && (
            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">VOID</span>
          )}
          {!inv.voided_at && inv.document_subtype === 'tax_invoice' && (
            <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">+ใบแจ้งหนี้</span>
          )}
          {!inv.voided_at && inv.is_receipt && (
            <span className="ml-1 text-xs text-green-600 dark:text-green-400">+ใบเสร็จ</span>
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
            <Link href={link.href} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              {link.label} <ExternalLink className="w-3 h-3" />
            </Link>
            {link.subtitle && (
              <div className="text-xs text-gray-400">{link.subtitle}</div>
            )}
          </>
        );
      },
    },
    {
      key: 'tax_invoice_name',
      label: 'ชื่อผู้ซื้อ',
      render: (inv) => (
        <>
          <div className="text-sm text-gray-900 dark:text-white">{inv.tax_invoice_name || '-'}</div>
          {inv.tax_invoice_branch && (
            <div className="text-xs text-gray-400">{inv.tax_invoice_branch}</div>
          )}
        </>
      ),
    },
    {
      key: 'tax_invoice_tax_id',
      label: 'เลขผู้เสียภาษี',
      render: (inv) => (
        <span className="text-sm font-mono text-gray-600 dark:text-slate-300">{inv.tax_invoice_tax_id || '-'}</span>
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
        <button
          onClick={() => handlePrint(inv)}
          className="p-1.5 text-gray-400 hover:text-primary transition-colors"
          title="พิมพ์"
        >
          <Printer className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <FileText className="w-8 h-8 text-primary" />
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
                placeholder="ค้นหาเลขที่, ชื่อ, เลขภาษี..."
                className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>
          </div>
        </div>

        <DataTable<Invoice>
          storageKey="tax-invoices-cols"
          columns={columns}
          data={invoices}
          loading={loading}
          getRowId={(inv) => inv.doc_id}
          emptyMessage="ไม่พบใบกำกับภาษี"
          emptyIcon={<FileText className="w-10 h-10 text-gray-300 dark:text-slate-600" />}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium text-primary">{inv.tax_invoice_number}</span>
                    {inv.tax_invoice_replaced_abbrev_number && (
                      <span className="text-xs text-amber-600 dark:text-amber-400">แทน {inv.tax_invoice_replaced_abbrev_number}</span>
                    )}
                    {inv.voided_at && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">VOID</span>
                    )}
                    {!inv.voided_at && inv.document_subtype === 'tax_invoice' && (
                      <span className="text-xs text-blue-600 dark:text-blue-400">+ใบแจ้งหนี้</span>
                    )}
                    {!inv.voided_at && inv.is_receipt && (
                      <span className="text-xs text-green-600 dark:text-green-400">+ใบเสร็จ</span>
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
                  {link.subtitle && (
                    <span className="text-xs text-gray-400 ml-1">{link.subtitle}</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-1">
                  <div>
                    <div className="text-sm text-gray-600 dark:text-slate-300">{inv.tax_invoice_name || '-'}</div>
                    {inv.tax_invoice_tax_id && (
                      <div className="text-xs font-mono text-gray-400">{inv.tax_invoice_tax_id}</div>
                    )}
                  </div>
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{formatMoney(inv.total_amount)} บาท</div>
                </div>
              </>
            );
          }}
        />
      </div>
    </Layout>
  );
}

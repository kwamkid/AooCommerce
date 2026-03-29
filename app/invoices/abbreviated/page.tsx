'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { ReceiptText, Search, Printer, ExternalLink, MoreHorizontal, FileUp } from 'lucide-react';
import { showPdfPreview } from '@/lib/print-pdf';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import TaxInvoiceModal from '@/app/orders/components/TaxInvoiceModal';

interface Invoice {
  id: string; // order_id (for backward compat)
  doc_id: string;
  order_number: string | null;
  tax_invoice_number: string;
  tax_invoice_date: string;
  tax_invoice_voided_at: string | null;
  tax_invoice_voided_reason: string | null;
  tax_invoice_replaced_abbrev_number: string | null; // the TAX number that replaced this ABB
  total_amount: number;
  customer_id: string | null;
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

export default function AbbreviatedInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [voidedFilter, setVoidedFilter] = useState<'all' | 'active' | 'voided'>('all');
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [loadTime, setLoadTime] = useState<number | null>(null);

  // Action menu & modal
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [taxModal, setTaxModal] = useState<{ orderId: string; orderNumber: string; customerId?: string } | null>(null);

  const monthOptions = getMonthOptions();

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const t0 = Date.now();
    try {
      const params = new URLSearchParams({ type: 'abbreviated', page: String(page), limit: String(recordsPerPage) });
      if (search) params.set('search', search);
      if (month) params.set('month', month);
      if (voidedFilter === 'active') params.set('voided', 'false');
      if (voidedFilter === 'voided') params.set('voided', 'true');
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
  }, [page, recordsPerPage, search, month, voidedFilter]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  // Close action menu on outside click
  useEffect(() => {
    if (!openMenuId) return;
    const handler = () => setOpenMenuId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [openMenuId]);

  const handlePrint = async (inv: Invoice) => {
    try {
      const res = await apiFetch(`/api/orders/${inv.id}?include_items=true`);
      if (!res.ok) return;
      const orderData = await res.json();
      const order = orderData.order || orderData;
      const { generateAbbreviatedInvoicePdf } = await import('@/lib/order-invoice-abbreviated-pdf');
      const blob = await generateAbbreviatedInvoicePdf([{
        ...order,
        tax_invoice_number: inv.tax_invoice_number,
        tax_invoice_date: inv.tax_invoice_date,
        tax_invoice_voided_at: inv.tax_invoice_voided_at,
      }]);
      showPdfPreview(blob, `ใบกำกับอย่างย่อ ${inv.tax_invoice_number}`);
    } catch (e) {
      console.error(e);
    }
  };

  const handleIssueFullInvoice = (inv: Invoice) => {
    setOpenMenuId(null);
    setTaxModal({
      orderId: inv.id,
      orderNumber: inv.order_number || '',
      customerId: inv.customer_id || inv.customer?.id,
    });
  };

  const handleTaxModalSaved = () => {
    setTaxModal(null);
    fetchInvoices();
  };

  const totalPages = Math.ceil(total / recordsPerPage);

  const statusTabs = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'active', label: 'ปกติ' },
    { key: 'voided', label: 'ยกเลิก' },
  ] as const;

  const columns: DataTableColumn<Invoice>[] = [
    {
      key: 'tax_invoice_number',
      label: 'เลขที่ใบกำกับ',
      alwaysVisible: true,
      render: (inv) => {
        const isVoided = !!inv.tax_invoice_voided_at;
        return (
          <span className={`font-mono text-sm font-medium ${isVoided ? 'text-gray-400 line-through' : 'text-primary'}`}>
            {inv.tax_invoice_number}
          </span>
        );
      },
    },
    {
      key: 'tax_invoice_date',
      label: 'วันที่ออก',
      render: (inv) => (
        <span className="text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">{formatDate(inv.tax_invoice_date)}</span>
      ),
    },
    {
      key: 'order_number',
      label: 'คำสั่งซื้อ',
      render: (inv) => (
        <Link href={`/orders/${inv.id}`} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
          {inv.order_number || '-'} <ExternalLink className="w-3 h-3" />
        </Link>
      ),
    },
    {
      key: 'status',
      label: 'สถานะ',
      render: (inv) => {
        const isVoided = !!inv.tax_invoice_voided_at;
        return isVoided ? (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
            ยกเลิก
          </span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            ปกติ
          </span>
        );
      },
    },
    {
      key: 'replaced',
      label: 'ออกใบแทน',
      render: (inv) => (
        <span className="text-sm font-mono text-amber-600 dark:text-amber-400">
          {inv.tax_invoice_replaced_abbrev_number || '-'}
        </span>
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
      label: 'จัดการ',
      headerClassName: 'text-center w-[100px]',
      cellClassName: 'text-center',
      stopPropagation: true,
      hideMobile: true,
      render: (inv) => {
        const isVoided = !!inv.tax_invoice_voided_at;
        const canIssueFullInvoice = !isVoided;
        return (
          <div className="flex items-center justify-center gap-1">
            <button onClick={() => handlePrint(inv)} className="p-1.5 text-gray-400 hover:text-primary transition-colors" title="พิมพ์">
              <Printer className="w-4 h-4" />
            </button>
            {canIssueFullInvoice && (
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === inv.doc_id ? null : inv.doc_id); }}
                  className="p-1.5 text-gray-400 hover:text-primary transition-colors"
                  title="เพิ่มเติม"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {openMenuId === inv.doc_id && (
                  <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600 py-1 min-w-[220px]">
                    <button
                      onClick={() => handleIssueFullInvoice(inv)}
                      className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <FileUp className="w-4 h-4 text-green-600" />
                      ออกใบกำกับภาษีแบบเต็ม
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <ReceiptText className="w-8 h-8 text-primary" />
              ใบกำกับอย่างย่อ
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">ABB-YYYYMM-NNNN — ออกอัตโนมัติสำหรับออเดอร์ปลีก</p>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex border-b border-gray-200 dark:border-slate-700">
          {statusTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setVoidedFilter(tab.key); setPage(1); }}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                voidedFilter === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

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
                placeholder="ค้นหาเลขที่, คำสั่งซื้อ..."
                className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>
          </div>
        </div>

        <DataTable<Invoice>
          storageKey="abbreviated-invoices-cols"
          columns={columns}
          data={invoices}
          loading={loading}
          getRowId={(inv) => inv.doc_id}
          rowClassName={(inv) => inv.tax_invoice_voided_at ? 'opacity-60' : ''}
          emptyMessage="ไม่พบใบกำกับอย่างย่อ"
          emptyIcon={<ReceiptText className="w-10 h-10 text-gray-300 dark:text-slate-600" />}
          currentPage={page}
          totalPages={totalPages}
          totalRecords={total}
          recordsPerPage={recordsPerPage}
          onPageChange={setPage}
          onRecordsPerPageChange={setRecordsPerPage}
          loadTime={loadTime}
          mobileCardRender={(inv) => {
            const isVoided = !!inv.tax_invoice_voided_at;
            const canIssueFullInvoice = !isVoided;
            return (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-sm font-medium ${isVoided ? 'text-gray-400 line-through' : 'text-primary'}`}>
                      {inv.tax_invoice_number}
                    </span>
                    {isVoided ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">ยกเลิก</span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">ปกติ</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handlePrint(inv)} className="p-1.5 text-gray-400 hover:text-primary transition-colors" title="พิมพ์">
                      <Printer className="w-4 h-4" />
                    </button>
                    {canIssueFullInvoice && (
                      <div className="relative">
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === inv.doc_id ? null : inv.doc_id); }}
                          className="p-1.5 text-gray-400 hover:text-primary transition-colors"
                          title="เพิ่มเติม"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                        {openMenuId === inv.doc_id && (
                          <div className="absolute right-0 top-full mt-1 z-[999] bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600 py-1 min-w-[220px]">
                            <button
                              onClick={() => handleIssueFullInvoice(inv)}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                            >
                              <FileUp className="w-4 h-4 text-green-600" />
                              ออกใบกำกับภาษีแบบเต็ม
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{formatDate(inv.tax_invoice_date)}</div>
                <div className="mt-1">
                  <Link href={`/orders/${inv.id}`} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                    {inv.order_number || '-'} <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                {inv.tax_invoice_replaced_abbrev_number && (
                  <div className="text-xs font-mono text-amber-600 dark:text-amber-400 mt-1">ออกใบแทน: {inv.tax_invoice_replaced_abbrev_number}</div>
                )}
                <div className="text-right text-sm font-medium text-gray-900 dark:text-white mt-2">{formatMoney(inv.total_amount)} บาท</div>
              </>
            );
          }}
        />
      </div>

      {/* TaxInvoiceModal for issuing full tax invoice */}
      {taxModal && (
        <TaxInvoiceModal
          orderId={taxModal.orderId}
          orderNumber={taxModal.orderNumber}
          customerId={taxModal.customerId}
          hasAbbrev={true}
          onClose={() => setTaxModal(null)}
          onSaved={handleTaxModalSaved}
        />
      )}
    </Layout>
  );
}

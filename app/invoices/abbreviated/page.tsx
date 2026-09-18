'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import StatusBadge from '@/components/ui/StatusBadge';
import { statusLabel } from '@/lib/status-labels';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { LoadingCard } from '@/components/ui/StateCard';
import PageHeader from '@/components/ui/PageHeader';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { MoreHorizontal, FileUp } from 'lucide-react';
import { ExternalLinkIcon, PrintIcon, ReceiptTextIcon } from '@/lib/icons';
import FormSelect from '@/components/ui/FormSelect';
import SearchInput from '@/components/ui/SearchInput';
import { getMonthOptions } from '@/lib/month-options';
import { showPdfPreview } from '@/lib/print-pdf';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import ActionMenu from '@/components/ui/ActionMenu';
import TaxInvoiceModal from '@/app/orders/components/TaxInvoiceModal';
import { formatThaiDate as formatDate, formatPrice as formatMoney } from '@/lib/utils/format';
import Tabs from '@/components/ui/Tabs';

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

export default function AbbreviatedInvoicesPage() {
  // ด่านสิทธิ์ระดับหน้า — เมนูใน Sidebar ซ่อนให้แล้ว แต่ URL ตรงยังเข้าได้
  const { allowed, loading: permLoading } = useAuthGuard('finance.view');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [voidedFilter, setVoidedFilter] = useState<'all' | 'active' | 'voided'>('all');
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [loadTime, setLoadTime] = useState<number | null>(null);

  // Modal
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
    { key: 'active', label: statusLabel('taxDoc', 'active') },
    { key: 'voided', label: statusLabel('taxDoc', 'voided') },
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
          {inv.order_number || '-'} <ExternalLinkIcon className="w-3 h-3" />
        </Link>
      ),
    },
    {
      key: 'status',
      label: 'สถานะ',
      render: (inv) => {
        const isVoided = !!inv.tax_invoice_voided_at;
        return <StatusBadge domain="taxDoc" status={isVoided ? 'voided' : 'active'} />;
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
              <PrintIcon className="w-4 h-4" />
            </button>
            {canIssueFullInvoice && (
              <ActionMenu
                trigger={<MoreHorizontal className="w-4 h-4" />}
                triggerClassName="p-1.5 text-gray-400 hover:text-primary transition-colors"
                items={[
                  {
                    key: 'issue_full_invoice',
                    label: 'ออกใบกำกับภาษีแบบเต็ม',
                    icon: <FileUp className="w-4 h-4" />,
                    primary: true,
                    onClick: () => handleIssueFullInvoice(inv),
                  },
                ]}
              />
            )}
          </div>
        );
      },
    },
  ];

  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไป /dashboard

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          icon={<ReceiptTextIcon />}
          title="ใบกำกับอย่างย่อ"
          subtitle="ABB-YYYYMM-NNNN — ออกอัตโนมัติสำหรับออเดอร์ปลีก"
        />

        <Tabs
          className="mb-0"
          activeKey={voidedFilter}
          onSelect={k => { setVoidedFilter(k as typeof voidedFilter); setPage(1); }}
          tabs={statusTabs.map(tab => ({ key: tab.key, label: tab.label }))}
        />

        <div className="data-filter-card">
          <div className="flex items-center gap-2 flex-wrap">
            <FormSelect
              value={month}
              onChange={v => { setMonth(v); setPage(1); }}
              options={monthOptions}
            />
            <div className="flex-1 min-w-[200px]">
              <SearchInput
                value={search}
                onChange={v => { setSearch(v); setPage(1); }}
                placeholder="ค้นหาเลขที่, คำสั่งซื้อ..."
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
          emptyIcon={<ReceiptTextIcon className="w-10 h-10 text-gray-300 dark:text-slate-600" />}
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
                    <StatusBadge domain="taxDoc" status={isVoided ? 'voided' : 'active'} />
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handlePrint(inv)} className="p-1.5 text-gray-400 hover:text-primary transition-colors" title="พิมพ์">
                      <PrintIcon className="w-4 h-4" />
                    </button>
                    {canIssueFullInvoice && (
                      <ActionMenu
                        trigger={<MoreHorizontal className="w-4 h-4" />}
                        triggerClassName="p-1.5 text-gray-400 hover:text-primary transition-colors"
                        items={[
                          {
                            key: 'issue_full_invoice',
                            label: 'ออกใบกำกับภาษีแบบเต็ม',
                            icon: <FileUp className="w-4 h-4" />,
                            primary: true,
                            onClick: () => handleIssueFullInvoice(inv),
                          },
                        ]}
                      />
                    )}
                  </div>
                </div>
                <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{formatDate(inv.tax_invoice_date)}</div>
                <div className="mt-1">
                  <Link href={`/orders/${inv.id}`} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                    {inv.order_number || '-'} <ExternalLinkIcon className="w-3 h-3" />
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

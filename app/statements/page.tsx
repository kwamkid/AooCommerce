'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import StatusTabs from '@/components/ui/StatusTabs';
import {
  FileText, Loader2, RefreshCw, CheckCircle2,
  AlertCircle, Clock, Package, Eye, Receipt,
  Printer, Banknote, Undo2,
} from 'lucide-react';
import { showPdfPreview } from '@/lib/print-pdf';
import { markPrinted as markPrintedDB } from '@/lib/print-tracking';
import Tooltip from '@/components/ui/Tooltip';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';

interface Statement {
  id: string;
  statement_number: string;
  status: string;
  statement_date: string;
  due_date: string | null;
  period_year: number;
  period_month: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  tax_invoice_number: string | null;
  receipt_number: string | null;
  printed_statement_at?: string | null;
  customer: { id: string; name: string; customer_code: string | null } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:          { label: 'แบบร่าง',      color: 'text-gray-600 dark:text-gray-300',    bg: 'bg-gray-100 dark:bg-gray-700/40' },
  sent:           { label: 'รอชำระ',       color: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900/40' },
  partially_paid: { label: 'ชำระบางส่วน',  color: 'text-amber-700 dark:text-amber-300',   bg: 'bg-amber-100 dark:bg-amber-900/40' },
  paid:           { label: 'ชำระแล้ว',     color: 'text-green-700 dark:text-green-300',   bg: 'bg-green-100 dark:bg-green-900/40' },
  overdue:        { label: 'เกินกำหนด',    color: 'text-red-700 dark:text-red-300',       bg: 'bg-red-100 dark:bg-red-900/40' },
};

const STATUS_TABS = [
  { key: 'all',            label: 'ทั้งหมด' },
  { key: 'sent',           label: 'รอชำระ' },
  { key: 'partially_paid', label: 'ชำระบางส่วน' },
  { key: 'paid',           label: 'ชำระแล้ว' },
  { key: 'overdue',        label: 'เกินกำหนด' },
];

const THAI_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const formatPeriod = (year: number, month: number) =>
  `${THAI_MONTHS[month]} ${year + 543}`;

const formatAmount = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatDate = (d: string | null | undefined) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
};

function StatementsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const activeStatus = searchParams.get('status') || 'all';
  const search = searchParams.get('q') || '';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const recordsPerPage = parseInt(searchParams.get('limit') || '20', 10);

  const setParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    let pageReset = false;
    for (const [k, v] of Object.entries(updates)) {
      if (k !== 'page') pageReset = true;
      if (!v || v === 'all' || v === '' || v === '1' || v === '20') {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    }
    if (pageReset) params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/statements', { scroll: false });
  }, [searchParams, router]);

  const [statements, setStatements] = useState<Statement[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const fetchData = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true); else setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(recordsPerPage),
      });
      if (activeStatus !== 'all') params.set('status', activeStatus);
      if (search.trim()) params.set('search', search.trim());

      const res = await apiFetch(`/api/statements?${params}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setStatements(data.statements || []);
      setStatusCounts(data.status_counts || {});
      setTotalPages(Math.ceil((data.total || 0) / recordsPerPage));
      setTotalRecords(data.total || 0);
    } catch {
      showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeStatus, search, currentPage, recordsPerPage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Debounced search
  const [searchInput, setSearchInput] = useState(search);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setParams({ q: val });
    }, 400);
  };
  useEffect(() => { setSearchInput(search); }, [search]);

  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const getTabCount = (key: string) => key === 'all' ? totalCount : (statusCounts[key] || 0);

  // Print state (DB-backed via printed_*_at columns)
  const [printingId, setPrintingId] = useState<string | null>(null);

  const isPrintedDoc = (st: Statement, docType: string) => {
    const col = `printed_${docType}_at` as keyof Statement;
    return !!st[col];
  };
  const markPrinted = (id: string, type: string) => {
    markPrintedDB('statement', [id], type);
    const col = `printed_${type}_at` as keyof Statement;
    setStatements(prev => prev.map(s =>
      s.id === id ? { ...s, [col]: new Date().toISOString() } : s
    ));
  };

  const handlePrintStatement = async (st: Statement) => {
    setPrintingId(st.id);
    try {
      const res = await apiFetch(`/api/statements/${st.id}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const detail = data.statement;
      const stReports = data.reports || [];
      const { generateStatementPdf } = await import('@/lib/statement-pdf');
      const blob = await generateStatementPdf({
        statement_number: detail.statement_number,
        statement_date: detail.statement_date,
        due_date: detail.due_date,
        period_year: detail.period_year,
        period_month: detail.period_month,
        status: detail.status,
        total_amount: detail.total_amount,
        paid_amount: detail.paid_amount,
        outstanding_amount: detail.outstanding_amount,
        tax_invoice_number: detail.tax_invoice_number,
        invoice_number: detail.invoice_number || null,
        receipt_number: detail.receipt_number,
        notes: detail.notes,
        customer: detail.customer ? {
          ...detail.customer,
          billing_address: [detail.customer.billing_address, detail.customer.billing_district, detail.customer.billing_amphoe, detail.customer.billing_province, detail.customer.billing_postal_code].filter(Boolean).join(', ') || null,
        } : null,
        reports: stReports.map((r: any) => ({
          report_number: r.report_number,
          doc_number: r.doc_number || null,
          period_label: `${THAI_MONTHS[r.period_month]} ${r.period_year + 543}`,
          total_qty_sold: r.total_qty_sold,
          our_amount: r.our_amount,
        })),
      });
      showPdfPreview(blob, `ใบวางบิล ${detail.statement_number}`);
      markPrinted(st.id, 'statement');
    } catch {
      showToast('ไม่สามารถสร้าง PDF ได้', 'error');
    } finally {
      setPrintingId(null);
    }
  };

  // Payment confirm state
  const [paymentConfirm, setPaymentConfirm] = useState<Statement | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const handleRecordPayment = async (st: Statement) => {
    setPaymentLoading(true);
    try {
      const payRes = await apiFetch(`/api/statements/${st.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_payment', amount: st.outstanding_amount }),
      });
      if (!payRes.ok) throw new Error('payment failed');
      const payData = await payRes.json();

      const docNums = [payData.tax_invoice_number, payData.receipt_number].filter(Boolean).join(', ');
      showToast(`บันทึกการชำระแล้ว${docNums ? ` ออกเลข ${docNums}` : ''}`, 'success');
      setPaymentConfirm(null);
      fetchData(true);

      // Auto print statement
      setTimeout(() => handlePrintStatement(st), 300);
    } catch {
      showToast('เกิดข้อผิดพลาดในการบันทึกการชำระ', 'error');
    } finally {
      setPaymentLoading(false);
    }
  };

  // Reverse payment state
  const [reverseConfirm, setReverseConfirm] = useState<Statement | null>(null);
  const [reverseLoading, setReverseLoading] = useState(false);

  const handleReversePayment = async (st: Statement) => {
    setReverseLoading(true);
    try {
      const res = await apiFetch(`/api/statements/${st.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reverse_payment' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'reverse failed');
      }
      showToast('ยกเลิกการชำระแล้ว เอกสารถูก void เรียบร้อย', 'success');
      setReverseConfirm(null);
      fetchData(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setReverseLoading(false);
    }
  };

  const buildMenuItems = (st: Statement): ActionItem[] => {
    const isPrinting = printingId === st.id;
    const dot = (key: string) => isPrintedDoc(st, key)
      ? <span className="ml-auto w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
      : null;

    const items: ActionItem[] = [
      {
        key: 'view',
        label: 'ดูรายละเอียด',
        icon: <Eye className="w-4 h-4" />,
        onClick: () => router.push(`/statements/${st.id}`),
      },
      {
        key: 'print_statement',
        label: 'ใบวางบิล',
        icon: isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />,
        suffix: dot('statement'),
        onClick: () => handlePrintStatement(st),
        disabled: isPrinting,
        dividerBefore: true,
      },
    ];

    // Payment action removed — already shown as focus button (btn-focus-action indigo)

    // Reverse payment action (undo)
    if (st.status === 'paid') {
      items.push({
        key: 'reverse_payment',
        label: 'ยกเลิกการชำระ',
        icon: <Undo2 className="w-4 h-4" />,
        onClick: () => setReverseConfirm(st),
        dividerBefore: true,
        danger: true,
      });
    }

    return items;
  };

  const statementColumns: DataTableColumn<Statement>[] = [
    {
      key: 'statement_number',
      label: 'เลขที่',
      alwaysVisible: true,
      render: (st) => (
        <>
          <p className="id-text-clickable text-gray-900 dark:text-white">{st.statement_number}</p>
          <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(st.statement_date)}</p>
        </>
      ),
    },
    {
      key: 'customer',
      label: 'ตัวแทน',
      alwaysVisible: true,
      render: (st) => (
        <>
          <p className="data-text text-gray-900 dark:text-white font-medium">{st.customer?.name || '-'}</p>
          {st.customer?.customer_code && (
            <p className="data-timestamp text-gray-400 dark:text-slate-500">{st.customer.customer_code}</p>
          )}
        </>
      ),
    },
    {
      key: 'period',
      label: 'งวด',
      render: (st) => (
        <span className="data-text text-gray-700 dark:text-slate-300">{formatPeriod(st.period_year, st.period_month)}</span>
      ),
    },
    {
      key: 'total_amount',
      label: 'ยอด (บาท)',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (st) => (
        <span className="data-number text-gray-900 dark:text-white">{formatAmount(st.total_amount)}</span>
      ),
    },
    {
      key: 'outstanding',
      label: 'คงเหลือ',
      headerClassName: 'text-right',
      cellClassName: 'text-right',
      render: (st) => (
        <span className={`data-number font-medium ${st.outstanding_amount > 0 ? 'text-gray-900 dark:text-white' : 'text-green-600 dark:text-green-400'}`}>
          {st.outstanding_amount > 0 ? formatAmount(st.outstanding_amount) : 'ครบ'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'สถานะ',
      render: (st) => {
        const cfg = STATUS_CONFIG[st.status] || STATUS_CONFIG.draft;
        return (
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
            {st.status === 'paid' && <CheckCircle2 className="w-3 h-3" />}
            {cfg.label}
          </span>
        );
      },
    },
    {
      key: 'print',
      label: 'พิมพ์',
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      stopPropagation: true,
      render: (st) => {
        const isPrinting = printingId === st.id;
        return (
          <Tooltip text={`ใบวางบิล: ${isPrintedDoc(st, 'statement') ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}`}>
            <div className="relative flex items-center justify-center gap-1">
              {isPrinting && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin absolute" />}
              <span className={`w-2.5 h-2.5 rounded-full transition-opacity ${isPrinting ? 'opacity-30' : ''} ${isPrintedDoc(st, 'statement') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
            </div>
          </Tooltip>
        );
      },
    },
    {
      key: 'due_date',
      label: 'ครบกำหนด',
      render: (st) => {
        const isOverdue = st.due_date && new Date(st.due_date) < new Date() && st.status !== 'paid';
        return st.due_date ? (
          <span className={`data-text flex items-center gap-1 ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-slate-300'}`}>
            {isOverdue && <AlertCircle className="w-3.5 h-3.5" />}
            {formatDate(st.due_date)}
          </span>
        ) : <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
      },
    },
    {
      key: 'documents',
      label: 'เอกสาร',
      render: (st) => (
        <div className="text-xs">
          {st.tax_invoice_number && (
            <div className="text-green-600 dark:text-green-400 font-mono">{st.tax_invoice_number}</div>
          )}
          {st.receipt_number && (
            <div className="text-blue-600 dark:text-blue-400 font-mono">{st.receipt_number}</div>
          )}
          {!st.tax_invoice_number && !st.receipt_number && <span className="text-gray-400">-</span>}
        </div>
      ),
    },
    {
      key: 'actions',
      label: 'จัดการ',
      headerClassName: 'text-right',
      alwaysVisible: true,
      stopPropagation: true,
      render: (st) => (
        <div className="flex items-center justify-end gap-1">
          {['sent', 'partially_paid', 'overdue'].includes(st.status) && (
            <button
              onClick={() => setPaymentConfirm(st)}
              className="btn-focus-action indigo"
            >
              <Banknote className="w-4 h-4" />
              <span className="hidden lg:inline">ลูกค้าชำระแล้ว</span>
            </button>
          )}
          {st.status === 'paid' && (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          )}
          <ActionMenu items={buildMenuItems(st)} />
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <PageHeader
          icon={<FileText />}
          title="ใบวางบิล"
          actions={
            <button
              onClick={() => fetchData(true)}
              disabled={isRefreshing}
              className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-white transition-colors disabled:opacity-50"
              title="รีเฟรช"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          }
        />

        {/* Status Tabs */}
        <StatusTabs
          activeKey={activeStatus}
          onSelect={(k) => setParams({ status: k })}
          tabs={STATUS_TABS.map(t => ({ ...t, count: getTabCount(t.key) }))}
        />

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchInput value={searchInput} onChange={handleSearchChange} placeholder="ค้นหาเลขที่ใบวางบิล, ชื่อตัวแทน..." />
          </div>
        </div>

        {/* Data Table */}
        <DataTable<Statement>
          storageKey="statements-columns"
          columns={statementColumns}
          data={statements}
          loading={isLoading}
          getRowId={(st) => st.id}
          onRowClick={(st) => router.push(`/statements/${st.id}`)}
          emptyMessage="ไม่พบใบวางบิล"
          emptyIcon={<Package className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={totalRecords}
          recordsPerPage={recordsPerPage}
          onPageChange={v => setParams({ page: String(v) })}
          onRecordsPerPageChange={v => setParams({ limit: String(v) })}
          mobileCardRender={(st) => {
            const cfg = STATUS_CONFIG[st.status] || STATUS_CONFIG.draft;
            return (
              <>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="id-text-clickable text-gray-900 dark:text-white">{st.statement_number}</p>
                    <p className="data-timestamp text-gray-400 dark:text-slate-500">{formatDate(st.statement_date)}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="data-text text-gray-700 dark:text-slate-300 font-medium">{st.customer?.name || '-'}</span>
                  <span className="data-number text-gray-900 dark:text-white">{formatAmount(st.total_amount)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatPeriod(st.period_year, st.period_month)}</span>
                  {st.outstanding_amount > 0 && <span>คงเหลือ {formatAmount(st.outstanding_amount)}</span>}
                </div>
                {/* Action buttons */}
                <div className="mt-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  {['sent', 'partially_paid', 'overdue'].includes(st.status) && (
                    <button
                      onClick={() => setPaymentConfirm(st)}
                      className="btn-focus-action indigo flex-1 justify-center"
                    >
                      <Banknote className="w-4 h-4" /> ลูกค้าชำระแล้ว
                    </button>
                  )}
                  {st.status === 'paid' && (
                    <span className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-green-600">
                      <CheckCircle2 className="w-4 h-4" /> ชำระแล้ว
                    </span>
                  )}
                  {/* Print indicator (mobile) */}
                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${isPrintedDoc(st, 'statement') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                  </div>
                  <ActionMenu items={buildMenuItems(st)} />
                </div>
              </>
            );
          }}
        />
      </div>

      {/* Payment Confirm Dialog */}
      <ConfirmDialog
        open={!!paymentConfirm}
        onClose={() => !paymentLoading && setPaymentConfirm(null)}
        onConfirm={() => paymentConfirm && handleRecordPayment(paymentConfirm)}
        icon={<Banknote className="w-6 h-6 text-primary" />}
        title="ลูกค้าชำระแล้ว"
        description={paymentConfirm ? `ยืนยันการชำระเงินของ ${paymentConfirm.customer?.name || '-'}\nรายงาน ${paymentConfirm.statement_number}\nงวด ${formatPeriod(paymentConfirm.period_year, paymentConfirm.period_month)}\nจำนวน ฿${formatAmount(paymentConfirm.outstanding_amount)}\n\nระบบจะออกใบกำกับภาษี/ใบเสร็จรับเงินอัตโนมัติ` : ''}
        confirmLabel={paymentLoading ? 'กำลังบันทึก...' : 'ยืนยันการชำระ'}
        confirmIcon={paymentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        loading={paymentLoading}
      />

      {/* Reverse Payment Confirm Dialog */}
      <ConfirmDialog
        open={!!reverseConfirm}
        onClose={() => !reverseLoading && setReverseConfirm(null)}
        onConfirm={() => reverseConfirm && handleReversePayment(reverseConfirm)}
        icon={<Undo2 className="w-6 h-6 text-red-500" />}
        title="ยกเลิกการชำระ"
        description={reverseConfirm ? `ยกเลิกการชำระเงินของ ${reverseConfirm.customer?.name || '-'}\nรายงาน ${reverseConfirm.statement_number}\nงวด ${formatPeriod(reverseConfirm.period_year, reverseConfirm.period_month)}\nจำนวน ฿${formatAmount(reverseConfirm.paid_amount)}\n\nใบกำกับภาษี/ใบเสร็จที่ออกไปจะถูกยกเลิก (void)` : ''}
        confirmLabel={reverseLoading ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิก'}
        confirmIcon={reverseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
        variant="danger"
        loading={reverseLoading}
      />
    </Layout>
  );
}

export default function StatementsPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      </Layout>
    }>
      <StatementsContent />
    </Suspense>
  );
}

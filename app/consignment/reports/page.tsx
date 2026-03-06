'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  ClipboardList, Loader2, RefreshCw, CheckCircle2,
  AlertCircle, Clock, BadgeCheck, Copy, Receipt,
  Plus, Package, XCircle, Eye, FileText, Printer,
  Banknote,
} from 'lucide-react';
import { showPdfPreview, mergePdfBlobs } from '@/lib/print-pdf';
import Pagination from '@/app/components/Pagination';
import Tooltip from '@/components/ui/Tooltip';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Link from 'next/link';
import ActionMenu, { type ActionItem } from '@/app/orders/components/ActionMenu';

interface ConsignmentReport {
  id: string;
  report_number: string;
  period_year: number;
  period_month: number;
  status: string;
  total_qty_sold: number;
  our_amount: number;
  due_date: string | null;
  report_token: string | null;
  statement_id: string | null;
  created_at: string;
  customer: { id: string; name: string; customer_code: string | null } | null;
}


const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'รอรายงาน',   color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' },
  received: { label: 'รับแล้ว',    color: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900/40' },
  invoiced: { label: 'ออก invoice', color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-900/40' },
  billed:   { label: 'วางบิลแล้ว', color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  paid:     { label: 'ชำระแล้ว',   color: 'text-green-700 dark:text-green-300',   bg: 'bg-green-100 dark:bg-green-900/40' },
  overdue:  { label: 'เกินกำหนด',  color: 'text-red-700 dark:text-red-300',       bg: 'bg-red-100 dark:bg-red-900/40' },
};

const STATUS_TABS = [
  { key: 'all',      label: 'ทั้งหมด',       active: 'bg-[#F4511E]',     inactive: 'bg-orange-50 dark:bg-orange-950/30',   labelColor: 'text-[#F4511E] dark:text-orange-400',    countColor: 'text-[#F4511E] dark:text-orange-300' },
  { key: 'received', label: 'รอยืนยัน',     active: 'bg-blue-600',      inactive: 'bg-blue-50 dark:bg-blue-950/50',       labelColor: 'text-blue-600 dark:text-blue-400',       countColor: 'text-blue-700 dark:text-blue-300',
    tooltip: 'ตัวแทนรายงานยอดขายแล้ว รอ Admin ตรวจสอบและยืนยัน', hideIfZero: true },
  { key: 'billed',   label: 'วางบิลแล้ว',   active: 'bg-indigo-600',    inactive: 'bg-indigo-50 dark:bg-indigo-950/50',   labelColor: 'text-indigo-600 dark:text-indigo-400',   countColor: 'text-indigo-700 dark:text-indigo-300' },
  { key: 'paid',     label: 'ชำระแล้ว',      active: 'bg-emerald-600',   inactive: 'bg-emerald-50 dark:bg-emerald-950/50', labelColor: 'text-emerald-600 dark:text-emerald-400', countColor: 'text-emerald-700 dark:text-emerald-300' },
  { key: 'overdue',  label: 'เกินกำหนด',    active: 'bg-red-500',       inactive: 'bg-red-50 dark:bg-red-950/50',         labelColor: 'text-red-500 dark:text-red-400',         countColor: 'text-red-600 dark:text-red-300' },
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

function ConsignmentReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  // Derive filter state from URL params
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
    router.replace(qs ? `?${qs}` : '/consignment/reports', { scroll: false });
  }, [searchParams, router]);

  const [reports, setReports] = useState<ConsignmentReport[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);


  const fetchReports = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true); else setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(recordsPerPage),
      });
      if (activeStatus !== 'all') params.set('status', activeStatus);
      if (search.trim()) params.set('search', search.trim());

      const res = await apiFetch(`/api/consignment/reports?${params}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setReports(data.reports || []);
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

  useEffect(() => { fetchReports(); }, [fetchReports]);

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

  const startIdx = (currentPage - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + reports.length, totalRecords);

  const copyPortalReportLink = (report: ConsignmentReport) => {
    if (!report.report_token) return;
    const url = `${window.location.origin}/portal/consignment/${report.customer?.id}?report=${report.report_token}`;
    navigator.clipboard.writeText(url).then(() => showToast('คัดลอกลิงก์แล้ว', 'success'));
  };

  // Print state
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printingType, setPrintingType] = useState<string | null>(null);
  const [printedDocs, setPrintedDocs] = useState<Record<string, Set<string>>>({});

  // Load printed docs from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('csr-printed-docs');
      if (stored) {
        const parsed = JSON.parse(stored);
        const map: Record<string, Set<string>> = {};
        for (const [k, v] of Object.entries(parsed)) map[k] = new Set(v as string[]);
        setPrintedDocs(map);
      }
    } catch { /* ignore */ }
  }, []);

  const markPrinted = (id: string, type: string) => {
    setPrintedDocs(prev => {
      const next = { ...prev };
      next[id] = new Set(prev[id] || []);
      next[id].add(type);
      // Persist
      const serializable: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(next)) serializable[k] = Array.from(v);
      localStorage.setItem('csr-printed-docs', JSON.stringify(serializable));
      return next;
    });
  };

  // Generate invoice blob (reusable for single print + merge)
  const generateInvoiceBlob = async (reportId: string): Promise<Blob> => {
    const res = await apiFetch(`/api/consignment/reports/${reportId}`);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    const r = data.report;
    const { generateConsignmentReportPdf } = await import('@/lib/consignment-report-pdf');
    return generateConsignmentReportPdf({
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
    });
  };

  // Generate statement blob (reusable for single print + merge)
  const generateStatementBlob = async (statementId: string): Promise<Blob> => {
    const res = await apiFetch(`/api/statements/${statementId}`);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    const st = data.statement;
    const stReports = data.reports || [];
    const THAI_MONTHS_FULL = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
      'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const { generateStatementPdf } = await import('@/lib/statement-pdf');
    return generateStatementPdf({
      statement_number: st.statement_number,
      statement_date: st.statement_date,
      due_date: st.due_date,
      period_year: st.period_year,
      period_month: st.period_month,
      status: st.status,
      total_amount: st.total_amount,
      paid_amount: st.paid_amount,
      outstanding_amount: st.outstanding_amount,
      tax_invoice_number: st.tax_invoice_number,
      receipt_number: st.receipt_number,
      notes: st.notes,
      customer: st.customer ? {
        ...st.customer,
        billing_address: [st.customer.billing_address, st.customer.billing_district, st.customer.billing_amphoe, st.customer.billing_province, st.customer.billing_postal_code].filter(Boolean).join(', ') || null,
      } : null,
      reports: stReports.map((r: any) => ({
        report_number: r.report_number,
        period_label: `${THAI_MONTHS_FULL[r.period_month]} ${r.period_year + 543}`,
        total_qty_sold: r.total_qty_sold,
        our_amount: r.our_amount,
      })),
    });
  };

  const handlePrintInvoice = async (reportId: string) => {
    setPrintingId(reportId);
    setPrintingType('invoice');
    try {
      const blob = await generateInvoiceBlob(reportId);
      showPdfPreview(blob, 'ใบแจ้งหนี้');
      markPrinted(reportId, 'invoice');
    } catch {
      showToast('ไม่สามารถสร้าง PDF ได้', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  const handlePrintStatement = async (reportId: string, statementId: string) => {
    setPrintingId(reportId);
    setPrintingType('statement');
    try {
      const blob = await generateStatementBlob(statementId);
      showPdfPreview(blob, 'ใบวางบิล');
      markPrinted(reportId, 'statement');
    } catch {
      showToast('ไม่สามารถสร้าง PDF ได้', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  const handlePrintAll = async (report: ConsignmentReport) => {
    if (!report.statement_id) return;
    setPrintingId(report.id);
    setPrintingType('all');
    try {
      const [invoiceBlob, statementBlob] = await Promise.all([
        generateInvoiceBlob(report.id),
        generateStatementBlob(report.statement_id),
      ]);
      const merged = await mergePdfBlobs([invoiceBlob, statementBlob]);
      showPdfPreview(merged, `เอกสารทั้งหมด ${report.report_number}`);
      markPrinted(report.id, 'invoice');
      markPrinted(report.id, 'statement');
    } catch {
      showToast('ไม่สามารถสร้าง PDF ได้', 'error');
    } finally {
      setPrintingId(null);
      setPrintingType(null);
    }
  };

  // Payment confirm state
  const [paymentConfirm, setPaymentConfirm] = useState<ConsignmentReport | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const handleRecordPayment = async (report: ConsignmentReport) => {
    if (!report.statement_id) return;
    setPaymentLoading(true);
    try {
      // Fetch statement to get outstanding_amount
      const stRes = await apiFetch(`/api/statements/${report.statement_id}`);
      if (!stRes.ok) throw new Error('fetch statement failed');
      const stData = await stRes.json();
      const outstanding = stData.statement.outstanding_amount;

      if (outstanding <= 0) {
        showToast('ใบวางบิลนี้ชำระครบแล้ว', 'error');
        setPaymentConfirm(null);
        return;
      }

      // Record payment
      const payRes = await apiFetch(`/api/statements/${report.statement_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_payment', amount: outstanding }),
      });
      if (!payRes.ok) throw new Error('payment failed');
      const payData = await payRes.json();

      const docNums = [payData.tax_invoice_number, payData.receipt_number].filter(Boolean).join(', ');
      showToast(`บันทึกการชำระแล้ว${docNums ? ` ออกเลข ${docNums}` : ''}`, 'success');
      setPaymentConfirm(null);
      fetchReports(true);

      // Auto print merged invoice + statement
      setTimeout(() => handlePrintAll(report), 300);
    } catch {
      showToast('เกิดข้อผิดพลาดในการบันทึกการชำระ', 'error');
    } finally {
      setPaymentLoading(false);
    }
  };

  const buildMenuItems = (report: ConsignmentReport): ActionItem[] => {
    const isPrinting = printingId === report.id;
    const printed = printedDocs[report.id] || new Set<string>();
    const dot = (key: string) => printed.has(key)
      ? <span className="ml-auto w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
      : null;

    const items: ActionItem[] = [
      {
        key: 'view',
        label: 'ดูรายละเอียด',
        icon: <Eye className="w-4 h-4" />,
        onClick: () => router.push(`/consignment/reports/${report.id}`),
      },
    ];

    // Print: ใบแจ้งหนี้ (available for billed/paid/invoiced)
    if (['invoiced', 'billed', 'paid'].includes(report.status)) {
      items.push({
        key: 'invoice',
        label: 'ใบแจ้งหนี้',
        icon: isPrinting && printingType === 'invoice' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />,
        suffix: dot('invoice'),
        onClick: () => handlePrintInvoice(report.id),
        disabled: isPrinting,
        dividerBefore: true,
      });
    }

    // Print: ใบวางบิล (available when has statement_id)
    if (report.statement_id && ['billed', 'paid'].includes(report.status)) {
      items.push({
        key: 'statement',
        label: 'ใบวางบิล',
        icon: isPrinting && printingType === 'statement' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />,
        suffix: dot('statement'),
        onClick: () => handlePrintStatement(report.id, report.statement_id!),
        disabled: isPrinting,
      });
    }

    // Print all (when both available) — merge into 1 PDF
    if (report.statement_id && ['billed', 'paid'].includes(report.status)) {
      items.push({
        key: 'print_all',
        label: isPrinting ? 'กำลังสร้าง...' : 'พิมพ์ทั้งหมด',
        icon: isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />,
        className: 'text-[#F4511E] font-medium',
        onClick: () => handlePrintAll(report),
        disabled: isPrinting,
      });
    }

    // Payment action (billed/overdue with statement)
    if (['billed', 'overdue'].includes(report.status) && report.statement_id) {
      items.push({
        key: 'payment',
        label: 'ลูกค้าชำระแล้ว',
        icon: <Banknote className="w-4 h-4" />,
        onClick: () => setPaymentConfirm(report),
        dividerBefore: true,
      });
    }

    // Draft actions
    if (report.status === 'draft' && report.report_token) {
      items.push({
        key: 'copy_link',
        label: 'คัดลอกลิงก์ตัวแทน',
        icon: <Copy className="w-4 h-4" />,
        onClick: () => copyPortalReportLink(report),
        dividerBefore: true,
      });
    }

    if (report.status === 'draft') {
      items.push({
        key: 'cancel',
        label: 'ยกเลิกรายงาน',
        icon: <XCircle className="w-4 h-4" />,
        danger: true,
        dividerBefore: report.status === 'draft' && !report.report_token,
        onClick: async () => {
          const res = await apiFetch(`/api/consignment/reports/${report.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cancel' }),
          });
          if (res.ok) { showToast('ยกเลิกรายงานแล้ว', 'success'); fetchReports(true); }
          else showToast('เกิดข้อผิดพลาด', 'error');
        },
      });
    }

    return items;
  };

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-[#F4511E]" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">ยอดขายตัวแทน</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchReports(true)}
              disabled={isRefreshing}
              className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-700 dark:hover:text-white transition-colors disabled:opacity-50"
              title="รีเฟรช"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <Link
              href="/consignment/reports/new"
              className="bg-[#F4511E] text-white px-4 py-2 rounded-lg hover:bg-[#D63B0E] transition-colors flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              คีย์ยอดตัวแทน
            </Link>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_TABS.map(tab => {
            const count = getTabCount(tab.key);
            const isActive = activeStatus === tab.key;
            if (tab.hideIfZero && count === 0 && !isActive) return null;
            const btn = (
              <button
                onClick={() => setParams({ status: tab.key })}
                className={`rounded-xl px-4 py-2 min-w-[80px] text-center transition-all ${
                  isActive ? `${tab.active} text-white shadow-md` : `${tab.inactive} hover:opacity-80`
                }`}
              >
                <div className={`text-xs font-medium ${isActive ? 'text-white/80' : tab.labelColor}`}>{tab.label}</div>
                <div className={`text-xl font-bold ${isActive ? 'text-white' : tab.countColor}`}>{count}</div>
              </button>
            );
            return (
              <div key={tab.key} className="flex-shrink-0">
                {tab.tooltip ? <Tooltip text={tab.tooltip}>{btn}</Tooltip> : btn}
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchInput value={searchInput} onChange={handleSearchChange} placeholder="ค้นหาเลขรายงาน, ชื่อตัวแทน..." />
          </div>
        </div>

        {/* Desktop Table */}
        <div className="data-table-wrap hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  <th className="data-th">เลขที่</th>
                  <th className="data-th">ตัวแทน</th>
                  <th className="data-th">งวด</th>
                  <th className="data-th text-right">จำนวน</th>
                  <th className="data-th text-right">ยอดสุทธิ (บาท)</th>
                  <th className="data-th">สถานะ</th>
                  <th className="data-th text-center">พิมพ์</th>
                  <th className="data-th">ครบกำหนด</th>
                  <th className="data-th text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="data-tbody">
                {isLoading ? (
                  <tr><td colSpan={9} className="px-6 py-12 text-center"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin mx-auto" /></td></tr>
                ) : reports.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center">
                      <Package className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                      <p className="text-gray-500 dark:text-slate-400 data-text">ไม่พบรายงาน</p>
                    </td>
                  </tr>
                ) : reports.map(report => {
                  const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft;
                  const isOverdue = report.due_date && new Date(report.due_date) < new Date() && report.status !== 'paid';
                  return (
                    <tr key={report.id} className="data-tr cursor-pointer" onClick={() => router.push(`/consignment/reports/${report.id}`)}>
                      {/* เลขที่ */}
                      <td className="data-td">
                        <p className="id-text-clickable text-gray-900 dark:text-white">
                          {report.report_number}
                        </p>
                        <p className="data-timestamp text-gray-400 dark:text-slate-500 mt-0.5">{formatDate(report.created_at)}</p>
                      </td>
                      {/* ตัวแทน */}
                      <td className="data-td">
                        <p className="data-text text-gray-900 dark:text-white font-medium">{report.customer?.name || '-'}</p>
                        {report.customer?.customer_code && (
                          <p className="data-timestamp text-gray-400 dark:text-slate-500">{report.customer.customer_code}</p>
                        )}
                      </td>
                      {/* งวด */}
                      <td className="data-td">
                        <span className="data-text text-gray-700 dark:text-slate-300">{formatPeriod(report.period_year, report.period_month)}</span>
                      </td>
                      {/* จำนวน */}
                      <td className="data-td text-right">
                        <span className="data-text text-gray-700 dark:text-slate-300">{report.total_qty_sold} ชิ้น</span>
                      </td>
                      {/* ยอดสุทธิ */}
                      <td className="data-td text-right">
                        <span className="data-number text-gray-900 dark:text-white">
                          ฿{formatAmount(report.our_amount)}
                        </span>
                      </td>
                      {/* สถานะ */}
                      <td className="data-td">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                          {report.status === 'paid' && <CheckCircle2 className="w-3 h-3" />}
                          {cfg.label}
                        </span>
                      </td>
                      {/* พิมพ์ */}
                      <td className="data-td text-center" onClick={e => e.stopPropagation()}>
                        {(() => {
                          const printed = printedDocs[report.id] || new Set<string>();
                          const isPrinting = printingId === report.id;
                          const hasDocs = ['invoiced', 'billed', 'paid'].includes(report.status);
                          if (!hasDocs) return <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
                          return (
                            <Tooltip text={`ใบแจ้งหนี้: ${printed.has('invoice') ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}\nใบวางบิล: ${report.statement_id ? (printed.has('statement') ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์') : 'ยังไม่มี'}`}>
                              <div className="flex items-center justify-center gap-1">
                                {isPrinting && <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />}
                                <span className={`w-2.5 h-2.5 rounded-full ${printed.has('invoice') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                                <span className={`w-2.5 h-2.5 rounded-full ${printed.has('statement') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                              </div>
                            </Tooltip>
                          );
                        })()}
                      </td>
                      {/* ครบกำหนด */}
                      <td className="data-td">
                        {report.due_date ? (
                          <span className={`data-text flex items-center gap-1 ${isOverdue ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-slate-300'}`}>
                            {isOverdue && <AlertCircle className="w-3.5 h-3.5" />}
                            {formatDate(report.due_date)}
                          </span>
                        ) : <span className="data-muted text-gray-400 dark:text-slate-500">-</span>}
                      </td>
                      {/* จัดการ */}
                      <td className="data-td" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {report.status === 'received' && (
                            <button
                              onClick={async () => {
                                const res = await apiFetch(`/api/consignment/reports/${report.id}`, {
                                  method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'confirm' }),
                                });
                                if (res.ok) {
                                  const data = await res.json();
                                  const stMsg = data.statement_number ? ` สร้างใบวางบิล ${data.statement_number}` : '';
                                  showToast(`ยืนยันรายงานแล้ว${stMsg}`, 'success');
                                  fetchReports(true);
                                } else showToast('เกิดข้อผิดพลาด', 'error');
                              }}
                              className="flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap"
                            >
                              <BadgeCheck className="w-4 h-4" />
                              <span className="hidden lg:inline">ยืนยัน</span>
                            </button>
                          )}
                          {['billed', 'overdue'].includes(report.status) && report.statement_id && (
                            <button
                              onClick={() => setPaymentConfirm(report)}
                              className="flex items-center gap-1.5 px-2.5 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap"
                            >
                              <Banknote className="w-4 h-4" />
                              <span className="hidden lg:inline">ลูกค้าชำระแล้ว</span>
                            </button>
                          )}
                          {report.status === 'paid' && (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          )}
                          <ActionMenu items={buildMenuItems(report)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage} totalPages={totalPages} totalRecords={totalRecords}
            startIdx={startIdx} endIdx={endIdx} recordsPerPage={recordsPerPage}
            setRecordsPerPage={v => setParams({ limit: String(v) })}
            setPage={v => setParams({ page: String(v) })}
          />
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" /></div>
          ) : reports.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-slate-400 data-text">ไม่พบรายงาน</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {reports.map(report => {
                const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft;
                return (
                  <div key={report.id} className="p-4 cursor-pointer" onClick={() => router.push(`/consignment/reports/${report.id}`)}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="id-text-clickable text-gray-900 dark:text-white">
                          {report.report_number}
                        </p>
                        <p className="data-timestamp text-gray-400 dark:text-slate-500">{formatDate(report.created_at)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="data-text text-gray-700 dark:text-slate-300 font-medium">{report.customer?.name || '-'}</span>
                      <span className="data-number text-gray-900 dark:text-white">฿{formatAmount(report.our_amount)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-slate-500">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatPeriod(report.period_year, report.period_month)}</span>
                      <span>{report.total_qty_sold} ชิ้น</span>
                    </div>
                    {/* Action buttons */}
                    <div className="mt-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      {report.status === 'received' && (
                        <button
                          onClick={async () => {
                            const res = await apiFetch(`/api/consignment/reports/${report.id}`, {
                              method: 'PUT', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ action: 'confirm' }),
                            });
                            if (res.ok) {
                              const data = await res.json();
                              const stMsg = data.statement_number ? ` สร้างใบวางบิล ${data.statement_number}` : '';
                              showToast(`ยืนยันรายงานแล้ว${stMsg}`, 'success');
                              fetchReports(true);
                            } else showToast('เกิดข้อผิดพลาด', 'error');
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                        >
                          <BadgeCheck className="w-4 h-4" /> ยืนยัน
                        </button>
                      )}
                      {['billed', 'overdue'].includes(report.status) && report.statement_id && (
                        <button
                          onClick={() => setPaymentConfirm(report)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                        >
                          <Banknote className="w-4 h-4" /> ลูกค้าชำระแล้ว
                        </button>
                      )}
                      {report.status === 'paid' && (
                        <span className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-green-600">
                          <CheckCircle2 className="w-4 h-4" /> ชำระแล้ว
                        </span>
                      )}
                      {/* Print indicators (mobile) */}
                      {['invoiced', 'billed', 'paid'].includes(report.status) && (() => {
                        const printed = printedDocs[report.id] || new Set<string>();
                        return (
                          <div className="flex items-center gap-1">
                            <span className={`w-2 h-2 rounded-full ${printed.has('invoice') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                            <span className={`w-2 h-2 rounded-full ${printed.has('statement') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                          </div>
                        );
                      })()}
                      <ActionMenu items={buildMenuItems(report)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Pagination
            currentPage={currentPage} totalPages={totalPages} totalRecords={totalRecords}
            startIdx={startIdx} endIdx={endIdx} recordsPerPage={recordsPerPage}
            setRecordsPerPage={v => setParams({ limit: String(v) })}
            setPage={v => setParams({ page: String(v) })}
          />
        </div>
      </div>

      {/* Payment Confirm Dialog */}
      <ConfirmDialog
        open={!!paymentConfirm}
        onClose={() => !paymentLoading && setPaymentConfirm(null)}
        onConfirm={() => paymentConfirm && handleRecordPayment(paymentConfirm)}
        icon={<Banknote className="w-6 h-6 text-[#F4511E]" />}
        title="ลูกค้าชำระแล้ว"
        description={paymentConfirm ? `ยืนยันการชำระเงินของ ${paymentConfirm.customer?.name || '-'}\nรายงาน ${paymentConfirm.report_number} จำนวน ฿${formatAmount(paymentConfirm.our_amount)}` : ''}
        confirmLabel={paymentLoading ? 'กำลังบันทึก...' : 'ยืนยันการชำระ'}
        confirmIcon={paymentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        loading={paymentLoading}
      />
    </Layout>
  );
}

export default function ConsignmentReportsPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    }>
      <ConsignmentReportsContent />
    </Suspense>
  );
}

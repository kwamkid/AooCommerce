'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  ClipboardList, Building2, Loader2, RefreshCw, CheckCircle2,
  AlertCircle, Clock, BadgeCheck, Copy, Receipt,
  Plus, Package, XCircle, Trash2, Eye, FileText, Printer,
  Banknote, Undo2,
} from 'lucide-react';
import { showPdfPreview, mergePdfBlobs } from '@/lib/print-pdf';
import { markPrinted as markPrintedDB } from '@/lib/print-tracking';
import Pagination from '@/app/components/Pagination';
import Tooltip from '@/components/ui/Tooltip';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ActionMenu, { type ActionItem } from '@/components/ui/ActionMenu';
import { getBadgeColor } from '@/lib/status-tab-colors';
import StatusTabs from '@/components/ui/StatusTabs';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import { LoadingCard } from '@/components/ui/StateCard';

interface DeptStoreReport {
  id: string;
  report_number: string;
  period_year: number;
  period_month: number;
  status: string;
  total_qty_sold: number;
  our_amount: number;
  due_date: string | null;
  statement_id: string | null;
  printed_invoice_at?: string | null;
  printed_statement_at?: string | null;
  created_at: string;
  customer: { id: string; name: string; customer_code: string | null; phone?: string | null; contact_person?: string | null } | null;
  doc_number?: string | null;
  doc_type?: string | null;
  statement_number?: string | null;
}


const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'ร่าง',       color: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900/40' },
  received: { label: 'รับแล้ว',    color: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900/40' },
  invoiced: { label: 'ออก invoice', color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-900/40' },
  billed:   { label: 'วางบิลแล้ว', color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  paid:      { label: 'ชำระแล้ว',   color: 'text-green-700 dark:text-green-300',   bg: 'bg-green-100 dark:bg-green-900/40' },
  overdue:   { label: 'เกินกำหนด',  color: 'text-red-700 dark:text-red-300',       bg: 'bg-red-100 dark:bg-red-900/40' },
  cancelled: { label: 'ยกเลิก',     color: 'text-red-700 dark:text-red-300',       bg: 'bg-red-100/50 dark:bg-red-900/20' },
};

const STATUS_TABS = [
  { key: 'all',      label: 'ทั้งหมด' },
  { key: 'draft',    label: 'ร่าง' },
  { key: 'billed',   label: 'วางบิลแล้ว' },
  { key: 'paid',     label: 'ชำระแล้ว' },
  { key: 'overdue',  label: 'เกินกำหนด' },
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

function DeptStoreReportsContent() {
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
    router.replace(qs ? `?${qs}` : '/department-store/reports', { scroll: false });
  }, [searchParams, router]);

  const [reports, setReports] = useState<DeptStoreReport[]>([]);
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

      const res = await apiFetch(`/api/department-store/reports?${params}`);
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

  // Print state (DB-backed via printed_*_at columns)
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printingType, setPrintingType] = useState<string | null>(null);

  const isPrintedDoc = (r: DeptStoreReport, docType: string) => {
    const col = `printed_${docType}_at` as keyof DeptStoreReport;
    return !!r[col];
  };
  const markPrinted = (id: string, type: string) => {
    markPrintedDB('department_store_report', [id], type);
    const col = `printed_${type}_at` as keyof DeptStoreReport;
    setReports(prev => prev.map(r =>
      r.id === id ? { ...r, [col]: new Date().toISOString() } : r
    ));
  };

  // Generate invoice blob (reusable for single print + merge)
  // taxInvoiceOverride: pass statement's tax_invoice_number/receipt_number to render as ใบกำกับภาษี/ใบเสร็จ
  const generateInvoiceBlob = async (reportId: string, taxInvoiceOverride?: {
    tax_invoice_number?: string | null;
    receipt_number?: string | null;
    tax_invoice_date?: string | null;
    receipt_date?: string | null;
    vat_registered?: boolean;
    document_subtype?: 'tax_only' | 'tax_receipt' | 'tax_invoice' | 'receipt' | null;
  }): Promise<Blob> => {
    const res = await apiFetch(`/api/department-store/reports/${reportId}`);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    const r = data.report;
    const { generateDepartmentStoreReportPdf } = await import('@/lib/department-store-report-pdf');
    return generateDepartmentStoreReportPdf({
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
      // Always pass doc info from report API
      tax_invoice_number: r.tax_invoice_number || null,
      tax_invoice_date: r.tax_invoice_date || null,
      vat_registered: r.vat_registered ?? false,
      ...(taxInvoiceOverride || {}),
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
      invoice_number: st.invoice_number || null,
      receipt_number: st.receipt_number,
      notes: st.notes,
      customer: st.customer ? {
        ...st.customer,
        billing_address: [st.customer.billing_address, st.customer.billing_district, st.customer.billing_amphoe, st.customer.billing_province, st.customer.billing_postal_code].filter(Boolean).join(', ') || null,
      } : null,
      reports: stReports.map((r: any) => ({
        report_number: r.report_number,
        doc_number: r.doc_number || null,
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
      // Check if statement has tax/receipt documents — always fetch fresh from API
      const report = reports.find(r => r.id === reportId);
      let taxOverride: Parameters<typeof generateInvoiceBlob>[1];
      if (report?.statement_id) {
        const stRes = await apiFetch(`/api/statements/${report.statement_id}`);
        if (stRes.ok) {
          const stData = await stRes.json();
          const st = stData.statement;
          if (st?.tax_invoice_number || st?.receipt_number) {
            taxOverride = {
              tax_invoice_number: st.tax_invoice_number,
              receipt_number: st.receipt_number,
              tax_invoice_date: st.tax_invoice_date,
              receipt_date: st.receipt_date,
              vat_registered: !!st.tax_invoice_number,
            };
          }
        }
      }
      const blob = await generateInvoiceBlob(reportId, taxOverride);
      const title = taxOverride ? 'ใบกำกับภาษี/ใบเสร็จ' : 'ใบแจ้งหนี้';
      showPdfPreview(blob, title);
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

  const handlePrintAll = async (report: DeptStoreReport) => {
    if (!report.statement_id) return;
    setPrintingId(report.id);
    setPrintingType('all');
    try {
      // Fetch statement to check if paid (has tax_invoice_number/receipt_number)
      const stRes = await apiFetch(`/api/statements/${report.statement_id}`);
      const stData = stRes.ok ? await stRes.json() : null;
      const st = stData?.statement;

      const isPaid = st?.status === 'paid';
      const taxOverride = isPaid && (st?.tax_invoice_number || st?.receipt_number)
        ? {
          tax_invoice_number: st.tax_invoice_number,
          receipt_number: st.receipt_number,
          tax_invoice_date: st.tax_invoice_date,
          receipt_date: st.receipt_date,
          vat_registered: !!st.tax_invoice_number,
        }
        : undefined;

      const [invoiceBlob, statementBlob] = await Promise.all([
        generateInvoiceBlob(report.id, taxOverride),
        generateStatementBlob(report.statement_id),
      ]);
      const merged = await mergePdfBlobs([invoiceBlob, statementBlob]);
      const title = `เอกสารทั้งหมด ${report.report_number}`;
      showPdfPreview(merged, title);
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
  // พร้อมวางบิล confirm state
  const [billConfirm, setBillConfirm] = useState<DeptStoreReport | null>(null);
  const [billLoading, setBillLoading] = useState(false);

  const handleReadyToBill = async (report: DeptStoreReport) => {
    setBillLoading(true);
    try {
      const res = await apiFetch(`/api/department-store/reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      const d = await res.json();
      showToast(`พร้อมวางบิลแล้ว${d.statement_number ? ` — สร้างใบวางบิล ${d.statement_number}` : ''}`, 'success');
      setBillConfirm(null);
      fetchReports(true);

      // Auto-print invoice + statement after confirm
      const statementId = d.statement_id || d.statementId;
      if (statementId) {
        setTimeout(() => handlePrintAll({ ...report, statement_id: statementId, status: 'invoiced' }), 300);
      } else {
        setTimeout(() => handlePrintInvoice(report.id), 300);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setBillLoading(false);
    }
  };

  const [paymentConfirm, setPaymentConfirm] = useState<DeptStoreReport | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const handleRecordPayment = async (report: DeptStoreReport) => {
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

      // Auto print invoice only (ไม่ต้องรวมใบวางบิล — พิมพ์ไปแล้วตอน billed)
      setTimeout(() => handlePrintInvoice(report.id), 300);
    } catch {
      showToast('เกิดข้อผิดพลาดในการบันทึกการชำระ', 'error');
    } finally {
      setPaymentLoading(false);
    }
  };

  // Reverse payment state
  const [reverseConfirm, setReverseConfirm] = useState<DeptStoreReport | null>(null);
  const [reverseLoading, setReverseLoading] = useState(false);

  const handleReversePayment = async (report: DeptStoreReport) => {
    if (!report.statement_id) return;
    setReverseLoading(true);
    try {
      const res = await apiFetch(`/api/statements/${report.statement_id}`, {
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
      fetchReports(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setReverseLoading(false);
    }
  };

  // Void confirm state
  const [voidConfirm, setVoidConfirm] = useState<DeptStoreReport | null>(null);
  const [voidLoading, setVoidLoading] = useState(false);

  const handleVoidReport = async (report: DeptStoreReport) => {
    setVoidLoading(true);
    try {
      const res = await apiFetch(`/api/department-store/reports/${report.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'void' }),
      });
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r.error || 'Failed');
      }
      showToast('Void เอกสารแล้ว — รายงานกลับเป็นร่าง แก้ไขได้', 'success');
      setVoidConfirm(null);
      fetchReports(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setVoidLoading(false);
    }
  };

  const buildMenuItems = (report: DeptStoreReport): ActionItem[] => {
    const isPrinting = printingId === report.id;
    const dot = (key: string) => isPrintedDoc(report, key)
      ? <span className="ml-auto w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
      : null;

    const items: ActionItem[] = [];

    // === Print documents — ordered by flow (latest first) ===

    // Receipt (paid only — latest in flow)
    if (report.status === 'paid' && report.statement_id) {
      items.push({
        key: 'print_receipt',
        label: 'ใบเสร็จรับเงิน',
        icon: <Receipt className="w-4 h-4" />,
        onClick: async () => {
          try {
            const stRes = await apiFetch(`/api/statements/${report.statement_id}`);
            if (!stRes.ok) throw new Error('fetch failed');
            const stData = await stRes.json();
            const st = stData.statement;
            const blob = await generateInvoiceBlob(report.id, {
              receipt_number: st.receipt_number,
              receipt_date: st.receipt_date,
              tax_invoice_number: st.tax_invoice_number,
              document_subtype: 'receipt',
            });
            showPdfPreview(blob, `ใบเสร็จรับเงิน`);
          } catch { showToast('ไม่สามารถพิมพ์ใบเสร็จได้', 'error'); }
        },
        dividerBefore: true,
      });
    }

    // Statement (billed/paid — issued at billing)
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

    // Invoice (invoiced/billed/paid — issued at confirm)
    if (['invoiced', 'billed', 'paid'].includes(report.status)) {
      items.push({
        key: 'invoice',
        label: 'ใบแจ้งหนี้',
        icon: isPrinting && printingType === 'invoice' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />,
        suffix: dot('invoice'),
        onClick: () => handlePrintInvoice(report.id),
        disabled: isPrinting,
      });
    }

    // Print all (merge)
    if (report.statement_id && ['billed', 'paid'].includes(report.status)) {
      items.push({
        key: 'print_all',
        label: isPrinting ? 'กำลังสร้าง...' : 'พิมพ์ทั้งหมด',
        icon: isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />,
        className: 'text-primary font-medium',
        onClick: () => handlePrintAll(report),
        disabled: isPrinting,
      });
    }

    // === Actions ===

    // Reverse payment (paid)
    if (report.status === 'paid' && report.statement_id) {
      items.push({
        key: 'reverse_payment',
        label: 'ยกเลิกการชำระ',
        icon: <Undo2 className="w-4 h-4" />,
        onClick: () => setReverseConfirm(report),
        danger: true,
        dividerBefore: true,
      });
    }

    // Void (billed/invoiced)
    if (['billed', 'invoiced'].includes(report.status)) {
      items.push({
        key: 'void',
        label: 'ยกเลิก (Void)',
        icon: <Trash2 className="w-4 h-4" />,
        danger: true,
        dividerBefore: true,
        onClick: () => setVoidConfirm(report),
      });
    }

    // Cancel (draft)
    if (report.status === 'draft') {
      items.push({
        key: 'cancel',
        label: 'ยกเลิกรายงาน',
        icon: <Trash2 className="w-4 h-4" />,
        danger: true,
        dividerBefore: true,
        onClick: async () => {
          const res = await apiFetch(`/api/department-store/reports/${report.id}`, {
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
      <Container size="full" gap="sm">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="w-8 h-8 text-primary" />
            <h1 className="heading-1">ยอดขายห้าง</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => fetchReports(true)}
              disabled={isRefreshing}
              title="รีเฟรช"
              icon={<RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />}
            />
            <Button
              variant="primary"
              icon={<Plus className="w-5 h-5" />}
              onClick={() => router.push('/department-store/reports/new')}
            >
              คีย์ยอดห้าง
            </Button>
          </div>
        </div>

        {/* Status Tabs */}
        <StatusTabs
          activeKey={activeStatus}
          onSelect={(k) => setParams({ status: k })}
          tabs={STATUS_TABS.map(t => ({ ...t, count: getTabCount(t.key) }))}
        />

        {/* Search */}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <SearchInput value={searchInput} onChange={handleSearchChange} placeholder="ค้นหาเลขรายงาน, ชื่อห้าง..." />
          </div>
        </div>

        {/* Table + Mobile Cards via DataTable */}
        <DataTable<DeptStoreReport>
          storageKey="csr-columns"
          columns={[
            {
              key: 'report', label: 'เลขที่', alwaysVisible: true,
              headerClassName: 'min-w-[140px]', cellClassName: 'whitespace-nowrap',
              render: (r) => (
                <>
                  <p className={`font-mono text-sm font-bold ${r.status === 'cancelled' ? 'text-red-500 line-through' : 'text-gray-900 dark:text-white'}`}>
                    {r.report_number}
                    {r.status === 'cancelled' && <span className="ml-1.5 no-underline inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white">VOID</span>}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{new Date(r.created_at).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
                </>
              ),
            },
            {
              key: 'customer', label: 'ห้าง',
              render: (r) => (
                <>
                  <p className="data-text text-gray-900 dark:text-white font-medium">{r.customer?.name || '-'}</p>
                  {r.customer?.phone && <p className="data-timestamp text-gray-400 dark:text-slate-500">{r.customer.phone}</p>}
                </>
              ),
            },
            {
              key: 'period', label: 'งวด', headerClassName: 'whitespace-nowrap', cellClassName: 'whitespace-nowrap',
              render: (r) => <span className="data-text text-gray-700 dark:text-slate-300">{formatPeriod(r.period_year, r.period_month)}</span>,
            },
            {
              key: 'amount', label: 'ยอดสุทธิ', headerClassName: 'text-right whitespace-nowrap', cellClassName: 'text-right',
              render: (r) => <span className="data-number text-gray-900 dark:text-white">฿{formatAmount(r.our_amount)}</span>,
            },
            {
              key: 'status', label: 'สถานะ',
              render: (r) => {
                const c = STATUS_CONFIG[r.status] || STATUS_CONFIG.draft;
                return (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.color}`}>
                    {r.status === 'paid' && <CheckCircle2 className="w-3 h-3" />}
                    {c.label}
                  </span>
                );
              },
            },
            {
              key: 'print', label: 'พิมพ์', headerClassName: 'text-center', cellClassName: 'text-center', stopPropagation: true, hideMobile: true,
              render: (r) => {
                const isPrinting = printingId === r.id;
                const hasDocs = ['invoiced', 'billed', 'paid'].includes(r.status);
                if (!hasDocs) return <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
                return (
                  <Tooltip text={`ใบแจ้งหนี้: ${isPrintedDoc(r, 'invoice') ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์'}\nใบวางบิล: ${r.statement_id ? (isPrintedDoc(r, 'statement') ? 'พิมพ์แล้ว' : 'ยังไม่พิมพ์') : 'ยังไม่มี'}`}>
                    <div className="relative flex items-center justify-center gap-1">
                      {isPrinting && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin absolute" />}
                      <span className={`w-2.5 h-2.5 rounded-full transition-opacity ${isPrinting ? 'opacity-30' : ''} ${isPrintedDoc(r, 'invoice') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                      <span className={`w-2.5 h-2.5 rounded-full transition-opacity ${isPrinting ? 'opacity-30' : ''} ${isPrintedDoc(r, 'statement') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                    </div>
                  </Tooltip>
                );
              },
            },
            {
              key: 'docs', label: 'เอกสาร', headerClassName: 'whitespace-nowrap', cellClassName: 'whitespace-nowrap',
              render: (r) => r.doc_number || r.statement_number ? (
                <div className="space-y-0.5">
                  {r.doc_number && <p className="font-mono text-xs text-primary">{r.doc_number}</p>}
                  {r.statement_number && <p className="font-mono text-xs text-indigo-600 dark:text-indigo-400">{r.statement_number}</p>}
                </div>
              ) : <span className="text-xs text-gray-300 dark:text-slate-600">-</span>,
            },
            {
              key: 'dueDate', label: 'ครบกำหนด', headerClassName: 'whitespace-nowrap',
              render: (r) => {
                const ov = r.due_date && new Date(r.due_date) < new Date() && r.status !== 'paid';
                return r.due_date ? (
                  <span className={`data-text flex items-center gap-1 ${ov ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-slate-300'}`}>
                    {ov && <AlertCircle className="w-3.5 h-3.5" />}
                    {formatDate(r.due_date)}
                  </span>
                ) : <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
              },
            },
            {
              key: 'actions', label: 'จัดการ', alwaysVisible: true, headerClassName: 'text-right', stopPropagation: true, hideMobile: true,
              render: (r) => (
                <div className="flex items-center justify-end gap-1">
                  {['draft', 'received'].includes(r.status) && (
                    <button onClick={() => setBillConfirm(r)} className="btn-focus-action green">
                      <BadgeCheck className="w-4 h-4" /><span className="hidden lg:inline">พร้อมวางบิล</span>
                    </button>
                  )}
                  {['billed', 'overdue'].includes(r.status) && r.statement_id && (
                    <button onClick={() => setPaymentConfirm(r)} className="btn-focus-action indigo">
                      <Banknote className="w-4 h-4" /><span className="hidden xl:inline">ลูกค้าชำระแล้ว</span>
                    </button>
                  )}
                  {r.status === 'paid' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
                  <ActionMenu items={buildMenuItems(r)} />
                </div>
              ),
            },
          ]}
          data={reports}
          loading={isLoading}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/department-store/reports/${r.id}`)}
          rowClassName={(r) => r.status === 'cancelled' ? 'opacity-50' : ''}
          emptyMessage="ไม่พบรายงาน"
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={totalRecords}
          recordsPerPage={recordsPerPage}
          onPageChange={(v) => setParams({ page: String(v) })}
          onRecordsPerPageChange={(v) => setParams({ limit: String(v) })}
          mobileCardRender={(report) => {
            const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft;
            return (
              <>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="id-text-clickable text-gray-900 dark:text-white">{report.report_number}</p>
                    <p className="data-timestamp text-gray-400 dark:text-slate-500">{formatDate(report.created_at)}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="data-text text-gray-700 dark:text-slate-300 font-medium">{report.customer?.name || '-'}</span>
                  <span className="data-number text-gray-900 dark:text-white">฿{formatAmount(report.our_amount)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatPeriod(report.period_year, report.period_month)}</span>
                  <span>{report.total_qty_sold} ชิ้น</span>
                </div>
                <div className="mt-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  {['draft', 'received'].includes(report.status) && (
                    <button onClick={() => setBillConfirm(report)} className="btn-focus-action green flex-1 justify-center"><BadgeCheck className="w-4 h-4" /> พร้อมวางบิล</button>
                  )}
                  {['billed', 'overdue'].includes(report.status) && report.statement_id && (
                    <button onClick={() => setPaymentConfirm(report)} className="btn-focus-action indigo flex-1 justify-center"><Banknote className="w-4 h-4" /> ลูกค้าชำระแล้ว</button>
                  )}
                  {report.status === 'paid' && <span className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-green-600"><CheckCircle2 className="w-4 h-4" /> ชำระแล้ว</span>}
                  {['invoiced', 'billed', 'paid'].includes(report.status) && (
                    <div className="flex items-center gap-1">
                      <span className={`w-2 h-2 rounded-full ${isPrintedDoc(report, 'invoice') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                      <span className={`w-2 h-2 rounded-full ${isPrintedDoc(report, 'statement') ? 'bg-green-500' : 'bg-gray-300 dark:bg-slate-600'}`} />
                    </div>
                  )}
                  <ActionMenu items={buildMenuItems(report)} />
                </div>
              </>
            );
          }}
        />
      </Container>

      {/* Ready to Bill Confirm Dialog */}
      <ConfirmDialog
        open={!!billConfirm}
        onClose={() => !billLoading && setBillConfirm(null)}
        onConfirm={() => billConfirm && handleReadyToBill(billConfirm)}
        icon={<BadgeCheck className="w-6 h-6 text-emerald-600" />}
        title="พร้อมวางบิล"
        confirmLabel={billLoading ? 'กำลังดำเนินการ...' : 'ยืนยันพร้อมวางบิล'}
        confirmIcon={billLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
        loading={billLoading}
      >
        {billConfirm && (
          <div className="text-base text-gray-600 dark:text-slate-300 mt-2 space-y-1 text-center">
            <p>ยืนยัน &quot;พร้อมวางบิล&quot; ของ <span className="font-semibold">{billConfirm.customer?.name || '-'}</span></p>
            <p>รายงาน <span className="font-semibold">{billConfirm.report_number}</span></p>
            <p>งวด <span className="font-semibold">{formatPeriod(billConfirm.period_year, billConfirm.period_month)}</span></p>
            <p>จำนวน <span className="font-semibold text-primary">฿{formatAmount(billConfirm.our_amount)}</span></p>
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-2">ระบบจะหักสต๊อก + ออกใบแจ้งหนี้ (INV) และใบวางบิล (ST) อัตโนมัติ</p>
          </div>
        )}
      </ConfirmDialog>

      {/* Payment Confirm Dialog */}
      <ConfirmDialog
        open={!!paymentConfirm}
        onClose={() => !paymentLoading && setPaymentConfirm(null)}
        onConfirm={() => paymentConfirm && handleRecordPayment(paymentConfirm)}
        icon={<Banknote className="w-6 h-6 text-primary" />}
        title="ลูกค้าชำระแล้ว"
        confirmLabel={paymentLoading ? 'กำลังบันทึก...' : 'ยืนยันการชำระ'}
        confirmIcon={paymentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        loading={paymentLoading}
      >
        {paymentConfirm && (
          <div className="text-base text-gray-600 dark:text-slate-300 mt-2 space-y-1 text-center">
            <p>ยืนยันการชำระเงินของ <span className="font-semibold">{paymentConfirm.customer?.name || '-'}</span></p>
            <p>รายงาน <span className="font-semibold">{paymentConfirm.report_number}</span></p>
            <p>งวด <span className="font-semibold">{formatPeriod(paymentConfirm.period_year, paymentConfirm.period_month)}</span></p>
            <p>จำนวน <span className="font-semibold text-primary">฿{formatAmount(paymentConfirm.our_amount)}</span></p>
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-2">ระบบจะออกใบกำกับภาษี/ใบเสร็จรับเงินอัตโนมัติ</p>
          </div>
        )}
      </ConfirmDialog>

      {/* Reverse Payment Confirm Dialog */}
      <ConfirmDialog
        open={!!reverseConfirm}
        onClose={() => !reverseLoading && setReverseConfirm(null)}
        onConfirm={() => reverseConfirm && handleReversePayment(reverseConfirm)}
        icon={<Undo2 className="w-6 h-6 text-red-500" />}
        title="ยกเลิกการชำระ"
        confirmLabel={reverseLoading ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิก'}
        confirmIcon={reverseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />}
        variant="danger"
        loading={reverseLoading}
      >
        {reverseConfirm && (
          <div className="text-base text-gray-600 dark:text-slate-300 mt-2 space-y-1 text-center">
            <p>ยกเลิกการชำระเงินของ <span className="font-semibold">{reverseConfirm.customer?.name || '-'}</span></p>
            <p>รายงาน <span className="font-semibold">{reverseConfirm.report_number}</span></p>
            <p>งวด <span className="font-semibold">{formatPeriod(reverseConfirm.period_year, reverseConfirm.period_month)}</span></p>
            <p>จำนวน <span className="font-semibold text-red-500">฿{formatAmount(reverseConfirm.our_amount)}</span></p>
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-2">ใบกำกับภาษี/ใบเสร็จที่ออกไปจะถูกยกเลิก (void)</p>
          </div>
        )}
      </ConfirmDialog>

      {/* Void Confirm Dialog */}
      <ConfirmDialog
        open={!!voidConfirm}
        onClose={() => !voidLoading && setVoidConfirm(null)}
        onConfirm={() => voidConfirm && handleVoidReport(voidConfirm)}
        icon={<Trash2 className="w-6 h-6 text-red-500" />}
        title="ยกเลิกรายงาน (Void)"
        confirmLabel={voidLoading ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิก'}
        confirmIcon={voidLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        variant="danger"
        loading={voidLoading}
      >
        {voidConfirm && (
          <div className="text-base text-gray-600 dark:text-slate-300 mt-2 space-y-1 text-center">
            <p>ยกเลิกรายงานของ <span className="font-semibold">{voidConfirm.customer?.name || '-'}</span></p>
            <p>รายงาน <span className="font-semibold">{voidConfirm.report_number}</span></p>
            <p>งวด <span className="font-semibold">{formatPeriod(voidConfirm.period_year, voidConfirm.period_month)}</span></p>
            <p className="text-sm text-gray-400 dark:text-slate-500 mt-2">• เอกสาร (INV/ST) จะถูก void<br/>• คืนสต๊อกกลับคลังห้าง<br/>• สถานะกลับเป็น &quot;ร่าง&quot; แก้ไขได้</p>
          </div>
        )}
      </ConfirmDialog>
    </Layout>
  );
}

export default function DeptStoreReportsPage() {
  return (
    <Suspense fallback={
      <Layout>
        <LoadingCard />
      </Layout>
    }>
      <DeptStoreReportsContent />
    </Suspense>
  );
}

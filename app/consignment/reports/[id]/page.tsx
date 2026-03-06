'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  Loader2, ArrowLeft, ClipboardList, Save, Printer,
  CheckCircle, MapPin, FileText, Receipt, Copy,
  BadgeCheck, XCircle, AlertCircle, ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { useCompany } from '@/lib/company-context';
import { formatNumber } from '@/lib/utils/format';
import { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';
import { type GpResolverContext, resolveGp, fetchGpContext } from '@/lib/gp-resolver';
import { showPdfPreview } from '@/lib/print-pdf';

// ─── Types ──────────────────────────────────────────────

interface ReportCustomer {
  id: string;
  name: string;
  customer_code: string | null;
  phone: string | null;
  email: string | null;
  contact_person: string | null;
  consignment_mode: string | null;
  portal_token: string | null;
  tax_company_name: string | null;
  tax_id: string | null;
  tax_branch: string | null;
  billing_address: string | null;
  billing_district: string | null;
  billing_amphoe: string | null;
  billing_province: string | null;
  billing_postal_code: string | null;
}

interface ReportData {
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
  confirmed_at: string | null;
  notes: string | null;
  customer: ReportCustomer | null;
  items: {
    id: string;
    variation_id: string;
    qty_sold: number;
    qty_returned: number;
    unit_price: number;
    gp_rate: number;
    our_amount: number;
    variation: {
      id: string; sku: string; variation_label: string; product_id: string;
      products: { name: string; image: string | null };
    } | null;
  }[];
}

interface ReportItem {
  product_id: string;
  variation_id: string | null;
  product_name: string;
  variation_label: string | null;
  sku: string | null;
  image: string | null;
  qty_sold: number;
  selling_price: number;
  gp_rate: number;
  brand_id: string | null;
  default_price: number;
  discount_price: number;
  gp_base_price: 'retail' | 'discounted';
  gp_level: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:     { label: 'รอรายงาน',    color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' },
  received:  { label: 'รับแล้ว',     color: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900/40' },
  invoiced:  { label: 'ออก invoice', color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-900/40' },
  billed:    { label: 'วางบิลแล้ว',  color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  paid:      { label: 'ชำระแล้ว',    color: 'text-green-700 dark:text-green-300',   bg: 'bg-green-100 dark:bg-green-900/40' },
  overdue:   { label: 'เกินกำหนด',   color: 'text-red-700 dark:text-red-300',       bg: 'bg-red-100 dark:bg-red-900/40' },
  cancelled: { label: 'ยกเลิก',      color: 'text-gray-500 dark:text-gray-400',     bg: 'bg-gray-100 dark:bg-gray-800' },
};

const THAI_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const formatPeriod = (year: number, month: number) =>
  `${THAI_MONTHS[month]} ${year + 543}`;

const formatDate = (d: string | null | undefined) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: '2-digit' });
};

// ─── Page Component ──────────────────────────────────────

function EditReportContent() {
  const router = useRouter();
  const params = useParams();
  const reportId = params.id as string;
  const { showToast } = useToast();
  const { currentCompany } = useCompany();

  // Report data
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  // Items
  const [items, setItems] = useState<ReportItem[]>([]);
  const [products, setProducts] = useState<ProductSearchItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Stock
  const [dealerStockMap, setDealerStockMap] = useState<Record<string, number>>({});

  // GP
  const [gpContext, setGpContext] = useState<GpResolverContext | null>(null);
  const [loadingGpData, setLoadingGpData] = useState(false);

  // Notes & actions
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState('');

  const isEditable = report ? ['draft', 'received'].includes(report.status) : false;

  // ─── Load report ──────────────────────────────────

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/consignment/reports/${reportId}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const r = data.report as ReportData;
      setReport(r);
      setNotes(r.notes || '');

      // Map items — unit_price from DB is net price (after per-item GP deduction)
      setItems(r.items.map(item => ({
        product_id: item.variation?.product_id || '',
        variation_id: item.variation_id,
        product_name: item.variation?.products?.name || '',
        variation_label: item.variation?.variation_label || null,
        sku: item.variation?.sku || null,
        image: item.variation?.products?.image || null,
        qty_sold: item.qty_sold,
        selling_price: item.unit_price,
        gp_rate: item.gp_rate,
        brand_id: null,
        default_price: item.unit_price,
        discount_price: 0,
        gp_base_price: 'retail' as const,
        gp_level: 0,
      })));
    } catch {
      showToast('ไม่สามารถโหลดรายงานได้', 'error');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  // ─── Load products (always — for images) + stock + GP (only if editable) ────

  useEffect(() => {
    if (!report) return;

    // Load products (always — needed for images even in read-only mode)
    setLoadingProducts(true);
    apiFetch('/api/products?limit=999&active=true')
      .then(r => r.json())
      .then(result => {
        const flat: ProductSearchItem[] = [];
        for (const p of result.products || []) {
          if (p.product_type === 'simple') {
            const v = p.variations?.[0];
            flat.push({
              id: v?.variation_id || p.product_id,
              product_id: p.product_id,
              code: p.code,
              name: p.name,
              image: p.main_image_url || p.image || null,
              variation_label: p.simple_variation_label || null,
              sku: p.simple_sku || null,
              barcode: v?.barcode || null,
              default_price: p.simple_default_price || 0,
              discount_price: p.simple_discount_price || 0,
              brand_id: p.brand_id || null,
            });
          } else {
            for (const v of p.variations || []) {
              flat.push({
                id: v.variation_id,
                product_id: p.product_id,
                code: p.code ? `${p.code}-${v.variation_label}` : p.code,
                name: p.name,
                image: v.image_url || p.main_image_url || null,
                variation_label: v.variation_label || null,
                sku: v.sku || null,
                barcode: v.barcode || null,
                default_price: v.default_price || 0,
                discount_price: v.discount_price || 0,
                brand_id: p.brand_id || null,
              });
            }
          }
        }
        setProducts(flat);
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, [report?.id]);

  // Enrich items with images + correct base prices from products API
  // Depend on both products and items length to handle race condition
  const enrichedRef = useRef(false);
  useEffect(() => {
    if (products.length === 0 || items.length === 0) return;
    // Only enrich once per product/items load
    const imageMap = new Map(products.map(p => [p.id, p.image]));
    setItems(prev => {
      let changed = false;
      const next = prev.map(item => {
        const key = item.variation_id ?? item.product_id;
        const img = imageMap.get(key);
        if (img && img !== item.image) {
          changed = true;
          return { ...item, image: img };
        }
        return item;
      });
      if (changed) enrichedRef.current = true;
      return changed ? next : prev;
    });
  }, [products, items.length]);

  // Load dealer stock
  useEffect(() => {
    if (!report?.customer?.id || !isEditable) { setDealerStockMap({}); return; }
    apiFetch(`/api/inventory?dealer_id=${report.customer.id}&limit=9999`)
      .then(r => r.json())
      .then(d => {
        const map: Record<string, number> = {};
        for (const i of d.items || []) {
          const b = i.consign_breakdown?.find((x: { customer_id: string }) => x.customer_id === report.customer?.id);
          if (b && b.qty > 0) {
            map[i.variation_id] = b.qty;
          }
        }
        setDealerStockMap(map);
      })
      .catch(() => setDealerStockMap({}));
  }, [report?.customer?.id, isEditable]);

  // Load GP context
  useEffect(() => {
    if (!report?.customer?.id || !isEditable) { setGpContext(null); return; }
    setLoadingGpData(true);
    fetchGpContext(report.customer.id)
      .then(ctx => setGpContext(ctx))
      .catch(() => {})
      .finally(() => setLoadingGpData(false));
  }, [report?.customer?.id, isEditable]);

  // ─── Item handlers ──────────────────────────────────

  const handleAddProduct = (p: ProductSearchItem) => {
    if (!gpContext) return;

    const exists = items.findIndex(i => i.variation_id === p.id || (!i.variation_id && i.product_id === p.product_id));
    if (exists >= 0) {
      setItems(prev => prev.map((item, idx) => idx === exists ? { ...item, qty_sold: item.qty_sold + 1 } : item));
    } else {
      const resolution = resolveGp(gpContext, {
        brand_id: p.brand_id || null,
        default_price: p.default_price || 0,
        discount_price: p.discount_price || 0,
      });

      setItems(prev => [...prev, {
        product_id: p.product_id,
        variation_id: p.id !== p.product_id ? p.id : null,
        product_name: p.name,
        variation_label: p.variation_label || null,
        sku: p.sku || null,
        image: p.image || null,
        qty_sold: 1,
        selling_price: resolution.unit_price,
        gp_rate: resolution.gp_rate,
        brand_id: p.brand_id || null,
        default_price: p.default_price || 0,
        discount_price: p.discount_price || 0,
        gp_base_price: resolution.gp_base_price,
        gp_level: resolution.gp_level,
      }]);
    }
    setTimeout(() => searchInputRef.current?.focus(), 50);
  };

  const updateItem = (idx: number, field: 'qty_sold' | 'selling_price', value: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const gpInfoText = (item: ReportItem): string => {
    const basePriceLabel = item.gp_base_price === 'discounted' ? 'ลด' : 'ปลีก';
    const basePrice = item.gp_base_price === 'discounted' && item.discount_price > 0 ? item.discount_price : item.default_price;
    return `฿${formatNumber(basePrice)}(${basePriceLabel}) - GP${formatNumber(item.gp_rate)}% = ฿${formatNumber(item.selling_price)}`;
  };

  // Available products (only those with stock)
  const availableProducts = report?.customer?.id
    ? products.filter(p => (dealerStockMap[p.id] ?? 0) > 0)
    : products;

  // ─── Calculations ──────────────────────────────────

  // selling_price is already net (after per-item GP deduction)
  const totalQty = items.reduce((s, i) => s + i.qty_sold, 0);
  const totalOurAmount = items.reduce((sum, i) => sum + i.qty_sold * i.selling_price, 0);
  const hasItems = items.length > 0;

  // ─── Actions ──────────────────────────────────────

  const handleSave = async () => {
    if (items.length === 0) { showToast('กรุณาเพิ่มสินค้า', 'error'); return; }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/consignment/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_items',
          notes,
          items: items.map(i => ({
            variation_id: i.variation_id ?? i.product_id,
            qty_sold: i.qty_sold,
            qty_returned: 0,
            unit_price: i.selling_price,
            gp_rate: i.gp_rate,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showToast('บันทึกรายงานสำเร็จ', 'success');
      fetchReport();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (action: string, successMsg: string) => {
    setActionLoading(action);
    try {
      const res = await apiFetch(`/api/consignment/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      const data = await res.json();
      // Show auto-created statement number in toast
      if (action === 'confirm' && data.statement_number) {
        showToast(`ยืนยันรายงานแล้ว + สร้างใบวางบิล ${data.statement_number}`, 'success');
      } else {
        showToast(successMsg, 'success');
      }
      fetchReport();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleCreateStatement = async () => {
    if (!report?.customer?.id) return;
    setActionLoading('create_statement');
    try {
      const res = await apiFetch('/api/statements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: report.customer.id,
          report_ids: [report.id],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`สร้างใบวางบิล ${data.statement_number} แล้ว`, 'success');
        fetchReport();
      } else {
        const err = await res.json();
        showToast(err.error || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleCopyLink = () => {
    if (!report?.report_token || !report?.customer?.id) return;
    const url = `${window.location.origin}/portal/consignment/${report.customer.id}?report=${report.report_token}`;
    navigator.clipboard.writeText(url).then(() => showToast('คัดลอกลิงก์แล้ว', 'success'));
  };

  const handlePrintReport = async () => {
    if (!report) return;
    try {
      const { generateConsignmentReportPdf } = await import('@/lib/consignment-report-pdf');
      const blob = await generateConsignmentReportPdf({
        report_number: report.report_number,
        period_year: report.period_year,
        period_month: report.period_month,
        status: report.status,
        created_at: report.created_at,
        due_date: report.due_date,
        notes: report.notes,
        customer: report.customer ? {
          name: report.customer.name,
          customer_code: report.customer.customer_code,
          phone: report.customer.phone,
          tax_company_name: report.customer.tax_company_name,
          tax_id: report.customer.tax_id,
          tax_branch: report.customer.tax_branch,
          billing_address: [report.customer.billing_address, report.customer.billing_district, report.customer.billing_amphoe, report.customer.billing_province, report.customer.billing_postal_code].filter(Boolean).join(', ') || null,
        } : null,
        items: items.map(i => {
          // selling_price = net price (หลังหัก GP แล้ว)
          return {
            product_name: i.product_name,
            variation_label: i.variation_label,
            sku: i.sku,
            qty_sold: i.qty_sold,
            unit_price: i.selling_price,
            gp_rate: i.gp_rate,
            our_amount: i.qty_sold * i.selling_price,
          };
        }),
        total_qty_sold: totalQty,
        total_sales: totalOurAmount,
        total_gp_share: 0,
        our_amount: totalOurAmount,
      });
      showPdfPreview(blob, `ใบแจ้งหนี้ ${report.report_number}`);
    } catch {
      showToast('ไม่สามารถสร้าง PDF ได้', 'error');
    }
  };

  const handlePrintStatement = async () => {
    if (!report?.statement_id) return;
    try {
      const res = await apiFetch(`/api/statements/${report.statement_id}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const st = data.statement;
      const stReports = data.reports || [];
      const THAI_MONTHS_FULL = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const { generateStatementPdf } = await import('@/lib/statement-pdf');
      const blob = await generateStatementPdf({
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
        reports: stReports.map((r: { report_number: string; period_month: number; period_year: number; total_qty_sold: number; our_amount: number }) => ({
          report_number: r.report_number,
          period_label: `${THAI_MONTHS_FULL[r.period_month]} ${r.period_year + 543}`,
          total_qty_sold: r.total_qty_sold,
          our_amount: r.our_amount,
        })),
      });
      showPdfPreview(blob, `ใบวางบิล ${st.statement_number}`);
    } catch {
      showToast('ไม่สามารถสร้าง PDF ได้', 'error');
    }
  };

  // ─── Loading / Error states ──────────────────────────

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!report) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-slate-400 mb-4">ไม่พบรายงาน</p>
          <Link href="/consignment/reports" className="text-[#F4511E] hover:underline">
            กลับไปหน้ารายการ
          </Link>
        </div>
      </Layout>
    );
  }

  const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft;
  const customer = report.customer;

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link
              href="/consignment/reports"
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-500" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-[#F4511E]" />
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{report.report_number}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color} ${cfg.bg}`}>
                  {cfg.label}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                งวด {formatPeriod(report.period_year, report.period_month)} · สร้างเมื่อ {formatDate(report.created_at)}
                {report.confirmed_at && ` · ยืนยันเมื่อ ${formatDate(report.confirmed_at)}`}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Print buttons — show after invoiced */}
            {!['draft', 'received'].includes(report.status) && report.status !== 'cancelled' && (
              <button
                onClick={handlePrintReport}
                className="border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 text-sm"
              >
                <Printer className="w-4 h-4" />
                พิมพ์ใบแจ้งหนี้
              </button>
            )}
            {report.statement_id && (
              <button
                onClick={handlePrintStatement}
                className="border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 text-sm"
              >
                <Printer className="w-4 h-4" />
                พิมพ์ใบวางบิล
              </button>
            )}
            {report.statement_id && (
              <Link
                href={`/statements/${report.statement_id}`}
                className="border border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 px-3 py-2 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors flex items-center gap-1.5 text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                ดูใบวางบิล
              </Link>
            )}

            {report.status === 'draft' && report.report_token && (
              <button
                onClick={handleCopyLink}
                className="border border-amber-400 text-amber-700 dark:text-amber-400 px-3 py-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center gap-1.5 text-sm"
              >
                <Copy className="w-4 h-4" />
                ส่งลิงก์
              </button>
            )}

            {report.status === 'draft' && (
              <button
                onClick={() => handleAction('cancel', 'ยกเลิกรายงานแล้ว')}
                disabled={actionLoading === 'cancel'}
                className="border border-red-300 text-red-600 dark:text-red-400 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center gap-1.5 text-sm disabled:opacity-50"
              >
                {actionLoading === 'cancel' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                ยกเลิก
              </button>
            )}

            {report.status === 'received' && (
              <button
                onClick={() => handleAction('confirm', 'ยืนยันรายงานแล้ว + หักสต๊อก')}
                disabled={actionLoading === 'confirm'}
                className="bg-green-600 text-white px-3 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 text-sm disabled:opacity-50"
              >
                {actionLoading === 'confirm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <BadgeCheck className="w-4 h-4" />}
                ยืนยัน
              </button>
            )}

            {report.status === 'invoiced' && !report.statement_id && (
              <button
                onClick={handleCreateStatement}
                disabled={actionLoading === 'create_statement'}
                className="bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 text-sm disabled:opacity-50"
              >
                {actionLoading === 'create_statement' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                สร้างใบวางบิล
              </button>
            )}

            {isEditable && (
              <button
                onClick={handleSave}
                disabled={submitting || items.length === 0}
                className="btn-primary"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                บันทึก
              </button>
            )}
          </div>
        </div>

        {/* Customer Info (read-only) */}
        {customer && (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <div className="flex gap-3 items-stretch">
              <div className="flex-1 min-w-0 flex items-start gap-2 px-3 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-[#F4511E]/30 rounded-lg">
                <CheckCircle className="w-4 h-4 text-[#F4511E] flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0 space-y-0.5 text-sm">
                  <div className="text-gray-900 dark:text-white font-medium text-base">{customer.name}</div>
                  {(() => {
                    const addressParts = [customer.billing_address, customer.billing_district, customer.billing_amphoe, customer.billing_province, customer.billing_postal_code].filter(Boolean);
                    if (addressParts.length === 0) return null;
                    const addressLabel = 'ที่อยู่ออกบิล';
                    return (
                      <div className="text-gray-500 dark:text-slate-400 flex items-start gap-1 pt-0.5">
                        <MapPin className="w-3 h-3 flex-shrink-0 mt-0.5" />
                        <span>
                          <span className="text-gray-600 dark:text-slate-300 font-medium">{addressLabel}: </span>
                          {addressParts.join(', ')}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
              {(() => {
                const mode = customer.consignment_mode || 'dn';
                const modeIsDN = mode === 'dn';
                const modeLabel = modeIsDN ? 'ใบส่งสินค้า (DN)' : 'ใบแจ้งหนี้ (Invoice)';
                const modeColor = modeIsDN ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' : 'text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800';
                return (
                  <div className={`flex-shrink-0 flex flex-col items-center justify-center px-4 py-2.5 rounded-lg border ${modeColor}`}>
                    {modeIsDN ? <FileText className="w-6 h-6 mb-1" /> : <Receipt className="w-6 h-6 mb-1" />}
                    <span className="text-xs font-bold whitespace-nowrap">{modeLabel}</span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Report Info (due date, etc.) */}
        {report.due_date && (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
            <AlertCircle className="w-4 h-4" />
            ครบกำหนดชำระ: <span className="font-medium text-gray-700 dark:text-slate-300">{formatDate(report.due_date)}</span>
          </div>
        )}

        {/* 2-Column Layout */}
        <div className="flex flex-wrap gap-4 items-start">
          {/* Left Column — Items */}
          <div className="flex-1 basis-[400px] min-w-0 space-y-4">
            <ItemsTable
              items={items.map((i): TableItem => ({
                variation_id: i.variation_id ?? i.product_id,
                product_id: i.product_id,
                product_name: i.product_name,
                variation_label: i.variation_label,
                sku: i.sku,
                image: i.image,
                quantity: i.qty_sold,
                unit_price: i.selling_price,
                gpInfo: isEditable ? gpInfoText(i) : null,
                stock_dest: isEditable ? (dealerStockMap[i.variation_id ?? i.product_id] ?? 0) : undefined,
              }))}
              columns={isEditable ? ['stock_dest', 'qty', 'unit_price', 'total'] : ['qty', 'unit_price', 'total']}
              stockMap={isEditable ? dealerStockMap : undefined}
              showStockInSearch={isEditable}
              disableOutOfStock={isEditable}
              products={isEditable ? availableProducts : undefined}
              loadingProducts={isEditable ? loadingProducts : false}
              inputRef={searchInputRef}
              onAdd={isEditable && gpContext ? handleAddProduct : undefined}
              searchDisabledMessage={isEditable && loadingGpData ? 'กำลังโหลดข้อมูลราคา...' : undefined}
              onUpdateField={isEditable ? (idx, field, value) => {
                if (field === 'quantity') updateItem(idx, 'qty_sold', value as number);
                if (field === 'unit_price') updateItem(idx, 'selling_price', value as number);
              } : undefined}
              onRemove={isEditable ? removeItem : undefined}
              showSummary={false}
              emptyMessage={isEditable ? 'เพิ่มสินค้าที่ขายได้ในงวดนี้' : 'ไม่มีรายการสินค้า'}
            />

            {/* Notes */}
            {(hasItems || notes) && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
                <div>
                  <label className="block text-base font-medium text-gray-700 dark:text-slate-300 mb-1">
                    หมายเหตุ
                  </label>
                  {isEditable ? (
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={3}
                      placeholder="หมายเหตุเพิ่มเติม..."
                      className="w-full px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#F4511E] text-base"
                    />
                  ) : (
                    <p className="text-base text-gray-600 dark:text-slate-400">{notes || '-'}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Column — Summary */}
          {hasItems && (
            <div className="w-full sm:w-[300px] flex-shrink-0 sm:sticky sm:top-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4">
                  <h3 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-3">สรุปยอดขาย</h3>
                  <div className="space-y-2 text-base">
                    <div className="flex justify-between text-gray-500 dark:text-slate-400">
                      <span>จำนวนรายการ</span>
                      <span>{items.length} รายการ</span>
                    </div>
                    <div className="flex justify-between text-gray-500 dark:text-slate-400">
                      <span>จำนวนชิ้น</span>
                      <span>{totalQty} ชิ้น</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-200 dark:border-slate-600 text-gray-900 dark:text-slate-100">
                      <span>ยอดที่ต้องชำระ</span>
                      <span className="text-[#F4511E]">฿{formatNumber(totalOurAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default function EditConsignmentReportPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    }>
      <EditReportContent />
    </Suspense>
  );
}

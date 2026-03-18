'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { formatPrice } from '@/lib/utils/format';
import {
  ArrowLeft, Loader2, FileText, CreditCard,
  CheckCircle2, AlertCircle, Clock, Receipt, Printer,
} from 'lucide-react';
import { showPdfPreview } from '@/lib/print-pdf';
import { generateStatementPdf } from '@/lib/statement-pdf';

interface StatementDetail {
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
  tax_invoice_date: string | null;
  receipt_number: string | null;
  receipt_date: string | null;
  notes: string | null;
  customer: {
    id: string; name: string; customer_code: string | null; phone: string | null;
    tax_company_name: string | null; tax_id: string | null; tax_branch: string | null;
    billing_address: string | null;
    billing_district: string | null;
    billing_amphoe: string | null;
    billing_province: string | null;
    billing_postal_code: string | null;
  } | null;
}

interface ConsignmentReport {
  id: string;
  report_number: string;
  period_year: number;
  period_month: number;
  total_qty_sold: number;
  our_amount: number;
  status: string;
  items: {
    id: string;
    variation_id: string;
    qty_sold: number;
    unit_price: number;
    gp_rate: number;
    our_amount: number;
    variation: { id: string; sku: string; label: string; product_id: string; products: { name: string } } | null;
  }[];
}

interface Payment {
  id: string;
  amount: number;
  paid_at: string;
  payment_method: string | null;
  reference: string | null;
  notes: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:          { label: 'แบบร่าง',     color: 'text-gray-600',   bg: 'bg-gray-100' },
  sent:           { label: 'รอชำระ',      color: 'text-blue-700',   bg: 'bg-blue-100' },
  partially_paid: { label: 'ชำระบางส่วน', color: 'text-amber-700',  bg: 'bg-amber-100' },
  paid:           { label: 'ชำระแล้ว',    color: 'text-green-700',  bg: 'bg-green-100' },
  overdue:        { label: 'เกินกำหนด',   color: 'text-red-700',    bg: 'bg-red-100' },
};

const THAI_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const formatPeriod = (year: number, month: number) =>
  `${THAI_MONTHS[month]} ${year + 543}`;

const formatDate = (d: string | null) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function StatementDetailPage() {
  const router = useRouter();
  const params = useParams();
  const stId = params.id as string;
  const { showToast } = useToast();

  const [statement, setStatement] = useState<StatementDetail | null>(null);
  const [reports, setReports] = useState<ConsignmentReport[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  // Payment modal
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [payReceiptDate, setPayReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [paySubmitting, setPaySubmitting] = useState(false);

  // Issue invoices
  const [issuingInvoices, setIssuingInvoices] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/statements/${stId}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStatement(data.statement);
      setReports(data.reports || []);
      setPayments(data.payments || []);
    } catch {
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [stId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const handleRecordPayment = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      showToast('กรุณาระบุจำนวนเงิน', 'error');
      return;
    }
    setPaySubmitting(true);
    try {
      const res = await apiFetch(`/api/statements/${stId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'record_payment',
          amount,
          payment_method: payMethod || null,
          reference: payRef || null,
          notes: payNotes || null,
          receipt_date: payReceiptDate || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'เกิดข้อผิดพลาด', 'error');
        return;
      }
      const data = await res.json();
      // Show auto-issued receipt number in toast
      if (data.status === 'paid' && data.receipt_number) {
        showToast(`ชำระเงินครบ + ออกใบเสร็จ ${data.receipt_number}`, 'success');
      } else {
        showToast('บันทึกการชำระเงินแล้ว', 'success');
      }
      setShowPayModal(false);
      setPayAmount('');
      setPayMethod('');
      setPayRef('');
      setPayNotes('');
      setPayReceiptDate(new Date().toISOString().split('T')[0]);
      fetchDetail();
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setPaySubmitting(false);
    }
  };

  const handleIssueInvoices = async () => {
    setIssuingInvoices(true);
    try {
      const res = await apiFetch(`/api/statements/${stId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'issue_invoices' }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'เกิดข้อผิดพลาด', 'error');
        return;
      }
      const data = await res.json();
      showToast(`ออกเอกสารแล้ว: ${data.tax_invoice_number || ''} ${data.receipt_number || ''}`, 'success');
      fetchDetail();
    } catch {
      showToast('เกิดข้อผิดพลาด', 'error');
    } finally {
      setIssuingInvoices(false);
    }
  };

  const handlePrint = async () => {
    if (!statement) return;
    try {
      const blob = await generateStatementPdf({
        statement_number: statement.statement_number,
        statement_date: statement.statement_date,
        due_date: statement.due_date,
        period_year: statement.period_year,
        period_month: statement.period_month,
        status: statement.status,
        total_amount: statement.total_amount,
        paid_amount: statement.paid_amount,
        outstanding_amount: statement.outstanding_amount,
        tax_invoice_number: statement.tax_invoice_number,
        receipt_number: statement.receipt_number,
        notes: statement.notes,
        customer: statement.customer ? {
          ...statement.customer,
          billing_address: [statement.customer.billing_address, statement.customer.billing_district, statement.customer.billing_amphoe, statement.customer.billing_province, statement.customer.billing_postal_code].filter(Boolean).join(', ') || null,
        } : null,
        reports: reports.map(r => ({
          report_number: r.report_number,
          period_label: `${THAI_MONTHS[r.period_month]} ${r.period_year + 543}`,
          total_qty_sold: r.total_qty_sold,
          our_amount: r.our_amount,
        })),
      });
      showPdfPreview(blob, 'ใบวางบิล');
    } catch {
      showToast('ไม่สามารถสร้าง PDF ได้', 'error');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!statement) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-slate-400 mb-4">ไม่พบใบวางบิล</p>
          <button onClick={() => router.push('/statements')} className="text-indigo-500 hover:underline">
            กลับไปหน้ารายการ
          </button>
        </div>
      </Layout>
    );
  }

  const cfg = STATUS_CONFIG[statement.status] || STATUS_CONFIG.draft;
  const canRecordPayment = ['sent', 'partially_paid', 'overdue'].includes(statement.status);
  const canIssueInvoices = statement.status === 'paid' && !statement.tax_invoice_number && !statement.receipt_number;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/statements')}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600 dark:text-slate-300" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{statement.statement_number}</h1>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color} ${cfg.bg}`}>
                  {cfg.label}
                </span>
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                งวด {formatPeriod(statement.period_year, statement.period_month)} · ออกเมื่อ {formatDate(statement.statement_date)}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 text-sm"
            >
              <Printer className="w-4 h-4" />
              พิมพ์ใบวางบิล
            </button>
            {canRecordPayment && (
              <button
                onClick={() => {
                  setPayAmount(String(statement.outstanding_amount));
                  setShowPayModal(true);
                }}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-1.5 text-sm"
              >
                <CreditCard className="w-4 h-4" />
                บันทึกการชำระเงิน
              </button>
            )}
            {canIssueInvoices && (
              <button
                onClick={handleIssueInvoices}
                disabled={issuingInvoices}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-1.5 text-sm disabled:opacity-50"
              >
                {issuingInvoices ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                ออกใบกำกับภาษี + ใบเสร็จ
              </button>
            )}
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Statement info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
            <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">ข้อมูลใบวางบิล</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">เลขที่</span>
                <span className="font-mono font-medium text-gray-900 dark:text-white">{statement.statement_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">วันที่ออก</span>
                <span className="text-gray-900 dark:text-white">{formatDate(statement.statement_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">วันครบกำหนด</span>
                <span className={`flex items-center gap-1 ${statement.due_date && new Date(statement.due_date) < new Date() && statement.status !== 'paid' ? 'text-red-600 font-medium' : 'text-gray-900 dark:text-white'}`}>
                  {statement.due_date && new Date(statement.due_date) < new Date() && statement.status !== 'paid' && <AlertCircle className="w-3.5 h-3.5" />}
                  {formatDate(statement.due_date)}
                </span>
              </div>
              {statement.tax_invoice_number && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">ใบกำกับภาษี</span>
                  <span className="font-mono text-green-600 dark:text-green-400">{statement.tax_invoice_number}</span>
                </div>
              )}
              {statement.receipt_number && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">ใบเสร็จ</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400">{statement.receipt_number}</span>
                </div>
              )}
            </div>
          </div>

          {/* Customer info */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5 space-y-3">
            <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">ตัวแทนจำหน่าย</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-slate-400">ชื่อ</span>
                <span className="text-gray-900 dark:text-white font-medium">{statement.customer?.name || '-'}</span>
              </div>
              {statement.customer?.customer_code && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">รหัส</span>
                  <span className="text-gray-900 dark:text-white">{statement.customer.customer_code}</span>
                </div>
              )}
              {statement.customer?.phone && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">เบอร์โทร</span>
                  <span className="text-gray-900 dark:text-white">{statement.customer.phone}</span>
                </div>
              )}
              {statement.customer?.tax_company_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">ชื่อกิจการ</span>
                  <span className="text-gray-900 dark:text-white">{statement.customer.tax_company_name}</span>
                </div>
              )}
              {statement.customer?.tax_id && (
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-slate-400">เลขผู้เสียภาษี</span>
                  <span className="font-mono text-gray-900 dark:text-white">{statement.customer.tax_id}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Amount summary */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="max-w-xs ml-auto space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-slate-400">ยอดรวม</span>
              <span className="text-gray-900 dark:text-white font-medium">฿{formatPrice(statement.total_amount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-slate-400">ชำระแล้ว</span>
              <span className="text-green-600 dark:text-green-400">฿{formatPrice(statement.paid_amount)}</span>
            </div>
            <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between text-base font-bold">
              <span className="text-gray-900 dark:text-white">คงเหลือ</span>
              <span className={statement.outstanding_amount > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}>
                ฿{formatPrice(statement.outstanding_amount)}
              </span>
            </div>
          </div>
        </div>

        {/* Linked reports */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700">
            <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">รายงานฝากขาย ({reports.length} รายงาน)</div>
          </div>
          {reports.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">ไม่มีรายงานที่เชื่อมโยง</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {reports.map(report => (
                <div key={report.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">{report.report_number}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        {formatPeriod(report.period_year, report.period_month)} · {report.total_qty_sold} ชิ้น
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">฿{formatPrice(report.our_amount)}</span>
                  </div>
                  {report.items && report.items.length > 0 && (
                    <div className="ml-4 space-y-1">
                      {report.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400">
                          <span>
                            {item.variation?.products?.name || '-'}
                            {item.variation?.label && ` (${item.variation.label})`}
                          </span>
                          <span>{item.qty_sold} x ฿{formatPrice(item.unit_price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Payments history */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 dark:border-slate-700">
            <div className="text-sm font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">ประวัติการชำระเงิน ({payments.length} รายการ)</div>
          </div>
          {payments.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">ยังไม่มีการชำระเงิน</div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {payments.map(payment => (
                <div key={payment.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium text-green-600 dark:text-green-400">฿{formatPrice(payment.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      {new Date(payment.paid_at).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {payment.payment_method && <span>· {payment.payment_method}</span>}
                      {payment.reference && <span>· Ref: {payment.reference}</span>}
                    </div>
                    {payment.notes && <div className="text-xs text-gray-400 mt-0.5">{payment.notes}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payment modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-md mx-4 space-y-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">บันทึกการชำระเงิน</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">จำนวนเงิน (บาท) *</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/50"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">วันที่รับเงิน *</label>
                <input
                  type="date"
                  value={payReceiptDate}
                  onChange={e => setPayReceiptDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/50"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">ช่องทาง</label>
              <input
                type="text"
                value={payMethod}
                onChange={e => setPayMethod(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/50"
                placeholder="เช่น โอนธนาคาร, เช็ค"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">อ้างอิง</label>
              <input
                type="text"
                value={payRef}
                onChange={e => setPayRef(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/50"
                placeholder="เลขอ้างอิง, เลขเช็ค"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">หมายเหตุ</label>
              <input
                type="text"
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500/50"
                placeholder="หมายเหตุเพิ่มเติม"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowPayModal(false)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={paySubmitting}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {paySubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

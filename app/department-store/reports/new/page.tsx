'use client';

import { Suspense, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { ArrowLeft, Building2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';
import { apiFetch } from '@/lib/api-client';
import { showPdfPreview, mergePdfBlobs } from '@/lib/print-pdf';

function NewDeptStoreReportContent() {
  // Auto print ใบแจ้งหนี้ + ใบวางบิล after successful submit
  const handleSubmitSuccess = useCallback(async (data: any) => {
    if (!data.report_id || !data.statement_id) return;

    try {
      const [reportRes, stRes] = await Promise.all([
        apiFetch(`/api/department-store/reports/${data.report_id}`),
        apiFetch(`/api/statements/${data.statement_id}`),
      ]);
      if (!reportRes.ok || !stRes.ok) return;

      const reportData = await reportRes.json();
      const stData = await stRes.json();
      const r = reportData.report;
      const st = stData.statement;
      const stReports = stData.reports || [];

      const { generateDepartmentStoreReportPdf } = await import('@/lib/department-store-report-pdf');
      const invoiceBlob = await generateDepartmentStoreReportPdf({
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

      const THAI_MONTHS_FULL = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
      const { generateStatementPdf } = await import('@/lib/statement-pdf');
      const statementBlob = await generateStatementPdf({
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
        reports: stReports.map((sr: any) => ({
          report_number: sr.report_number,
          period_label: `${THAI_MONTHS_FULL[sr.period_month]} ${sr.period_year + 543}`,
          total_qty_sold: sr.total_qty_sold,
          our_amount: sr.our_amount,
        })),
      });

      const merged = await mergePdfBlobs([invoiceBlob, statementBlob]);
      showPdfPreview(merged, `ใบแจ้งหนี้ + ใบวางบิล ${data.report_number}`);
    } catch (printErr) {
      console.error('Auto print error:', printErr);
    }
  }, []);

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/department-store/reports" className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-[#F4511E]" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">คีย์ยอดห้าง</h1>
          </div>
        </div>

        <DealerOrderForm
          mode="dept_consignment"
          customerTypeFilter="department_store"
          customerLabel="ห้าง"
          submitLabel="บันทึกรายงาน"
          summaryTitle="สรุปยอดขาย"
          showWarehousePicker
          backUrl="/department-store/reports"
          onSubmitSuccess={handleSubmitSuccess}
        />
      </div>
    </Layout>
  );
}

export default function NewDeptStoreReportPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    }>
      <NewDeptStoreReportContent />
    </Suspense>
  );
}

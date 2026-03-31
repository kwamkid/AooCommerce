/**
 * Statement (ใบวางบิล) PDF generation.
 * FlowAccount-style template matching credit-note-pdf.ts design.
 *
 * Color: indigo #4f46e5
 * Title: ใบวางบิล
 */

import {
  fetchCompanyInfo,
  setupPdfMake,
  loadLogoDataUrl,
  formatPdfDate,
  formatPdfPrice,
  buildCompanyStack,
  buildCornerTriangle,
  buildSignatureFooter,
  withOriginalAndCopy,
} from './pdf-utils';

// ─── Interfaces ──────────────────────────────────────────

interface StatementReportData {
  report_number: string;
  doc_number?: string | null;
  period_label: string;
  total_qty_sold: number;
  our_amount: number;
}

export interface StatementPdfData {
  statement_number: string;
  statement_date: string;
  due_date: string | null;
  period_year: number;
  period_month: number;
  status: string;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  tax_invoice_number: string | null;
  invoice_number?: string | null;
  receipt_number: string | null;
  notes: string | null;
  customer: {
    name: string;
    customer_code?: string | null;
    phone?: string | null;
    tax_company_name?: string | null;
    tax_id?: string | null;
    tax_branch?: string | null;
    billing_address?: string | null;
  } | null;
  reports: StatementReportData[];
}

// ─── Theme ──────────────────────────────────────────────

const THEME = { primary: '#4f46e5' };

const THAI_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const STATUS_LABELS: Record<string, string> = {
  draft: 'แบบร่าง',
  sent: 'รอชำระ',
  partially_paid: 'ชำระบางส่วน',
  paid: 'ชำระแล้ว',
  overdue: 'เกินกำหนด',
};

// ─── Main Export ─────────────────────────────────────────

export async function generateStatementPdf(data: StatementPdfData): Promise<Blob> {
  const company = await fetchCompanyInfo() || undefined;
  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  const dateStr = formatPdfDate(data.statement_date);
  const periodStr = `${THAI_MONTHS[data.period_month]} ${data.period_year + 543}`;
  const statusLabel = STATUS_LABELS[data.status] || data.status;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ═══════════════════════════════════════════════════
  // Section 1 — Header
  // ═══════════════════════════════════════════════════

  const companyStack = buildCompanyStack(company, logoDataUrl, data.customer, THEME.primary);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [
    [
      { text: 'เลขที่', fontSize: 10, color: THEME.primary, bold: true },
      { text: data.statement_number, fontSize: 10, bold: true },
    ],
    [
      { text: 'วันที่', fontSize: 10, color: THEME.primary, bold: true },
      { text: dateStr, fontSize: 10 },
    ],
    [
      { text: 'งวด', fontSize: 10, color: THEME.primary, bold: true },
      { text: periodStr, fontSize: 10 },
    ],
  ];

  if (data.due_date) {
    infoBoxRows.push([
      { text: 'ครบกำหนด', fontSize: 10, color: THEME.primary, bold: true },
      { text: formatPdfDate(data.due_date), fontSize: 10 },
    ]);
  }

  content.push({
    columnGap: 16,
    columns: [
      {
        width: '*',
        stack: companyStack.length > 0 ? companyStack : [{ text: '' }],
      },
      {
        width: 230,
        stack: [
          { text: 'ใบวางบิล', fontSize: 24, bold: true, color: THEME.primary, alignment: 'right', margin: [0, 0, 0, 6] },
          {
            table: {
              widths: [55, '*'],
              body: infoBoxRows,
            },
            layout: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0.5 : 0,
              vLineWidth: () => 0,
              hLineColor: () => '#cccccc',
              paddingTop: (i: number) => i === 0 ? 6 : 2,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              paddingBottom: (i: number, node: any) => i === node.table.body.length - 1 ? 6 : 2,
              paddingLeft: () => 4,
              paddingRight: () => 4,
            },
          },
        ],
      },
    ],
    margin: [0, 0, 0, 12],
  });

  // ═══════════════════════════════════════════════════
  // Section 3 — Reports table
  // ═══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCols: any[] = [
    { text: '#', style: 'tableHeader', alignment: 'center' },
    { text: 'เลขที่ใบแจ้งหนี้', style: 'tableHeader' },
    { text: 'งวด', style: 'tableHeader', alignment: 'center' },
    { text: 'ยอดเงิน', style: 'tableHeader', alignment: 'right' },
  ];
  const widths: (number | string)[] = [25, '*', 80, 80];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableBody: any[][] = [headerCols];

  data.reports.forEach((report, idx) => {
    tableBody.push([
      { text: String(idx + 1), alignment: 'center', fontSize: 10, color: '#666666' },
      { text: report.doc_number || report.report_number, fontSize: 10, color: '#333333' },
      { text: report.period_label, alignment: 'center', fontSize: 10, color: '#666666' },
      { text: formatPdfPrice(report.our_amount), alignment: 'right', fontSize: 10, bold: true },
    ]);
  });

  content.push({
    table: {
      headerRows: 1,
      widths,
      body: tableBody,
    },
    layout: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hLineWidth: (i: number, node: any) => (i <= 1 || i === node.table.body.length) ? 1 : 0.5,
      vLineWidth: () => 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hLineColor: (i: number, node: any) => (i <= 1 || i === node.table.body.length) ? '#333333' : '#e5e7eb',
      paddingTop: () => 5,
      paddingBottom: () => 5,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    margin: [0, 0, 0, 12],
  });

  // ═══════════════════════════════════════════════════
  // Section 4 — Summary
  // ═══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryRows: any[][] = [
    [
      { text: 'จำนวนรายงาน', fontSize: 10, alignment: 'right', color: '#666666' },
      { text: `${data.reports.length} รายงาน`, fontSize: 10, alignment: 'right' },
    ],
    [
      { text: 'รวมเป็นเงิน', fontSize: 12, alignment: 'right', bold: true, color: THEME.primary },
      { text: `฿${formatPdfPrice(data.total_amount)}`, fontSize: 12, alignment: 'right', bold: true, color: THEME.primary },
    ],
  ];

  // Notes on left, summary on right
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leftContent: any[] = [];
  if (data.notes) {
    leftContent.push(
      { text: 'หมายเหตุ', fontSize: 10, bold: true, color: '#666666', margin: [0, 0, 0, 2] },
      { text: data.notes, fontSize: 10, color: '#555555' },
    );
  }

  content.push({
    columns: [
      { width: '*', stack: leftContent.length > 0 ? leftContent : [{ text: '' }] },
      {
        width: 260,
        table: {
          widths: ['*', 100],
          body: summaryRows,
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingTop: () => 2,
          paddingBottom: () => 2,
          paddingLeft: () => 4,
          paddingRight: () => 4,
        },
      },
    ],
    margin: [0, 0, 0, 0],
  });

  // ═══════════════════════════════════════════════════
  // Document definition
  // ═══════════════════════════════════════════════════

  const companyName = company?.tax_company_name || company?.name || '';

  const docDefinition = {
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 110] as [number, number, number, number],
    defaultStyle: {
      font: 'IBMPlexSansThai',
      fontSize: 10,
    },
    styles: {
      tableHeader: {
        fontSize: 10,
        bold: true,
        color: '#333333',
      },
    },
    content: withOriginalAndCopy(content),
    background: buildCornerTriangle(THEME.primary),
    footer: buildSignatureFooter(companyName, 'ผู้วางบิล', 'ผู้รับวางบิล'),
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

/**
 * Consignment Invoice (ใบแจ้งหนี้) PDF generation.
 * FlowAccount-style template matching statement-pdf.ts design.
 *
 * Color: orange #F4511E
 * Title: ใบแจ้งหนี้
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
  buildProductNameStack,
  withOriginalAndCopy,
} from './pdf-utils';

// ─── Interfaces ──────────────────────────────────────────

export interface ConsignmentReportPdfItem {
  product_name: string;
  variation_label: string | null;
  sku: string | null;
  qty_sold: number;
  unit_price: number;
  gp_rate: number;
  our_amount: number;
}

export interface ConsignmentReportPdfData {
  report_number: string;
  period_year: number;
  period_month: number;
  status: string;
  created_at: string;
  due_date: string | null;
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
  items: ConsignmentReportPdfItem[];
  total_qty_sold: number;
  total_sales: number;
  total_gp_share: number;
  our_amount: number;
  /** When set, renders as ใบกำกับภาษี/ใบเสร็จ instead of ใบแจ้งหนี้ */
  tax_invoice_number?: string | null;
  receipt_number?: string | null;
  tax_invoice_date?: string | null;
  receipt_date?: string | null;
  /** Company VAT registered at time of issue */
  vat_registered?: boolean;
  /** Voided document */
  voided_at?: string | null;
}

// ─── Theme ──────────────────────────────────────────────

const THEME = { primary: '#F4511E' };

const THAI_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const STATUS_LABELS: Record<string, string> = {
  draft: 'รอรายงาน',
  received: 'รับแล้ว',
  invoiced: 'ออก invoice',
  billed: 'วางบิลแล้ว',
  paid: 'ชำระแล้ว',
  overdue: 'เกินกำหนด',
  cancelled: 'ยกเลิก',
};

// ─── Main Export ─────────────────────────────────────────

export async function generateConsignmentReportPdf(data: ConsignmentReportPdfData): Promise<Blob> {
  const company = await fetchCompanyInfo() || undefined;
  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  const dateStr = formatPdfDate(data.created_at);
  const periodStr = `${THAI_MONTHS[data.period_month]} ${data.period_year + 543}`;
  const statusLabel = STATUS_LABELS[data.status] || data.status;

  // Determine document mode: tax invoice/receipt vs regular invoice
  const isTaxInvoiceMode = !!(data.tax_invoice_number || data.receipt_number);
  const vatRegistered = data.vat_registered ?? false;

  let docTitle: string;
  let docTheme: string;
  if (isTaxInvoiceMode) {
    docTitle = vatRegistered ? 'ใบกำกับภาษี/ใบเสร็จรับเงิน' : 'ใบเสร็จรับเงิน';
    docTheme = '#15803d'; // green for paid
  } else {
    docTitle = 'ใบแจ้งหนี้';
    docTheme = THEME.primary; // orange
  }
  const titleFontSize = docTitle.length > 14 ? 18 : 24;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ═══════════════════════════════════════════════════
  // Section 1 — Header
  // ═══════════════════════════════════════════════════

  const companyStack = buildCompanyStack(company, logoDataUrl, data.customer, THEME.primary);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [];

  if (isTaxInvoiceMode) {
    // Tax invoice / receipt mode — show document numbers
    if (data.tax_invoice_number) {
      infoBoxRows.push([
        { text: 'เลขที่', fontSize: 10, color: docTheme, bold: true },
        { text: data.tax_invoice_number, fontSize: 10, bold: true },
      ]);
      if (data.tax_invoice_date) {
        infoBoxRows.push([
          { text: 'วันที่ออก', fontSize: 10, color: docTheme, bold: true },
          { text: formatPdfDate(data.tax_invoice_date), fontSize: 10 },
        ]);
      }
    }
    if (data.receipt_number && data.receipt_number !== data.tax_invoice_number) {
      infoBoxRows.push([
        { text: 'เลขใบเสร็จ', fontSize: 10, color: docTheme, bold: true },
        { text: data.receipt_number, fontSize: 10, bold: true },
      ]);
    }
    infoBoxRows.push([
      { text: 'อ้างอิง', fontSize: 10, color: docTheme, bold: true },
      { text: data.report_number, fontSize: 10 },
    ]);
    infoBoxRows.push([
      { text: 'งวด', fontSize: 10, color: docTheme, bold: true },
      { text: periodStr, fontSize: 10 },
    ]);
  } else {
    // Regular invoice mode
    infoBoxRows.push(
      [
        { text: 'เลขที่', fontSize: 10, color: docTheme, bold: true },
        { text: data.report_number, fontSize: 10, bold: true },
      ],
      [
        { text: 'วันที่', fontSize: 10, color: docTheme, bold: true },
        { text: dateStr, fontSize: 10 },
      ],
      [
        { text: 'งวด', fontSize: 10, color: docTheme, bold: true },
        { text: periodStr, fontSize: 10 },
      ],
      [
        { text: 'สถานะ', fontSize: 10, color: docTheme, bold: true },
        { text: statusLabel, fontSize: 10, bold: true },
      ],
    );

    if (data.due_date) {
      infoBoxRows.push([
        { text: 'ครบกำหนด', fontSize: 10, color: docTheme, bold: true },
        { text: formatPdfDate(data.due_date), fontSize: 10 },
      ]);
    }
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
          { text: docTitle, fontSize: titleFontSize, bold: true, color: docTheme, alignment: 'right', margin: [0, 0, 0, 6] },
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
  // Section 3 — Items table
  // ═══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCols: any[] = [
    { text: '#', style: 'tableHeader', alignment: 'center' },
    { text: 'รายละเอียดสินค้า', style: 'tableHeader' },
    { text: 'จำนวน', style: 'tableHeader', alignment: 'center' },
    { text: 'ราคา/หน่วย', style: 'tableHeader', alignment: 'right' },
    { text: 'รวม', style: 'tableHeader', alignment: 'right' },
  ];
  const widths: (number | string)[] = [25, '*', 50, 80, 80];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableBody: any[][] = [headerCols];

  data.items.forEach((item, idx) => {
    const nameStack = buildProductNameStack(item.product_name, item.variation_label, item.sku);

    tableBody.push([
      { text: String(idx + 1), alignment: 'center', fontSize: 10, color: '#666666' },
      { stack: nameStack },
      { text: String(item.qty_sold), alignment: 'center', fontSize: 10 },
      { text: formatPdfPrice(item.unit_price), alignment: 'right', fontSize: 10 },
      { text: formatPdfPrice(item.our_amount), alignment: 'right', fontSize: 10, bold: true },
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
      { text: 'จำนวนรายการ', fontSize: 10, alignment: 'right', color: '#666666' },
      { text: `${data.items.length} รายการ`, fontSize: 10, alignment: 'right' },
    ],
    [
      { text: 'จำนวนชิ้น', fontSize: 10, alignment: 'right', color: '#666666' },
      { text: `${data.total_qty_sold} ชิ้น`, fontSize: 10, alignment: 'right' },
    ],
  ];

  if (isTaxInvoiceMode && vatRegistered) {
    const totalWithVAT = data.our_amount;
    const subtotalExVAT = Math.round((totalWithVAT / 1.07) * 100) / 100;
    const vatAmt = totalWithVAT - subtotalExVAT;
    summaryRows.push(
      [
        { text: 'ยอดก่อน VAT', fontSize: 10, alignment: 'right', color: '#666666' },
        { text: `฿${formatPdfPrice(subtotalExVAT)}`, fontSize: 10, alignment: 'right' },
      ],
      [
        { text: 'VAT 7%', fontSize: 10, alignment: 'right', color: '#666666' },
        { text: `฿${formatPdfPrice(vatAmt)}`, fontSize: 10, alignment: 'right' },
      ],
    );
  }

  summaryRows.push([
    { text: 'รวมเป็นเงิน', fontSize: 12, alignment: 'right', bold: true, color: docTheme },
    { text: `฿${formatPdfPrice(data.our_amount)}`, fontSize: 12, alignment: 'right', bold: true, color: docTheme },
  ]);

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docDefinition: any = {
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
    background: buildCornerTriangle(docTheme),
    footer: buildSignatureFooter(companyName, isTaxInvoiceMode ? 'ผู้ออกเอกสาร' : 'ผู้ขาย', 'ตัวแทนจำหน่าย'),
  };

  if (data.voided_at) {
    docDefinition.watermark = { text: 'VOID', color: '#dc2626', opacity: 0.15, bold: true, fontSize: 120, angle: -45 };
  }

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

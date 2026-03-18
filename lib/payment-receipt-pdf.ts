/**
 * Payment Receipt (ใบเสร็จรับเงิน) PDF — standalone for Flow C/D payment
 * Color: green #15803d
 * Shows: receipt number, date, reference (TAX/INV number), customer, amount
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

export interface PaymentReceiptPdfData {
  receipt_number: string;
  receipt_date: string;
  reference_number: string | null;
  statement_number: string | null;
  customer: {
    name: string;
    customer_code?: string | null;
    phone?: string | null;
    tax_company_name?: string | null;
    tax_id?: string | null;
    tax_branch?: string | null;
    billing_address?: string | null;
  } | null;
  total_amount: number;
  payment_method?: string | null;
  notes?: string | null;
  voided_at?: string | null;
}

const THEME = '#15803d'; // green

export async function generatePaymentReceiptPdf(data: PaymentReceiptPdfData): Promise<Blob> {
  const company = await fetchCompanyInfo() || undefined;
  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  const docTitle = 'ใบเสร็จรับเงิน';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ═══ Section 1 — Header ═══
  const companyStack = buildCompanyStack(company, logoDataUrl, data.customer, THEME);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [
    [
      { text: 'เลขที่', fontSize: 10, color: THEME, bold: true },
      { text: data.receipt_number, fontSize: 10, bold: true },
    ],
    [
      { text: 'วันที่', fontSize: 10, color: THEME, bold: true },
      { text: formatPdfDate(data.receipt_date), fontSize: 10 },
    ],
  ];

  if (data.reference_number) {
    infoBoxRows.push([
      { text: 'อ้างอิง', fontSize: 10, color: THEME, bold: true },
      { text: data.reference_number, fontSize: 10 },
    ]);
  }

  if (data.statement_number) {
    infoBoxRows.push([
      { text: 'ใบวางบิล', fontSize: 10, color: THEME, bold: true },
      { text: data.statement_number, fontSize: 10 },
    ]);
  }

  if (data.payment_method) {
    infoBoxRows.push([
      { text: 'วิธีชำระ', fontSize: 10, color: THEME, bold: true },
      { text: data.payment_method, fontSize: 10 },
    ]);
  }

  content.push({
    columnGap: 16,
    columns: [
      { width: '*', stack: companyStack.length > 0 ? companyStack : [{ text: '' }] },
      {
        width: 230,
        stack: [
          { text: docTitle, fontSize: 24, bold: true, color: THEME, alignment: 'right', margin: [0, 0, 0, 6] },
          {
            table: { widths: [55, '*'], body: infoBoxRows },
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
  });

  content.push(buildCornerTriangle(THEME));

  // ═══ Section 2 — Amount ═══
  content.push({ text: '', margin: [0, 20, 0, 0] });

  content.push({
    table: {
      widths: ['*', 120],
      body: [
        [
          { text: 'รายการ', fontSize: 10, bold: true, color: THEME },
          { text: 'จำนวนเงิน (บาท)', fontSize: 10, bold: true, color: THEME, alignment: 'right' },
        ],
        [
          { text: 'ชำระเงินตามใบวางบิล' + (data.statement_number ? ` ${data.statement_number}` : '') + (data.reference_number ? `\nอ้างอิง ${data.reference_number}` : ''), fontSize: 10 },
          { text: formatPdfPrice(data.total_amount), fontSize: 10, alignment: 'right', bold: true },
        ],
      ],
    },
    layout: {
      hLineWidth: (i: number) => i <= 1 ? 0.5 : 0,
      vLineWidth: () => 0,
      hLineColor: () => '#cccccc',
      paddingTop: () => 6,
      paddingBottom: () => 6,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
  });

  // Summary
  content.push({
    margin: [0, 10, 0, 0],
    table: {
      widths: ['*', 120],
      body: [
        [
          { text: 'ยอดรวมสุทธิ', fontSize: 12, bold: true, alignment: 'right' },
          { text: formatPdfPrice(data.total_amount), fontSize: 14, bold: true, color: THEME, alignment: 'right' },
        ],
      ],
    },
    layout: {
      hLineWidth: (i: number) => i === 0 ? 1 : 0.5,
      vLineWidth: () => 0,
      hLineColor: () => THEME,
      paddingTop: () => 8,
      paddingBottom: () => 8,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    unbreakable: true,
  });

  if (data.notes) {
    content.push({ text: `หมายเหตุ: ${data.notes}`, fontSize: 9, color: '#6b7280', margin: [0, 8, 0, 0] });
  }

  // Voided watermark
  if (data.voided_at) {
    content.push({
      text: 'ยกเลิก',
      fontSize: 60, bold: true, color: '#ef444440',
      absolutePosition: { x: 150, y: 350 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  // ═══ Section 3 — Footer ═══
  const footer = buildSignatureFooter('ผู้รับเงิน', 'ผู้ชำระเงิน');
  content.push({ text: '', margin: [0, 30, 0, 0] });
  content.push(footer);

  const docDef = {
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    content,
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 10 },
  };

  const finalDef = withOriginalAndCopy(docDef);

  return new Promise((resolve) => {
    pdfMake.createPdf(finalDef).getBlob((blob: Blob) => resolve(blob));
  });
}

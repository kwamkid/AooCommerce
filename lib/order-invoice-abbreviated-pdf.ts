/**
 * Abbreviated Invoice / Receipt PDF generation (ครึ่ง A4, 2 orders per page).
 *
 * Title logic:
 *   - paid + VAT → ใบกำกับอย่างย่อ/ใบเสร็จรับเงิน (green)
 *   - paid + no VAT → ใบเสร็จรับเงิน (green)
 *   - unpaid → ใบแจ้งหนี้ (dark)
 *
 * Layout pattern copied from orders-packing-pdf.ts (half-page split).
 */

import {
  type CompanyInfo,
  fetchCompanyInfo,
  setupPdfMake,
  loadLogoDataUrl,
  formatPdfDate,
  formatPdfPrice,
  buildCornerTriangle,
  buildProductNameStack,
} from './pdf-utils';

// Re-export the data interface so callers can use it
export { type OrderInvoiceData } from './order-invoice-pdf';

// ─── Types ──────────────────────────────────────────────

interface AbbreviatedInvoiceItem {
  product_name: string;
  product_code?: string;
  variation_label?: string;
  quantity: number;
  unit_price: number;
  discount_amount?: number;
  total: number;
}

export interface AbbreviatedInvoiceData {
  order_number: string;
  order_date?: string;
  created_at: string;
  payment_status: string;
  payment_method?: string;
  subtotal: number;
  discount_amount: number;
  shipping_fee: number;
  vat_amount: number;
  total_amount: number;
  notes?: string;
  customer?: {
    name?: string;
    phone?: string;
  } | null;
  delivery_name?: string;
  delivery_phone?: string;
  items: AbbreviatedInvoiceItem[];
  // Running number fields
  tax_invoice_number?: string;
  tax_invoice_date?: string;
  // Void support
  tax_invoice_voided_at?: string | null;
  tax_invoice_replaced_abbrev_number?: string | null; // ใบแทนที่
}

// ─── Themes ─────────────────────────────────────────────

const THEMES = {
  unpaid: { primary: '#1e293b' },
  paid:   { primary: '#15803d' },
};

// ─── Helpers ────────────────────────────────────────────

function getDocTitle(paymentStatus: string, vatRegistered: boolean): string {
  if (paymentStatus !== 'paid') return 'ใบแจ้งหนี้';
  return vatRegistered ? 'ใบกำกับอย่างย่อ/ใบเสร็จรับเงิน' : 'ใบเสร็จรับเงิน';
}

function getPaymentMethodLabel(method?: string): string {
  if (!method) return '-';
  const labels: Record<string, string> = {
    cash: 'เงินสด',
    transfer: 'โอนเงิน',
    bank_transfer: 'โอนเงิน',
    credit: 'เครดิต',
    cheque: 'เช็ค',
    promptpay: 'พร้อมเพย์',
    payment_gateway: 'ชำระออนไลน์',
  };
  return labels[method] || method;
}

function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'รอชำระ',
    verifying: 'รอตรวจสอบ',
    paid: 'ชำระแล้ว',
    cancelled: 'ยกเลิก',
  };
  return labels[status] || status;
}

// ─── Build single order content (compact for half-A4) ───

function buildCompactInvoiceContent(
  order: AbbreviatedInvoiceData,
  company: CompanyInfo | undefined,
  logoDataUrl: string | null,
  vatRegistered: boolean,
) {
  const isPaid = order.payment_status === 'paid';
  const isVoided = !!order.tax_invoice_voided_at;
  const theme = isPaid ? THEMES.paid : THEMES.unpaid;
  const docTitle = getDocTitle(order.payment_status, vatRegistered);
  const dateStr = formatPdfDate(order.order_date || order.created_at);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ── Header: Logo + Company name (left) + Title + info box (right) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leftStack: any[] = [];
  if (logoDataUrl) {
    leftStack.push({
      image: logoDataUrl,
      width: 30,
      height: 30,
      fit: [30, 30],
      margin: [0, 0, 6, 0],
    });
  }
  const companyName = company?.tax_company_name || company?.name || '';
  if (companyName) {
    leftStack.push({ text: companyName, bold: true, fontSize: 10, color: '#333333' });
  }
  if (company?.tax_id) {
    leftStack.push({ text: `เลขผู้เสียภาษี ${company.tax_id}`, fontSize: 8, color: '#666666', margin: [0, 1, 0, 0] });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoRows: any[][] = [
    [
      { text: 'เลขที่', fontSize: 8, color: theme.primary, bold: true },
      { text: order.order_number, fontSize: 8, bold: true },
    ],
    [
      { text: 'วันที่', fontSize: 8, color: theme.primary, bold: true },
      { text: dateStr, fontSize: 8 },
    ],
    [
      { text: 'สถานะ', fontSize: 8, color: theme.primary, bold: true },
      { text: getPaymentStatusLabel(order.payment_status), fontSize: 8, bold: true },
    ],
  ];

  if (order.tax_invoice_number) {
    infoRows.push([
      { text: 'เลขใบกำกับ', fontSize: 8, color: theme.primary, bold: true },
      { text: order.tax_invoice_number, fontSize: 8, bold: true },
    ]);
  }

  if (isPaid && order.payment_method) {
    infoRows.push([
      { text: 'วิธีชำระ', fontSize: 8, color: theme.primary, bold: true },
      { text: getPaymentMethodLabel(order.payment_method), fontSize: 8 },
    ]);
  }

  content.push({
    columns: [
      {
        width: '*',
        stack: leftStack.length > 0 ? leftStack : [{ text: '' }],
      },
      {
        width: 200,
        stack: [
          {
            text: docTitle,
            fontSize: 14,
            bold: true,
            color: theme.primary,
            alignment: 'right',
            margin: [0, 0, 0, 4],
          },
          {
            table: {
              widths: [35, '*'],
              body: infoRows,
            },
            layout: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              hLineWidth: (i: number, node: any) =>
                i === 0 || i === node.table.body.length ? 0.5 : 0,
              vLineWidth: () => 0,
              hLineColor: () => '#cccccc',
              paddingTop: (i: number) => (i === 0 ? 4 : 1),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              paddingBottom: (i: number, node: any) =>
                i === node.table.body.length - 1 ? 4 : 1,
              paddingLeft: () => 3,
              paddingRight: () => 3,
            },
          },
        ],
      },
    ],
    margin: [0, 0, 0, 4],
  });

  // ── Customer line ──
  const customerName = order.delivery_name || order.customer?.name || '';
  const customerPhone = order.delivery_phone || order.customer?.phone || '';
  if (customerName) {
    const label = customerPhone ? `${customerName}  โทร: ${customerPhone}` : customerName;
    content.push({
      text: [
        { text: 'ลูกค้า ', fontSize: 8, bold: true, color: theme.primary },
        { text: label, fontSize: 8, color: '#333333' },
      ],
      margin: [0, 0, 0, 3],
    });
  }

  // ── Item table (compact) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCols: any[] = [
    { text: '#', fontSize: 8, bold: true, color: '#666666', alignment: 'center' },
    { text: 'รายละเอียด', fontSize: 8, bold: true, color: '#666666' },
    { text: 'จำนวน', fontSize: 8, bold: true, color: '#666666', alignment: 'center' },
    { text: 'ราคา', fontSize: 8, bold: true, color: '#666666', alignment: 'right' },
    { text: 'รวม', fontSize: 8, bold: true, color: '#666666', alignment: 'right' },
  ];
  const widths: (number | string)[] = [20, '*', 35, 55, 60];

  const tableBody = order.items.map((item, idx) => {
    const subtitle = [item.product_code, item.variation_label].filter(Boolean).join(' | ');
    const productStack = buildProductNameStack(item.product_name, subtitle);

    return [
      { text: `${idx + 1}`, alignment: 'center', fontSize: 9, margin: [0, 1, 0, 0] },
      { stack: productStack, margin: [0, 1, 0, 1] },
      { text: `${item.quantity}`, alignment: 'center', fontSize: 9, margin: [0, 1, 0, 0] },
      { text: formatPdfPrice(item.unit_price), alignment: 'right', fontSize: 9, margin: [0, 1, 0, 0] },
      { text: formatPdfPrice(item.total), alignment: 'right', fontSize: 9, margin: [0, 1, 0, 0] },
    ];
  });

  content.push({
    table: {
      headerRows: 1,
      widths,
      body: [headerCols, ...tableBody],
    },
    layout: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hLineWidth: (i: number, node: any) =>
        i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.3,
      vLineWidth: () => 0,
      hLineColor: (i: number) => (i <= 1 ? '#333333' : '#e5e7eb'),
      paddingTop: () => 2,
      paddingBottom: () => 2,
      paddingLeft: () => 3,
      paddingRight: () => 3,
    },
  });

  // ── Summary (compact, right-aligned) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryRows: any[][] = [];

  if (order.discount_amount > 0) {
    summaryRows.push([
      { text: 'ส่วนลด', fontSize: 9, alignment: 'right', color: '#dc2626' },
      { text: `-${formatPdfPrice(order.discount_amount)}`, fontSize: 9, alignment: 'right', color: '#dc2626' },
    ]);
  }

  if (order.shipping_fee > 0) {
    summaryRows.push([
      { text: 'ค่าจัดส่ง', fontSize: 9, alignment: 'right', color: '#555555' },
      { text: formatPdfPrice(order.shipping_fee), fontSize: 9, alignment: 'right' },
    ]);
  }

  if (vatRegistered && order.vat_amount > 0) {
    const beforeVat = order.total_amount - order.vat_amount;
    summaryRows.push([
      { text: 'ยอดก่อน VAT', fontSize: 9, alignment: 'right', color: '#555555' },
      { text: formatPdfPrice(beforeVat), fontSize: 9, alignment: 'right' },
    ]);
    summaryRows.push([
      { text: 'VAT 7%', fontSize: 9, alignment: 'right', color: '#555555' },
      { text: formatPdfPrice(order.vat_amount), fontSize: 9, alignment: 'right' },
    ]);
  }

  summaryRows.push([
    { text: 'ยอดรวมสุทธิ', fontSize: 10, alignment: 'right', color: '#333333', bold: true },
    { text: formatPdfPrice(order.total_amount), fontSize: 10, alignment: 'right', bold: true },
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noteStack: any[] = [];
  if (order.notes) {
    noteStack.push({ text: 'หมายเหตุ: ' + order.notes, fontSize: 8, color: '#555555' });
  }

  content.push({
    columns: [
      {
        width: '*',
        stack: noteStack.length > 0 ? noteStack : [{ text: '' }],
        margin: [0, 4, 0, 0],
      },
      {
        width: 200,
        table: {
          widths: ['*', 65],
          body: summaryRows,
        },
        layout: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hLineWidth: (i: number, node: any) => i === node.table.body.length - 1 ? 0.5 : 0,
          vLineWidth: () => 0,
          hLineColor: () => '#cccccc',
          paddingTop: () => 2,
          paddingBottom: () => 2,
          paddingLeft: () => 3,
          paddingRight: () => 3,
        },
        margin: [0, 4, 0, 0],
      },
    ],
  });

  // ── Void watermark ──
  if (isVoided) {
    content.push({
      text: 'ยกเลิก',
      fontSize: 48,
      bold: true,
      color: '#dc262650',
      alignment: 'center',
      margin: [0, -120, 0, 0],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  return content;
}

// ─── Main Export ─────────────────────────────────────────

export async function generateAbbreviatedInvoicePdf(
  orders: AbbreviatedInvoiceData[],
  options?: { company?: CompanyInfo },
): Promise<Blob> {
  const company = options?.company || (await fetchCompanyInfo()) || undefined;
  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;
  const vatRegistered = company?.vat_registered || false;

  // Half-A4 layout constants (same as packing slip)
  const PAGE_CENTER_Y = 421;
  const TOP_HALF_HEIGHT = PAGE_CENTER_Y - 40; // 381pt
  const PAGE_WIDTH = 595;
  const H_MARGIN = 40;
  const LINE_LENGTH = PAGE_WIDTH - H_MARGIN * 2;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullContent: any[] = [];

  for (let i = 0; i < orders.length; i += 2) {
    if (fullContent.length > 0) {
      fullContent.push({ text: '', pageBreak: 'before' });
    }

    const topOrder = orders[i];
    const bottomOrder = i + 1 < orders.length ? orders[i + 1] : null;

    const topContent = buildCompactInvoiceContent(topOrder, company, logoDataUrl, vatRegistered);
    const bottomContent = bottomOrder
      ? buildCompactInvoiceContent(bottomOrder, company, logoDataUrl, vatRegistered)
      : null;

    // Top half — fixed height container
    fullContent.push({
      table: {
        widths: ['*'],
        heights: [TOP_HALF_HEIGHT],
        body: [[{ stack: topContent, margin: [0, 0, 0, 0] }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
      },
    });

    // Dashed divider at exact page center
    if (bottomContent) {
      fullContent.push({
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: LINE_LENGTH,
            y2: 0,
            lineWidth: 0.5,
            lineColor: '#cccccc',
            dash: { length: 4, space: 3 },
          },
        ],
        absolutePosition: { x: H_MARGIN, y: PAGE_CENTER_Y },
      });

      fullContent.push({
        stack: bottomContent,
        margin: [0, 12, 0, 0],
      });
    }
  }

  const theme = THEMES.paid; // default corner triangle color

  const docDefinition = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 16 },
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    background: () => buildCornerTriangle(theme.primary),
    content: fullContent,
    styles: {
      tableHeader: { bold: true, fontSize: 9, color: '#333333' },
    },
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

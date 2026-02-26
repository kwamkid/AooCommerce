/**
 * Full Tax Invoice PDF generation (เต็ม A4, 1 order per page).
 *
 * Title: ใบกำกับแบบเต็ม/ใบเสร็จรับเงิน
 * Adds buyer tax info section + invoice number + issue date.
 * Based on order-invoice-pdf.ts template.
 */

import {
  type CompanyInfo,
  fetchCompanyInfo,
  setupPdfMake,
  loadLogoDataUrl,
  formatPdfDate,
  formatPdfPrice,
  buildCompanyStack,
  buildCornerTriangle,
  buildSignatureFooter,
} from './pdf-utils';

// ─── Interfaces ──────────────────────────────────────────

interface FullInvoiceItem {
  product_name: string;
  product_code?: string;
  variation_label?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  discount_amount?: number;
  subtotal: number;
  total: number;
}

export interface FullInvoiceData {
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
  // Buyer info (from customer or delivery)
  customer?: {
    name?: string;
    contact_person?: string;
    phone?: string;
    email?: string;
  } | null;
  delivery_name?: string;
  delivery_phone?: string;
  delivery_address?: string;
  delivery_district?: string;
  delivery_amphoe?: string;
  delivery_province?: string;
  delivery_postal_code?: string;
  delivery_email?: string;
  // Tax invoice snapshot fields (from order)
  tax_invoice_number?: string;
  tax_invoice_date?: string;
  tax_invoice_name?: string;
  tax_invoice_tax_id?: string;
  tax_invoice_address?: string;
  tax_invoice_branch?: string;
  items: FullInvoiceItem[];
}

// ─── Theme ──────────────────────────────────────────────

const THEME = { primary: '#15803d' }; // Always green — full invoice = paid + VAT

// ─── Helpers ────────────────────────────────────────────

const MAX_NAME_LEN = 70;
const truncateName = (name: string) =>
  name.length > MAX_NAME_LEN ? name.slice(0, MAX_NAME_LEN) + '...' : name;

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

// ─── Main Export ─────────────────────────────────────────

export async function generateFullInvoicePdf(
  data: FullInvoiceData,
  options?: { company?: CompanyInfo },
): Promise<Blob> {
  const company = options?.company || (await fetchCompanyInfo()) || undefined;
  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  const docTitle = 'ใบกำกับแบบเต็ม/ใบเสร็จรับเงิน';
  const dateStr = formatPdfDate(data.order_date || data.created_at);
  const invoiceDateStr = data.tax_invoice_date
    ? formatPdfDate(data.tax_invoice_date)
    : formatPdfDate(new Date().toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 1 — Header
  // ═══════════════════════════════════════════════════

  const companyStack = buildCompanyStack(company, logoDataUrl);

  // Info box rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [
    [{ text: 'เลขที่', fontSize: 10, color: THEME.primary, bold: true }, { text: data.order_number, fontSize: 10, bold: true }],
    [{ text: 'วันที่', fontSize: 10, color: THEME.primary, bold: true }, { text: dateStr, fontSize: 10 }],
  ];

  if (data.tax_invoice_number) {
    infoBoxRows.push([
      { text: 'เลขใบกำกับ', fontSize: 10, color: THEME.primary, bold: true },
      { text: data.tax_invoice_number, fontSize: 10, bold: true },
    ]);
  }

  infoBoxRows.push([
    { text: 'วันที่ออก', fontSize: 10, color: THEME.primary, bold: true },
    { text: invoiceDateStr, fontSize: 10 },
  ]);

  if (data.payment_method) {
    infoBoxRows.push([
      { text: 'วิธีชำระ', fontSize: 10, color: THEME.primary, bold: true },
      { text: getPaymentMethodLabel(data.payment_method), fontSize: 10 },
    ]);
  }

  content.push({
    columns: [
      {
        width: '*',
        stack: companyStack.length > 0 ? companyStack : [{ text: '' }],
      },
      {
        width: 230,
        stack: [
          { text: docTitle, fontSize: 16, bold: true, color: THEME.primary, alignment: 'right', margin: [0, 0, 0, 6] },
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
  // ส่วนที่ 2 — ข้อมูลผู้ซื้อ (Tax Buyer Info)
  // ═══════════════════════════════════════════════════

  const buyerName = data.tax_invoice_name || data.delivery_name || data.customer?.name || '';
  const buyerPhone = data.delivery_phone || data.customer?.phone || '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buyerStack: any[] = [
    { text: 'ข้อมูลผู้ซื้อ', fontSize: 10, bold: true, color: THEME.primary, margin: [0, 0, 0, 4] },
  ];

  if (buyerName) {
    buyerStack.push({ text: buyerName, fontSize: 12, bold: true, color: '#333333' });
  }
  if (data.tax_invoice_tax_id) {
    let taxLine = `เลขผู้เสียภาษี: ${data.tax_invoice_tax_id}`;
    if (data.tax_invoice_branch) taxLine += `  สาขา: ${data.tax_invoice_branch}`;
    buyerStack.push({ text: taxLine, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
  }
  if (data.tax_invoice_address) {
    buyerStack.push({ text: `ที่อยู่: ${data.tax_invoice_address}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
  }
  if (buyerPhone) {
    buyerStack.push({ text: `โทร: ${buyerPhone}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
  }

  // Notes on right
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notesStack: any[] = [];
  if (data.notes) {
    notesStack.push({ text: 'หมายเหตุ', fontSize: 10, bold: true, color: THEME.primary, margin: [0, 0, 0, 4] });
    notesStack.push({ text: data.notes, fontSize: 10, color: '#555555' });
  }

  content.push({
    columns: [
      { width: '*', stack: buyerStack },
      ...(notesStack.length > 0 ? [{ width: 200, stack: notesStack }] : []),
    ],
    margin: [0, 0, 0, 12],
  });

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 3 — ตารางสินค้า
  // ═══════════════════════════════════════════════════

  const hasDiscount = data.items.some(i => (i.discount_amount || 0) > 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCols: any[] = [
    { text: '#', style: 'tableHeader', alignment: 'center' },
    { text: 'รายละเอียด', style: 'tableHeader' },
    { text: 'จำนวน', style: 'tableHeader', alignment: 'center' },
    { text: 'ราคา/หน่วย', style: 'tableHeader', alignment: 'right' },
  ];
  const widths: (number | string)[] = [25, '*', 45, 70];

  if (hasDiscount) {
    headerCols.push({ text: 'ส่วนลด', style: 'tableHeader', alignment: 'right' });
    widths.push(60);
  }

  headerCols.push({ text: 'รวม', style: 'tableHeader', alignment: 'right' });
  widths.push(75);

  const tableBody = data.items.map((item, idx) => {
    const nameText = truncateName(item.product_name);
    const subtitleParts = [item.product_code, item.variation_label].filter(Boolean);
    const subtitle = subtitleParts.join(' | ');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productStack: any[] = [{ text: nameText, fontSize: 11 }];
    if (subtitle) productStack.push({ text: subtitle, fontSize: 9, color: '#888888' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any[] = [
      { text: `${idx + 1}`, alignment: 'center', fontSize: 11, margin: [0, 2, 0, 0] },
      { stack: productStack, margin: [0, 1, 0, 1] },
      { text: `${item.quantity}`, alignment: 'center', fontSize: 11, margin: [0, 2, 0, 0] },
      { text: formatPdfPrice(item.unit_price), alignment: 'right', fontSize: 11, margin: [0, 2, 0, 0] },
    ];

    if (hasDiscount) {
      const discountAmt = item.discount_amount || 0;
      if (discountAmt > 0) {
        const discountText = item.discount_percent && item.discount_percent > 0
          ? `${item.discount_percent}%`
          : formatPdfPrice(discountAmt);
        row.push({ text: discountText, alignment: 'right', fontSize: 11, color: '#dc2626', margin: [0, 2, 0, 0] });
      } else {
        row.push({ text: '-', alignment: 'right', fontSize: 11, color: '#999999', margin: [0, 2, 0, 0] });
      }
    }

    row.push({ text: formatPdfPrice(item.total), alignment: 'right', fontSize: 11, margin: [0, 2, 0, 0] });

    return row;
  });

  content.push({
    table: {
      headerRows: 1,
      widths,
      body: [headerCols, ...tableBody],
    },
    layout: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
      vLineWidth: () => 0,
      hLineColor: (i: number) => i <= 1 ? '#333333' : '#e5e7eb',
      paddingTop: () => 5,
      paddingBottom: () => 5,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
  });

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 4 — สรุปยอด
  // ═══════════════════════════════════════════════════

  const itemsTotal = data.items.reduce((s, i) => s + i.total, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryRows: any[][] = [];

  summaryRows.push([
    { text: 'จำนวนรายการ', fontSize: 11, alignment: 'right', color: '#555555' },
    { text: `${data.items.length}`, fontSize: 11, alignment: 'right' },
  ]);

  summaryRows.push([
    { text: 'ยอดรวมสินค้า', fontSize: 11, alignment: 'right', color: '#555555' },
    { text: formatPdfPrice(itemsTotal), fontSize: 11, alignment: 'right' },
  ]);

  if (data.discount_amount > 0) {
    summaryRows.push([
      { text: 'ส่วนลดรวม', fontSize: 11, alignment: 'right', color: '#dc2626' },
      { text: `-${formatPdfPrice(data.discount_amount)}`, fontSize: 11, alignment: 'right', color: '#dc2626' },
    ]);
  }

  if (data.shipping_fee > 0) {
    summaryRows.push([
      { text: 'ค่าจัดส่ง', fontSize: 11, alignment: 'right', color: '#555555' },
      { text: formatPdfPrice(data.shipping_fee), fontSize: 11, alignment: 'right' },
    ]);
  }

  // VAT breakdown (always show for full tax invoice)
  if (data.vat_amount > 0) {
    const beforeVat = data.total_amount - data.vat_amount;
    summaryRows.push([
      { text: 'ยอดก่อน VAT', fontSize: 11, alignment: 'right', color: '#555555' },
      { text: formatPdfPrice(beforeVat), fontSize: 11, alignment: 'right' },
    ]);
    summaryRows.push([
      { text: 'VAT 7%', fontSize: 11, alignment: 'right', color: '#555555' },
      { text: formatPdfPrice(data.vat_amount), fontSize: 11, alignment: 'right' },
    ]);
  }

  summaryRows.push([
    { text: 'ยอดรวมสุทธิ', fontSize: 12, alignment: 'right', color: '#333333', bold: true },
    { text: formatPdfPrice(data.total_amount), fontSize: 12, alignment: 'right', bold: true },
  ]);

  content.push({
    columns: [
      { width: '*', text: '' },
      {
        width: 260,
        table: {
          widths: ['*', 80],
          body: summaryRows,
        },
        layout: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          hLineWidth: (i: number, node: any) => i === node.table.body.length - 1 ? 0.5 : 0,
          vLineWidth: () => 0,
          hLineColor: () => '#cccccc',
          paddingTop: () => 3,
          paddingBottom: () => 3,
          paddingLeft: () => 4,
          paddingRight: () => 4,
        },
        margin: [0, 8, 0, 0],
      },
    ],
  });

  // ═══════════════════════════════════════════════════
  // Document definition
  // ═══════════════════════════════════════════════════

  const docDefinition = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 16 },
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 110] as [number, number, number, number],
    background: () => buildCornerTriangle(THEME.primary),
    footer: buildSignatureFooter(company?.name || '', 'ผู้ออกเอกสาร', 'ผู้รับสินค้า'),
    content,
    styles: {
      tableHeader: { bold: true, fontSize: 11, color: '#333333' },
    },
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

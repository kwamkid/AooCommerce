/**
 * Full Tax Invoice PDF generation (เต็ม A4).
 *
 * 4 sections:
 * 1. Header (company + buyer + doc info) — repeats every page via pdfMake header
 * 2. Items table — flows across pages
 * 3. Summary (totals) — after items
 * 4. Footer (signatures + page number) — repeats every page via pdfMake footer
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
  buildProductNameStack,
} from './pdf-utils';

// ─── Interfaces ──────────────────────────────────────────

interface PromotionComponent {
  product_name: string;
  product_code?: string | null;
  variation_label?: string | null;
  sku?: string | null;
  role: string;
  quantity: number;
}

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
  promotion_name?: string | null;
  promotion_type?: string | null;
  promotion_components?: PromotionComponent[];
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
  tax_invoice_number?: string | null;
  tax_invoice_date?: string | null;
  tax_invoice_name?: string | null;
  tax_invoice_tax_id?: string | null;
  tax_invoice_address?: string | null;
  tax_invoice_branch?: string | null;
  tax_invoice_doc_type?: string; // 'tax' | 'receipt' | 'abbreviated' | legacy INV
  tax_invoice_replaced_abbrev_number?: string | null; // อ้างอิง ABB ที่ถูก void
  voided_at?: string | null;
  items: FullInvoiceItem[];
}

// ─── Theme ──────────────────────────────────────────────

const THEME = { primary: '#15803d' }; // Always green — full invoice = paid + VAT

// ─── Helpers ────────────────────────────────────────────

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

  const docTitle = data.tax_invoice_doc_type === 'receipt'
    ? 'ใบเสร็จรับเงิน'
    : data.tax_invoice_doc_type === 'tax_receipt' || data.payment_status === 'paid'
      ? 'ใบกำกับภาษี/ใบเสร็จรับเงิน'
      : 'ใบกำกับภาษี';
  const dateStr = formatPdfDate(data.order_date || data.created_at);
  const invoiceDateStr = data.tax_invoice_date
    ? formatPdfDate(data.tax_invoice_date)
    : formatPdfDate(new Date().toISOString());
  const docNumber = data.tax_invoice_number || data.order_number;

  // ═══════════════════════════════════════════════════
  // Build Header content (used in pdfMake header function)
  // ═══════════════════════════════════════════════════

  const buyerName = data.tax_invoice_name || data.delivery_name || data.customer?.name || '';
  const buyerPhone = data.delivery_phone || data.customer?.phone || '';

  // Info box rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [];

  if (data.tax_invoice_number) {
    infoBoxRows.push([
      { text: 'เลขที่', fontSize: 10, color: THEME.primary, bold: true },
      { text: data.tax_invoice_number, fontSize: 10, bold: true },
    ]);
    infoBoxRows.push([
      { text: 'อ้างอิง', fontSize: 10, color: THEME.primary, bold: true },
      { text: data.order_number, fontSize: 10 },
    ]);
  } else {
    infoBoxRows.push([
      { text: 'เลขที่', fontSize: 10, color: THEME.primary, bold: true },
      { text: data.order_number, fontSize: 10, bold: true },
    ]);
  }

  infoBoxRows.push([
    { text: 'วันที่', fontSize: 10, color: THEME.primary, bold: true },
    { text: dateStr, fontSize: 10 },
  ]);
  infoBoxRows.push([
    { text: 'วันที่ออก', fontSize: 10, color: THEME.primary, bold: true },
    { text: invoiceDateStr, fontSize: 10 },
  ]);

  if (data.tax_invoice_replaced_abbrev_number) {
    infoBoxRows.push([
      { text: 'อ้างอิงใบย่อ', fontSize: 10, color: '#b45309', bold: true },
      { text: data.tax_invoice_replaced_abbrev_number, fontSize: 10, color: '#b45309' },
    ]);
  }

  if (data.payment_method) {
    infoBoxRows.push([
      { text: 'วิธีชำระ', fontSize: 10, color: THEME.primary, bold: true },
      { text: getPaymentMethodLabel(data.payment_method), fontSize: 10 },
    ]);
  }

  // Calculate header height — approximate based on content
  // Company: logo(~40) + name + address + taxId + phone = ~80px
  // Buyer: divider + label + name + taxId + address + phone = ~60px
  // Total ~180-220px depending on buyer info
  const headerHeight = buyerName ? 220 : 140;

  // ═══════════════════════════════════════════════════
  // Build Footer (signatures + page number)
  // ═══════════════════════════════════════════════════

  const companyName = company?.name || '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buildSide = (topLabel: string, signLabel: string): any => ({
    width: '*',
    stack: [
      { text: topLabel || ' ', fontSize: 10, color: '#666666' },
      { text: ' ', margin: [0, 18, 0, 0] },
      {
        columns: [
          {
            width: '*',
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] },
              { text: signLabel, fontSize: 10, margin: [0, 3, 0, 0] },
            ],
          },
          {
            width: 'auto',
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 80, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] },
              { text: 'วันที่', fontSize: 10, margin: [0, 3, 0, 0] },
            ],
          },
        ],
        columnGap: 10,
      },
    ],
  });

  // ═══════════════════════════════════════════════════
  // Content — Items table + Notes + Summary
  // ═══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // Notes (if any, show above items table)
  if (data.notes) {
    content.push({
      text: [
        { text: 'หมายเหตุ: ', fontSize: 10, bold: true, color: THEME.primary },
        { text: data.notes, fontSize: 10, color: '#555555' },
      ],
      margin: [0, 0, 0, 8],
    });
  }

  // Items table
  const hasDiscount = (data.items || []).some(i => (i.discount_amount || 0) > 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableHeaderCols: any[] = [
    { text: '#', style: 'tableHeader', alignment: 'center' },
    { text: 'รายละเอียด', style: 'tableHeader' },
    { text: 'จำนวน', style: 'tableHeader', alignment: 'center' },
    { text: 'ราคา/หน่วย', style: 'tableHeader', alignment: 'right' },
  ];
  const widths: (number | string)[] = [25, '*', 45, 70];

  if (hasDiscount) {
    tableHeaderCols.push({ text: 'ส่วนลด', style: 'tableHeader', alignment: 'right' });
    widths.push(60);
  }

  tableHeaderCols.push({ text: 'รวม', style: 'tableHeader', alignment: 'right' });
  widths.push(75);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableBody: any[][] = [];
  const subRowIndices = new Set<number>();
  let rowNum = 0;

  for (const item of data.items) {
    rowNum++;
    const hasComponents = item.promotion_components && item.promotion_components.length > 0;

    if (hasComponents) {
      const promoUnitPrice = item.quantity > 0 ? item.total / item.quantity : item.total;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const headerRow: any[] = [
        { text: `${rowNum}`, alignment: 'center', fontSize: 11, margin: [0, 2, 0, 0] },
        {
          text: [
            { text: item.promotion_name || item.product_name, fontSize: 11, bold: true, color: '#6366f1' },
          ],
          margin: [0, 2, 0, 0],
        },
        { text: `${item.quantity}`, alignment: 'center', fontSize: 11, margin: [0, 2, 0, 0] },
        { text: formatPdfPrice(promoUnitPrice), alignment: 'right', fontSize: 11, margin: [0, 2, 0, 0] },
      ];
      if (hasDiscount) {
        headerRow.push({ text: '-', alignment: 'right', fontSize: 11, color: '#999999', margin: [0, 2, 0, 0] });
      }
      headerRow.push({ text: formatPdfPrice(item.total), alignment: 'right', fontSize: 11, bold: true, margin: [0, 2, 0, 0] });
      tableBody.push(headerRow);

      for (const comp of item.promotion_components!) {
        const compSubtitle = [comp.sku || comp.product_code, comp.role === 'gift' ? '[แถมฟรี]' : null].filter(Boolean).join(' ');
        const compProductStack = buildProductNameStack(`- ${comp.product_name}`, compSubtitle);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const compRow: any[] = [
          { text: '', margin: [0, 0, 0, 0] },
          { stack: compProductStack, margin: [0, 0, 0, 0], color: '#666666' },
          { text: '', margin: [0, 0, 0, 0] },
          { text: '', margin: [0, 0, 0, 0] },
        ];
        if (hasDiscount) {
          compRow.push({ text: '', margin: [0, 0, 0, 0] });
        }
        compRow.push({ text: '', margin: [0, 0, 0, 0] });
        subRowIndices.add(tableBody.length);
        tableBody.push(compRow);
      }
    } else {
      const subtitle = [item.product_code, item.variation_label].filter(Boolean).join(' | ');
      const productStack = buildProductNameStack(item.product_name, subtitle);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: any[] = [
        { text: `${rowNum}`, alignment: 'center', fontSize: 11, margin: [0, 2, 0, 0] },
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
      tableBody.push(row);
    }
  }

  content.push({
    table: {
      headerRows: 1,
      widths,
      body: [tableHeaderCols, ...tableBody],
    },
    layout: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hLineWidth: (i: number, node: any) => {
        if (i === 0 || i === 1 || i === node.table.body.length) return 1;
        if (subRowIndices.has(i - 1)) return 0;
        return 0.5;
      },
      vLineWidth: () => 0,
      hLineColor: (i: number) => i <= 1 ? '#333333' : '#e5e7eb',
      paddingTop: (i: number) => subRowIndices.has(i - 1) ? 1 : 5,
      paddingBottom: (i: number) => subRowIndices.has(i) ? 1 : 5,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
  });

  // ═══════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════

  const itemsTotal = data.items.reduce((s, i) => s + i.total, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryRows: any[][] = [];

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
    unbreakable: true,
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

  // Deep clone utility for duplicating content (ต้นฉบับ/สำเนา)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deepClone);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const copy: any = {};
    for (const key of Object.keys(obj)) {
      copy[key] = typeof obj[key] === 'function' ? obj[key] : deepClone(obj[key]);
    }
    return copy;
  }

  // Duplicate content: ต้นฉบับ + สำเนา
  const contentCopy = deepClone(content);
  const fullContent = [
    ...content,
    { text: '', pageBreak: 'after' },
    ...contentCopy,
  ];

  // Track which pages belong to ต้นฉบับ vs สำเนา
  // We'll detect based on page count: first half = ต้นฉบับ, second half = สำเนา

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docDefinition: any = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 16 },
    pageSize: 'A4' as const,
    pageMargins: [40, headerHeight + 40, 40, 120] as [number, number, number, number],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    header: function(currentPage: number, pageCount: number): any {
      const halfPages = Math.ceil(pageCount / 2);
      const isOriginal = currentPage <= halfPages;
      const logicalPage = isOriginal ? currentPage : currentPage - halfPages;
      const logicalTotal = halfPages;
      const copyLabel = isOriginal ? '(ต้นฉบับ)' : '(สำเนา)';
      const copyColor = isOriginal ? THEME.primary : '#6b7280';

      // Rebuild header fresh each time (avoids deepClone issues with layout functions)
      const hdrCompanyStack = buildCompanyStack(company, logoDataUrl);

      // Append buyer info
      if (buyerName) {
        hdrCompanyStack.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: '#dddddd' }], margin: [0, 6, 0, 4] } as any);
        hdrCompanyStack.push({ text: 'ลูกค้า', fontSize: 10, bold: true, color: THEME.primary, margin: [0, 0, 0, 2] } as any);
        hdrCompanyStack.push({ text: buyerName, fontSize: 11, bold: true, color: '#333333' } as any);
        if (data.tax_invoice_tax_id) {
          let taxLine = `เลขประจำตัวผู้เสียภาษี: ${data.tax_invoice_tax_id}`;
          if (data.tax_invoice_branch) taxLine += `  สาขา: ${data.tax_invoice_branch}`;
          hdrCompanyStack.push({ text: taxLine, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] } as any);
        }
        if (data.tax_invoice_address) {
          hdrCompanyStack.push({ text: data.tax_invoice_address, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] } as any);
        }
        if (buyerPhone) {
          hdrCompanyStack.push({ text: `โทร: ${buyerPhone}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] } as any);
        }
      }

      const pageText = logicalTotal > 1
        ? `${copyLabel}  หน้า ${logicalPage}/${logicalTotal}`
        : copyLabel;

      return {
        margin: [40, 30, 40, 0],
        stack: [
          // Copy label (ต้นฉบับ/สำเนา) — absolute positioned top-right
          {
            text: pageText,
            fontSize: 9,
            bold: true,
            color: copyColor,
            alignment: 'right',
            margin: [0, -16, 4, 0],
          },
          {
            columnGap: 16,
            columns: [
              { width: '*', stack: hdrCompanyStack },
              {
                width: 230,
                stack: [
                  { text: docTitle, fontSize: 16, bold: true, color: THEME.primary, alignment: 'right', margin: [0, 0, 0, 6] },
                  {
                    table: {
                      widths: [55, '*'],
                      body: infoBoxRows.map(row => row.map((cell: any) => ({ ...cell }))),
                    },
                    layout: {
                      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0.5 : 0,
                      vLineWidth: () => 0,
                      hLineColor: () => '#cccccc',
                      paddingTop: (i: number) => i === 0 ? 6 : 2,
                      paddingBottom: (i: number, node: any) => i === node.table.body.length - 1 ? 6 : 2,
                      paddingLeft: () => 4,
                      paddingRight: () => 4,
                    },
                  },
                ],
              },
            ],
          },
        ],
      };
    },
    background: () => buildCornerTriangle(THEME.primary),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    footer: function(currentPage: number, pageCount: number): any {
      const halfPages = Math.ceil(pageCount / 2);
      const isOriginal = currentPage <= halfPages;
      const logicalPage = isOriginal ? currentPage : currentPage - halfPages;
      const logicalTotal = halfPages;

      return {
        stack: [
          {
            columns: [
              buildSide(companyName ? `ในนาม ${companyName}` : ' ', 'ผู้ออกเอกสาร'),
              { width: 30, text: '' },
              buildSide(' ', 'ผู้รับสินค้า'),
            ],
            margin: [40, 0, 40, 0],
          },
          logicalTotal > 1 ? {
            text: `หน้า ${logicalPage}/${logicalTotal}`,
            fontSize: 8,
            color: '#999999',
            alignment: 'center',
            margin: [0, 4, 0, 0],
          } : { text: '' },
        ],
      };
    },
    content: fullContent,
    styles: {
      tableHeader: { bold: true, fontSize: 11, color: '#333333' },
    },
  };

  if (data.voided_at) {
    docDefinition.watermark = { text: 'VOID', color: '#dc2626', opacity: 0.15, bold: true, fontSize: 120, angle: -45 };
  }

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

/**
 * Order Invoice / Tax Invoice / Receipt PDF generation.
 * FlowAccount-style template matching inventory-pdf.ts design.
 *
 * Document title changes by payment_status:
 * - unpaid → ใบแจ้งหนี้ (dark #1e293b)
 * - paid + VAT → ใบกำกับภาษี/ใบเสร็จรับเงิน (green #15803d)
 * - paid + no VAT → ใบเสร็จรับเงิน (green #15803d)
 */

import {
  type CompanyInfo,
  fetchCompanyInfo,
  setupPdfMake,
  loadLogoDataUrl,
  formatPdfDate,
  formatDeliverySchedule,
  formatPdfPrice,
  buildCompanyStack,
  buildCornerTriangle,
  buildSignatureFooter,
  buildProductNameStack,
  withOriginalAndCopy,
} from './pdf-utils';
import { productDisplayName } from './product-display';

// ─── Interfaces ──────────────────────────────────────────

interface PromotionComponent {
  product_name: string;
  product_code?: string | null;
  variation_label?: string | null;
  sku?: string | null;
  role: string;
  quantity: number;
}

interface OrderItemData {
  product_name: string;
  product_code?: string;
  sku?: string | null;
  variation_label?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  discount_amount?: number;
  subtotal: number;
  total: number;
  /** หมายเหตุรายสินค้า (order_items.notes) */
  notes?: string | null;
  promotion_name?: string | null;
  promotion_type?: string | null;
  promotion_components?: PromotionComponent[];
}

export interface OrderInvoiceData {
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
  exchange_credit?: number;
  notes?: string;
  customer?: {
    name?: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    tax_company_name?: string;
    tax_id?: string;
    tax_branch?: string;
    billing_address?: string;
    billing_district?: string;
    billing_amphoe?: string;
    billing_province?: string;
    billing_postal_code?: string;
  } | null;
  delivery_name?: string;
  delivery_phone?: string;
  delivery_address?: string;
  delivery_district?: string;
  delivery_amphoe?: string;
  delivery_province?: string;
  delivery_postal_code?: string;
  delivery_email?: string;
  /** กำหนดส่ง — snapshot จากโซน/รอบส่ง (ฟีเจอร์ delivery) */
  delivery_date?: string | null;
  delivery_slot_label?: string | null;
  voided_at?: string | null;
  items: OrderItemData[];
}

// ─── Themes ──────────────────────────────────────────────

const THEMES = {
  unpaid: { primary: '#1e293b' },
  paid:   { primary: '#15803d' },
};

// ─── Helpers ─────────────────────────────────────────────

function getDocumentTitle(paymentStatus: string, vatRegistered: boolean): string {
  if (paymentStatus === 'paid') {
    return vatRegistered ? 'ใบกำกับภาษี/ใบเสร็จรับเงิน' : 'ใบเสร็จรับเงิน';
  }
  return 'ใบแจ้งหนี้';
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

// ─── Main Export ─────────────────────────────────────────

interface GenerateOptions {
  data: OrderInvoiceData;
  company?: CompanyInfo;
}

export async function generateOrderInvoicePdf({ data, company }: GenerateOptions): Promise<Blob> {
  if (!company) {
    company = (await fetchCompanyInfo()) || undefined;
  }

  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  const isPaid = data.payment_status === 'paid';
  const vatRegistered = company?.vat_registered || false;
  const theme = isPaid ? THEMES.paid : THEMES.unpaid;
  const docTitle = getDocumentTitle(data.payment_status, vatRegistered);
  const dateStr = formatPdfDate(data.order_date || data.created_at);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 1 — Header
  // ═══════════════════════════════════════════════════

  const companyStack = buildCompanyStack(company, logoDataUrl);

  // Info box rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [
    [{ text: 'เลขที่', fontSize: 10, color: theme.primary, bold: true }, { text: data.order_number, fontSize: 10, bold: true }],
    [{ text: 'วันที่', fontSize: 10, color: theme.primary, bold: true }, { text: dateStr, fontSize: 10 }],
  ];

  if (isPaid && data.payment_method) {
    infoBoxRows.push([
      { text: 'วิธีชำระ', fontSize: 10, color: theme.primary, bold: true },
      { text: getPaymentMethodLabel(data.payment_method), fontSize: 10 },
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
          { text: docTitle, fontSize: isPaid && vatRegistered ? 18 : 24, bold: true, color: theme.primary, alignment: 'right', margin: [0, 0, 0, 6] },
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
  // ส่วนที่ 2 — ข้อมูลลูกค้า
  // ═══════════════════════════════════════════════════

  const customerName = data.delivery_name || data.customer?.name || data.customer?.contact_person || '';
  const customerPhone = data.delivery_phone || data.customer?.phone || '';
  const customerEmail = data.delivery_email || data.customer?.email || '';
  const addressParts = [
    data.delivery_address, data.delivery_district, data.delivery_amphoe,
    data.delivery_province, data.delivery_postal_code,
  ].filter(Boolean).join(' ');

  if (customerName || addressParts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customerInfoStack: any[] = [
      { text: 'ข้อมูลลูกค้า', fontSize: 10, bold: true, color: theme.primary, margin: [0, 0, 0, 4] },
      { text: customerName, fontSize: 12, bold: true, color: '#333333' },
    ];

    if (customerPhone) {
      customerInfoStack.push({ text: `โทร: ${customerPhone}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
    }
    if (customerEmail) {
      customerInfoStack.push({ text: `อีเมล: ${customerEmail}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
    }
    if (addressParts) {
      customerInfoStack.push({ text: `ที่อยู่: ${addressParts}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
    }
    // กำหนดส่ง — ลูกค้าต้องเห็นรอบที่ตัวเองเลือกบนเอกสารด้วย ไม่ใช่แค่ตอนกดสั่ง
    const scheduleText = formatDeliverySchedule(data);
    if (scheduleText) {
      customerInfoStack.push({
        text: [
          { text: 'กำหนดส่ง: ', fontSize: 10, bold: true, color: theme.primary },
          { text: scheduleText, fontSize: 10, bold: true, color: '#b45309' },
        ],
        margin: [0, 1, 0, 0],
      });
    }

    // Tax info (from customer record)
    const taxId = data.customer?.tax_id;
    if (taxId) {
      let taxLine = `เลขผู้เสียภาษี: ${taxId}`;
      if (data.customer?.tax_branch) taxLine += ` สาขา: ${data.customer.tax_branch}`;
      customerInfoStack.push({ text: taxLine, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
    }
    if (data.customer?.tax_company_name) {
      customerInfoStack.push({ text: `ชื่อกิจการ: ${data.customer.tax_company_name}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
    }

    // Tax address (if different from shipping)
    const taxAddress = [
      data.customer?.billing_address, data.customer?.billing_district, data.customer?.billing_amphoe,
      data.customer?.billing_province, data.customer?.billing_postal_code,
    ].filter(Boolean).join(' ');
    if (taxAddress && taxAddress !== addressParts) {
      customerInfoStack.push({ text: `ที่อยู่ออกบิล: ${taxAddress}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
    }

    // Right column: notes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notesStack: any[] = [];
    if (data.notes) {
      notesStack.push({ text: 'หมายเหตุ', fontSize: 10, bold: true, color: theme.primary, margin: [0, 0, 0, 4] });
      notesStack.push({ text: data.notes, fontSize: 10, color: '#555555' });
    }

    content.push({
      columns: [
        { width: '*', stack: customerInfoStack },
        ...(notesStack.length > 0 ? [{ width: 200, stack: notesStack }] : []),
      ],
      margin: [0, 0, 0, 12],
    });
  }

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 3 — ตารางสินค้า
  // ═══════════════════════════════════════════════════

  const hasDiscount = data.items.some(i => (i.discount_amount || 0) > 0);

  // Build table header
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

  // Table rows — expand promotion items into header + sub-rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableBody: any[][] = [];
  let rowNum = 0;

  for (const item of data.items) {
    rowNum++;
    const hasComponents = item.promotion_components && item.promotion_components.length > 0;

    if (hasComponents) {
      // Promotion header row: # | name (purple) | (empty) | (empty) | [discount] | total
      const colCount = hasDiscount ? 6 : 5;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const headerRow: any[] = [
        { text: `${rowNum}`, alignment: 'center', fontSize: 11, margin: [0, 2, 0, 0] },
        {
          text: [
            { text: item.promotion_name || item.product_name, fontSize: 11, bold: true, color: '#6366f1' },
            { text: ` (×${item.quantity})`, fontSize: 9, color: '#888888' },
          ],
          margin: [0, 1, 0, 1],
        },
        { text: '', margin: [0, 2, 0, 0] },
        { text: '', margin: [0, 2, 0, 0] },
      ];
      if (hasDiscount) {
        headerRow.push({ text: '', margin: [0, 2, 0, 0] });
      }
      headerRow.push({ text: formatPdfPrice(item.total), alignment: 'right', fontSize: 11, bold: true, margin: [0, 2, 0, 0] });
      tableBody.push(headerRow);

      // Component sub-rows
      for (const comp of item.promotion_components!) {
        const compSubtitle = [comp.sku || comp.product_code, comp.role === 'gift' ? '[แถมฟรี]' : null].filter(Boolean).join(' ');
        const compProductStack = buildProductNameStack(`- ${comp.product_name}`, compSubtitle);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const compRow: any[] = [
          { text: '', margin: [0, 1, 0, 0] },
          { stack: compProductStack, margin: [8, 1, 0, 1], color: '#666666' },
          { text: `${comp.quantity}`, alignment: 'center', fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] },
          { text: '-', alignment: 'right', fontSize: 10, color: '#999999', margin: [0, 1, 0, 0] },
        ];
        if (hasDiscount) {
          compRow.push({ text: '', margin: [0, 1, 0, 0] });
        }
        compRow.push({ text: '', margin: [0, 1, 0, 0] });
        tableBody.push(compRow);
      }
    } else {
      // Normal item row
      const fullName = productDisplayName(item);
      const productStack = buildProductNameStack(fullName, null, item.sku || item.product_code, item.notes);

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

  if (vatRegistered && data.vat_amount > 0) {
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

  // Exchange credit (if applicable)
  if (data.exchange_credit && data.exchange_credit > 0) {
    // Show the pre-credit total first
    const preCredit = data.total_amount + data.exchange_credit;
    summaryRows.push([
      { text: 'ยอดรวมก่อนหักเครดิต', fontSize: 11, alignment: 'right', color: '#333333', bold: true },
      { text: formatPdfPrice(preCredit), fontSize: 11, alignment: 'right', bold: true },
    ]);
    summaryRows.push([
      { text: 'เครดิตจากการเปลี่ยนสินค้า', fontSize: 11, alignment: 'right', color: '#16a34a' },
      { text: `-${formatPdfPrice(data.exchange_credit)}`, fontSize: 11, alignment: 'right', color: '#16a34a' },
    ]);
  }

  // Grand total — bold, larger
  summaryRows.push([
    { text: data.exchange_credit && data.exchange_credit > 0 ? 'ยอดชำระสุทธิ' : 'ยอดรวมสุทธิ', fontSize: 12, alignment: 'right', color: '#333333', bold: true },
    { text: formatPdfPrice(data.total_amount), fontSize: 12, alignment: 'right', bold: true },
  ]);

  // Notes on the left (if not already shown in customer section)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bottomNotesStack: any[] = [];
  // Notes already shown in customer info section above, so skip here
  // But if no customer section was rendered, show notes here
  if (data.notes && !customerName && !addressParts) {
    bottomNotesStack.push({ text: 'หมายเหตุ:', fontSize: 10, bold: true, color: '#666666', margin: [0, 0, 0, 2] });
    bottomNotesStack.push({ text: data.notes, fontSize: 10, color: '#555555' });
  }

  content.push({
    columns: [
      {
        width: '*',
        stack: bottomNotesStack.length > 0 ? bottomNotesStack : [{ text: '' }],
        margin: [0, 8, 0, 0],
      },
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
  // ส่วนที่ 5 — ลายเซ็น (Footer)
  // ═══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docDefinition: any = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 16 },
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 110] as [number, number, number, number],
    background: () => buildCornerTriangle(theme.primary),
    footer: buildSignatureFooter(company?.name || '', 'ผู้ออกเอกสาร', 'ผู้รับสินค้า'),
    content: withOriginalAndCopy(content),
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

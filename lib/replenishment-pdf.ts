/**
 * Replenishment PDF — ใบส่งสินค้า (Delivery Note)
 * Same template as inventory-pdf.ts, adapted for flat replenishment items.
 * Orange theme (#F4511E), QR code for receive, price columns.
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
  buildProductNameStack,
  withOriginalAndCopy,
} from './pdf-utils';
import { productDisplayName } from '@/lib/product-display';

export type { CompanyInfo } from './pdf-utils';

const THEME_COLOR = '#F4511E';

export interface ReplenishmentPdfItem {
  product_name: string;
  variation_label: string | null;
  sku: string | null;
  quantity: number;
  confirmed_quantity?: number | null;  // ถ้ายืนยันแล้ว ให้แสดงจำนวนนี้แทน
  unit_price: number;
  image?: string | null;
}

export interface ReplenishmentPdfData {
  id: string;
  replenishment_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  receive_token?: string | null;
  total_amount?: number | null;
  shipping_fee?: number | null;
  customer: {
    name: string;
    customer_code?: string | null;
    phone?: string | null;
    tax_id?: string | null;
    tax_company_name?: string | null;
    tax_branch?: string | null;
    billing_address?: string | null;
    billing_district?: string | null;
    billing_amphoe?: string | null;
    billing_province?: string | null;
    billing_postal_code?: string | null;
  } | null;
  created_by_name?: string | null;
  confirm_notes?: string | null;
  items: ReplenishmentPdfItem[];
}

interface GenerateReplenishmentPdfOptions {
  data: ReplenishmentPdfData;
  company?: CompanyInfo;
  vatRegistered?: boolean;
}


export async function generateReplenishmentPdf({ data, company, vatRegistered = false }: GenerateReplenishmentPdfOptions): Promise<Blob> {
  if (!company) {
    company = (await fetchCompanyInfo()) || undefined;
  }

  const pdfMake = await setupPdfMake();
  const dateStr = formatPdfDate(data.created_at);
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  // QR code for receive link
  let qrDataUrl: string | null = null;
  if (data.receive_token) {
    try {
      const QRCode = (await import('qrcode')).default;
      const receiveUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/replenishments/receive/${data.receive_token}`;
      qrDataUrl = await QRCode.toDataURL(receiveUrl, { width: 160, margin: 1 });
    } catch { /* skip */ }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 1 — Header (logo + company | title + info box)
  // ═══════════════════════════════════════════════════

  const companyStack = buildCompanyStack(company, logoDataUrl);

  // Customer info — append to left column (under company info)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leftStack: any[] = [...companyStack];
  if (data.customer) {
    const addr = [
      data.customer.billing_address,
      data.customer.billing_district,
      data.customer.billing_amphoe,
      data.customer.billing_province,
      data.customer.billing_postal_code,
    ].filter(Boolean).join(' ');

    const custName = data.customer.tax_company_name || data.customer.name;
    const branchText = data.customer.tax_branch ? `  ${data.customer.tax_branch}` : '';

    leftStack.push({ text: 'ลูกค้า', fontSize: 10, color: THEME_COLOR, bold: true, margin: [0, 6, 0, 1] });
    leftStack.push({ text: custName + branchText, fontSize: 10, bold: true });
    if (addr) {
      leftStack.push({ text: addr, fontSize: 10 });
    }
    if (data.customer.tax_id) {
      leftStack.push({ text: `เลขประจำตัวผู้เสียภาษี ${data.customer.tax_id}`, fontSize: 10, color: '#666666' });
    }
  }

  // Info box rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [
    [{ text: 'เลขที่', fontSize: 10, color: THEME_COLOR, bold: true }, { text: data.replenishment_number, fontSize: 10, bold: true }],
    [{ text: 'วันที่', fontSize: 10, color: THEME_COLOR, bold: true }, { text: dateStr, fontSize: 10 }],
    [{ text: 'ตัวแทน', fontSize: 10, color: THEME_COLOR, bold: true }, { text: data.customer?.name || '-', fontSize: 10 }],
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rightStack: any[] = [
    { text: 'ใบส่งสินค้า', fontSize: 22, bold: true, color: THEME_COLOR, alignment: 'right', margin: [0, 0, 0, 6] },
    {
      table: {
        widths: [45, '*'],
        body: infoBoxRows,
      },
      layout: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0.5 : 0,
        vLineWidth: () => 0,
        hLineColor: () => '#cccccc',
        paddingTop: (i: number) => i === 0 ? 4 : 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paddingBottom: (i: number, node: any) => i === node.table.body.length - 1 ? 4 : 1,
        paddingLeft: () => 4,
        paddingRight: () => 4,
      },
    },
  ];

  content.push({
    columnGap: 16,
    columns: [
      { width: '*', stack: leftStack.length > 0 ? leftStack : [{ text: '' }] },
      { width: 220, stack: rightStack },
    ],
    margin: [0, 0, 0, 8],
  });

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 2 — ตารางรายการ (Items Table)
  // ═══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCols: any[] = [
    { text: '#', style: 'tableHeader', alignment: 'center' },
    { text: 'รายละเอียด', style: 'tableHeader' },
    { text: 'จำนวน', style: 'tableHeader', alignment: 'center' },
    { text: 'ราคา', style: 'tableHeader', alignment: 'right' },
    { text: 'ยอดรวม', style: 'tableHeader', alignment: 'right' },
  ];
  const widths: (number | string)[] = [25, '*', 50, 70, 70];

  // ใช้ confirmed_quantity เฉพาะเมื่อ status = received/partial_received (ยืนยันรับแล้ว)
  const isConfirmed = ['received', 'partial_received'].includes(data.status);

  const tableBody = data.items.map((item, idx) => {
    const displayQty = (isConfirmed && item.confirmed_quantity != null) ? item.confirmed_quantity : item.quantity;
    const fullName = productDisplayName(item);
    // ถ้าจำนวนไม่ตรง แสดงหมายเหตุ
    const hasMismatch = isConfirmed && item.confirmed_quantity != null && item.confirmed_quantity !== item.quantity;
    const mismatchNote = hasMismatch ? `(ส่ง ${item.quantity} รับ ${item.confirmed_quantity})` : null;
    const subParts = [item.sku ? `SKU: ${item.sku}` : null, mismatchNote].filter(Boolean);
    const subText = subParts.length > 0 ? subParts.join('  ') : null;

    const productStack = buildProductNameStack(fullName, subText);

    const lineTotal = item.unit_price * displayQty;

    return [
      { text: `${idx + 1}`, alignment: 'center', fontSize: 10 },
      { stack: productStack },
      { text: `${displayQty}`, alignment: 'center', fontSize: 10 },
      { text: formatPdfPrice(item.unit_price), alignment: 'right', fontSize: 10 },
      { text: formatPdfPrice(lineTotal), alignment: 'right', fontSize: 10 },
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
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
      vLineWidth: () => 0,
      hLineColor: (i: number) => i <= 1 ? '#333333' : '#e5e7eb',
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
  });

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 3 — สรุปยอด + หมายเหตุ
  // ═══════════════════════════════════════════════════

  const totalQty = data.items.reduce((s, i) => s + ((isConfirmed && i.confirmed_quantity != null) ? i.confirmed_quantity : i.quantity), 0);
  const subtotal = data.items.reduce((s, i) => {
    const qty = (isConfirmed && i.confirmed_quantity != null) ? i.confirmed_quantity : i.quantity;
    return s + i.unit_price * qty;
  }, 0);
  const shippingFee = data.shipping_fee || 0;
  const preVat = subtotal + shippingFee;
  const vatAmount = vatRegistered ? Math.round(preVat * 7 / 107 * 100) / 100 : 0;
  const grandTotal = preVat;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryRows: any[][] = [];
  summaryRows.push([
    { text: 'จำนวนรายการ', fontSize: 10, alignment: 'right', color: '#555555' },
    { text: `${data.items.length}`, fontSize: 10, alignment: 'right', bold: true },
  ]);
  summaryRows.push([
    { text: 'รวมจำนวน (ชิ้น)', fontSize: 10, alignment: 'right', color: '#555555', bold: true },
    { text: `${totalQty}`, fontSize: 10, alignment: 'right', bold: true },
  ]);
  summaryRows.push([
    { text: 'รวมเป็นเงิน', fontSize: 10, alignment: 'right', color: '#555555' },
    { text: formatPdfPrice(subtotal), fontSize: 10, alignment: 'right' },
  ]);
  if (shippingFee > 0) {
    summaryRows.push([
      { text: 'ค่าจัดส่ง', fontSize: 10, alignment: 'right', color: '#555555' },
      { text: formatPdfPrice(shippingFee), fontSize: 10, alignment: 'right' },
    ]);
  }
  if (vatRegistered) {
    summaryRows.push([
      { text: 'มูลค่าก่อน VAT', fontSize: 10, alignment: 'right', color: '#555555' },
      { text: formatPdfPrice(grandTotal - vatAmount), fontSize: 10, alignment: 'right' },
    ]);
    summaryRows.push([
      { text: 'VAT 7%', fontSize: 10, alignment: 'right', color: '#555555' },
      { text: formatPdfPrice(vatAmount), fontSize: 10, alignment: 'right' },
    ]);
  }
  summaryRows.push([
    { text: 'ยอดรวมสุทธิ (บาท)', fontSize: 11, alignment: 'right', color: THEME_COLOR, bold: true },
    { text: formatPdfPrice(grandTotal), fontSize: 11, alignment: 'right', bold: true, color: THEME_COLOR },
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notesStack: any[] = [];
  if (data.notes) {
    notesStack.push({ text: 'หมายเหตุ:', fontSize: 10, bold: true, color: '#666666', margin: [0, 0, 0, 1] });
    notesStack.push({ text: data.notes, fontSize: 10, color: '#555555' });
  }
  if (data.confirm_notes) {
    notesStack.push({ text: 'หมายเหตุการยืนยัน:', fontSize: 10, bold: true, color: '#b45309', margin: [0, 4, 0, 1] });
    notesStack.push({ text: data.confirm_notes, fontSize: 10, color: '#555555' });
  }
  if (qrDataUrl) {
    notesStack.push({ image: qrDataUrl, width: 50, height: 50, margin: [0, 6, 0, 0] });
    notesStack.push({ text: 'สแกนเพื่อรับสินค้า', fontSize: 7, color: '#888888', margin: [0, 2, 0, 0] });
  }

  content.push({
    columns: [
      { width: '*', stack: notesStack.length > 0 ? notesStack : [{ text: '' }], margin: [0, 4, 0, 0] },
      {
        width: 240,
        table: {
          widths: ['*', 70],
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
        margin: [0, 4, 0, 0],
      },
    ],
  });

  const docDefinition = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 16 },
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 110] as [number, number, number, number],
    background: () => buildCornerTriangle(THEME_COLOR),
    footer: buildSignatureFooter(company?.name || '', 'ผู้ส่งสินค้า', 'ผู้รับสินค้า'),
    content: withOriginalAndCopy(content),
    styles: {
      tableHeader: { bold: true, fontSize: 10, color: '#333333' },
    },
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

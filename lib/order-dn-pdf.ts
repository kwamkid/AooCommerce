/**
 * Order Delivery Note (DN) PDF — ใบส่งสินค้า
 * สำหรับ order ที่มี dn_number (Flow B no-VAT, etc.)
 * ไม่แสดงราคา — แค่รายการสินค้า + จำนวน
 * Amber theme (#b45309), adapted from replenishment-pdf.ts
 */

import {
  type CompanyInfo,
  fetchCompanyInfo,
  setupPdfMake,
  loadLogoDataUrl,
  formatPdfDate,
  buildCompanyStack,
  buildCornerTriangle,
  buildSignatureFooter,
  buildProductNameStack,
  withOriginalAndCopy,
} from './pdf-utils';

const THEME_COLOR = '#b45309';

export interface OrderDnItem {
  product_name: string;
  variation_label?: string | null;
  sku?: string | null;
  quantity: number;
}

export interface OrderDnData {
  dn_number: string;
  order_number: string;
  dn_date: string;
  delivery_name: string;
  delivery_phone?: string;
  delivery_address?: string;
  delivery_district?: string;
  delivery_amphoe?: string;
  delivery_province?: string;
  delivery_postal_code?: string;
  notes?: string;
  items: OrderDnItem[];
}

export async function generateOrderDnPdf(
  data: OrderDnData,
  options?: { company?: CompanyInfo },
): Promise<Blob> {
  const company = options?.company || (await fetchCompanyInfo()) || undefined;
  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;
  const dateStr = formatPdfDate(data.dn_date || new Date().toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 1 — Header (logo + company | title + info box)
  // ═══════════════════════════════════════════════════

  const companyStack = buildCompanyStack(company, logoDataUrl);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [
    [{ text: 'เลขที่', fontSize: 10, color: THEME_COLOR, bold: true }, { text: data.dn_number, fontSize: 10, bold: true }],
    [{ text: 'วันที่', fontSize: 10, color: THEME_COLOR, bold: true }, { text: dateStr, fontSize: 10 }],
    [{ text: 'อ้างอิง', fontSize: 10, color: THEME_COLOR, bold: true }, { text: data.order_number, fontSize: 10 }],
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
      { width: '*', stack: companyStack.length > 0 ? companyStack : [{ text: '' }] },
      { width: 220, stack: rightStack },
    ],
    margin: [0, 0, 0, 4],
  });

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 1.5 — ผู้รับสินค้า (delivery address)
  // ═══════════════════════════════════════════════════

  const addr = [
    data.delivery_address,
    data.delivery_district,
    data.delivery_amphoe,
    data.delivery_province,
    data.delivery_postal_code,
  ].filter(Boolean).join(' ');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const destStack: any[] = [
    { text: 'ผู้รับสินค้า', fontSize: 10, color: THEME_COLOR, bold: true, margin: [0, 0, 0, 1] },
    { text: data.delivery_name, fontSize: 10, bold: true },
  ];
  if (data.delivery_phone) {
    destStack.push({ text: `โทร ${data.delivery_phone}`, fontSize: 10, color: '#666666' });
  }
  if (addr) {
    destStack.push({ text: addr, fontSize: 10 });
  }

  content.push({ stack: destStack, margin: [0, 0, 0, 8] });

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 2 — ตารางรายการ (ไม่มีราคา)
  // ═══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCols: any[] = [
    { text: '#', style: 'tableHeader', alignment: 'center' },
    { text: 'รายละเอียด', style: 'tableHeader' },
    { text: 'จำนวน', style: 'tableHeader', alignment: 'center' },
  ];
  const widths: (number | string)[] = [25, '*', 60];

  const tableBody = data.items.map((item, idx) => {
    const fullName = item.product_name + (item.variation_label ? ` - ${item.variation_label}` : '');
    const subText = item.sku ? `SKU: ${item.sku}` : null;
    const productStack = buildProductNameStack(fullName, subText);

    return [
      { text: `${idx + 1}`, alignment: 'center', fontSize: 10 },
      { stack: productStack },
      { text: `${item.quantity}`, alignment: 'center', fontSize: 10 },
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
  // ส่วนที่ 3 — สรุป + หมายเหตุ
  // ═══════════════════════════════════════════════════

  const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryRows: any[][] = [
    [
      { text: 'จำนวนรายการ', fontSize: 10, alignment: 'right', color: '#555555' },
      { text: `${data.items.length}`, fontSize: 10, alignment: 'right', bold: true },
    ],
    [
      { text: 'รวมจำนวน (ชิ้น)', fontSize: 10, alignment: 'right', color: THEME_COLOR, bold: true },
      { text: `${totalQty}`, fontSize: 10, alignment: 'right', bold: true, color: THEME_COLOR },
    ],
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notesStack: any[] = [];
  if (data.notes) {
    notesStack.push({ text: 'หมายเหตุ:', fontSize: 10, bold: true, color: '#666666', margin: [0, 0, 0, 1] });
    notesStack.push({ text: data.notes, fontSize: 10, color: '#555555' });
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
      tableHeader: { bold: true, fontSize: 10, fillColor: '#fafafa' },
    },
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

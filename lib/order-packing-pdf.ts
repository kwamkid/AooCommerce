/**
 * Order Packing List PDF generation.
 * FlowAccount-style template matching inventory-pdf.ts / order-invoice-pdf.ts design.
 *
 * ใบจัดของ — สำหรับคลังสินค้าจัดเตรียมสินค้า
 * สี: #6366f1 (indigo)
 * มี checkbox column สำหรับติ๊ก
 * ไม่มีคอลัมน์ราคา
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
} from './pdf-utils';

// ─── Interfaces ──────────────────────────────────────────

interface PackingItem {
  product_name: string;
  product_code?: string;
  variation_label?: string;
  quantity: number;
}

export interface PackingListData {
  order_number: string;
  order_date?: string;
  created_at: string;
  order_status?: string;
  notes?: string;
  customer?: { name?: string; phone?: string } | null;
  delivery_name?: string;
  delivery_phone?: string;
  delivery_address?: string;
  delivery_district?: string;
  delivery_amphoe?: string;
  delivery_province?: string;
  delivery_postal_code?: string;
  items: PackingItem[];
}

// ─── Theme ───────────────────────────────────────────────

const THEME = { primary: '#6366f1' };

// ─── Helpers ─────────────────────────────────────────────

const MAX_NAME_LEN = 70;
const truncateName = (name: string) => name.length > MAX_NAME_LEN ? name.slice(0, MAX_NAME_LEN) + '...' : name;

// ─── Main Export ─────────────────────────────────────────

interface GenerateOptions {
  data: PackingListData;
  company?: CompanyInfo;
}

export async function generatePackingListPdf({ data, company }: GenerateOptions) {
  if (!company) {
    company = (await fetchCompanyInfo()) || undefined;
  }

  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  const dateStr = formatPdfDate(data.order_date || data.created_at);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 1 — Header
  // ═══════════════════════════════════════════════════

  const companyStack = buildCompanyStack(company, logoDataUrl);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [
    [{ text: 'เลขที่', fontSize: 10, color: THEME.primary, bold: true }, { text: data.order_number, fontSize: 10, bold: true }],
    [{ text: 'วันที่', fontSize: 10, color: THEME.primary, bold: true }, { text: dateStr, fontSize: 10 }],
  ];

  content.push({
    columns: [
      {
        width: '*',
        stack: companyStack.length > 0 ? companyStack : [{ text: '' }],
      },
      {
        width: 230,
        stack: [
          { text: 'ใบจัดของ', fontSize: 24, bold: true, color: THEME.primary, alignment: 'right', margin: [0, 0, 0, 6] },
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
  // ส่วนที่ 2 — ข้อมูลจัดส่ง
  // ═══════════════════════════════════════════════════

  const customerName = data.delivery_name || data.customer?.name || '';
  const customerPhone = data.delivery_phone || data.customer?.phone || '';
  const addressParts = [
    data.delivery_address, data.delivery_district, data.delivery_amphoe,
    data.delivery_province, data.delivery_postal_code,
  ].filter(Boolean).join(' ');

  if (customerName || addressParts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deliveryStack: any[] = [
      { text: 'จัดส่งถึง', fontSize: 10, bold: true, color: THEME.primary, margin: [0, 0, 0, 4] },
      { text: customerName, fontSize: 12, bold: true, color: '#333333' },
    ];

    if (customerPhone) {
      deliveryStack.push({ text: `โทร: ${customerPhone}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
    }
    if (addressParts) {
      deliveryStack.push({ text: `ที่อยู่: ${addressParts}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notesStack: any[] = [];
    if (data.notes) {
      notesStack.push({ text: 'หมายเหตุ', fontSize: 10, bold: true, color: THEME.primary, margin: [0, 0, 0, 4] });
      notesStack.push({ text: data.notes, fontSize: 10, color: '#555555' });
    }

    content.push({
      columns: [
        { width: '*', stack: deliveryStack },
        ...(notesStack.length > 0 ? [{ width: 200, stack: notesStack }] : []),
      ],
      margin: [0, 0, 0, 12],
    });
  }

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 3 — ตารางสินค้า (มี checkbox)
  // ═══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCols: any[] = [
    { text: '☐', style: 'tableHeader', alignment: 'center' },
    { text: '#', style: 'tableHeader', alignment: 'center' },
    { text: 'รายละเอียด', style: 'tableHeader' },
    { text: 'จำนวน', style: 'tableHeader', alignment: 'center' },
  ];
  const widths: (number | string)[] = [25, 25, '*', 50];

  const tableBody = data.items.map((item, idx) => {
    const nameText = truncateName(item.product_name);
    const subtitleParts = [item.product_code, item.variation_label].filter(Boolean);
    const subtitle = subtitleParts.join(' | ');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productStack: any[] = [{ text: nameText, fontSize: 11 }];
    if (subtitle) productStack.push({ text: subtitle, fontSize: 9, color: '#888888' });

    return [
      { text: '☐', alignment: 'center', fontSize: 14, margin: [0, 1, 0, 0] },
      { text: `${idx + 1}`, alignment: 'center', fontSize: 11, margin: [0, 2, 0, 0] },
      { stack: productStack, margin: [0, 1, 0, 1] },
      { text: `${item.quantity}`, alignment: 'center', fontSize: 11, margin: [0, 2, 0, 0] },
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
      paddingTop: () => 5,
      paddingBottom: () => 5,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
  });

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 4 — สรุป
  // ═══════════════════════════════════════════════════

  const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryRows: any[][] = [
    [
      { text: 'จำนวนรายการ', fontSize: 11, alignment: 'right', color: '#555555' },
      { text: `${data.items.length}`, fontSize: 11, alignment: 'right' },
    ],
    [
      { text: 'รวมจัดของทั้งหมด (ชิ้น)', fontSize: 11, alignment: 'right', color: '#333333', bold: true },
      { text: `${totalQty}`, fontSize: 11, alignment: 'right', bold: true },
    ],
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bottomNotesStack: any[] = [];
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
          widths: ['*', 60],
          body: summaryRows,
        },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
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

  const docDefinition = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 16 },
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 110] as [number, number, number, number],
    background: () => buildCornerTriangle(THEME.primary),
    footer: buildSignatureFooter(company?.name || '', 'ผู้จัดเตรียมสินค้า', 'ผู้ตรวจสอบ'),
    content,
    styles: {
      tableHeader: { bold: true, fontSize: 11, color: '#333333' },
    },
  };

  pdfMake.createPdf(docDefinition).open();
}

/**
 * Credit Note (ใบลดหนี้) PDF generation.
 * FlowAccount-style template matching order-invoice-pdf.ts design.
 *
 * Color: red #dc2626
 * Title: ใบลดหนี้ (if VAT → ใบลดหนี้/ใบกำกับภาษี)
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
} from './pdf-utils';

// ─── Interfaces ──────────────────────────────────────────

interface CnItemData {
  product_name: string;
  product_code?: string | null;
  variation_label?: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  total: number;
}

interface CnData {
  cn_number: string;
  type: 'void' | 'refund' | 'exchange';
  status: string;
  reason?: string | null;
  subtotal: number;
  discount_amount: number;
  vat_amount: number;
  total_amount: number;
  issued_at: string;
  order?: {
    order_number?: string;
    source?: string;
    customer?: {
      name?: string;
      phone?: string;
    } | null;
  } | null;
  items: CnItemData[];
}

// ─── Theme ──────────────────────────────────────────────

const THEME = { primary: '#dc2626' };

// ─── Helpers ────────────────────────────────────────────

const MAX_NAME_LEN = 70;
const truncateName = (name: string) => name.length > MAX_NAME_LEN ? name.slice(0, MAX_NAME_LEN) + '...' : name;

function getCnTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    void: 'ยกเลิกบิล',
    refund: 'คืนสินค้า',
    exchange: 'เปลี่ยนสินค้า',
  };
  return labels[type] || type;
}

// ─── Main Export ─────────────────────────────────────────

export async function generateCreditNotePdf(data: CnData, vatRegistered = false): Promise<Blob> {
  const company = await fetchCompanyInfo() || undefined;
  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  const docTitle = vatRegistered ? 'ใบลดหนี้/ใบกำกับภาษี' : 'ใบลดหนี้';
  const dateStr = formatPdfDate(data.issued_at);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ═══════════════════════════════════════════════════
  // Section 1 — Header
  // ═══════════════════════════════════════════════════

  const companyStack = buildCompanyStack(company, logoDataUrl);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [
    [
      { text: 'เลขที่', fontSize: 10, color: THEME.primary, bold: true },
      { text: data.cn_number, fontSize: 10, bold: true },
    ],
    [
      { text: 'วันที่', fontSize: 10, color: THEME.primary, bold: true },
      { text: dateStr, fontSize: 10 },
    ],
    [
      { text: 'ประเภท', fontSize: 10, color: THEME.primary, bold: true },
      { text: getCnTypeLabel(data.type), fontSize: 10, bold: true },
    ],
  ];

  if (data.order?.order_number) {
    infoBoxRows.push([
      { text: 'อ้างอิง', fontSize: 10, color: THEME.primary, bold: true },
      { text: data.order.order_number, fontSize: 10 },
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
          { text: docTitle, fontSize: vatRegistered ? 18 : 24, bold: true, color: THEME.primary, alignment: 'right', margin: [0, 0, 0, 6] },
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
  // Section 2 — Customer info + Reason
  // ═══════════════════════════════════════════════════

  const customerName = data.order?.customer?.name || '';
  const customerPhone = data.order?.customer?.phone || '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leftStack: any[] = [];
  if (customerName) {
    leftStack.push(
      { text: 'ลูกค้า', fontSize: 10, bold: true, color: THEME.primary, margin: [0, 0, 0, 4] },
      { text: customerName, fontSize: 12, bold: true, color: '#333333' },
    );
    if (customerPhone) {
      leftStack.push({ text: `โทร: ${customerPhone}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rightStack: any[] = [];
  if (data.reason) {
    rightStack.push(
      { text: 'เหตุผล', fontSize: 10, bold: true, color: THEME.primary, margin: [0, 0, 0, 4] },
      { text: data.reason, fontSize: 10, color: '#555555' },
    );
  }

  if (leftStack.length > 0 || rightStack.length > 0) {
    content.push({
      columns: [
        { width: '*', stack: leftStack.length > 0 ? leftStack : [{ text: '' }] },
        ...(rightStack.length > 0 ? [{ width: 200, stack: rightStack }] : []),
      ],
      margin: [0, 0, 0, 12],
    });
  }

  // ═══════════════════════════════════════════════════
  // Section 3 — Items table
  // ═══════════════════════════════════════════════════

  const hasDiscount = data.items.some(i => Number(i.discount_amount || 0) > 0);

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
  widths.push(70);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableBody: any[][] = [headerCols];

  data.items.forEach((item, idx) => {
    const productName = truncateName(item.product_name || '');
    const subtitle = [item.product_code, item.variation_label].filter(Boolean).join(' · ');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameContent: any[] = [{ text: productName, fontSize: 11, color: '#333333' }];
    if (subtitle) {
      nameContent.push({ text: subtitle, fontSize: 9, color: '#999999', margin: [0, 1, 0, 0] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any[] = [
      { text: String(idx + 1), alignment: 'center', fontSize: 10, color: '#666666' },
      { stack: nameContent },
      { text: String(item.quantity), alignment: 'center', fontSize: 10 },
      { text: formatPdfPrice(item.unit_price), alignment: 'right', fontSize: 10 },
    ];

    if (hasDiscount) {
      row.push({
        text: Number(item.discount_amount) > 0 ? formatPdfPrice(item.discount_amount) : '-',
        alignment: 'right',
        fontSize: 10,
        color: '#999999',
      });
    }

    row.push({ text: formatPdfPrice(item.total), alignment: 'right', fontSize: 10, bold: true });
    tableBody.push(row);
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
      { text: 'รวมสินค้า', fontSize: 10, alignment: 'right', color: '#666666' },
      { text: formatPdfPrice(data.subtotal), fontSize: 10, alignment: 'right' },
    ],
  ];

  if (Number(data.discount_amount) > 0) {
    summaryRows.push([
      { text: 'ส่วนลด', fontSize: 10, alignment: 'right', color: '#666666' },
      { text: `-${formatPdfPrice(data.discount_amount)}`, fontSize: 10, alignment: 'right', color: THEME.primary },
    ]);
  }

  if (Number(data.vat_amount) > 0) {
    summaryRows.push([
      { text: 'VAT 7%', fontSize: 10, alignment: 'right', color: '#666666' },
      { text: formatPdfPrice(data.vat_amount), fontSize: 10, alignment: 'right' },
    ]);
  }

  summaryRows.push([
    { text: 'รวมทั้งสิ้น', fontSize: 12, alignment: 'right', bold: true, color: THEME.primary },
    { text: `฿${formatPdfPrice(data.total_amount)}`, fontSize: 12, alignment: 'right', bold: true, color: THEME.primary },
  ]);

  content.push({
    columns: [
      { width: '*', text: '' },
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
    content,
    background: buildCornerTriangle(THEME.primary),
    footer: buildSignatureFooter(companyName, 'ผู้ออกเอกสาร', 'ผู้รับเอกสาร'),
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

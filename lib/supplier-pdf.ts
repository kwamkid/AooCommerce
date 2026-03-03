/**
 * Supplier PDF generation: PO PDF + Supplier Report PDF
 * Uses same FlowAccount-style template as inventory-pdf.ts
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

// ─── PO PDF ─────────────────────────────────────────

interface POItem {
  variation_id: string;
  quantity: number;
  received_quantity?: number;
  unit_cost: number;
  notes: string | null;
  variation: {
    id: string;
    variation_label: string | null;
    sku: string | null;
    barcode?: string | null;
    product: { id: string; code: string; name: string; image: string | null } | null;
  } | null;
}

interface POData {
  po_number: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  total_amount: number;
  notes: string | null;
  supplier: { name: string; contact_name?: string | null; phone?: string | null } | null;
  warehouse: { name: string } | null;
  created_by_user: { name: string } | null;
  items: POItem[];
}

const PO_THEME = { primary: '#2563eb' }; // Blue for PO

function getItemName(item: POItem): string {
  const name = item.variation?.product?.name || '-';
  const varLabel = item.variation?.variation_label;
  return varLabel ? `${name} - ${varLabel}` : name;
}

function getItemSubtitle(item: POItem): string {
  const parts: string[] = [];
  if (item.variation?.product?.code) parts.push(item.variation.product.code);
  if (item.variation?.sku) parts.push(`SKU: ${item.variation.sku}`);
  return parts.join(' | ');
}

const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'ร่าง', sent: 'แจ้ง Sup แล้ว', partial_received: 'รับบางส่วน',
  received: 'รับครบ', closed: 'ปิด', cancelled: 'ยกเลิก',
};

export async function generatePOPdf(data: POData, company?: CompanyInfo): Promise<Blob> {
  if (!company) company = (await fetchCompanyInfo()) || undefined;
  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  const dateStr = formatPdfDate(data.order_date);
  const theme = PO_THEME;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // Header
  const companyStack = buildCompanyStack(company, logoDataUrl);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [
    [{ text: 'เลขที่', fontSize: 10, color: theme.primary, bold: true }, { text: data.po_number, fontSize: 10, bold: true }],
    [{ text: 'วันที่', fontSize: 10, color: theme.primary, bold: true }, { text: dateStr, fontSize: 10 }],
    [{ text: 'สถานะ', fontSize: 10, color: theme.primary, bold: true }, { text: PO_STATUS_LABELS[data.status] || data.status, fontSize: 10, bold: true }],
    [{ text: 'ผู้สั่ง', fontSize: 10, color: theme.primary, bold: true }, { text: data.created_by_user?.name || '-', fontSize: 10 }],
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rightStack: any[] = [
    { text: 'ใบสั่งซื้อ', fontSize: 24, bold: true, color: theme.primary, alignment: 'right', margin: [0, 0, 0, 6] },
    {
      table: { widths: [45, '*'], body: infoBoxRows },
      layout: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0.5 : 0,
        vLineWidth: () => 0,
        hLineColor: () => '#cccccc',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paddingTop: (i: number) => i === 0 ? 6 : 2,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paddingBottom: (_i: number, node: any) => _i === node.table.body.length - 1 ? 6 : 2,
      },
    },
  ];

  content.push({
    columns: [
      { width: '*', stack: companyStack },
      { width: 230, stack: rightStack },
    ],
    margin: [0, 0, 0, 10],
  });

  // Supplier + Warehouse info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoLines: any[] = [];
  if (data.supplier) {
    infoLines.push({ text: `ซัพพลายเออร์: ${data.supplier.name}`, fontSize: 10, color: '#333' });
    if (data.supplier.contact_name) infoLines.push({ text: `  ผู้ติดต่อ: ${data.supplier.contact_name}`, fontSize: 9, color: '#666' });
    if (data.supplier.phone) infoLines.push({ text: `  เบอร์: ${data.supplier.phone}`, fontSize: 9, color: '#666' });
  }
  if (data.warehouse) {
    infoLines.push({ text: `คลัง: ${data.warehouse.name}`, fontSize: 10, color: '#333', margin: [0, 4, 0, 0] });
  }
  if (infoLines.length > 0) {
    content.push({ stack: infoLines, alignment: 'right', margin: [0, 0, 0, 10] });
  }

  // Items Table
  const tableWidths = [25, '*', 50, 70, 70];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerRow: any[] = [
    { text: '#', fontSize: 9, bold: true, color: '#333' },
    { text: 'รายละเอียด', fontSize: 9, bold: true, color: '#333' },
    { text: 'จำนวน', fontSize: 9, bold: true, color: '#333', alignment: 'center' },
    { text: 'ราคา', fontSize: 9, bold: true, color: '#333', alignment: 'right' },
    { text: 'ยอดรวม', fontSize: 9, bold: true, color: '#333', alignment: 'right' },
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableBody: any[] = [headerRow];

  data.items.forEach((item, idx) => {
    const lineTotal = item.quantity * (item.unit_cost || 0);
    const subtitle = getItemSubtitle(item);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameStack: any[] = [{ text: getItemName(item), fontSize: 11 }];
    if (subtitle) nameStack.push({ text: subtitle, fontSize: 9, color: '#999999' });

    tableBody.push([
      { text: String(idx + 1), fontSize: 10, alignment: 'center' },
      { stack: nameStack },
      { text: item.quantity.toLocaleString(), fontSize: 10, alignment: 'center' },
      { text: formatPdfPrice(item.unit_cost || 0), fontSize: 10, alignment: 'right' },
      { text: formatPdfPrice(lineTotal), fontSize: 10, alignment: 'right' },
    ]);
  });

  content.push({
    table: { headerRows: 1, widths: tableWidths, body: tableBody },
    layout: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hLineWidth: (i: number, node: any) => i <= 1 || i === node.table.body.length ? 1 : 0.5,
      vLineWidth: () => 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hLineColor: (i: number, node: any) => i <= 1 || i === node.table.body.length ? '#333333' : '#e5e7eb',
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 0, 0, 10],
  });

  // Summary
  const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryRows: any[][] = [
    [{ text: 'จำนวนรายการ', fontSize: 10, alignment: 'right' }, { text: `${data.items.length}`, fontSize: 10, alignment: 'right' }],
    [{ text: 'รวมสินค้า (ชิ้น)', fontSize: 10, alignment: 'right', bold: true }, { text: `${totalQty.toLocaleString()}`, fontSize: 10, alignment: 'right', bold: true }],
    [{ text: 'รวมเป็นเงิน (บาท)', fontSize: 10, alignment: 'right', bold: true }, { text: formatPdfPrice(data.total_amount), fontSize: 10, alignment: 'right', bold: true }],
  ];

  content.push({
    columns: [
      { width: '*', stack: data.notes ? [{ text: 'หมายเหตุ', fontSize: 10, bold: true, margin: [0, 0, 0, 2] }, { text: data.notes, fontSize: 10, color: '#666666' }] : [] },
      {
        width: 260,
        table: { widths: ['*', 'auto'], body: summaryRows },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 2, paddingBottom: () => 2 },
      },
    ],
    margin: [0, 0, 0, 10],
  });

  const companyName = company?.tax_company_name || company?.name || '';
  const docDefinition = {
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 110] as [number, number, number, number],
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 10 },
    background: [buildCornerTriangle(theme.primary)],
    content,
    footer: buildSignatureFooter(companyName, 'ผู้สั่งซื้อ', 'ซัพพลายเออร์'),
  };

  return pdfMake.createPdf(docDefinition).getBlob();
}

// ─── Supplier Report PDF ─────────────────────────────

interface ReportVariation {
  id: string;
  variation_label: string | null;
  sku: string | null;
  product: { code: string; name: string } | null;
}

interface ReportStockItem {
  warehouse_id: string;
  variation_id: string;
  quantity: number;
  warehouse: { name: string } | null;
  variation: ReportVariation | null;
}

interface ReportSalesItem {
  variation_id: string;
  source: string;
  quantity_sold: number;
  revenue: number;
  variation: ReportVariation | null;
}

interface ReportReceiveItem {
  variation_id: string;
  quantity: number;
  amount: number;
  variation: ReportVariation | null;
  receive?: { receive_number: string } | null;
  po?: { po_number: string } | null;
}

interface SnapshotReportData {
  supplier_type: string;
  period_year: number;
  period_month: number;
  status: string;
  total_stock_remaining: number;
  total_sold_quantity: number;
  total_sold_amount: number;
  total_received_quantity: number;
  total_received_amount: number;
  supplier: { name: string } | null;
  stock_items: ReportStockItem[];
  sales_items: ReportSalesItem[];
  receive_items: ReportReceiveItem[];
}

const MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const SOURCE_LABELS: Record<string, string> = {
  manual: 'ออเดอร์ปกติ', shopee: 'Shopee', tiktok: 'TikTok', lazada: 'Lazada',
  pos: 'POS', line: 'Line', facebook: 'Facebook', all: 'ทุกช่องทาง',
};

const REPORT_THEMES: Record<string, { primary: string }> = {
  credit: { primary: '#2563eb' },
  consignment: { primary: '#b45309' },
};

function getVarName(v: ReportVariation | null): string {
  if (!v) return '-';
  const name = v.product?.name || '';
  return v.variation_label ? `${name} - ${v.variation_label}` : name;
}

function getVarSub(v: ReportVariation | null): string {
  if (!v) return '';
  const parts: string[] = [];
  if (v.product?.code) parts.push(v.product.code);
  if (v.sku) parts.push(`SKU: ${v.sku}`);
  return parts.join(' | ');
}

export async function generateReportPdf(data: SnapshotReportData, company?: CompanyInfo): Promise<Blob> {
  if (!company) company = (await fetchCompanyInfo()) || undefined;
  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  const isConsignment = data.supplier_type === 'consignment';
  const theme = REPORT_THEMES[data.supplier_type] || REPORT_THEMES.credit;
  const periodStr = `${MONTHS_FULL[data.period_month - 1]} ${data.period_year + 543}`;
  const docTitle = isConsignment ? 'รายงานยอดขาย' : 'รายงานยอดค้างจ่าย';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // Header
  const companyStack = buildCompanyStack(company, logoDataUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [
    [{ text: 'Supplier', fontSize: 10, color: theme.primary, bold: true }, { text: data.supplier?.name || '-', fontSize: 10, bold: true }],
    [{ text: 'ประเภท', fontSize: 10, color: theme.primary, bold: true }, { text: isConsignment ? 'ฝากขาย' : 'เครดิต', fontSize: 10 }],
    [{ text: 'ประจำ', fontSize: 10, color: theme.primary, bold: true }, { text: periodStr, fontSize: 10 }],
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rightStack: any[] = [
    { text: docTitle, fontSize: 22, bold: true, color: theme.primary, alignment: 'right', margin: [0, 0, 0, 6] },
    {
      table: { widths: [50, '*'], body: infoBoxRows },
      layout: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length) ? 0.5 : 0,
        vLineWidth: () => 0,
        hLineColor: () => '#cccccc',
        paddingTop: (i: number) => i === 0 ? 6 : 2,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paddingBottom: (_i: number, node: any) => _i === node.table.body.length - 1 ? 6 : 2,
      },
    },
  ];

  content.push({
    columns: [
      { width: '*', stack: companyStack },
      { width: 250, stack: rightStack },
    ],
    margin: [0, 0, 0, 12],
  });

  // ─── Stock Section ───
  if (data.stock_items.length > 0) {
    content.push({ text: 'สินค้าคงเหลือ', fontSize: 12, bold: true, color: theme.primary, margin: [0, 4, 0, 6] });

    // Group by warehouse
    const stockByWh = new Map<string, { name: string; items: ReportStockItem[] }>();
    for (const item of data.stock_items) {
      const key = item.warehouse_id;
      if (!stockByWh.has(key)) stockByWh.set(key, { name: item.warehouse?.name || 'คลัง', items: [] });
      stockByWh.get(key)!.items.push(item);
    }

    for (const [, group] of stockByWh) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows: any[][] = [
        [
          { text: '#', fontSize: 9, bold: true },
          { text: 'รายละเอียด', fontSize: 9, bold: true },
          { text: 'จำนวน', fontSize: 9, bold: true, alignment: 'right' },
        ],
      ];

      group.items.forEach((item, idx) => {
        const sub = getVarSub(item.variation);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nameStack: any[] = [{ text: getVarName(item.variation), fontSize: 10 }];
        if (sub) nameStack.push({ text: sub, fontSize: 8, color: '#999' });
        rows.push([
          { text: String(idx + 1), fontSize: 9 },
          { stack: nameStack },
          { text: item.quantity.toLocaleString(), fontSize: 10, alignment: 'right' },
        ]);
      });

      content.push(
        { text: group.name, fontSize: 10, color: '#666', margin: [0, 0, 0, 3] },
        {
          table: { headerRows: 1, widths: [25, '*', 60], body: rows },
          layout: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            hLineWidth: (i: number, node: any) => i <= 1 || i === node.table.body.length ? 0.5 : 0.3,
            vLineWidth: () => 0,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            hLineColor: (i: number, node: any) => i <= 1 || i === node.table.body.length ? '#333' : '#e5e7eb',
            paddingTop: () => 3, paddingBottom: () => 3,
          },
          margin: [0, 0, 0, 8],
        },
      );
    }

    content.push({ text: `รวมสินค้าคงเหลือ: ${data.total_stock_remaining.toLocaleString()} ชิ้น`, fontSize: 10, bold: true, alignment: 'right', margin: [0, 0, 0, 12] });
  }

  // ─── Sales Section (Consignment) ───
  if (isConsignment && data.sales_items.length > 0) {
    content.push({ text: `ยอดขาย ${periodStr}`, fontSize: 12, bold: true, color: theme.primary, margin: [0, 4, 0, 6] });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const salesRows: any[][] = [
      [
        { text: '#', fontSize: 9, bold: true },
        { text: 'สินค้า', fontSize: 9, bold: true },
        { text: 'ช่องทาง', fontSize: 9, bold: true },
        { text: 'จำนวน', fontSize: 9, bold: true, alignment: 'right' },
        { text: 'ยอดขาย', fontSize: 9, bold: true, alignment: 'right' },
      ],
    ];

    data.sales_items.forEach((item, idx) => {
      salesRows.push([
        { text: String(idx + 1), fontSize: 9 },
        { text: getVarName(item.variation), fontSize: 10 },
        { text: SOURCE_LABELS[item.source] || item.source, fontSize: 9 },
        { text: item.quantity_sold.toLocaleString(), fontSize: 10, alignment: 'right' },
        { text: formatPdfPrice(item.revenue), fontSize: 10, alignment: 'right' },
      ]);
    });

    // Total row
    salesRows.push([
      { text: '', fontSize: 9 },
      { text: 'รวม', fontSize: 10, bold: true, colSpan: 2 }, {},
      { text: data.total_sold_quantity.toLocaleString(), fontSize: 10, bold: true, alignment: 'right' },
      { text: formatPdfPrice(data.total_sold_amount), fontSize: 10, bold: true, alignment: 'right' },
    ]);

    content.push({
      table: { headerRows: 1, widths: [25, '*', 80, 50, 70], body: salesRows },
      layout: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hLineWidth: (i: number, node: any) => i <= 1 || i === node.table.body.length || i === node.table.body.length - 1 ? 0.5 : 0.3,
        vLineWidth: () => 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hLineColor: (i: number, node: any) => i <= 1 || i === node.table.body.length ? '#333' : '#e5e7eb',
        paddingTop: () => 3, paddingBottom: () => 3,
      },
      margin: [0, 0, 0, 12],
    });
  }

  // ─── Receives Section (Credit) ───
  if (!isConsignment && data.receive_items.length > 0) {
    content.push({ text: `รายการรับเข้า ${periodStr}`, fontSize: 12, bold: true, color: theme.primary, margin: [0, 4, 0, 6] });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recRows: any[][] = [
      [
        { text: '#', fontSize: 9, bold: true },
        { text: 'สินค้า', fontSize: 9, bold: true },
        { text: 'จำนวน', fontSize: 9, bold: true, alignment: 'right' },
        { text: 'มูลค่า', fontSize: 9, bold: true, alignment: 'right' },
      ],
    ];

    data.receive_items.forEach((item, idx) => {
      recRows.push([
        { text: String(idx + 1), fontSize: 9 },
        { text: getVarName(item.variation), fontSize: 10 },
        { text: item.quantity.toLocaleString(), fontSize: 10, alignment: 'right' },
        { text: formatPdfPrice(item.amount), fontSize: 10, alignment: 'right' },
      ]);
    });

    recRows.push([
      { text: '', fontSize: 9 },
      { text: 'รวมยอดค้างจ่าย', fontSize: 10, bold: true },
      { text: data.total_received_quantity.toLocaleString(), fontSize: 10, bold: true, alignment: 'right' },
      { text: formatPdfPrice(data.total_received_amount), fontSize: 10, bold: true, alignment: 'right' },
    ]);

    content.push({
      table: { headerRows: 1, widths: [25, '*', 60, 80], body: recRows },
      layout: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hLineWidth: (i: number, node: any) => i <= 1 || i === node.table.body.length || i === node.table.body.length - 1 ? 0.5 : 0.3,
        vLineWidth: () => 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hLineColor: (i: number, node: any) => i <= 1 || i === node.table.body.length ? '#333' : '#e5e7eb',
        paddingTop: () => 3, paddingBottom: () => 3,
      },
      margin: [0, 0, 0, 12],
    });
  }

  const companyName = company?.tax_company_name || company?.name || '';
  const docDefinition = {
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 110] as [number, number, number, number],
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 10 },
    background: [buildCornerTriangle(theme.primary)],
    content,
    footer: buildSignatureFooter(companyName, 'ผู้จัดทำ', 'ซัพพลายเออร์'),
  };

  return pdfMake.createPdf(docDefinition).getBlob();
}

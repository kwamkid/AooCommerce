/**
 * Inventory PDF generation with FlowAccount-style template.
 * Color-coded: receive=green, issue=dark, transfer=amber
 */

import JsBarcode from 'jsbarcode';

/** Generate a barcode as a data URL using JsBarcode on an off-screen canvas */
function generateBarcodeDataUrl(value: string): string | null {
  if (!value) return null;
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: 1.5,
      height: 40,
      displayValue: false,
      margin: 2,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

const MAX_NAME_LEN = 70;
const truncateName = (name: string) => name.length > MAX_NAME_LEN ? name.slice(0, MAX_NAME_LEN) + '...' : name;

interface InventoryVariation {
  id: string;
  variation_label: string | null;
  sku: string | null;
  barcode?: string | null;
  attributes: Record<string, string> | null;
  product: { id: string; code: string; name: string; image: string | null };
}

interface InventoryItem {
  id: string;
  variation_id: string;
  quantity: number;
  unit_cost?: number | null;
  reason?: string | null;
  notes: string | null;
  variation: InventoryVariation;
}

interface InventoryDocData {
  id: string;
  doc_number: string;
  status: string;
  notes: string | null;
  created_at: string;
  warehouse: { id: string; name: string; code: string | null } | null;
  to_warehouse?: { id: string; name: string; code: string | null } | null;
  created_by_user: { id: string; name: string } | null;
  receive_token?: string;
  items: InventoryItem[];
}

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  tax_id?: string;
  tax_company_name?: string;
  logo_url?: string | null;
}

function getVariationLabel(item: InventoryItem) {
  const parts: string[] = [];
  const raw = item.variation?.variation_label || '';
  const code = item.variation?.product?.code || '';
  const sku = item.variation?.sku || '';
  if (raw && raw !== code && raw !== sku && !/^\d+$/.test(raw)) parts.push(raw);
  if (item.variation?.attributes) Object.values(item.variation.attributes).forEach(v => { if (v?.trim()) parts.push(v.trim()); });
  return parts.join(' / ');
}

function buildSubtitle(item: InventoryItem) {
  const code = item.variation?.product?.code || '';
  const varLabel = getVariationLabel(item);
  const sku = item.variation?.sku || '';
  const parts: string[] = [];
  if (code) parts.push(code);
  if (varLabel) parts.push(varLabel);
  if (sku && sku !== code) parts.push(`SKU: ${sku}`);
  return parts.join(' | ');
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' });

// ─── Color themes (ink-saving: color only at corner tab) ─────
interface ThemeColors {
  primary: string;  // Corner tab + accent text (title, labels)
}

const THEMES: Record<string, ThemeColors> = {
  receive:  { primary: '#15803d' },
  issue:    { primary: '#1e293b' },
  transfer: { primary: '#b45309' },
};

// Cache company info to avoid repeated API calls
let cachedCompanyInfo: CompanyInfo | null = null;

async function fetchCompanyInfo(): Promise<CompanyInfo | null> {
  if (cachedCompanyInfo) return cachedCompanyInfo;
  try {
    const { apiFetch } = await import('@/lib/api-client');
    const res = await apiFetch('/api/companies');
    if (!res.ok) return null;
    const result = await res.json();
    const memberships = result.companies || [];
    // Pick current company from localStorage, or first
    const currentId = typeof window !== 'undefined' ? localStorage.getItem('aoo-current-company-id') : null;
    const membership = (currentId
      ? memberships.find((m: { company_id: string }) => m.company_id === currentId)
      : null) || memberships[0];
    const co = membership?.company;
    if (!co) return null;
    cachedCompanyInfo = {
      name: co.name || '',
      address: co.address || '',
      phone: co.phone || '',
      tax_id: co.tax_id || '',
      tax_company_name: co.tax_company_name || '',
      logo_url: co.logo_url || null,
    };
    return cachedCompanyInfo;
  } catch { return null; }
}

interface GeneratePdfOptions {
  type: 'receive' | 'issue' | 'transfer';
  data: InventoryDocData;
  company?: CompanyInfo;
}

export async function generateInventoryPdf({ type, data, company }: GeneratePdfOptions) {
  // Auto-fetch company info if not provided
  if (!company) {
    company = (await fetchCompanyInfo()) || undefined;
  }

  const pdfMake = (await import('pdfmake/build/pdfmake')).default;

  const [regularBuf, boldBuf] = await Promise.all([
    fetch('/fonts/IBMPlexSansThai-Regular.ttf').then(r => r.arrayBuffer()),
    fetch('/fonts/IBMPlexSansThai-Bold.ttf').then(r => r.arrayBuffer()),
  ]);

  const toBase64 = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  pdfMake.addFontContainer({
    vfs: {
      'IBMPlexSansThai-Regular.ttf': toBase64(regularBuf),
      'IBMPlexSansThai-Bold.ttf': toBase64(boldBuf),
    },
    fonts: {
      IBMPlexSansThai: {
        normal: 'IBMPlexSansThai-Regular.ttf',
        bold: 'IBMPlexSansThai-Bold.ttf',
        italics: 'IBMPlexSansThai-Regular.ttf',
        bolditalics: 'IBMPlexSansThai-Bold.ttf',
      },
    },
  });

  const theme = THEMES[type];
  const isReceive = type === 'receive';
  const isTransfer = type === 'transfer';
  const isIssue = type === 'issue';

  const docTitle = isTransfer ? 'ใบโอนย้ายสินค้า' : isReceive ? 'ใบรับสินค้า' : 'ใบเบิกออกสินค้า';
  const dateStr = formatDate(data.created_at);
  const hasUnitCost = isReceive && data.items.some(i => i.unit_cost != null && (i.unit_cost ?? 0) > 0);
  const hasReason = isIssue && data.items.some(i => i.reason);
  const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);

  // Load company logo
  let logoDataUrl: string | null = null;
  if (company?.logo_url) {
    try {
      const response = await fetch(company.logo_url);
      if (response.ok) {
        const blob = await response.blob();
        logoDataUrl = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      }
    } catch { /* skip logo */ }
  }

  // Status text
  const statusText = isTransfer
    ? ({ pending: 'ที่ต้องจัดส่ง', shipping: 'กำลังส่ง', received: 'รับสินค้าแล้ว', cancelled: 'ยกเลิก' }[data.status] || data.status)
    : isReceive
      ? (data.status === 'completed' ? 'รับเข้าสำเร็จ' : 'ยกเลิก')
      : (data.status === 'completed' ? 'เบิกออกสำเร็จ' : 'ยกเลิก');

  // Generate QR code for transfer receive link
  let qrDataUrl: string | null = null;
  if (isTransfer && data.receive_token) {
    try {
      const QRCode = (await import('qrcode')).default;
      const receiveUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/transfers/receive/${data.receive_token}`;
      qrDataUrl = await QRCode.toDataURL(receiveUrl, { width: 160, margin: 1 });
    } catch { /* QR generation failed, skip */ }
  }

  const userLabel = isTransfer ? 'ผู้สร้าง' : isReceive ? 'ผู้รับ' : 'ผู้เบิก';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 1 — Header
  // ═══════════════════════════════════════════════════

  // Left side: logo + company info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyStack: any[] = [];

  if (logoDataUrl) {
    companyStack.push({ image: logoDataUrl, width: 50, height: 50, fit: [50, 50], margin: [0, 0, 0, 6] });
  }

  const companyName = company?.tax_company_name || company?.name || '';
  if (companyName) {
    companyStack.push({ text: companyName, bold: true, fontSize: 12, color: '#333333' });
  }
  if (company?.address) {
    companyStack.push({ text: company.address, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
  }
  if (company?.tax_id) {
    companyStack.push({ text: `เลขประจำตัวผู้เสียภาษี ${company.tax_id}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
  }
  if (company?.phone) {
    companyStack.push({ text: `เบอร์มือถือ ${company.phone}`, fontSize: 10, color: '#666666', margin: [0, 1, 0, 0] });
  }

  // Right side: document title + info box
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [];

  // Determine info box rows based on type
  if (isTransfer) {
    infoBoxRows.push(
      [{ text: 'เลขที่', fontSize: 10, color: theme.primary, bold: true }, { text: data.doc_number, fontSize: 10, bold: true }],
      [{ text: 'วันที่', fontSize: 10, color: theme.primary, bold: true }, { text: dateStr, fontSize: 10 }],
      [{ text: userLabel, fontSize: 10, color: theme.primary, bold: true }, { text: data.created_by_user?.name || '-', fontSize: 10 }],
    );
  } else {
    infoBoxRows.push(
      [{ text: 'เลขที่', fontSize: 10, color: theme.primary, bold: true }, { text: data.doc_number, fontSize: 10, bold: true }],
      [{ text: 'วันที่', fontSize: 10, color: theme.primary, bold: true }, { text: dateStr, fontSize: 10 }],
      [{ text: 'สถานะ', fontSize: 10, color: theme.primary, bold: true }, { text: statusText, fontSize: 10, bold: true }],
      [{ text: userLabel, fontSize: 10, color: theme.primary, bold: true }, { text: data.created_by_user?.name || '-', fontSize: 10 }],
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rightStack: any[] = [
    { text: docTitle, fontSize: 24, bold: true, color: theme.primary, alignment: 'right', margin: [0, 0, 0, 6] },
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
        paddingBottom: (i: number, node: any) => i === node.table.body.length - 1 ? 6 : 2,
        paddingLeft: () => 4,
        paddingRight: () => 4,
      },
    },
  ];

  // Add warehouse info + QR code below info box for transfer
  if (isTransfer) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const warehouseTable: any = {
      table: {
        widths: [65, '*'],
        body: [
          [{ text: 'คลังต้นทาง', fontSize: 10, color: theme.primary, bold: true }, { text: data.warehouse?.name || '-', fontSize: 10, bold: true }],
          [{ text: 'คลังปลายทาง', fontSize: 10, color: theme.primary, bold: true }, { text: data.to_warehouse?.name || '-', fontSize: 10, bold: true }],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingTop: () => 2,
        paddingBottom: () => 2,
        paddingLeft: () => 4,
        paddingRight: () => 4,
      },
    };

    if (qrDataUrl) {
      rightStack.push({
        columns: [
          { width: '*', ...warehouseTable },
          {
            width: 'auto',
            stack: [
              { image: qrDataUrl, width: 45, height: 45, alignment: 'center' as const },
              { text: 'สแกนเพื่อรับสินค้า', fontSize: 7, alignment: 'center' as const, color: '#888888', margin: [0, 2, 0, 0] },
            ],
            margin: [6, 0, 0, 0],
          },
        ],
        margin: [0, 4, 0, 0],
      });
    } else {
      rightStack.push({ ...warehouseTable, margin: [0, 4, 0, 0] });
    }
  }

  content.push({
    columns: [
      {
        width: '*',
        stack: companyStack.length > 0 ? companyStack : [{ text: '' }],
      },
      {
        width: 230,
        stack: rightStack,
      },
    ],
    margin: [0, 0, 0, 12],
  });

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 2 — ข้อมูลคลัง (Warehouse Info)
  // ═══════════════════════════════════════════════════

  if (isTransfer) {
    // Warehouse info already in info box — no separate section needed
  } else {
    content.push({
      text: [
        { text: 'คลัง: ', fontSize: 11, bold: true, color: theme.primary },
        { text: data.warehouse?.name || '-', fontSize: 11, bold: true },
      ],
      alignment: 'right',
      margin: [0, 0, 0, 12],
    });
  }

  // ═══════════════════════════════════════════════════
  // ส่วนที่ 3 — ตารางรายการ
  // ═══════════════════════════════════════════════════

  // Pre-generate barcode images for items that have barcode data
  const barcodeMap = new Map<string, string>();
  for (const item of data.items) {
    const barcodeValue = item.variation?.barcode || item.variation?.sku || '';
    if (barcodeValue && !barcodeMap.has(barcodeValue)) {
      const dataUrl = generateBarcodeDataUrl(barcodeValue);
      if (dataUrl) barcodeMap.set(barcodeValue, dataUrl);
    }
  }
  const hasBarcode = barcodeMap.size > 0;

  // Build table header
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCols: any[] = [
    { text: '#', style: 'tableHeader', alignment: 'center' },
    { text: 'รายละเอียด', style: 'tableHeader' },
  ];

  const widths: (number | string)[] = [25, '*'];

  if (hasBarcode) {
    headerCols.push({ text: 'Barcode', style: 'tableHeader', alignment: 'center' });
    widths.push(100);
  }

  headerCols.push({ text: 'จำนวน', style: 'tableHeader', alignment: 'center' });
  widths.push(50);

  if (hasUnitCost) {
    headerCols.push({ text: 'ราคา', style: 'tableHeader', alignment: 'right' });
    headerCols.push({ text: 'ยอดรวม', style: 'tableHeader', alignment: 'right' });
    widths.push(70, 70);
  }

  if (hasReason) {
    headerCols.push({ text: 'เหตุผล', style: 'tableHeader' });
    widths.push(80);
  }

  // Table rows
  const tableBody = data.items.map((item, idx) => {
    const varLabel = getVariationLabel(item);
    const fullName = (item.variation?.product?.name || '-') + (varLabel ? ` - ${varLabel}` : '');
    const nameText = truncateName(fullName);
    const subText = buildSubtitle(item);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productStack: any[] = [{ text: nameText, fontSize: 11 }];
    if (subText) productStack.push({ text: subText, fontSize: 9, color: '#888888' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any[] = [
      { text: `${idx + 1}`, alignment: 'center', fontSize: 11, margin: [0, 2, 0, 0] },
      { stack: productStack, margin: [0, 1, 0, 1] },
    ];

    // Barcode column
    if (hasBarcode) {
      const barcodeValue = item.variation?.barcode || item.variation?.sku || '';
      const barcodeDataUrl = barcodeValue ? barcodeMap.get(barcodeValue) : null;
      if (barcodeDataUrl) {
        row.push({
          stack: [
            { image: barcodeDataUrl, width: 90, height: 30, alignment: 'center' as const, margin: [0, 1, 0, 0] },
            { text: barcodeValue, fontSize: 7, alignment: 'center' as const, color: '#666666' },
          ],
        });
      } else {
        row.push({ text: '-', alignment: 'center', fontSize: 11, margin: [0, 2, 0, 0] });
      }
    }

    row.push({ text: `${item.quantity}`, alignment: 'center', fontSize: 11, margin: [0, 2, 0, 0] });

    if (hasUnitCost) {
      const cost = item.unit_cost ?? 0;
      row.push({ text: cost > 0 ? cost.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-', alignment: 'right', fontSize: 11, margin: [0, 2, 0, 0] });
      row.push({ text: cost > 0 ? (cost * item.quantity).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-', alignment: 'right', fontSize: 11, margin: [0, 2, 0, 0] });
    }

    if (hasReason) {
      row.push({ text: item.reason || '-', fontSize: 10, margin: [0, 2, 0, 0] });
    }

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
  // ส่วนที่ 4 — สรุปยอด (ตรงกับคอลัมน์ตาราง)
  // ═══════════════════════════════════════════════════

  // Build summary as simple 2-column table (label + value)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryRows: any[][] = [];
  summaryRows.push([
    { text: 'จำนวนรายการ', fontSize: 11, alignment: 'right', color: '#555555' },
    { text: `${data.items.length}`, fontSize: 11, alignment: 'right', bold: true },
  ]);
  summaryRows.push([
    { text: isReceive ? 'รวมรับเข้าทั้งหมด (ชิ้น)' : isIssue ? 'รวมเบิกออกทั้งหมด (ชิ้น)' : 'รวมโอนย้ายทั้งหมด (ชิ้น)', fontSize: 11, alignment: 'right', color: '#555555', bold: true },
    { text: `${totalQty}`, fontSize: 11, alignment: 'right', bold: true },
  ]);
  if (hasUnitCost) {
    const totalCost = data.items.reduce((s, i) => s + (i.unit_cost ?? 0) * i.quantity, 0);
    summaryRows.push([
      { text: 'รวมเป็นเงิน (บาท)', fontSize: 11, alignment: 'right', color: '#555555', bold: true },
      { text: totalCost.toLocaleString('th-TH', { minimumFractionDigits: 2 }), fontSize: 11, alignment: 'right', bold: true },
    ]);
  }

  // Notes (left) + Summary (right) on same row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const notesStack: any[] = [];
  if (data.notes) {
    notesStack.push({ text: 'หมายเหตุ:', fontSize: 10, bold: true, color: '#666666', margin: [0, 0, 0, 2] });
    notesStack.push({ text: data.notes, fontSize: 10, color: '#555555' });
  }

  content.push({
    columns: [
      {
        width: '*',
        stack: notesStack.length > 0 ? notesStack : [{ text: '' }],
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
  // ส่วนที่ 5 — ลายเซ็น (Footer — absolute bottom)
  // ═══════════════════════════════════════════════════

  const leftSignLabel = isTransfer ? 'ผู้ส่ง' : isReceive ? 'ผู้ส่งสินค้า' : 'ผู้เบิกสินค้า';
  const rightSignLabel = isTransfer ? 'ผู้รับ' : isReceive ? 'ผู้รับสินค้า' : 'ผู้อนุมัติ';
  const leftCompanyName = company?.name || '';

  // A4 dimensions
  const pageWidth = 595.28;
  const triangleSize = 50;

  const docDefinition = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 16 },
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 110] as [number, number, number, number],
    // Color triangle at top-right corner with print margin offset
    background: () => ({
      canvas: [{
        type: 'polyline',
        closePath: true,
        points: [
          { x: pageWidth - 8, y: 8 },
          { x: pageWidth - 8 - triangleSize, y: 8 },
          { x: pageWidth - 8, y: 8 + triangleSize },
        ],
        color: theme.primary,
      }],
    }),
    // Signature section pinned to absolute bottom of every page
    // Each side: signature line (left) + date line (right) on same row
    footer: {
      columns: [
        {
          width: '*',
          stack: [
            { text: leftCompanyName ? `ในนาม ${leftCompanyName}` : ' ', fontSize: 10, color: '#666666' },
            { text: ' ', margin: [0, 18, 0, 0] },
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] },
                    { text: leftSignLabel, fontSize: 10, margin: [0, 3, 0, 0] },
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
        },
        { width: 30, text: '' },
        {
          width: '*',
          stack: [
            { text: ' ', fontSize: 10 },
            { text: ' ', margin: [0, 18, 0, 0] },
            {
              columns: [
                {
                  width: '*',
                  stack: [
                    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] },
                    { text: rightSignLabel, fontSize: 10, margin: [0, 3, 0, 0] },
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
        },
      ],
      margin: [40, 0, 40, 12],
    },
    content,
    styles: {
      tableHeader: { bold: true, fontSize: 11, color: '#333333' },
    },
  };

  pdfMake.createPdf(docDefinition).open();
}

/**
 * Shipping Label PDF — Compact 2-column layout
 *
 * ┌──────────────────────────────────────────────┐
 * │ เลขพัสดุ: TRACKING-NUMBER (left-aligned)     │
 * │ ||||||||||||||||||||||||||||||||||||||||||    │
 * ├──────────────────────┬───────────────────────┤
 * │ ผู้ส่ง (FROM)        │ ผู้รับ (TO)            │
 * │ Company Name         │ Receiver Name (bold)  │
 * │ ที่อยู่               │ ที่อยู่ (larger)        │
 * │ เบอร์โทร             │ เบอร์โทร              │
 * ├──────────────────────┴───────────────────────┤
 * │ Order No: xxx   ขนส่ง: xxx   วันที่: xxx     │
 * │ Source: LINE : xxx                           │
 * ├──────────────────────────────────────────────┤
 * │ # │ ชื่อสินค้า                    │ จำนวน    │
 * │ 1 │ Product name...               │   1      │
 * ├──────────────────────────────────────────────┤
 * │                              จำนวนรวม   x   │
 * └──────────────────────────────────────────────┘
 */

import JsBarcode from 'jsbarcode';
import {
  type CompanyInfo,
  fetchCompanyInfo,
  setupPdfMake,
  formatPdfDate,
  formatDeliverySchedule,
} from './pdf-utils';
import { cleanVariationLabel } from './product-display';
import { resolveCarrierLabel } from './carrier-lookup';

// ─── Interfaces ──────────────────────────────────────────

interface LabelItem {
  product_name: string;
  variation_label?: string;
  sku?: string | null;
  product_code?: string | null;
  quantity: number;
}

export interface ShippingLabelData {
  order_number: string;
  order_date?: string;
  created_at: string;
  /** Carrier code stored in DB (kept for back-compat with old orders that hold a free-form name) */
  shipping_carrier?: string;
  /** Resolved display label from the carriers table; falls back to shipping_carrier raw value */
  carrier_label?: string;
  tracking_number?: string;
  delivery_name?: string;
  delivery_phone?: string;
  delivery_address?: string;
  delivery_district?: string;
  delivery_amphoe?: string;
  delivery_province?: string;
  delivery_postal_code?: string;
  /** กำหนดส่ง — snapshot จากโซน/รอบส่ง (ฟีเจอร์ delivery) */
  delivery_date?: string | null;
  delivery_slot_label?: string | null;
  items: LabelItem[];
  parcel_number?: number;
  total_parcels?: number;
  source?: string;
  source_name?: string;
  // Dropship: override sender with agent's name instead of our company
  sender_name?: string;
  sender_phone?: string;
  sender_address?: string;
}

// ─── Helpers ─────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  line: 'LINE',
  facebook: 'FB Page',
  instagram: 'Instagram',
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiktok: 'TikTok',
  pos: 'POS',
  manual: 'Manual',
};

/** Generate CODE128 barcode as data URL */
function generateBarcodeDataUrl(value: string, opts?: { width?: number; height?: number }): string | null {
  if (!value) return null;
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: opts?.width ?? 2,
      height: opts?.height ?? 50,
      displayValue: false,
      margin: 4,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

const MAX_NAME_LEN = 90;
const truncate = (s: string) => s.length > MAX_NAME_LEN ? s.slice(0, MAX_NAME_LEN) + '...' : s;

// ─── Main Export ─────────────────────────────────────────

interface GenerateOptions {
  data: ShippingLabelData;
  company?: CompanyInfo;
  /** Override page size. Default: A6 (105×148mm). Pass 'A4' for full-page label. */
  pageSizeOverride?: 'A4';
}

export async function generateShippingLabelPdf({ data, company, pageSizeOverride }: GenerateOptions): Promise<Blob> {
  if (!company) {
    company = (await fetchCompanyInfo()) || undefined;
  }

  const pdfMake = await setupPdfMake();

  // Dropship: use agent's name as sender; otherwise use our company
  const senderName = data.sender_name || company?.tax_company_name || company?.name || '';
  const senderPhone = data.sender_phone || company?.phone || '';
  const senderAddress = data.sender_address || company?.address || '';

  const receiverName = data.delivery_name || '';
  const receiverPhone = data.delivery_phone || '';
  const receiverAddress = [
    data.delivery_address, data.delivery_district, data.delivery_amphoe,
    data.delivery_province, data.delivery_postal_code,
  ].filter(Boolean).join(', ');

  const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);
  const dateStr = formatPdfDate(data.order_date || data.created_at);
  // Resolve carrier display label: prefer caller-provided label, otherwise look up via the
  // carriers table. Final fallback is the raw stored value (back-compat with old orders
  // that hold a free-form name in shipping_carrier).
  const carrierLabel = data.carrier_label
    ? data.carrier_label
    : (data.shipping_carrier ? await resolveCarrierLabel(data.shipping_carrier) : '');

  // Source label — only show when there's a channel name or non-manual source
  const sourceLabel = data.source && data.source !== 'manual' ? (SOURCE_LABELS[data.source] || data.source) : '';
  const sourceDisplay = data.source_name
    ? (sourceLabel ? `${sourceLabel} : ${data.source_name}` : data.source_name)
    : sourceLabel;

  // A6 in points: 105mm × 148mm → 297.64 × 419.53
  // A4 in points: 595.28 × 841.89
  const pageWidth = pageSizeOverride === 'A4' ? 595.28 : 297.64;
  const pageHeight = pageSizeOverride === 'A4' ? 841.89 : 419.53;
  const margin = pageSizeOverride === 'A4' ? 30 : 12;
  const innerWidth = pageWidth - margin * 2;
  const halfWidth = (innerWidth - 6) / 2; // 6pt gap between columns

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ══════════════════════════════════════════════════
  // Section 1 — Tracking number (left-aligned) + barcode
  // ══════════════════════════════════════════════════

  if (data.tracking_number) {
    content.push({
      text: `เลขพัสดุ: ${data.tracking_number}`,
      fontSize: 9,
      bold: true,
      alignment: 'left' as const,
      color: '#000000',
      margin: [0, 2, 0, 2],
    });
    const barcodeDataUrl = generateBarcodeDataUrl(data.tracking_number, { width: 2, height: 45 });
    if (barcodeDataUrl) {
      content.push({
        image: barcodeDataUrl,
        width: innerWidth * 0.85,
        alignment: 'center' as const,
        margin: [0, 0, 0, 4],
      });
    }
  } else {
    content.push({
      text: 'เลขพัสดุ: ___________________________',
      fontSize: 9,
      color: '#999999',
      alignment: 'left' as const,
      margin: [0, 6, 0, 6],
    });
  }

  // Divider
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 1, lineColor: '#000000' }],
    margin: [0, 0, 0, 0],
  });

  // ══════════════════════════════════════════════════
  // Section 2 — Sender (FROM) + Receiver (TO) side by side
  // ══════════════════════════════════════════════════

  // Build sender column content
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const senderCol: any[] = [
    { text: 'ผู้ส่ง (FROM)', fontSize: 6, bold: true, color: '#888888', margin: [0, 0, 0, 1] },
    { text: senderName, fontSize: 8, bold: true, color: '#000000', lineHeight: 1.0 },
  ];
  if (senderAddress) {
    senderCol.push({ text: senderAddress, fontSize: 6.5, color: '#444444', lineHeight: 1.0, margin: [0, 1, 0, 0] });
  }
  if (senderPhone) {
    senderCol.push({ text: `โทร ${senderPhone}`, fontSize: 6.5, color: '#444444', lineHeight: 1.0 });
  }

  // Build receiver column content
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const receiverCol: any[] = [
    {
      columns: [
        { text: 'ผู้รับ (TO)', fontSize: 6, bold: true, color: '#888888', width: 'auto' },
        receiverPhone
          ? { text: `Tel. ${receiverPhone}`, fontSize: 6.5, bold: true, color: '#555555', alignment: 'right' as const, width: '*' }
          : { text: '', width: '*' },
      ],
      margin: [0, 0, 0, 1],
    },
    { text: receiverName, fontSize: 10, bold: true, color: '#000000', lineHeight: 1.0 },
  ];
  if (receiverAddress) {
    receiverCol.push({ text: receiverAddress, fontSize: 7.5, color: '#333333', lineHeight: 0.85, margin: [0, 1, 0, 0] });
  }
  // กำหนดส่ง — คนขับต้องเห็นบนกล่อง ไม่ใช่แค่ในระบบ
  const scheduleText = formatDeliverySchedule(data);
  if (scheduleText) {
    receiverCol.push({
      text: `ส่ง ${scheduleText}`,
      fontSize: 8,
      bold: true,
      color: '#b45309',
      lineHeight: 0.9,
      margin: [0, 2, 0, 0],
    });
  }

  content.push({
    table: {
      widths: [halfWidth, '*'],
      body: [[
        { stack: senderCol },
        { stack: receiverCol },
      ]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => i === 1 ? 0.5 : 0,
      vLineColor: () => '#cccccc',
      paddingTop: () => 4,
      paddingBottom: () => 4,
      paddingLeft: (i: number) => i === 0 ? 0 : 5,
      paddingRight: (i: number) => i === 0 ? 3 : 0,
    },
    margin: [0, 0, 0, 0],
  });

  // Divider
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 1, lineColor: '#000000' }],
    margin: [0, 0, 0, 0],
  });

  // ══════════════════════════════════════════════════
  // Section 3 — Order info row
  // ══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBody: any[][] = [];

  // Label style: small font, vertically centered with value via margin
  const lbl = (t: string) => ({ text: t, fontSize: 6, bold: true, color: '#666666', margin: [0, 1, 0, 0] });

  // Row 1: Order No + carrier or date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row1: any[] = [
    lbl('Order No.'),
    { text: data.order_number, fontSize: 7, bold: true, color: '#000000' },
  ];
  if (carrierLabel) {
    row1.push(lbl('ขนส่ง'));
    row1.push({ text: carrierLabel, fontSize: 7, color: '#000000' });
  } else {
    row1.push(lbl('วันที่'));
    row1.push({ text: dateStr, fontSize: 7, color: '#000000' });
  }
  infoBody.push(row1);

  // Row 2: date (if carrier shown) or parcel or source
  if (carrierLabel) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row2: any[] = [
      lbl('วันที่'),
      { text: dateStr, fontSize: 7, color: '#000000' },
    ];
    if (data.parcel_number) {
      row2.push(lbl('พัสดุ'));
      row2.push({ text: `${data.parcel_number} / ${data.total_parcels || '?'}`, fontSize: 7, bold: true, color: '#7c3aed' });
    } else {
      row2.push({ text: '', fontSize: 6 });
      row2.push({ text: '', fontSize: 6 });
    }
    infoBody.push(row2);
  } else if (data.parcel_number) {
    infoBody.push([
      lbl('พัสดุ'),
      { text: `${data.parcel_number} / ${data.total_parcels || '?'}`, fontSize: 7, bold: true, color: '#7c3aed' },
      { text: '', fontSize: 6 },
      { text: '', fontSize: 6 },
    ]);
  }

  // Source row
  if (sourceDisplay) {
    infoBody.push([
      lbl('ช่องทาง'),
      { text: sourceDisplay, fontSize: 7, color: '#555555', colSpan: 3 },
      {}, {},
    ]);
  }

  content.push({
    table: {
      widths: [35, '*', 25, '*'],
      body: infoBody,
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 2,
      paddingBottom: () => 1,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    margin: [0, 4, 0, 0],
  });

  // Divider (dashed)
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 0.5, lineColor: '#999999', dash: { length: 3, space: 2 } }],
    margin: [0, 2, 0, 2],
  });

  // ══════════════════════════════════════════════════
  // Section 4 — Items table
  // ══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemTableBody: any[][] = [
    [
      { text: '#', fontSize: 7, bold: true, color: '#666666', alignment: 'center' },
      { text: 'ชื่อสินค้า', fontSize: 7, bold: true, color: '#666666' },
      { text: 'จำนวน', fontSize: 7, bold: true, color: '#666666', alignment: 'center' },
    ],
  ];

  data.items.forEach((item, idx) => {
    const varLabel = cleanVariationLabel({ product_name: item.product_name, variation_label: item.variation_label, sku: item.sku, product_code: item.product_code });
    const fullName = varLabel ? `${item.product_name} - ${varLabel}` : item.product_name;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nameStack: any[] = [{ text: truncate(fullName), fontSize: 7, color: '#333333' }];
    if (item.sku) nameStack.push({ text: item.sku, fontSize: 6, color: '#999999' });
    itemTableBody.push([
      { text: `${idx + 1}`, fontSize: 7, alignment: 'center', color: '#333333' },
      { stack: nameStack },
      { text: `${item.quantity}`, fontSize: 7, alignment: 'center', color: '#333333' },
    ]);
  });

  content.push({
    table: {
      headerRows: 1,
      widths: [15, '*', 30],
      body: itemTableBody,
    },
    layout: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 0.5 : 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vLineWidth: (i: number, _node: any) => (i === 0 || i === _node.table.widths.length) ? 0.5 : 0,
      hLineColor: () => '#cccccc',
      vLineColor: () => '#cccccc',
      paddingTop: () => 2,
      paddingBottom: () => 2,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    margin: [0, 0, 0, 0],
  });

  // ══════════════════════════════════════════════════
  // Section 5 — Total
  // ══════════════════════════════════════════════════

  content.push({
    columns: [
      { text: '', width: '*' },
      {
        table: {
          widths: [50, 25],
          body: [[
            { text: 'จำนวนรวม', fontSize: 8, bold: true, color: '#000000', alignment: 'right' },
            { text: `${totalQty}`, fontSize: 9, bold: true, color: '#000000', alignment: 'center' },
          ]],
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#cccccc',
          vLineColor: () => '#cccccc',
          paddingTop: () => 3,
          paddingBottom: () => 3,
          paddingLeft: () => 4,
          paddingRight: () => 4,
        },
        width: 'auto',
      },
    ],
    margin: [0, 0, 0, 0],
  });

  // ══════════════════════════════════════════════════
  // Document definition
  // ══════════════════════════════════════════════════

  const docDefinition = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 10 },
    pageSize: { width: pageWidth, height: pageHeight },
    pageMargins: [margin, margin, margin, margin] as [number, number, number, number],
    content,
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

/** A4-sized shipping label for replenishments (consignment delivery note cover page) */
export async function generateReplenishmentLabelPdf(options: GenerateOptions): Promise<Blob> {
  return generateShippingLabelPdf({ ...options, pageSizeOverride: 'A4' });
}

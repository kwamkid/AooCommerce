/**
 * Shipping Label PDF — Shopee-style layout
 *
 * ┌─────────────────────────────────────────────┐
 * │  ||||||||||||||||||||||||||||||||||||||||    │ ← Large barcode (tracking)
 * │            TRACKING-NUMBER                  │
 * ├─────────────────────────────────────────────┤
 * │ ผู้ส่ง (FROM)     Company Name              │
 * │ ที่อยู่ / เบอร์โทร                           │ ← Sender box (bordered)
 * ├─────────────────────────────────────────────┤
 * │ ผู้รับ (TO)       Receiver Name             │
 * │ ที่อยู่ / เบอร์โทร (larger, bold)            │ ← Receiver box (bordered)
 * ├─────────────────────────────────────────────┤
 * │ ขนส่ง: xxx          วันที่: xx/xx/xxxx      │
 * │ Order No: xxx                               │
 * ├─────────────────────────────────────────────┤
 * │ # │ ชื่อสินค้า                    │ จำนวน  │ ← Items table
 * │ 1 │ Product name...               │   1    │
 * ├─────────────────────────────────────────────┤
 * │                              จำนวนรวม   x  │
 * └─────────────────────────────────────────────┘
 */

import JsBarcode from 'jsbarcode';
import {
  type CompanyInfo,
  fetchCompanyInfo,
  setupPdfMake,
  formatPdfDate,
} from './pdf-utils';

// ─── Interfaces ──────────────────────────────────────────

interface LabelItem {
  product_name: string;
  variation_label?: string;
  quantity: number;
}

export interface ShippingLabelData {
  order_number: string;
  order_date?: string;
  created_at: string;
  shipping_carrier?: string;
  tracking_number?: string;
  delivery_name?: string;
  delivery_phone?: string;
  delivery_address?: string;
  delivery_district?: string;
  delivery_amphoe?: string;
  delivery_province?: string;
  delivery_postal_code?: string;
  items: LabelItem[];
}

// ─── Helpers ─────────────────────────────────────────────

const SHIPPING_CARRIERS: Record<string, string> = {
  thai_post: 'ไปรษณีย์ไทย',
  kerry: 'Kerry Express',
  flash: 'Flash Express',
  'j&t': 'J&T Express',
  scg: 'SCG Express',
  ninja: 'Ninja Van',
  best: 'BEST Express',
  dhl: 'DHL',
  grab: 'Grab Express',
  lalamove: 'Lalamove',
  self: 'จัดส่งเอง',
  other: 'อื่นๆ',
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

const MAX_NAME_LEN = 50;
const truncate = (s: string) => s.length > MAX_NAME_LEN ? s.slice(0, MAX_NAME_LEN) + '...' : s;

// ─── Main Export ─────────────────────────────────────────

interface GenerateOptions {
  data: ShippingLabelData;
  company?: CompanyInfo;
}

export async function generateShippingLabelPdf({ data, company }: GenerateOptions): Promise<Blob> {
  if (!company) {
    company = (await fetchCompanyInfo()) || undefined;
  }

  const pdfMake = await setupPdfMake();

  const senderName = company?.tax_company_name || company?.name || '';
  const senderPhone = company?.phone || '';
  const senderAddress = company?.address || '';

  const receiverName = data.delivery_name || '';
  const receiverPhone = data.delivery_phone || '';
  const receiverAddress = [
    data.delivery_address, data.delivery_district, data.delivery_amphoe,
    data.delivery_province, data.delivery_postal_code,
  ].filter(Boolean).join(', ');

  const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);
  const dateStr = formatPdfDate(data.order_date || data.created_at);
  const carrierLabel = data.shipping_carrier ? (SHIPPING_CARRIERS[data.shipping_carrier] || data.shipping_carrier) : '';

  // A6 in points: 105mm × 148mm → 297.64 × 419.53
  const pageWidth = 297.64;
  const pageHeight = 419.53;
  const margin = 12;
  const innerWidth = pageWidth - margin * 2;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ══════════════════════════════════════════════════
  // Section 1 — Large Barcode (tracking number)
  // ══════════════════════════════════════════════════

  if (data.tracking_number) {
    const barcodeDataUrl = generateBarcodeDataUrl(data.tracking_number, { width: 2, height: 55 });
    if (barcodeDataUrl) {
      content.push({
        image: barcodeDataUrl,
        width: innerWidth,
        alignment: 'center' as const,
        margin: [0, 0, 0, 2],
      });
    }
    content.push({
      text: data.tracking_number,
      fontSize: 10,
      bold: true,
      alignment: 'center' as const,
      color: '#000000',
      margin: [0, 0, 0, 6],
    });
  } else {
    // Blank tracking field
    content.push({
      text: 'เลขพัสดุ: ___________________________',
      fontSize: 10,
      color: '#999999',
      alignment: 'center' as const,
      margin: [0, 8, 0, 8],
    });
  }

  // Divider
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 1, lineColor: '#000000' }],
    margin: [0, 0, 0, 0],
  });

  // ══════════════════════════════════════════════════
  // Section 2 — Sender (FROM) box
  // ══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const senderBody: any[][] = [];

  // Row 1: label + name
  senderBody.push([
    { text: 'ผู้ส่ง (FROM)', fontSize: 7, bold: true, color: '#666666' },
    { text: senderName, fontSize: 9, bold: true, color: '#000000' },
  ]);

  // Row 2: address
  const senderDetails = [senderAddress, senderPhone ? `โทร ${senderPhone}` : ''].filter(Boolean).join(', ');
  if (senderDetails) {
    senderBody.push([
      { text: '', fontSize: 7 },
      { text: senderDetails, fontSize: 7, color: '#444444' },
    ]);
  }

  content.push({
    table: {
      widths: [55, '*'],
      body: senderBody,
    },
    layout: {
      hLineWidth: (i: number) => i === 0 ? 0 : 0,
      vLineWidth: () => 0,
      paddingTop: () => 4,
      paddingBottom: () => 3,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    margin: [0, 0, 0, 0],
  });

  // Divider
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 0.5, lineColor: '#999999' }],
    margin: [0, 0, 0, 0],
  });

  // ══════════════════════════════════════════════════
  // Section 3 — Receiver (TO) box — LARGER
  // ══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const receiverBody: any[][] = [];

  // Row 1: label + name (BOLD, LARGE)
  receiverBody.push([
    { text: 'ผู้รับ (TO)', fontSize: 8, bold: true, color: '#000000' },
    { text: receiverName, fontSize: 12, bold: true, color: '#000000' },
  ]);

  // Row 2: address
  if (receiverAddress) {
    receiverBody.push([
      { text: '', fontSize: 7 },
      { text: receiverAddress, fontSize: 9, color: '#333333' },
    ]);
  }

  // Row 3: phone
  if (receiverPhone) {
    receiverBody.push([
      { text: '', fontSize: 7 },
      { text: `โทร ${receiverPhone}`, fontSize: 9, color: '#333333' },
    ]);
  }

  content.push({
    table: {
      widths: [55, '*'],
      body: receiverBody,
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 4,
      paddingBottom: () => 3,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    margin: [0, 0, 0, 0],
  });

  // Divider
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 1, lineColor: '#000000' }],
    margin: [0, 0, 0, 0],
  });

  // ══════════════════════════════════════════════════
  // Section 4 — Order info row
  // ══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBody: any[][] = [];

  if (carrierLabel) {
    infoBody.push([
      { text: 'ขนส่ง', fontSize: 7, bold: true, color: '#666666' },
      { text: carrierLabel, fontSize: 8, color: '#000000' },
      { text: 'วันที่', fontSize: 7, bold: true, color: '#666666' },
      { text: dateStr, fontSize: 8, color: '#000000' },
    ]);
  }

  infoBody.push([
    { text: 'Order No.', fontSize: 7, bold: true, color: '#666666' },
    { text: data.order_number, fontSize: 8, bold: true, color: '#000000', colSpan: 3 },
    {}, {},
  ]);

  content.push({
    table: {
      widths: [40, '*', 25, '*'],
      body: infoBody,
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingTop: () => 3,
      paddingBottom: () => 2,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    margin: [0, 0, 0, 0],
  });

  // Divider (dashed)
  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 0.5, lineColor: '#999999', dash: { length: 3, space: 2 } }],
    margin: [0, 2, 0, 2],
  });

  // ══════════════════════════════════════════════════
  // Section 5 — Items table
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
    const name = truncate(item.product_name) + (item.variation_label ? ` (${item.variation_label})` : '');
    itemTableBody.push([
      { text: `${idx + 1}`, fontSize: 7, alignment: 'center', color: '#333333' },
      { text: name, fontSize: 7, color: '#333333' },
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
      vLineWidth: (i: number, _node: any) => (i === 0 || i === _node.table.widths.length) ? 0.5 : 0,
      hLineColor: () => '#cccccc',
      vLineColor: () => '#cccccc',
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
    margin: [0, 0, 0, 0],
  });

  // ══════════════════════════════════════════════════
  // Section 6 — Total
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
  return pdfDoc.getBlob() as Promise<Blob>;
}

/**
 * Shipping Label PDF generation — A6 (105×148mm), Shopee-style.
 *
 * Layout:
 * ┌─────────────────────────────────┐
 * │  ชื่อร้าน (bold)   ORDER#       │ ← Header
 * ├─────────────────────────────────┤
 * │ ผู้ส่ง: ชื่อ / เบอร์ / ที่อยู่    │ ← Sender (compact)
 * ├─────────────────────────────────┤
 * │ ผู้รับ: ชื่อ / เบอร์ / ที่อยู่    │ ← Receiver (larger)
 * ├─────────────────────────────────┤
 * │ ||||||||| BARCODE ||||||||||||  │ ← Tracking barcode
 * ├─────────────────────────────────┤
 * │ ขนส่ง: xxx | จำนวน: x ชิ้น     │ ← Footer
 * └─────────────────────────────────┘
 */

import JsBarcode from 'jsbarcode';
import {
  type CompanyInfo,
  fetchCompanyInfo,
  setupPdfMake,
} from './pdf-utils';

// ─── Interfaces ──────────────────────────────────────────

interface LabelItem {
  product_name: string;
  variation_label?: string;
  quantity: number;
}

export interface ShippingLabelData {
  order_number: string;
  shipping_carrier?: string;
  tracking_number?: string;
  // Receiver (delivery snapshot)
  delivery_name?: string;
  delivery_phone?: string;
  delivery_address?: string;
  delivery_district?: string;
  delivery_amphoe?: string;
  delivery_province?: string;
  delivery_postal_code?: string;
  // Items (summary)
  items: LabelItem[];
}

// ─── Helpers ─────────────────────────────────────────────

/** Generate a barcode as data URL for tracking number */
function generateBarcodeDataUrl(value: string): string | null {
  if (!value) return null;
  try {
    const canvas = document.createElement('canvas');
    JsBarcode(canvas, value, {
      format: 'CODE128',
      width: 2,
      height: 50,
      displayValue: false,
      margin: 4,
    });
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** Build items summary text (max ~2 lines) */
function buildItemsSummary(items: LabelItem[]): string {
  if (items.length === 0) return '';
  const parts: string[] = [];
  let charLen = 0;
  for (const item of items) {
    const label = item.variation_label ? `${item.product_name} (${item.variation_label})` : item.product_name;
    const entry = `${label} x${item.quantity}`;
    if (charLen + entry.length > 80 && parts.length > 0) {
      parts.push(`+อื่นๆ อีก ${items.length - parts.length} รายการ`);
      break;
    }
    parts.push(entry);
    charLen += entry.length + 2;
  }
  return parts.join(', ');
}

// ─── Main Export ─────────────────────────────────────────

interface GenerateOptions {
  data: ShippingLabelData;
  company?: CompanyInfo;
}

export async function generateShippingLabelPdf({ data, company }: GenerateOptions) {
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
  ].filter(Boolean).join(' ');

  const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);
  const itemsSummary = buildItemsSummary(data.items);

  // A6 in points: 105mm × 148mm → 297.64 × 419.53
  const pageWidth = 297.64;
  const pageHeight = 419.53;
  const margin = 14;
  const innerWidth = pageWidth - margin * 2;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ── Header ──────────────────────────────────────
  content.push({
    columns: [
      { text: senderName, fontSize: 10, bold: true, color: '#333333', width: '*' },
      { text: data.order_number, fontSize: 9, color: '#555555', alignment: 'right', width: 'auto' },
    ],
    margin: [0, 0, 0, 4],
  });

  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 1, lineColor: '#333333' }],
    margin: [0, 0, 0, 8],
  });

  // ── Sender box ──────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const senderStack: any[] = [
    { text: 'ผู้ส่ง', fontSize: 8, bold: true, color: '#888888', margin: [0, 0, 0, 2] },
  ];
  if (senderName) senderStack.push({ text: senderName, fontSize: 8, color: '#333333' });
  if (senderPhone) senderStack.push({ text: `โทร: ${senderPhone}`, fontSize: 8, color: '#555555' });
  if (senderAddress) senderStack.push({ text: senderAddress, fontSize: 8, color: '#555555' });

  content.push({
    stack: senderStack,
    margin: [0, 0, 0, 6],
  });

  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }],
    margin: [0, 0, 0, 8],
  });

  // ── Receiver box (larger, prominent) ────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const receiverStack: any[] = [
    { text: 'ผู้รับ', fontSize: 9, bold: true, color: '#333333', margin: [0, 0, 0, 3] },
  ];
  if (receiverName) receiverStack.push({ text: receiverName, fontSize: 13, bold: true, color: '#000000' });
  if (receiverPhone) receiverStack.push({ text: `โทร: ${receiverPhone}`, fontSize: 11, color: '#333333', margin: [0, 2, 0, 0] });
  if (receiverAddress) receiverStack.push({ text: receiverAddress, fontSize: 10, color: '#333333', margin: [0, 2, 0, 0] });

  content.push({
    stack: receiverStack,
    margin: [0, 0, 0, 8],
  });

  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }],
    margin: [0, 0, 0, 8],
  });

  // ── Barcode / Tracking ──────────────────────────
  if (data.tracking_number) {
    const barcodeDataUrl = generateBarcodeDataUrl(data.tracking_number);
    if (barcodeDataUrl) {
      content.push({
        image: barcodeDataUrl,
        width: innerWidth - 20,
        alignment: 'center' as const,
        margin: [0, 4, 0, 2],
      });
    }
    content.push({
      text: data.tracking_number,
      fontSize: 9,
      alignment: 'center' as const,
      color: '#333333',
      bold: true,
      margin: [0, 0, 0, 8],
    });
  } else {
    content.push({
      text: 'เลขพัสดุ: ___________________________',
      fontSize: 10,
      color: '#999999',
      alignment: 'center' as const,
      margin: [0, 12, 0, 12],
    });
  }

  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }],
    margin: [0, 0, 0, 6],
  });

  // ── Footer info ─────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const footerParts: any[] = [];

  if (data.shipping_carrier) {
    footerParts.push({ text: `ขนส่ง: ${data.shipping_carrier}`, fontSize: 8, color: '#555555' });
  }
  footerParts.push({ text: `จำนวน: ${totalQty} ชิ้น (${data.items.length} รายการ)`, fontSize: 8, color: '#555555' });

  content.push({
    text: footerParts.map(p => p.text).join('  |  '),
    fontSize: 8,
    color: '#555555',
    margin: [0, 0, 0, 2],
  });

  if (itemsSummary) {
    content.push({
      text: itemsSummary,
      fontSize: 7,
      color: '#888888',
      margin: [0, 0, 0, 0],
    });
  }

  // ── Document definition ─────────────────────────

  const docDefinition = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 10 },
    pageSize: { width: pageWidth, height: pageHeight },
    pageMargins: [margin, margin, margin, margin] as [number, number, number, number],
    content,
  };

  pdfMake.createPdf(docDefinition).open();
}

/**
 * Orders Packing List PDF generation (multi-order + single-order compact).
 *
 * ใบหยิบของ (Pick List) — only when >1 orders:
 *   - Aggregated list of ALL products across all selected orders
 *   - Duplicates combined (quantity summed)
 *   - Has barcodes (CODE128, scannable) + checkboxes
 *   - Same style as existing packing list (indigo theme)
 *
 * ใบจัดของ (Compact Packing List) — always generated:
 *   - Per-order packing list, compact version
 *   - Logo + company name (left) + "ใบจัดของ" title + info box (right)
 *   - Two orders per A4 page (half page each) with dashed divider
 *   - Used for both single and multi-order printing
 */

import JsBarcode from 'jsbarcode';
import {
  type CompanyInfo,
  fetchCompanyInfo,
  setupPdfMake,
  loadLogoDataUrl,
  formatPdfDate,
  buildCompanyStack,
  buildProductNameStack,
} from './pdf-utils';

// ─── Interfaces ──────────────────────────────────────────

interface PackingComponentItem {
  product_name: string;
  product_code?: string | null;
  sku?: string | null;
  barcode?: string | null;
  image?: string | null;
  role: string;
  quantity: number;
}

interface PackingItem {
  product_name: string;
  product_code?: string;
  variation_label?: string;
  quantity: number;
  image?: string | null;
  barcode?: string | null;
  sku?: string | null;
  promotion_name?: string | null;
  promotion_components?: PackingComponentItem[];
}

export interface PackingListData {
  order_number: string;
  order_date?: string;
  created_at: string;
  order_status?: string;
  notes?: string;
  gift_card_requested?: boolean;
  gift_message?: string;
  gift_to?: string;
  gift_from?: string;
  gift_hide_price?: boolean;
  customer?: { name?: string; phone?: string } | null;
  delivery_name?: string;
  delivery_phone?: string;
  delivery_address?: string;
  delivery_district?: string;
  delivery_amphoe?: string;
  delivery_province?: string;
  delivery_postal_code?: string;
  source?: string;
  items: PackingItem[];
  is_split?: boolean;
  tax_invoice_requested?: boolean;
  parcels?: {
    parcel_number: number;
    tracking_number?: string;
    shipping_carrier?: string;
    items: { product_name: string; variation_label?: string | null; quantity: number }[];
  }[];
}

// ─── Theme ───────────────────────────────────────────────

const THEME = { primary: '#6366f1' };

// ─── Helpers ─────────────────────────────────────────────

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

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function generateCheckboxDataUrl(): string {
  const size = 28;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = '#999999';
  ctx.lineWidth = 1.5;
  const inset = 2;
  ctx.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
  return canvas.toDataURL('image/png');
}

// ─── Aggregated item for pick list ───────────────────────

interface AggregatedItem {
  product_name: string;
  product_code?: string;
  variation_label?: string;
  quantity: number;
  image?: string | null;
  barcode?: string | null;
  sku?: string | null;
  /** Which orders contain this item */
  order_numbers: string[];
}

function aggregateItems(orders: PackingListData[]): AggregatedItem[] {
  const map = new Map<string, AggregatedItem>();

  for (const order of orders) {
    for (const item of order.items) {
      // If item has promotion components, expand them for picking
      if (item.promotion_components && item.promotion_components.length > 0) {
        for (const comp of item.promotion_components) {
          const key = `${comp.product_name}||||${comp.barcode || comp.sku || comp.product_code || ''}`;
          const existing = map.get(key);
          if (existing) {
            existing.quantity += comp.quantity * item.quantity;
            if (!existing.order_numbers.includes(order.order_number)) {
              existing.order_numbers.push(order.order_number);
            }
          } else {
            map.set(key, {
              product_name: comp.product_name,
              product_code: comp.product_code || undefined,
              quantity: comp.quantity * item.quantity,
              image: comp.image,
              barcode: comp.barcode,
              sku: comp.sku,
              order_numbers: [order.order_number],
            });
          }
        }
      } else {
        // Normal item
        const key = `${item.product_name}||${item.variation_label || ''}||${item.barcode || item.sku || item.product_code || ''}`;
        const existing = map.get(key);
        if (existing) {
          existing.quantity += item.quantity;
          if (!existing.order_numbers.includes(order.order_number)) {
            existing.order_numbers.push(order.order_number);
          }
        } else {
          map.set(key, {
            product_name: item.product_name,
            product_code: item.product_code,
            variation_label: item.variation_label,
            quantity: item.quantity,
            image: item.image,
            barcode: item.barcode,
            sku: item.sku,
            order_numbers: [order.order_number],
          });
        }
      }
    }
  }

  // Sort by product name
  return Array.from(map.values()).sort((a, b) =>
    a.product_name.localeCompare(b.product_name, 'th')
  );
}

// ─── Pick List Content ───────────────────────────────────

async function buildPickListContent(
  orders: PackingListData[],
  company: CompanyInfo | undefined,
  logoDataUrl: string | null,
) {
  const items = aggregateItems(orders);

  // Pre-load product images
  const imageMap = new Map<string, string>();
  const imagePromises = items
    .filter((item) => item.image)
    .map(async (item) => {
      const dataUrl = await loadImageAsDataUrl(item.image!);
      if (dataUrl) imageMap.set(item.image!, dataUrl);
    });
  await Promise.all(imagePromises);

  // Pre-generate barcodes
  const barcodeMap = new Map<string, string>();
  for (const item of items) {
    const barcodeValue = item.barcode || item.sku || item.product_code || '';
    if (barcodeValue && !barcodeMap.has(barcodeValue)) {
      const dataUrl = generateBarcodeDataUrl(barcodeValue);
      if (dataUrl) barcodeMap.set(barcodeValue, dataUrl);
    }
  }
  const hasBarcode = barcodeMap.size > 0;
  const hasImage = imageMap.size > 0;

  const checkboxDataUrl = generateCheckboxDataUrl();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ── Header ──
  const companyStack = buildCompanyStack(company, logoDataUrl);

  const dateStr = formatPdfDate(new Date().toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoBoxRows: any[] = [
    [
      { text: 'วันที่', fontSize: 10, color: THEME.primary, bold: true },
      { text: dateStr, fontSize: 10 },
    ],
    [
      { text: 'จำนวน', fontSize: 10, color: THEME.primary, bold: true },
      { text: `${orders.length} ออเดอร์`, fontSize: 10 },
    ],
  ];

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
          {
            text: 'ใบหยิบของ',
            fontSize: 24,
            bold: true,
            color: THEME.primary,
            alignment: 'right',
            margin: [0, 0, 0, 6],
          },
          {
            table: {
              widths: [45, '*'],
              body: infoBoxRows,
            },
            layout: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              hLineWidth: (i: number, node: any) =>
                i === 0 || i === node.table.body.length ? 0.5 : 0,
              vLineWidth: () => 0,
              hLineColor: () => '#cccccc',
              paddingTop: (i: number) => (i === 0 ? 6 : 2),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              paddingBottom: (i: number, node: any) =>
                i === node.table.body.length - 1 ? 6 : 2,
              paddingLeft: () => 4,
              paddingRight: () => 4,
            },
          },
        ],
      },
    ],
    margin: [0, 0, 0, 12],
  });

  // ── Item Table ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCols: any[] = [];
  const widths: (number | string)[] = [];

  // # column
  headerCols.push({
    text: '#',
    style: 'tableHeader',
    alignment: 'center',
  });
  widths.push(25);

  if (hasImage) {
    headerCols.push({
      text: 'รูป',
      style: 'tableHeader',
      alignment: 'center',
    });
    widths.push(45);
  }

  headerCols.push({ text: 'รายละเอียด', style: 'tableHeader' });
  widths.push('*');

  if (hasBarcode) {
    headerCols.push({
      text: 'Barcode',
      style: 'tableHeader',
      alignment: 'center',
    });
    widths.push(100);
  }

  headerCols.push({
    text: 'จำนวน',
    style: 'tableHeader',
    alignment: 'center',
  });
  widths.push(50);

  headerCols.push({
    text: '✓',
    style: 'tableHeader',
    alignment: 'center',
  });
  widths.push(30);

  const tableBody = items.map((item, idx) => {
    const barcodeSource =
      item.barcode || item.sku || item.product_code || '';
    const showCodeInSubtitle =
      !hasBarcode ||
      (item.product_code && item.product_code !== barcodeSource);
    const subtitle = [
      showCodeInSubtitle ? item.product_code : null,
      item.variation_label,
    ].filter(Boolean).join(' | ');

    const productStack = buildProductNameStack(item.product_name, subtitle);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any[] = [];

    // # column
    row.push({
      text: `${idx + 1}`,
      alignment: 'center',
      fontSize: 10,
      margin: [0, 2, 0, 0],
    });

    // Image column
    if (hasImage) {
      const imgDataUrl = item.image ? imageMap.get(item.image) : null;
      if (imgDataUrl) {
        row.push({
          image: imgDataUrl,
          width: 35,
          height: 35,
          fit: [35, 35],
          alignment: 'center' as const,
          margin: [0, 1, 0, 1],
        });
      } else {
        row.push({
          text: '-',
          alignment: 'center',
          fontSize: 11,
          margin: [0, 2, 0, 0],
        });
      }
    }

    row.push({ stack: productStack, margin: [0, 1, 0, 1] });

    // Barcode column
    if (hasBarcode) {
      const barcodeValue =
        item.barcode || item.sku || item.product_code || '';
      const barcodeDataUrl = barcodeValue
        ? barcodeMap.get(barcodeValue)
        : null;
      if (barcodeDataUrl) {
        row.push({
          stack: [
            {
              image: barcodeDataUrl,
              width: 90,
              height: 30,
              alignment: 'center' as const,
              margin: [0, 1, 0, 0],
            },
            {
              text: barcodeValue,
              fontSize: 7,
              alignment: 'center' as const,
              color: '#666666',
            },
          ],
        });
      } else {
        row.push({
          text: '-',
          alignment: 'center',
          fontSize: 11,
          margin: [0, 2, 0, 0],
        });
      }
    }

    row.push({
      text: `${item.quantity}`,
      alignment: 'center',
      fontSize: 11,
      bold: true,
      margin: [0, 2, 0, 0],
    });

    // Checkbox
    row.push({
      image: checkboxDataUrl,
      width: 14,
      height: 14,
      alignment: 'center' as const,
      margin: [0, 4, 0, 0],
    });

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
      hLineWidth: (i: number, node: any) =>
        i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
      vLineWidth: () => 0,
      hLineColor: (i: number) => (i <= 1 ? '#333333' : '#e5e7eb'),
      paddingTop: () => 5,
      paddingBottom: () => 5,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
  });

  // ── Summary ──
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  content.push({
    columns: [
      { width: '*', text: '' },
      {
        width: 260,
        table: {
          widths: ['*', 60],
          body: [
            [
              {
                text: 'จำนวนรายการ',
                fontSize: 11,
                alignment: 'right',
                color: '#555555',
              },
              {
                text: `${items.length}`,
                fontSize: 11,
                alignment: 'right',
              },
            ],
            [
              {
                text: 'รวมหยิบทั้งหมด (ชิ้น)',
                fontSize: 11,
                alignment: 'right',
                color: '#333333',
                bold: true,
              },
              {
                text: `${totalQty}`,
                fontSize: 11,
                alignment: 'right',
                bold: true,
              },
            ],
          ],
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

  return content;
}

// ─── Compact Packing List Content ────────────────────────

function buildCompactPackingContent(
  order: PackingListData,
  company: CompanyInfo | undefined,
  logoDataUrl: string | null,
  checkboxDataUrl: string,
  barcodeMap: Map<string, string>,
  imageMap: Map<string, string>,
) {
  const dateStr = formatPdfDate(order.order_date || order.created_at);
  const customerName =
    order.delivery_name || order.customer?.name || 'ลูกค้าทั่วไป';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ── Header: Logo + Company name (left) + "ใบจัดของ" title + info box (right) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leftStack: any[] = [];
  if (logoDataUrl) {
    leftStack.push({
      image: logoDataUrl,
      width: 40,
      height: 40,
      fit: [40, 40],
      margin: [0, 0, 0, 4],
    });
  }
  const companyName = company?.tax_company_name || company?.name || '';
  if (companyName) {
    leftStack.push({
      text: companyName,
      bold: true,
      fontSize: 11,
      color: '#333333',
    });
  }
  if (company?.address) {
    leftStack.push({ text: company.address, fontSize: 9, color: '#666666' });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoRows: any[][] = [
    [
      { text: 'เลขที่', fontSize: 8, color: THEME.primary, bold: true },
      { text: order.order_number, fontSize: 8, bold: true },
    ],
    [
      { text: 'วันที่', fontSize: 8, color: THEME.primary, bold: true },
      { text: dateStr, fontSize: 8 },
    ],
  ];

  content.push({
    columns: [
      {
        width: '*',
        stack: leftStack.length > 0 ? leftStack : [{ text: '' }],
      },
      {
        width: 200,
        stack: [
          {
            text: 'ใบจัดของ',
            fontSize: 16,
            bold: true,
            color: THEME.primary,
            alignment: 'right',
            margin: [0, 0, 0, 4],
          },
          {
            table: {
              widths: [30, '*'],
              body: infoRows,
            },
            layout: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              hLineWidth: (i: number, node: any) =>
                i === 0 || i === node.table.body.length ? 0.5 : 0,
              vLineWidth: () => 0,
              hLineColor: () => '#cccccc',
              paddingTop: (i: number) => (i === 0 ? 4 : 1),
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              paddingBottom: (i: number, node: any) =>
                i === node.table.body.length - 1 ? 4 : 1,
              paddingLeft: () => 3,
              paddingRight: () => 3,
            },
          },
        ],
      },
    ],
    margin: [0, 0, 0, 4],
  });

  // ── Customer name (left) + Notes (right) — same line ──
  const customerPhone = order.delivery_phone || order.customer?.phone || '';
  const customerLabel = customerPhone ? `${customerName}  โทร: ${customerPhone}` : customerName;
  const noteSource = order.source === 'shopee' && !(order.notes || '').includes(order.order_number)
    ? `Shopee: ${order.order_number}` : '';
  const noteText = [order.notes, noteSource].filter(Boolean).join(' | ');

  if (customerLabel || noteText) {
    content.push({
      columns: [
        {
          width: '*',
          text: customerLabel ? [
            { text: 'จัดส่งถึง ', fontSize: 9, bold: true, color: THEME.primary },
            { text: customerLabel, fontSize: 9, bold: true, color: '#333333' },
          ] : '',
        },
        ...(noteText ? [{
          width: 'auto',
          text: [
            { text: 'หมายเหตุ: ', fontSize: 8, bold: true, color: THEME.primary },
            { text: noteText, fontSize: 8, color: '#555555' },
          ],
        }] : []),
      ],
      margin: [0, 0, 0, 4],
    });
  }

  // ── การ์ดอวยพร ──
  // ใส่กรอบไว้เลย เพราะเป็นงานมือที่คนแพ็คต้องทำเพิ่ม (เขียนการ์ด) ถ้าพลาด
  // ของถึงมือคนรับโดยไม่มีการ์ด = แก้ไม่ได้แล้ว
  if (order.gift_card_requested) {
    const giftLines: object[] = [
      { text: '🎁 แนบการ์ดอวยพร', fontSize: 10, bold: true, color: '#be185d', margin: [0, 0, 0, 2] },
    ];
    if (order.gift_message) {
      giftLines.push({ text: order.gift_message, fontSize: 10, color: '#333333', margin: [0, 0, 0, 2] });
    }
    const toFrom = [
      order.gift_to ? `ถึง: ${order.gift_to}` : '',
      order.gift_from ? `จาก: ${order.gift_from}` : '',
    ].filter(Boolean).join('   ');
    if (toFrom) giftLines.push({ text: toFrom, fontSize: 9, color: '#555555' });
    if (order.gift_hide_price) {
      giftLines.push({
        text: '** ห้ามแนบใบเสร็จ / ราคา ไปกับของ **',
        fontSize: 9, bold: true, color: '#dc2626', margin: [0, 2, 0, 0],
      });
    }
    content.push({
      table: { widths: ['*'], body: [[{ stack: giftLines, margin: [6, 5, 6, 5] }]] },
      layout: {
        hLineWidth: () => 1, vLineWidth: () => 1,
        hLineColor: () => '#f9a8d4', vLineColor: () => '#f9a8d4',
      },
      margin: [0, 2, 0, 5],
    });
  }

  // ── Tax invoice badge ──
  if (order.tax_invoice_requested) {
    content.push({
      text: '** ขอใบกำกับภาษี **',
      fontSize: 10,
      bold: true,
      color: '#dc2626',
      margin: [0, 2, 0, 4],
    });
  }

  // ── Compact item table ──
  const allComponents = order.items.flatMap(i => i.promotion_components || []);
  const hasBarcode = order.items.some(
    (item) => item.barcode || item.sku || item.product_code
  ) || allComponents.some(c => c.barcode || c.sku || c.product_code);
  const hasImage = order.items.some((item) => item.image) || allComponents.some(c => c.image);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCols: any[] = [];
  const widths: (number | string)[] = [];

  if (hasImage) {
    headerCols.push({
      text: 'รูป',
      fontSize: 8,
      bold: true,
      color: '#666666',
      alignment: 'center',
    });
    widths.push(35);
  }

  headerCols.push({ text: 'รายละเอียด', fontSize: 8, bold: true, color: '#666666' });
  widths.push('*');

  if (hasBarcode) {
    headerCols.push({
      text: 'Barcode',
      fontSize: 8,
      bold: true,
      color: '#666666',
      alignment: 'center',
    });
    widths.push(85);
  }

  headerCols.push({
    text: 'จำนวน',
    fontSize: 8,
    bold: true,
    color: '#666666',
    alignment: 'center',
  });
  widths.push(40);

  headerCols.push({
    text: '✓',
    fontSize: 8,
    bold: true,
    color: '#666666',
    alignment: 'center',
  });
  widths.push(22);

  // Build table rows — expand promotion items into component rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableBody: any[][] = [];

  for (const item of order.items) {
    const hasComponents = item.promotion_components && item.promotion_components.length > 0;

    if (hasComponents) {
      // Promotion header row
      const colCount = (hasImage ? 1 : 0) + 1 + (hasBarcode ? 1 : 0) + 1 + 1;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const headerRow: any[] = [];
      if (hasImage) headerRow.push({ text: '', margin: [0, 1, 0, 0] });
      headerRow.push({
        text: [
          { text: '', fontSize: 9 },
          { text: item.promotion_name || item.product_name, fontSize: 9, bold: true, color: '#6366f1' },
          { text: ` (×${item.quantity})`, fontSize: 8, color: '#888888' },
        ],
        margin: [0, 1, 0, 0],
        colSpan: 1 + (hasBarcode ? 1 : 0),
      });
      if (hasBarcode) headerRow.push({});
      headerRow.push({ text: '', margin: [0, 1, 0, 0] });
      headerRow.push({ text: '', margin: [0, 1, 0, 0] });
      tableBody.push(headerRow);

      // Component rows
      for (const comp of item.promotion_components!) {
        const compBarcodeSource = comp.barcode || comp.sku || comp.product_code || '';
        const compSubtitle = [comp.sku, comp.role === 'gift' ? '[แถมฟรี]' : null].filter(Boolean).join(' ');
        const compProductStack = buildProductNameStack(comp.product_name, compSubtitle);
        // Indent the product name
        compProductStack[0] = { ...compProductStack[0], text: `- ${compProductStack[0].text || comp.product_name}` };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const compRow: any[] = [];

        if (hasImage) {
          const imgDataUrl = comp.image ? imageMap.get(comp.image) : null;
          if (imgDataUrl) {
            compRow.push({
              image: imgDataUrl,
              width: 25,
              height: 25,
              fit: [25, 25],
              alignment: 'center' as const,
              margin: [0, 1, 0, 1],
            });
          } else {
            compRow.push({ text: '', margin: [0, 1, 0, 0] });
          }
        }

        compRow.push({ stack: compProductStack, margin: [8, 1, 0, 1] });

        if (hasBarcode) {
          const barcodeDataUrl = compBarcodeSource ? barcodeMap.get(compBarcodeSource) : null;
          if (barcodeDataUrl) {
            compRow.push({
              stack: [
                { image: barcodeDataUrl, width: 75, height: 22, alignment: 'center' as const, margin: [0, 1, 0, 0] },
                { text: compBarcodeSource, fontSize: 6, alignment: 'center' as const, color: '#666666' },
              ],
            });
          } else {
            compRow.push({ text: '-', alignment: 'center', fontSize: 9, margin: [0, 1, 0, 0] });
          }
        }

        compRow.push({
          text: `${comp.quantity * item.quantity}`,
          alignment: 'center',
          fontSize: 10,
          bold: true,
          margin: [0, 1, 0, 0],
        });

        compRow.push({
          image: checkboxDataUrl,
          width: 12,
          height: 12,
          alignment: 'center' as const,
          margin: [0, 3, 0, 0],
        });

        tableBody.push(compRow);
      }
    } else {
      // Normal item row
      const barcodeSource = item.barcode || item.sku || item.product_code || '';
      const showCodeInSubtitle =
        !hasBarcode || (item.product_code && item.product_code !== barcodeSource);
      const subtitle = [
        showCodeInSubtitle ? item.product_code : null,
        item.variation_label,
      ].filter(Boolean).join(' | ');

      const productStack = buildProductNameStack(item.product_name, subtitle);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row: any[] = [];

      if (hasImage) {
        const imgDataUrl = item.image ? imageMap.get(item.image) : null;
        if (imgDataUrl) {
          row.push({
            image: imgDataUrl,
            width: 25,
            height: 25,
            fit: [25, 25],
            alignment: 'center' as const,
            margin: [0, 1, 0, 1],
          });
        } else {
          row.push({
            text: '-',
            alignment: 'center',
            fontSize: 9,
            margin: [0, 1, 0, 0],
          });
        }
      }

      row.push({ stack: productStack, margin: [0, 1, 0, 1] });

      if (hasBarcode) {
        const barcodeValue = item.barcode || item.sku || item.product_code || '';
        const barcodeDataUrl = barcodeValue
          ? barcodeMap.get(barcodeValue)
          : null;
        if (barcodeDataUrl) {
          row.push({
            stack: [
              {
                image: barcodeDataUrl,
                width: 75,
                height: 22,
                alignment: 'center' as const,
                margin: [0, 1, 0, 0],
              },
              {
                text: barcodeValue,
                fontSize: 6,
                alignment: 'center' as const,
                color: '#666666',
              },
            ],
          });
        } else {
          row.push({
            text: '-',
            alignment: 'center',
            fontSize: 9,
            margin: [0, 1, 0, 0],
          });
        }
      }

      row.push({
        text: `${item.quantity}`,
        alignment: 'center',
        fontSize: 10,
        bold: true,
        margin: [0, 1, 0, 0],
      });

      row.push({
        image: checkboxDataUrl,
        width: 12,
        height: 12,
        alignment: 'center' as const,
        margin: [0, 3, 0, 0],
      });

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
      hLineWidth: (i: number, node: any) =>
        i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.3,
      vLineWidth: () => 0,
      hLineColor: (i: number) => (i <= 1 ? '#333333' : '#e5e7eb'),
      paddingTop: () => 3,
      paddingBottom: () => 3,
      paddingLeft: () => 4,
      paddingRight: () => 4,
    },
  });

  // ── Summary line ──
  const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
  content.push({
    text: `รวม ${order.items.length} รายการ / ${totalQty} ชิ้น`,
    fontSize: 9,
    bold: true,
    color: '#333333',
    alignment: 'right',
    margin: [0, 4, 0, 0],
  });

  return content;
}

// ─── Main Export ─────────────────────────────────────────

/**
 * Generate packing list PDF.
 * - 1 order: compact packing list only (no pick list)
 * - >1 orders: pick list (aggregated) + compact packing lists (2 per page)
 */
export async function generatePackingPdf(
  orders: PackingListData[],
): Promise<Blob> {
  const company = (await fetchCompanyInfo()) || undefined;
  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url
    ? await loadLogoDataUrl(company.logo_url)
    : null;

  // Pre-generate all barcodes and images for compact lists
  const allBarcodeMap = new Map<string, string>();
  const allImageMap = new Map<string, string>();

  const imagePromises: Promise<void>[] = [];
  for (const order of orders) {
    // Collect all items including promotion components
    const allItems: { image?: string | null; barcode?: string | null; sku?: string | null; product_code?: string }[] = [];
    for (const item of order.items) {
      allItems.push(item);
      if (item.promotion_components) {
        for (const comp of item.promotion_components) {
          allItems.push(comp as any);
        }
      }
    }
    for (const item of allItems) {
      const barcodeValue = item.barcode || item.sku || item.product_code || '';
      if (barcodeValue && !allBarcodeMap.has(barcodeValue)) {
        const dataUrl = generateBarcodeDataUrl(barcodeValue);
        if (dataUrl) allBarcodeMap.set(barcodeValue, dataUrl);
      }
      if (item.image && !allImageMap.has(item.image)) {
        const imgUrl = item.image;
        imagePromises.push(
          loadImageAsDataUrl(imgUrl).then((dataUrl) => {
            if (dataUrl) allImageMap.set(imgUrl, dataUrl);
          }),
        );
      }
    }
  }
  await Promise.all(imagePromises);

  const checkboxDataUrl = generateCheckboxDataUrl();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullContent: any[] = [];

  // Pick list only when multiple orders
  if (orders.length > 1) {
    const pickListContent = await buildPickListContent(
      orders,
      company,
      logoDataUrl,
    );
    fullContent.push(...pickListContent);
  }

  // Build compact packing list content (2 per page, 50:50 split)
  // A4 = 842pt, exact vertical center = 421pt
  // Top half: fixed-height table = 381pt (421 - 40 top margin)
  // Dashed divider: absolutePosition canvas at y=421 (pixel-perfect page center)
  // Bottom half: content flows below divider
  const PAGE_CENTER_Y = 421;
  const TOP_HALF_HEIGHT = PAGE_CENTER_Y - 40; // 381pt
  const PAGE_WIDTH = 595; // A4 width in pt
  const H_MARGIN = 40;
  const LINE_LENGTH = PAGE_WIDTH - H_MARGIN * 2; // 515pt

  for (let i = 0; i < orders.length; i += 2) {
    // Page break before each new page pair (except if first content)
    if (fullContent.length > 0) {
      fullContent.push({ text: '', pageBreak: 'before' });
    }

    const topOrder = orders[i];
    const bottomOrder = i + 1 < orders.length ? orders[i + 1] : null;

    const topContent = buildCompactPackingContent(
      topOrder, company, logoDataUrl, checkboxDataUrl, allBarcodeMap, allImageMap,
    );
    const bottomContent = bottomOrder
      ? buildCompactPackingContent(
          bottomOrder, company, logoDataUrl, checkboxDataUrl, allBarcodeMap, allImageMap,
        )
      : null;

    // Top half — fixed height container (no border, we draw divider separately)
    fullContent.push({
      table: {
        widths: ['*'],
        heights: [TOP_HALF_HEIGHT],
        body: [[{ stack: topContent, margin: [0, 0, 0, 0] }]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
      },
    });

    // Dashed divider at exact page center using absolutePosition
    if (bottomContent) {
      fullContent.push({
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: LINE_LENGTH,
            y2: 0,
            lineWidth: 0.5,
            lineColor: '#cccccc',
            dash: { length: 4, space: 3 },
          },
        ],
        absolutePosition: { x: H_MARGIN, y: PAGE_CENTER_Y },
      });

      // Bottom half content
      fullContent.push({
        stack: bottomContent,
        margin: [0, 12, 0, 0],
      });
    }
  }

  const docDefinition = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 16 },
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    content: fullContent,
    styles: {
      tableHeader: { bold: true, fontSize: 11, color: '#333333' },
    },
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

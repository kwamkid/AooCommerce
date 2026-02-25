/**
 * Combined Pick List + Compact Packing List PDF generation.
 *
 * ใบหยิบของ (Pick List):
 *   - Aggregated list of ALL products across all selected orders
 *   - Duplicates combined (quantity summed)
 *   - Has barcodes (CODE128, scannable) + checkboxes
 *   - Same style as existing packing list (indigo theme)
 *
 * ใบจัดของ (Compact Packing List):
 *   - Per-order packing list, compact version
 *   - Only: Logo + company name + order number + date + customer + notes
 *   - NO company address, customer address, or signature footer
 *   - Two orders per A4 page (half page each), unless items overflow
 */

import JsBarcode from 'jsbarcode';
import {
  type CompanyInfo,
  fetchCompanyInfo,
  setupPdfMake,
  loadLogoDataUrl,
  formatPdfDate,
  buildCornerTriangle,
} from './pdf-utils';

import type { PackingListData } from './order-packing-pdf';

// ─── Theme ───────────────────────────────────────────────

const THEME = { primary: '#6366f1' };

// ─── Helpers ─────────────────────────────────────────────

const MAX_NAME_LEN = 60;
const truncateName = (name: string) =>
  name.length > MAX_NAME_LEN ? name.slice(0, MAX_NAME_LEN) + '...' : name;

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
      // Key by product name + variation to combine duplicates
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyStack: any[] = [];
  if (logoDataUrl) {
    companyStack.push({
      image: logoDataUrl,
      width: 50,
      height: 50,
      fit: [50, 50],
      margin: [0, 0, 0, 6],
    });
  }
  const companyName = company?.tax_company_name || company?.name || '';
  if (companyName) {
    companyStack.push({
      text: companyName,
      bold: true,
      fontSize: 12,
      color: '#333333',
    });
  }

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
    const nameText = truncateName(item.product_name);
    const barcodeSource =
      item.barcode || item.sku || item.product_code || '';
    const showCodeInSubtitle =
      !hasBarcode ||
      (item.product_code && item.product_code !== barcodeSource);
    const subtitleParts = [
      showCodeInSubtitle ? item.product_code : null,
      item.variation_label,
    ].filter(Boolean);
    const subtitle = subtitleParts.join(' | ');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productStack: any[] = [{ text: nameText, fontSize: 11 }];
    if (subtitle)
      productStack.push({ text: subtitle, fontSize: 9, color: '#888888' });

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

  // ── Mini header: Logo + Company name (left) + Order number + date + customer (right) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leftStack: any[] = [];
  if (logoDataUrl) {
    leftStack.push({
      image: logoDataUrl,
      width: 30,
      height: 30,
      fit: [30, 30],
      margin: [0, 0, 6, 0],
    });
  }
  const companyName = company?.tax_company_name || company?.name || '';
  if (companyName) {
    leftStack.push({
      text: companyName,
      bold: true,
      fontSize: 10,
      color: '#333333',
      margin: [0, logoDataUrl ? 0 : 0, 0, 0],
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rightStack: any[] = [
    {
      text: order.order_number,
      fontSize: 12,
      bold: true,
      color: THEME.primary,
      alignment: 'right',
    },
    {
      text: dateStr,
      fontSize: 9,
      color: '#888888',
      alignment: 'right',
    },
    {
      text: customerName,
      fontSize: 10,
      color: '#333333',
      alignment: 'right',
      margin: [0, 2, 0, 0],
    },
  ];

  const customerPhone = order.delivery_phone || order.customer?.phone || '';
  if (customerPhone) {
    rightStack.push({
      text: `โทร: ${customerPhone}`,
      fontSize: 9,
      color: '#666666',
      alignment: 'right',
    });
  }

  content.push({
    columns: [
      {
        width: '*',
        stack:
          leftStack.length > 0 ? leftStack : [{ text: '' }],
      },
      {
        width: 'auto',
        stack: rightStack,
      },
    ],
    margin: [0, 0, 0, 6],
  });

  // ── Notes (if exists) ──
  if (order.notes) {
    content.push({
      text: [
        { text: 'หมายเหตุ: ', fontSize: 9, bold: true, color: THEME.primary },
        { text: order.notes, fontSize: 9, color: '#555555' },
      ],
      margin: [0, 0, 0, 4],
    });
  }

  // ── Parcel info (split orders) ──
  if (order.is_split && order.parcels && order.parcels.length > 0) {
    content.push({
      text: `แบ่ง ${order.parcels.length} กล่อง: ${order.parcels.map(p => {
        const qty = p.items.reduce((s: number, i: { quantity: number }) => s + i.quantity, 0);
        return `กล่อง ${p.parcel_number} (${qty} ชิ้น)`;
      }).join(', ')}`,
      fontSize: 8,
      color: '#7c3aed',
      bold: true,
      margin: [0, 0, 0, 4],
    });
  }

  // ── Compact item table ──
  const hasBarcode = order.items.some(
    (item) => item.barcode || item.sku || item.product_code
  );
  const hasImage = order.items.some((item) => item.image);

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

  const tableBody = order.items.map((item) => {
    const nameText = truncateName(item.product_name);
    const barcodeSource = item.barcode || item.sku || item.product_code || '';
    const showCodeInSubtitle =
      !hasBarcode || (item.product_code && item.product_code !== barcodeSource);
    const subtitleParts = [
      showCodeInSubtitle ? item.product_code : null,
      item.variation_label,
    ].filter(Boolean);
    const subtitle = subtitleParts.join(' | ');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productStack: any[] = [{ text: nameText, fontSize: 9 }];
    if (subtitle)
      productStack.push({ text: subtitle, fontSize: 7, color: '#888888' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any[] = [];

    // Image column
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

    // Barcode column (smaller for compact)
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

    // Checkbox
    row.push({
      image: checkboxDataUrl,
      width: 12,
      height: 12,
      alignment: 'center' as const,
      margin: [0, 3, 0, 0],
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

export async function generatePickAndPackPdf(
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
    for (const item of order.items) {
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

  // Build pick list content (page 1+)
  const pickListContent = await buildPickListContent(
    orders,
    company,
    logoDataUrl,
  );

  // Build compact packing list content (2 per page)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const compactContent: any[] = [];

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const isFirstOnPage = i % 2 === 0;
    const isLastOrder = i === orders.length - 1;

    if (isFirstOnPage) {
      // Page break before each new page pair (except the very first compact page)
      compactContent.push({
        text: '',
        pageBreak: 'before',
      });
    }

    const orderContent = buildCompactPackingContent(
      order,
      company,
      logoDataUrl,
      checkboxDataUrl,
      allBarcodeMap,
      allImageMap,
    );

    // Wrap in a container — if it's the first of a pair, add a separator after
    for (const block of orderContent) {
      compactContent.push(block);
    }

    if (!isLastOrder && isFirstOnPage) {
      // Add a dashed line separator + spacer between top and bottom order
      compactContent.push({
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: 515,
            y2: 0,
            lineWidth: 0.5,
            lineColor: '#cccccc',
            dash: { length: 4, space: 3 },
          },
        ],
        margin: [0, 10, 0, 10],
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullContent: any[] = [
    ...pickListContent,
    ...compactContent,
  ];

  const docDefinition = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 16 },
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    background: () => buildCornerTriangle(THEME.primary),
    content: fullContent,
    styles: {
      tableHeader: { bold: true, fontSize: 11, color: '#333333' },
    },
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

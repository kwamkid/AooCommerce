/**
 * Shared PDF generation for inventory receives and issues.
 * Used from both detail pages and list pages.
 */

const MAX_NAME_LEN = 70;
const truncateName = (name: string) => name.length > MAX_NAME_LEN ? name.slice(0, MAX_NAME_LEN) + '...' : name;
const MAX_SUB_LEN = 50;
const truncateSub = (text: string) => text.length > MAX_SUB_LEN ? text.slice(0, MAX_SUB_LEN) + '...' : text;

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
  created_by_user: { id: string; name: string } | null;
  items: InventoryItem[];
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

function getBarcodeValue(item: InventoryItem) {
  return item.variation?.barcode || (item.variation?.product?.code && /^\d{8,}$/.test(item.variation.product.code) ? item.variation.product.code : null);
}

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

interface GeneratePdfOptions {
  type: 'receive' | 'issue';
  data: InventoryDocData;
}

export async function generateInventoryPdf({ type, data }: GeneratePdfOptions) {
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

  const isReceive = type === 'receive';
  const title = isReceive ? 'ใบรับเข้าสินค้า' : 'ใบเบิกออกสินค้า';
  const dateStr = formatDate(data.created_at);
  const hasUnitCost = isReceive && data.items.some(i => i.unit_cost != null);
  const hasAnyBarcode = data.items.some(i => getBarcodeValue(i));
  const hasReason = !isReceive && data.items.some(i => i.reason);
  const totalQty = data.items.reduce((s, i) => s + i.quantity, 0);

  // Load product images as base64
  const imageDataUrls = await Promise.all(
    data.items.map(async (item) => {
      const imgUrl = item.variation?.product?.image;
      if (!imgUrl) return null;
      try {
        const response = await fetch(imgUrl);
        if (!response.ok) return null;
        const blob = await response.blob();
        return await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch { return null; }
    })
  );

  // Generate barcode images
  let barcodeDataUrls: (string | null)[] = [];
  if (hasAnyBarcode) {
    const JsBarcode = (await import('jsbarcode')).default;
    barcodeDataUrls = data.items.map(item => {
      const bc = getBarcodeValue(item);
      if (!bc) return null;
      try {
        const canvas = document.createElement('canvas');
        JsBarcode(canvas, bc, { format: 'CODE128', width: 1.5, height: 35, displayValue: true, fontSize: 9, margin: 2 });
        return canvas.toDataURL('image/png');
      } catch { return null; }
    });
  }

  // Build dynamic columns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const headerCols: any[] = [
    { text: '#', style: 'tableHeader', alignment: 'center' },
    { text: 'รูป', style: 'tableHeader', alignment: 'center' },
    { text: 'สินค้า', style: 'tableHeader' },
  ];
  if (hasAnyBarcode) headerCols.push({ text: 'บาร์โค้ด', style: 'tableHeader', alignment: 'center' });
  headerCols.push({ text: 'จำนวน', style: 'tableHeader', alignment: 'center' });
  if (hasUnitCost) {
    headerCols.push({ text: 'ต้นทุน/หน่วย', style: 'tableHeader', alignment: 'right' });
    headerCols.push({ text: 'รวม', style: 'tableHeader', alignment: 'right' });
  }
  if (hasReason) headerCols.push({ text: 'เหตุผล', style: 'tableHeader' });

  // Build widths
  const widths: (number | string)[] = [20, 42, '*'];
  if (hasAnyBarcode) widths.push(80);
  widths.push(40);
  if (hasUnitCost) { widths.push(60); widths.push(60); }
  if (hasReason) widths.push(70);

  // Table rows
  const tableBody = data.items.map((item, idx) => {
    const varLabel = getVariationLabel(item);
    const fullName = (item.variation?.product?.name || '-') + (varLabel ? ` - ${varLabel}` : '');
    const nameText = truncateName(fullName);
    const subText = truncateSub(buildSubtitle(item));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productStack: any[] = [{ text: nameText, bold: true, fontSize: 9 }];
    if (subText) productStack.push({ text: subText, fontSize: 7, color: '#666666' });

    const imgDataUrl = imageDataUrls[idx];
    const imgCell = imgDataUrl
      ? { image: imgDataUrl, width: 36, height: 36, alignment: 'center' }
      : { text: '-', alignment: 'center', fontSize: 8, color: '#999999' };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any[] = [
      { text: `${idx + 1}`, alignment: 'center', fontSize: 9 },
      imgCell,
      { stack: productStack },
    ];

    if (hasAnyBarcode) {
      const bcDataUrl = barcodeDataUrls[idx];
      row.push(bcDataUrl
        ? { image: bcDataUrl, width: 70, height: 28, alignment: 'center' }
        : { text: '-', alignment: 'center', fontSize: 8, color: '#999999' }
      );
    }

    row.push({ text: `${item.quantity}`, alignment: 'center', fontSize: 9 });

    if (hasUnitCost) {
      const cost = item.unit_cost ?? 0;
      row.push({ text: cost > 0 ? cost.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-', alignment: 'right', fontSize: 9 });
      row.push({ text: cost > 0 ? (cost * item.quantity).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-', alignment: 'right', fontSize: 9 });
    }

    if (hasReason) {
      row.push({ text: item.reason || '-', fontSize: 8 });
    }

    return row;
  });

  // Footer row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const footerRow: any[] = [];
  const borderStyle = [false, true, false, false];
  footerRow.push({ text: '', border: borderStyle });
  footerRow.push({ text: '', border: borderStyle });
  footerRow.push({ text: `รวม ${data.items.length} รายการ`, bold: true, fontSize: 9, border: borderStyle });
  if (hasAnyBarcode) footerRow.push({ text: '', border: borderStyle });
  footerRow.push({ text: `${totalQty}`, alignment: 'center', bold: true, fontSize: 9, border: borderStyle });
  if (hasUnitCost) {
    footerRow.push({ text: '', border: borderStyle });
    footerRow.push({
      text: data.items.reduce((s, i) => s + (i.unit_cost ?? 0) * i.quantity, 0).toLocaleString('th-TH', { minimumFractionDigits: 2 }),
      alignment: 'right', bold: true, fontSize: 9, border: borderStyle,
    });
  }
  if (hasReason) footerRow.push({ text: '', border: borderStyle });

  const statusText = isReceive
    ? (data.status === 'completed' ? 'สถานะ: รับเข้าสำเร็จ' : 'สถานะ: ยกเลิก')
    : (data.status === 'completed' ? 'สถานะ: เบิกออกสำเร็จ' : 'สถานะ: ยกเลิก');

  const userLabel = isReceive ? 'ผู้รับ: ' : 'ผู้เบิก: ';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [
    { text: title, style: 'header' },
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: [{ text: 'เลขที่: ', color: '#666666' }, { text: data.doc_number, bold: true }], fontSize: 11 },
            { text: [{ text: 'คลังสินค้า: ', color: '#666666' }, data.warehouse?.name || '-'], fontSize: 10, margin: [0, 2, 0, 0] },
          ],
        },
        {
          width: 'auto',
          alignment: 'right',
          stack: [
            { text: [{ text: 'วันที่: ', color: '#666666' }, dateStr], fontSize: 10 },
            { text: [{ text: userLabel, color: '#666666' }, data.created_by_user?.name || '-'], fontSize: 10, margin: [0, 2, 0, 0] },
            { text: statusText, fontSize: 10, color: data.status === 'completed' ? '#16a34a' : '#dc2626', margin: [0, 2, 0, 0] },
          ],
        },
      ],
      margin: [0, 5, 0, 10],
    },
  ];

  if (data.notes) {
    content.push({ text: [{ text: 'หมายเหตุ: ', color: '#666666' }, data.notes], fontSize: 9, margin: [0, 0, 0, 8] });
  }

  content.push({
    table: {
      headerRows: 1,
      widths,
      body: [headerCols, ...tableBody, footerRow],
    },
    layout: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5,
      vLineWidth: () => 0,
      hLineColor: (i: number) => i <= 1 ? '#333333' : '#dddddd',
      paddingTop: () => 5,
      paddingBottom: () => 5,
      paddingLeft: () => 3,
      paddingRight: () => 3,
    },
  });

  const docDefinition = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 10 },
    pageSize: 'A4' as const,
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    content,
    styles: {
      header: { fontSize: 16, bold: true, margin: [0, 0, 0, 5] as [number, number, number, number] },
      tableHeader: { bold: true, fontSize: 8, color: '#333333' },
    },
  };

  pdfMake.createPdf(docDefinition).open();
}

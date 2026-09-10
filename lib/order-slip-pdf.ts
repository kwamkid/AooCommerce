// Path: lib/order-slip-pdf.ts
// ใบคำสั่งซื้อ (ใบออเดอร์) — รายการสินค้า + ราคา + สรุปยอด 1 ออเดอร์/หน้า
//
// ต่างจาก **ใบจัดของ** ([lib/orders-packing-pdf.ts](orders-packing-pdf.ts)) ตรงที่ใบนี้มีราคา:
// ใบจัดของไว้ให้คนแพ็ค (ไม่มีราคา · 2 ออเดอร์/หน้า) ส่วนใบนี้ไว้ทวนกับลูกค้า/แนบบิล
//
// ⚠️ เดิม "ใบออเดอร์" มีแค่ใน [หน้า order detail](../app/orders/[id]/page.tsx) ซึ่งพิมพ์ด้วย
// `window.print()` จาก DOM ของ OrderForm — พิมพ์ทีละหลายบิลไม่ได้ ตัวนี้จึงเกิดขึ้นเพื่อ
// หน้า "จัดของ & ส่ง" ที่ต้องพิมพ์ทั้งวันรวดเดียว

import {
  fetchCompanyInfo, setupPdfMake, loadLogoDataUrl, loadImageDataUrl,
  buildCompanyStack, formatPdfPrice, formatPdfDate, formatDeliverySchedule,
  buildCornerTriangle, buildOrderSpecialFlagsCard,
  type OrderSpecialFlags,
} from './pdf-utils';
import { cleanVariationLabel } from './product-display';

const THEME = '#F4511E';

export interface OrderSlipItem {
  product_name: string;
  product_code?: string;
  variation_label?: string | null;
  quantity: number;
  unit_price?: number;
  discount_amount?: number;
  discount_percent?: number;
  discount_type?: string | null;
  total?: number;
  image?: string | null;
  /** หมายเหตุรายสินค้า (order_items.notes) — เช่น "1 เซต ปักป้าย HBD" */
  notes?: string | null;
}

// คำสั่งพิเศษของบิล (ห้ามแนบใบเสร็จ · ส่งเอกสารทางไปรษณีย์ · การ์ดอวยพร · ขอใบกำกับ)
// เป็นชุดเดียวกับใบจัดของ — ผู้เรียกส่ง order ทั้งก้อนจาก /api/orders/[id] อยู่แล้ว
export interface OrderSlipData extends OrderSpecialFlags {
  order_number: string;
  created_at?: string;
  order_date?: string;
  delivery_date?: string | null;
  delivery_slot_label?: string | null;
  notes?: string | null;
  customer?: { name?: string; phone?: string } | null;
  delivery_name?: string | null;
  delivery_phone?: string | null;
  delivery_address?: string | null;
  delivery_district?: string | null;
  delivery_amphoe?: string | null;
  delivery_province?: string | null;
  delivery_postal_code?: string | null;
  items: OrderSlipItem[];
  subtotal?: number;
  discount_amount?: number;
  shipping_fee?: number;
  gift_card_fee?: number;
  vat_amount?: number;
  total_amount?: number;
}

const lineTotal = (item: OrderSlipItem): number => {
  if (typeof item.total === 'number') return item.total;
  const gross = (item.unit_price || 0) * (item.quantity || 0);
  return gross - lineDiscount(item);
};

const lineDiscount = (item: OrderSlipItem): number => {
  if (item.discount_type === 'percent') {
    return (item.unit_price || 0) * (item.quantity || 0) * (item.discount_percent || 0) / 100;
  }
  return item.discount_amount || 0;
};

/** ที่อยู่จัดส่งที่พิมพ์ไว้บนตัวออเดอร์ — บิลที่ยังไม่กรอกจะได้บรรทัดว่าง (ไม่ใช่ "undefined") */
const deliveryAddressLine = (order: OrderSlipData): string =>
  [order.delivery_address, order.delivery_district, order.delivery_amphoe, order.delivery_province, order.delivery_postal_code]
    .filter(Boolean).join(' ');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOrderContent(order: OrderSlipData, company: any, logo: string | null, images: Map<string, string>): any[] {
  const schedule = formatDeliverySchedule(order);
  const addressLine = deliveryAddressLine(order);
  const receiver = order.delivery_name || order.customer?.name || '';
  const phone = order.delivery_phone || order.customer?.phone || '';

  const itemRows = order.items.map((item, i) => {
    const img = item.image ? images.get(item.image) : null;
    const discount = lineDiscount(item);
    return [
      { text: String(i + 1), fontSize: 9, color: '#9ca3af', margin: [0, 8, 0, 0] },
      img
        ? { image: img, width: 34, height: 34, fit: [34, 34], margin: [0, 4, 0, 4] }
        : { text: '', margin: [0, 4, 0, 4] },
      {
        stack: [
          { text: item.product_name, fontSize: 10, bold: true, color: '#333333' },
          // ป้ายตัวเลือกที่เป็นขีดกลาง/รหัสซ้ำ ไม่ใช่ตัวเลือกจริง — ตัดทิ้ง ไม่งั้นได้บรรทัด "-" เปล่า
          ...(cleanVariationLabel(item) ? [{ text: cleanVariationLabel(item), fontSize: 9, color: '#6b7280' }] : []),
          ...(item.notes && item.notes.trim()
            ? [{ text: `• ${item.notes.trim()}`, fontSize: 9.5, bold: true, color: '#111111' }]
            : []),
          ...(item.product_code ? [{ text: item.product_code, fontSize: 8, color: '#9ca3af' }] : []),
        ],
        margin: [0, 6, 0, 0],
      },
      { text: String(item.quantity), fontSize: 11, bold: true, alignment: 'center', margin: [0, 8, 0, 0] },
      { text: formatPdfPrice(item.unit_price || 0), fontSize: 10, alignment: 'right', margin: [0, 8, 0, 0] },
      { text: discount > 0 ? `-${formatPdfPrice(discount)}` : '-', fontSize: 10, alignment: 'right', color: '#6b7280', margin: [0, 8, 0, 0] },
      { text: formatPdfPrice(lineTotal(item)), fontSize: 10, bold: true, alignment: 'right', margin: [0, 8, 0, 0] },
    ];
  });

  const itemsTotal = order.items.reduce((sum, item) => sum + lineTotal(item), 0);
  // ⚠️ ความกว้างคงที่เสมอ — คอลัมน์ซ้ายกว้าง ~295pt (A4 หักขอบ 80 หักตารางสรุป 220)
  const flagsCard = buildOrderSpecialFlagsCard(order, { fontSize: 9, width: 280 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summaryRows: any[] = [['ยอดรวมสินค้า', formatPdfPrice(itemsTotal)]];
  if ((order.discount_amount || 0) > 0) summaryRows.push(['ส่วนลดท้ายบิล', `-${formatPdfPrice(order.discount_amount || 0)}`]);
  if ((order.shipping_fee || 0) > 0) summaryRows.push(['ค่าจัดส่ง', formatPdfPrice(order.shipping_fee || 0)]);
  if ((order.gift_card_fee || 0) > 0) summaryRows.push(['ค่าการ์ดอวยพร', formatPdfPrice(order.gift_card_fee || 0)]);
  if ((order.vat_amount || 0) > 0) {
    summaryRows.push(['ยอดก่อน VAT', formatPdfPrice(order.subtotal || 0)]);
    summaryRows.push(['VAT 7%', formatPdfPrice(order.vat_amount || 0)]);
  }

  return [
    {
      columns: [
        { width: '*', stack: buildCompanyStack(company, logo) },
        {
          width: 210,
          stack: [
            { text: 'ใบคำสั่งซื้อ', fontSize: 20, bold: true, color: THEME, alignment: 'right' },
            { text: order.order_number, fontSize: 12, bold: true, alignment: 'right', margin: [0, 2, 0, 6] },
            {
              table: {
                widths: ['auto', '*'],
                body: [
                  [{ text: 'วันที่', fontSize: 9, color: '#6b7280' },
                   { text: formatPdfDate(order.order_date || order.created_at || ''), fontSize: 9, alignment: 'right' }],
                  ...(schedule ? [[{ text: 'กำหนดส่ง', fontSize: 9, color: '#6b7280' },
                                    { text: schedule, fontSize: 9, alignment: 'right' }]] : []),
                ],
              },
              layout: 'noBorders',
            },
          ],
        },
      ],
      margin: [0, 0, 0, 12],
    },
    // ผู้รับ — บิลที่เปิดจากแชทยังไม่มีที่อยู่ ให้ขึ้นตามที่มีจริง ไม่ต้องเว้นช่องว่างลอย
    ...(receiver || phone || addressLine ? [{
      stack: [
        { text: 'ผู้รับ', fontSize: 9, bold: true, color: THEME },
        { text: [receiver, phone].filter(Boolean).join('  ·  '), fontSize: 10, bold: true, color: '#333333' },
        ...(addressLine ? [{ text: addressLine, fontSize: 9, color: '#666666' }] : []),
      ],
      margin: [0, 0, 0, 10],
    }] : []),
    {
      table: {
        headerRows: 1,
        widths: [16, 40, '*', 32, 58, 58, 66],
        body: [
          [
            { text: '#', fontSize: 9, bold: true, color: '#ffffff', fillColor: '#333333', margin: [0, 4, 0, 4] },
            { text: 'รูป', fontSize: 9, bold: true, color: '#ffffff', fillColor: '#333333', margin: [0, 4, 0, 4] },
            { text: 'สินค้า', fontSize: 9, bold: true, color: '#ffffff', fillColor: '#333333', margin: [0, 4, 0, 4] },
            { text: 'จำนวน', fontSize: 9, bold: true, color: '#ffffff', fillColor: '#333333', alignment: 'center', margin: [0, 4, 0, 4] },
            { text: 'ราคา', fontSize: 9, bold: true, color: '#ffffff', fillColor: '#333333', alignment: 'right', margin: [0, 4, 0, 4] },
            { text: 'ส่วนลด', fontSize: 9, bold: true, color: '#ffffff', fillColor: '#333333', alignment: 'right', margin: [0, 4, 0, 4] },
            { text: 'รวม', fontSize: 9, bold: true, color: '#ffffff', fillColor: '#333333', alignment: 'right', margin: [0, 4, 0, 4] },
          ],
          ...itemRows,
        ],
      },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
        hLineColor: (i: number, node: { table: { body: unknown[] } }) => (i <= 1 || i === node.table.body.length ? '#333333' : '#e5e7eb'),
        vLineWidth: () => 0,
        paddingLeft: () => 4,
        paddingRight: () => 4,
      },
    },
    {
      columns: [
        {
          width: '*',
          margin: [0, 10, 8, 0],
          stack: [
            ...(order.notes ? [{ text: `หมายเหตุ: ${order.notes}`, fontSize: 9, color: '#6b7280' }] : []),
            // การ์ดคำสั่งพิเศษ — ตัวเดียวกับใบจัดของ (pdf-utils) · 1 ออเดอร์/หน้า จึงไม่ต้องคุมความสูง
            ...(flagsCard ? [{ ...flagsCard, margin: [0, order.notes ? 6 : 0, 0, 0] }] : []),
          ],
        },
        {
          width: 220,
          margin: [0, 10, 0, 0],
          table: {
            widths: ['*', 'auto'],
            body: [
              ...summaryRows.map(([label, value]) => [
                { text: label, fontSize: 10, color: '#6b7280' },
                { text: value, fontSize: 10, alignment: 'right' },
              ]),
              [
                { text: 'ยอดรวมสุทธิ', fontSize: 12, bold: true, margin: [0, 4, 0, 0] },
                { text: `฿${formatPdfPrice(order.total_amount ?? itemsTotal)}`, fontSize: 12, bold: true, alignment: 'right', color: THEME, margin: [0, 4, 0, 0] },
              ],
            ],
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === node.table.body.length - 1 ? 1 : 0),
            hLineColor: () => '#333333',
            vLineWidth: () => 0,
            paddingTop: () => 2,
            paddingBottom: () => 2,
          },
        },
      ],
    },
  ];
}

/** ใบคำสั่งซื้อ — 1 ออเดอร์/หน้า (ส่งหลายใบมาได้ พิมพ์ทั้งวันรวดเดียว) */
export async function generateOrderSlipPdf(orders: OrderSlipData[]): Promise<Blob> {
  const company = (await fetchCompanyInfo()) || undefined;
  const pdfMake = await setupPdfMake();
  const logo = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  // โหลดรูปสินค้าล่วงหน้า (ตัวกลางมี /api/image-proxy ให้แล้ว — fetch ตรงโดน CORS)
  const images = new Map<string, string>();
  await Promise.all(
    Array.from(new Set(orders.flatMap(o => o.items.map(i => i.image).filter(Boolean) as string[])))
      .map(url => loadImageDataUrl(url).then(data => { if (data) images.set(url, data); })),
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];
  orders.forEach((order, i) => {
    // ติด pageBreak กับบล็อกของออเดอร์เอง ไม่ใช่ node ข้อความเปล่า
    // (node เปล่ากินความสูง 1 บรรทัดที่หัวหน้าถัดไป — บทเรียนเดียวกับใบจัดของ)
    content.push({
      ...(i > 0 ? { pageBreak: 'before' as const } : {}),
      stack: buildOrderContent(order, company, logo, images),
    });
  });

  const doc = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40] as [number, number, number, number],
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 10 },
    // สามเหลี่ยมมุมขวาบนเป็น "พื้นหลังของหน้า" — วางเป็น content จะกินความสูง 58pt
    // ดันทุกอย่างลงมา (หัวเอกสารเคยลอยกลางหน้า)
    background: () => buildCornerTriangle(THEME),
    content,
  };

  // ⚠️ pdfmake 0.3 `getBlob()` คืน **Promise** และไม่รับ callback อีกแล้ว
  // ของเดิมส่ง callback เข้าไป → ไม่มีใครเรียก resolve → promise ค้างตลอดกาล
  // → ปุ่มหมุนไม่หยุด ไม่มี error ให้เห็น (ดู fix-bug.md 2026-09-09)
  // ห้ามเขียนกลับเป็นแบบ callback — ทุกไฟล์ PDF ในโปรเจกต์ใช้ `return pdfDoc.getBlob()`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (pdfMake as any).createPdf(doc).getBlob();
}

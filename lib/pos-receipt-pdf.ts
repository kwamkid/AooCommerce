// Path: lib/pos-receipt-pdf.ts
//
// ใบเสร็จ POS เป็น PDF กระดาษใบเสร็จ 80mm — **ขนาดกระดาษฝังอยู่ในไฟล์**
//
// เดิมพิมพ์ด้วย `window.print()` ของหน้าเว็บ + CSS `@page 80mm` ซึ่งเบราว์เซอร์
// "แนะนำ" ให้เครื่องพิมพ์เท่านั้น ขนาดจริงมาจากการตั้งค่า driver ของแต่ละเครื่อง →
// เครื่องไหนตั้งไม่ตรงก็ได้ใบเสร็จคนละหน้าตา (เจ้าของขอ 19 ก.ย. 2026: "เปิดเครื่อง
// ไหนก็พิมพ์ได้เลย แค่ลง driver") · PDF กำหนดกว้าง 80mm สูงตามเนื้อหาในตัวไฟล์
// เครื่องพิมพ์จึงพิมพ์ตามนั้นโดยไม่ต้องตั้ง custom paper size
//
// ⚠️ ความสูงต้องรู้ล่วงหน้า (pdfMake ไม่มี height:auto) — ประมาณจากจำนวนบรรทัด
//    แล้วเผื่อไว้ · กระดาษม้วนไม่เสียหายถ้าเหลือท้ายว่างนิดหน่อย แต่ถ้า**ประมาณสั้นไป
//    เนื้อหาจะไหลไปหน้า 2** = ใบเสร็จขาดเป็นสองท่อน ดังนั้นเผื่อเยอะไว้ก่อน
//
// ⛔ ห้ามใส่ emoji/สัญลักษณ์ที่ฟอนต์ไม่มี (กติกา .claude/rules/domains/pdf.md)

import { setupPdfMake, loadLogoDataUrl, formatPdfPrice } from '@/lib/pdf-utils';
import { productDisplayName } from '@/lib/product-display';
import { formatThaiDateTime } from '@/lib/utils/format';

export interface ReceiptItem {
  product_name: string;
  variation_label?: string;
  quantity: number;
  unit_price: number;
  total: number;
  sku?: string | null;
  barcode?: string | null;
}

export interface ReceiptPayment {
  method: string;
  amount: number;
  channel_name: string;
  reference?: string;
}

export interface ReceiptData {
  company: {
    name: string;
    address: string;
    phone: string;
    tax_id: string;
    tax_company_name: string;
    /** ป้ายสาขาที่จด VAT (เช่น "สำนักงานใหญ่", "สาขาที่ 1") — ว่างถ้าไม่จด VAT */
    tax_branch?: string;
    logo_url?: string;
    vat_registered?: boolean;
  };
  order: {
    receipt_number: string;
    order_number: string;
    subtotal: number;
    vat_amount: number;
    discount_amount: number;
    total_amount: number;
    created_at: string;
    customer_name: string;
    tax_invoice_number?: string | null;
  };
  cashier_name: string;
  branch_name: string;
  items: ReceiptItem[];
  payments: ReceiptPayment[];
  change_amount?: number;
}

/**
 * ชื่อเอกสาร — ร้านจด VAT ต้องมีคำว่า "ภาษี" ในหัวเอกสารถึงจะเป็นใบกำกับภาษี
 * อย่างย่อที่ใช้ได้ตามประมวลรัษฎากร ม.86/6 · ใช้ทั้งบนจอและใน PDF
 */
export function receiptDocTitle(vatRegistered: boolean | undefined): string {
  return vatRegistered ? 'ใบกำกับภาษีอย่างย่อ/ใบเสร็จรับเงิน' : 'ใบเสร็จรับเงิน';
}

// ── ขนาดกระดาษ ──────────────────────────────────────────────────────────────
const MM = 72 / 25.4;
/** กระดาษ 80mm — พื้นที่พิมพ์จริงของเครื่องความร้อนส่วนใหญ่ ~72mm จึงเว้นขอบข้างละ 4mm */
const PAGE_W = 80 * MM;
const MARGIN_X = 4 * MM;
const MARGIN_Y = 3 * MM;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const GREEN = '#15803d';
const GRAY = '#6b7280';
const RED = '#dc2626';

const BODY = 8;
const SMALL = 7;

/** เส้นประคั่นส่วน — แบบเดียวกับใบเสร็จบนจอ */
function dashed() {
  return {
    canvas: [{
      type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0,
      lineWidth: 0.5, lineColor: '#9ca3af', dash: { length: 2, space: 2 },
    }],
    margin: [0, 4, 0, 4] as [number, number, number, number],
  };
}

function row(label: string, value: string, opts: { bold?: boolean; color?: string; size?: number } = {}) {
  const base = { fontSize: opts.size ?? BODY, bold: opts.bold ?? false, color: opts.color };
  return {
    columns: [
      { ...base, text: label, width: '*' },
      { ...base, text: value, width: 'auto', alignment: 'right' as const },
    ],
    margin: [0, 0.5, 0, 0.5] as [number, number, number, number],
  };
}

/**
 * ประมาณความสูงของใบเสร็จ (pt) — นับบรรทัดคูณความสูงบรรทัด แล้วเผื่อ 20%
 * ชื่อสินค้ายาวจะตัดบรรทัดในช่องกว้าง ~150pt (≈ 30 ตัวอักษรที่ 8pt)
 */
function estimateHeight(data: ReceiptData, hasLogo: boolean): number {
  const LINE = 11;
  let lines = 0;
  lines += hasLogo ? 4 : 0;           // โลโก้ 40pt
  lines += 6;                          // ชื่อร้าน สาขา ที่อยู่ โทร เลขภาษี หัวเอกสาร
  lines += 5;                          // เลขที่ วันที่ แคชเชียร์ สาขา ลูกค้า
  for (const it of data.items) {
    const name = productDisplayName({ product_name: it.product_name, variation_label: it.variation_label, sku: it.sku });
    lines += Math.max(1, Math.ceil(name.length / 30)) + 1;   // ชื่อ (อาจหลายบรรทัด) + บรรทัดจำนวน×ราคา
  }
  lines += 7;                          // รวม ส่วนลด ก่อน VAT VAT ยอดชำระ หมายเหตุภาษี
  lines += data.payments.length + 1;   // ช่องทางชำระ + เงินทอน
  lines += 2;                          // ขอบคุณ
  const separators = 5 * 9;
  return Math.ceil((lines * LINE + separators) * 1.2 + MARGIN_Y * 2);
}

export async function generatePosReceiptPdf(data: ReceiptData): Promise<Blob> {
  const pdfMake = await setupPdfMake();
  const logo = data.company.logo_url ? await loadLogoDataUrl(data.company.logo_url) : null;

  const vatRegistered = data.company.vat_registered || false;
  const docTitle = receiptDocTitle(vatRegistered);
  const docNumber = data.order.tax_invoice_number || data.order.receipt_number;
  // ชื่อที่จดทะเบียนภาษีสำคัญกว่าชื่อแบรนด์บนใบกำกับอย่างย่อ
  const displayName = data.company.tax_company_name?.trim() || data.company.name;
  const branchLabel = vatRegistered ? data.company.tax_branch?.trim() : '';

  const gross = Number(data.order.subtotal) + Number(data.order.vat_amount) + Number(data.order.discount_amount);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ── หัวร้าน ──
  if (logo) content.push({ image: logo, width: 40, alignment: 'center', margin: [0, 0, 0, 3] });
  content.push({ text: displayName, bold: true, fontSize: 10, alignment: 'center' });
  if (branchLabel) content.push({ text: `(${branchLabel})`, fontSize: SMALL, alignment: 'center', color: '#374151' });
  if (data.company.address) content.push({ text: data.company.address, fontSize: SMALL, alignment: 'center', color: GRAY });
  if (data.company.phone) content.push({ text: `โทร: ${data.company.phone}`, fontSize: SMALL, alignment: 'center', color: GRAY });
  if (data.company.tax_id) content.push({ text: `เลขผู้เสียภาษี: ${data.company.tax_id}`, fontSize: SMALL, alignment: 'center', color: GRAY });
  content.push({ text: docTitle, bold: true, fontSize: 9, alignment: 'center', color: GREEN, margin: [0, 4, 0, 0] });

  content.push(dashed());

  // ── ข้อมูลใบเสร็จ ──
  content.push({ text: [{ text: 'เลขที่: ' }, { text: docNumber, bold: true }], fontSize: BODY });
  content.push({ text: `วันที่: ${formatThaiDateTime(data.order.created_at)}`, fontSize: BODY });
  content.push({ text: `แคชเชียร์: ${data.cashier_name}`, fontSize: BODY });
  content.push({ text: `สาขา: ${data.branch_name}`, fontSize: BODY });
  if (data.order.customer_name && data.order.customer_name !== 'ลูกค้าทั่วไป') {
    content.push({ text: `ลูกค้า: ${data.order.customer_name}`, fontSize: BODY });
  }

  content.push(dashed());

  // ── รายการ ──
  for (const it of data.items) {
    const name = productDisplayName({ product_name: it.product_name, variation_label: it.variation_label, sku: it.sku });
    content.push({
      columns: [
        { text: name, fontSize: BODY, width: '*' },
        { text: formatPdfPrice(it.total), fontSize: BODY, width: 'auto', alignment: 'right', margin: [6, 0, 0, 0] },
      ],
      margin: [0, 1, 0, 0],
    });
    const codes = [
      it.sku ? `SKU: ${it.sku}` : null,
      it.barcode ? `BC: ${it.barcode}` : null,
    ].filter(Boolean).join('  ');
    content.push({
      text: `${it.quantity} x ${formatPdfPrice(it.unit_price)}${codes ? `   ${codes}` : ''}`,
      fontSize: SMALL, color: GRAY, margin: [0, 0, 0, 1],
    });
  }

  content.push(dashed());

  // ── ยอดเงิน ──
  content.push(row('รวม', formatPdfPrice(gross)));
  if (Number(data.order.discount_amount) > 0) {
    content.push(row('ส่วนลด', `-${formatPdfPrice(data.order.discount_amount)}`, { color: RED }));
  }
  if (Number(data.order.vat_amount) > 0) {
    content.push(row('มูลค่าก่อน VAT', formatPdfPrice(data.order.subtotal), { size: SMALL, color: GRAY }));
    content.push(row('VAT 7%', formatPdfPrice(data.order.vat_amount), { size: SMALL, color: GRAY }));
  }
  content.push(row('ยอดชำระ', formatPdfPrice(data.order.total_amount), { bold: true, size: 10 }));
  // ม.86/6 — ต้องบอกชัดว่าราคารวมภาษีแล้ว
  if (vatRegistered && Number(data.order.vat_amount) > 0) {
    content.push({ text: 'ราคารวมภาษีมูลค่าเพิ่มแล้ว', fontSize: SMALL, color: GRAY, alignment: 'right' });
  }

  content.push(dashed());

  // ── การชำระเงิน ──
  for (const p of data.payments) content.push(row(p.channel_name, formatPdfPrice(p.amount)));
  if ((data.change_amount ?? 0) > 0) content.push(row('เงินทอน', formatPdfPrice(data.change_amount!), { bold: true }));

  content.push(dashed());
  content.push({ text: 'ขอบคุณที่อุดหนุนค่ะ', fontSize: SMALL, color: GRAY, alignment: 'center' });

  const doc = {
    pageSize: { width: PAGE_W, height: estimateHeight(data, !!logo) },
    pageMargins: [MARGIN_X, MARGIN_Y, MARGIN_X, MARGIN_Y] as [number, number, number, number],
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: BODY, color: '#111827' },
    content,
  };

  // pdfmake 0.3 `getBlob()` คืน Promise — ห้ามเขียนแบบ callback (ดู fix-bug.md 2026-09-09)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (pdfMake as any).createPdf(doc).getBlob();
}

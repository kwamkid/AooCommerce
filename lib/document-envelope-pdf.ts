/**
 * ใบปะหน้าซองเอกสาร (Document Envelope Cover)
 *
 * เคสจริง: ร้านขายกระเช้า/ของขวัญ — ของส่งไปหา "ผู้รับของขวัญ" แต่ใบกำกับภาษี/ใบเสร็จ
 * ห้ามอยู่ในกล่อง (ผู้รับจะเห็นราคา) → เอกสารถูกส่งทางไปรษณีย์ไปหา "ผู้ซื้อ" แทน
 * ใบนี้คือหน้าซองของเอกสารชุดนั้น
 *
 * ┌──────────────────────────────────────────────┐
 * │ ผู้ส่ง (FROM)                                 │
 * │ [logo] ชื่อบริษัท / ที่อยู่ / โทร              │
 * │                                              │
 * │              ผู้รับ (TO)                      │
 * │              ชื่อผู้รับเอกสาร (ตัวใหญ่)        │
 * │              ที่อยู่ (ตัวใหญ่)                 │
 * │                                              │
 * │ เอกสารประกอบคำสั่งซื้อ ORD-xxx · วันที่       │
 * └──────────────────────────────────────────────┘
 *
 * ⛔ ห้ามใส่ราคา/รายการสินค้าในใบนี้เด็ดขาด — มันคือหน้าซอง ไม่ใช่เอกสารการเงิน
 */

import {
  type CompanyInfo,
  fetchCompanyInfo,
  setupPdfMake,
  loadLogoDataUrl,
  buildCompanyStack,
  formatPdfDate,
} from './pdf-utils';

// ─── Interfaces ──────────────────────────────────────────

export interface DocumentEnvelopeData {
  order_number: string;
  order_date?: string;
  created_at?: string;
  /** snapshot ผู้รับเอกสาร (orders.document_recipient_name) */
  document_recipient_name?: string | null;
  /** snapshot ที่อยู่เอกสารทั้งก้อน (orders.document_address) */
  document_address?: string | null;
  /** fallback เมื่อ snapshot ว่าง — ใช้ชื่อลูกค้าผู้สั่งแทน */
  customer?: { name?: string | null } | null;
  customer_name?: string | null;
}

/** ขนาดกระดาษ — default A5 แนวนอน (210×148mm) พอดีหน้าซองเอกสาร/ซองยาว
 *  'A4' = เต็มหน้า (ติดซองใหญ่ / พับใส่ซอง) · 'A6' = สติกเกอร์เล็ก (105×148mm) */
type EnvelopePageSize = 'A4' | 'A5' | 'A6';

const PAGE_SPECS: Record<EnvelopePageSize, {
  width: number; height: number; margin: number;
  nameSize: number; addrSize: number; gap: number;
}> = {
  // A5 landscape
  A5: { width: 595.28, height: 419.53, margin: 36, nameSize: 20, addrSize: 14, gap: 26 },
  A4: { width: 595.28, height: 841.89, margin: 48, nameSize: 22, addrSize: 15, gap: 60 },
  // A6 portrait (เท่าใบปะหน้าพัสดุ)
  A6: { width: 297.64, height: 419.53, margin: 18, nameSize: 14, addrSize: 10.5, gap: 18 },
};

interface GenerateOptions {
  data: DocumentEnvelopeData;
  company?: CompanyInfo;
  pageSizeOverride?: EnvelopePageSize;
}

// ─── Main Export ─────────────────────────────────────────

export async function generateDocumentEnvelopePdf({
  data,
  company,
  pageSizeOverride,
}: GenerateOptions): Promise<Blob> {
  if (!company) {
    company = (await fetchCompanyInfo()) || undefined;
  }

  const pdfMake = await setupPdfMake();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  const spec = PAGE_SPECS[pageSizeOverride || 'A5'];
  const innerWidth = spec.width - spec.margin * 2;
  // เยื้องบล็อกผู้รับเข้ามาแบบซองจดหมาย (ผู้ส่งชิดซ้ายบน · ผู้รับเยื้องกลาง)
  const recipientIndent = Math.round(innerWidth * 0.22);

  const recipientName =
    (data.document_recipient_name || '').trim() ||
    (data.customer?.name || '').trim() ||
    (data.customer_name || '').trim();
  const recipientAddress = (data.document_address || '').trim();
  const dateStr = formatPdfDate(data.order_date || data.created_at || new Date().toISOString());

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ══════════════════════════════════════════════════
  // ผู้ส่ง (FROM) — ข้อมูลบริษัท (helper กลาง ห้ามประกอบเอง)
  // ══════════════════════════════════════════════════

  content.push({
    text: 'ผู้ส่ง (FROM)',
    fontSize: 7,
    bold: true,
    color: '#888888',
    margin: [0, 0, 0, 2],
  });
  content.push({ stack: buildCompanyStack(company, logoDataUrl) });

  content.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: innerWidth, y2: 0, lineWidth: 0.5, lineColor: '#dddddd' }],
    margin: [0, 8, 0, 0],
  });

  // ══════════════════════════════════════════════════
  // ผู้รับ (TO) — ตัวใหญ่ อ่านง่ายจากระยะแขน
  // ══════════════════════════════════════════════════

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recipientStack: any[] = [
    { text: 'ผู้รับ (TO)', fontSize: 8, bold: true, color: '#888888', margin: [0, 0, 0, 4] },
    {
      text: recipientName || '___________________________',
      fontSize: spec.nameSize,
      bold: true,
      color: '#000000',
      lineHeight: 1.1,
    },
  ];
  recipientStack.push({
    text: recipientAddress || '___________________________________________',
    fontSize: spec.addrSize,
    color: '#222222',
    lineHeight: 1.35,
    margin: [0, 6, 0, 0],
  });

  content.push({
    columns: [
      { text: '', width: recipientIndent },
      { stack: recipientStack, width: '*' },
    ],
    margin: [0, spec.gap, 0, 0],
  });

  // ══════════════════════════════════════════════════
  // อ้างอิงคำสั่งซื้อ (ตัวเล็ก มุมล่าง) — ไม่มีราคา/รายการสินค้า
  // ══════════════════════════════════════════════════

  const docDefinition = {
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 10 },
    pageSize: { width: spec.width, height: spec.height },
    pageMargins: [spec.margin, spec.margin, spec.margin, spec.margin + 16] as [number, number, number, number],
    content,
    footer: () => ({
      text: `เอกสารประกอบคำสั่งซื้อ ${data.order_number} · ${dateStr}`,
      fontSize: 8,
      color: '#999999',
      margin: [spec.margin, 0, spec.margin, 0] as [number, number, number, number],
    }),
  };

  const pdfDoc = pdfMake.createPdf(docDefinition);
  return pdfDoc.getBlob();
}

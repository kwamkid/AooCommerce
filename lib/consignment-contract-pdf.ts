/**
 * PDF สัญญาแต่งตั้งตัวแทนเพื่อขายสินค้า ตามมาตรา 78(3) แห่งประมวลรัษฎากร
 * ใช้ pdfMake + IBMPlexSansThai
 */

import { setupPdfMake, fetchCompanyInfo, loadLogoDataUrl, formatPdfDate, withOriginalAndCopy, type CompanyInfo } from './pdf-utils';

export interface ContractParty {
  name: string;
  tax_company_name?: string | null;
  tax_id?: string | null;
  billing_address?: string | null;
  phone?: string | null;
}

export interface ContractData {
  contract_number: string;
  contract_date: string;          // ISO date
  gp_rate: number;                // GP% e.g. 30
  gp_base_price: 'retail' | 'discounted';
  report_due_days: number;        // e.g. 15
  payment_terms: number;          // e.g. 30
  contract_years?: number;        // default 1
  interest_rate?: number;         // default 15 (% per year)
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

function thaiFullDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const month = THAI_MONTHS[d.getMonth()];
  const year = d.getFullYear() + 543;
  return `${day} ${month} ${year}`;
}

function thaiYear(iso: string): number {
  return new Date(iso).getFullYear() + 543;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function p(text: string, opts?: Record<string, any>): any {
  return { text, fontSize: 11, lineHeight: 1.15, ...opts };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bold(text: string, opts?: Record<string, any>): any {
  return { text, bold: true, fontSize: 11, lineHeight: 1.15, ...opts };
}

function indent(text: string, opts?: Record<string, unknown>) {
  return p(text, { margin: [16, 0, 0, 0], ...opts });
}

function sectionTitle(num: number, title: string) {
  return bold(`ข้อ ${num}. ${title}`, { margin: [0, 3, 0, 1] });
}

/** Build inline party block: name, tax ID, address, phone on consecutive lines (no extra spacing) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function partyBlock(label: string, name: string, taxId: string, address: string, phone: string): any[] {
  const parts: string[] = [name];
  if (taxId) parts.push(`เลขผู้เสียภาษี ${taxId}`);
  if (address) parts.push(`ที่อยู่ ${address}`);
  if (phone) parts.push(`โทร ${phone}`);
  return [
    { text: [{ text: `${label}: `, bold: true }, parts.join(' ')], fontSize: 11, lineHeight: 1.15 },
  ];
}

export async function generateConsignmentContractPdf(
  agent: ContractParty,
  contract: ContractData,
  company?: CompanyInfo | null,
): Promise<Blob> {
  const pdfMake = await setupPdfMake();

  if (!company) company = await fetchCompanyInfo();
  const logoDataUrl = company?.logo_url ? await loadLogoDataUrl(company.logo_url) : null;

  const principalName = company?.tax_company_name || company?.name || '(ชื่อบริษัท)';
  const principalTaxId = company?.tax_id || '';
  const principalAddress = company?.address || '';
  const principalPhone = company?.phone || '';

  const agentName = agent.tax_company_name || agent.name || '(ชื่อตัวแทน)';
  const agentTaxId = agent.tax_id || '';
  const agentAddress = agent.billing_address || '';
  const agentPhone = agent.phone || '';

  const gpRate = contract.gp_rate;
  const gpBaseLabel = contract.gp_base_price === 'discounted' ? 'ราคาลด' : 'ราคาปลีก';
  const netPercent = 100 - gpRate;
  const reportDays = contract.report_due_days;
  const paymentDays = contract.payment_terms;
  const contractYears = contract.contract_years || 1;
  const interestRate = contract.interest_rate ?? 15;
  const contractDate = thaiFullDate(contract.contract_date);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [];

  // ── Header: logo left + title right ──
  content.push({
    columns: [
      logoDataUrl
        ? { image: logoDataUrl, width: 40, margin: [0, 0, 0, 0] }
        : { text: '', width: 40 },
      {
        width: '*',
        stack: [
          bold('สัญญาแต่งตั้งตัวแทนเพื่อขายสินค้า', { fontSize: 14, alignment: 'right', margin: [0, 0, 0, 1] }),
          p('ตามมาตรา 78(3) แห่งประมวลรัษฎากร', { fontSize: 10, alignment: 'right', color: '#666666', margin: [0, 0, 0, 1] }),
          p(`เลขที่สัญญา: ${contract.contract_number}`, { fontSize: 10, alignment: 'right', color: '#666666' }),
        ],
      },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 8],
  });

  // ── วันที่ทำสัญญา ──
  content.push(p(`สัญญาฉบับนี้ทำขึ้นเมื่อวันที่ ${contractDate}`, { margin: [0, 0, 0, 4] }));

  // ── คู่สัญญา (inline) ──
  content.push(bold('ระหว่าง', { margin: [0, 2, 0, 2] }));
  content.push(...partyBlock('ตัวการ (Principal)', principalName, principalTaxId, principalAddress, principalPhone));
  content.push(p('ซึ่งต่อไปในสัญญานี้จะเรียกว่า "ตัวการ"', { margin: [0, 0, 0, 4], color: '#666666', fontSize: 9 }));

  content.push(...partyBlock('ตัวแทน (Agent)', agentName, agentTaxId, agentAddress, agentPhone));
  content.push(p('ซึ่งต่อไปในสัญญานี้จะเรียกว่า "ตัวแทน"', { margin: [0, 0, 0, 4], color: '#666666', fontSize: 9 }));

  content.push(p('คู่สัญญาทั้งสองฝ่ายตกลงทำสัญญากันมีข้อความดังต่อไปนี้', { margin: [0, 0, 0, 4] }));

  // ── ข้อ 1: วัตถุประสงค์ ──
  content.push(sectionTitle(1, 'วัตถุประสงค์'));
  content.push(indent(
    'ตัวการแต่งตั้งให้ตัวแทนเป็นผู้ขายสินค้าของตัวการในนามของตัวการ ตามเงื่อนไขที่กำหนดในสัญญานี้ โดยตัวแทนตกลงรับเป็นตัวแทนขายสินค้า',
  ));

  // ── ข้อ 2: สินค้า ──
  content.push(sectionTitle(2, 'สินค้า'));
  content.push(indent(
    'สินค้าที่ตัวการมอบให้ตัวแทนจำหน่ายได้แก่สินค้าตามรายการที่ตัวการส่งมอบให้ตัวแทนตามใบส่งสินค้า (Delivery Note) แต่ละครั้ง',
  ));

  // ── ข้อ 3: กรรมสิทธิ์ในสินค้า ──
  content.push(sectionTitle(3, 'กรรมสิทธิ์ในสินค้า'));
  content.push(indent(
    'สินค้าทั้งหมดที่ตัวการส่งมอบให้ตัวแทน ยังคงเป็นกรรมสิทธิ์ของตัวการจนกว่าจะมีการขายสินค้าให้แก่ลูกค้า กรรมสิทธิ์ในสินค้าจะโอนไปยังลูกค้าเมื่อมีการส่งมอบสินค้า',
  ));

  // ── ข้อ 4: การส่งมอบสินค้า ──
  content.push(sectionTitle(4, 'การส่งมอบสินค้า'));
  content.push(indent(
    'ตัวการจะส่งมอบสินค้าให้ตัวแทนโดยออกใบส่งสินค้า (Delivery Note — DN) ทุกครั้งที่มีการส่งมอบ ตัวแทนต้องลงนามรับสินค้าและตรวจสอบจำนวนให้ถูกต้อง',
  ));

  // ── ข้อ 5: GP% และค่าตอบแทน ──
  content.push(sectionTitle(5, 'ค่าตอบแทนตัวแทน (GP%)'));
  content.push(indent(
    `ตัวแทนมีสิทธิหักค่าตอบแทน (GP) ในอัตราร้อยละ ${gpRate} จาก${gpBaseLabel}ของสินค้า ก่อนนำส่งเงินค่าสินค้าให้ตัวการ`,
  ));
  content.push(indent(
    `ดังนั้นตัวแทนจะนำส่งเงินค่าสินค้าให้ตัวการในอัตราร้อยละ ${netPercent} ของ${gpBaseLabel}`,
    { margin: [20, 2, 0, 0] },
  ));
  content.push(indent(
    'อัตรา GP อาจแตกต่างกันตามแบรนด์สินค้า ตามที่ตัวการและตัวแทนตกลงกันเป็นรายแบรนด์',
    { margin: [20, 2, 0, 0], fontSize: 10, color: '#666666' },
  ));

  // ── ข้อ 6: การส่งรายงานยอดขาย ──
  content.push(sectionTitle(6, 'การส่งรายงานยอดขาย'));
  content.push(indent(
    `ตัวแทนจะต้องส่งรายงานยอดขายประจำเดือนให้ตัวการภายใน ${reportDays} วันนับจากวันสิ้นเดือน โดยระบุรายละเอียดสินค้าที่ขายได้ จำนวน ราคา และยอดเงินที่ต้องนำส่ง`,
  ));

  // ── ข้อ 7: การชำระเงิน ──
  content.push(sectionTitle(7, 'การชำระเงิน'));
  content.push(indent(
    `ตัวแทนจะต้องชำระเงินค่าสินค้า (หลังหัก GP แล้ว) ให้ตัวการภายใน ${paymentDays} วันนับจากวันที่ตัวการออกใบวางบิล`,
  ));
  if (interestRate > 0) {
    content.push(indent(
      `หากตัวแทนชำระเงินล่าช้าเกินกว่ากำหนด ตัวแทนยินยอมชำระดอกเบี้ยในอัตราร้อยละ ${interestRate} ต่อปีของยอดเงินค้างชำระ`,
      { margin: [20, 2, 0, 0] },
    ));
  }

  // ── ข้อ 8: การรายงานสินค้าคงเหลือ ──
  content.push(sectionTitle(8, 'การรายงานสินค้าคงเหลือ'));
  content.push(indent(
    'ตัวแทนจะต้องรายงานยอดสินค้าคงเหลือที่อยู่ในความครอบครองให้ตัวการทราบทุกเดือน พร้อมกับรายงานยอดขายประจำเดือน',
  ));

  // ── ข้อ 9: ภาษีมูลค่าเพิ่ม (ม.78(3)) ──
  content.push(sectionTitle(9, 'ภาษีมูลค่าเพิ่ม'));
  content.push(indent(
    'ตัวการจะออกใบกำกับภาษีเมื่อตัวแทนได้ขายสินค้าให้แก่ลูกค้าแล้ว ตามมาตรา 78(3) แห่งประมวลรัษฎากร กล่าวคือ ความรับผิดในการเสียภาษีมูลค่าเพิ่มเกิดขึ้นเมื่อได้รับชำระราคาสินค้าหรือได้ส่งมอบสินค้า แล้วแต่กรณีใดจะเกิดขึ้นก่อน',
  ));
  content.push(indent(
    'ตัวการมีหน้าที่ยื่นแบบแจ้งการส่งสินค้าให้ตัวแทนเพื่อขาย (ภ.พ. 09.1) ต่อกรมสรรพากรภายใน 15 วันนับแต่วันทำสัญญา',
    { margin: [20, 2, 0, 0] },
  ));

  // ── ข้อ 10: การคืนสินค้า ──
  content.push(sectionTitle(10, 'การคืนสินค้า'));
  content.push(indent(
    'ตัวแทนสามารถคืนสินค้าที่ไม่สามารถจำหน่ายได้ให้แก่ตัวการ โดยสินค้าที่คืนต้องอยู่ในสภาพเรียบร้อยพร้อมขาย ตัวการจะออกใบรับคืนสินค้าทุกครั้ง',
  ));

  // ── ข้อ 11: ระยะเวลาของสัญญา ──
  content.push(sectionTitle(11, 'ระยะเวลาของสัญญา'));
  content.push(indent(
    `สัญญานี้มีผลบังคับใช้ตั้งแต่วันที่ลงนาม มีกำหนดระยะเวลา ${contractYears} ปี และจะต่ออายุโดยอัตโนมัติครั้งละ 1 ปี เว้นแต่คู่สัญญาฝ่ายใดฝ่ายหนึ่งจะบอกเลิกสัญญาเป็นลายลักษณ์อักษรล่วงหน้าไม่น้อยกว่า 30 วัน`,
  ));

  // ── ข้อ 12: การเก็บบันทึก ──
  content.push(sectionTitle(12, 'การเก็บบันทึก'));
  content.push(indent(
    'คู่สัญญาทั้งสองฝ่ายจะเก็บรักษาบันทึกและเอกสารที่เกี่ยวข้องกับสัญญานี้ไว้เป็นเวลาไม่น้อยกว่า 5 ปี เพื่อการตรวจสอบของเจ้าหน้าที่สรรพากร',
  ));

  // ── ข้อ 13: เงื่อนไขทั่วไป ──
  content.push(sectionTitle(13, 'เงื่อนไขทั่วไป'));
  content.push(indent(
    'สัญญานี้ทำขึ้นเป็นสองฉบับ มีข้อความถูกต้องตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความในสัญญาโดยตลอดแล้ว จึงลงลายมือชื่อไว้เป็นหลักฐานต่อหน้าพยาน',
  ));

  // ── ลงนาม ──
  content.push({ text: '', margin: [0, 20, 0, 0] });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signBlock = (role: string, name: string): any => ({
    width: '*',
    stack: [
      { text: ' ', margin: [0, 20, 0, 0] },
      { canvas: [{ type: 'line', x1: 20, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: '#999999' }] },
      { text: `ลงชื่อ ${role}`, fontSize: 10, margin: [20, 4, 0, 0] },
      { text: `(${name})`, fontSize: 10, margin: [20, 2, 0, 0], color: '#666666' },
      { text: 'วันที่ ........./........../..........', fontSize: 10, margin: [20, 4, 0, 0], color: '#999999' },
    ],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const witnessBlock = (num: number): any => ({
    width: '*',
    stack: [
      { text: ' ', margin: [0, 20, 0, 0] },
      { canvas: [{ type: 'line', x1: 20, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: '#999999' }] },
      { text: `ลงชื่อ พยาน ${num}`, fontSize: 10, margin: [20, 4, 0, 0] },
      { text: '(..........................................)', fontSize: 10, margin: [20, 2, 0, 0], color: '#666666' },
      { text: 'วันที่ ........./........../..........', fontSize: 10, margin: [20, 4, 0, 0], color: '#999999' },
    ],
  });

  content.push({
    columns: [
      signBlock('ตัวการ', principalName),
      signBlock('ตัวแทน', agentName),
    ],
    columnGap: 20,
  });

  content.push({
    columns: [
      witnessBlock(1),
      witnessBlock(2),
    ],
    columnGap: 20,
    margin: [0, 10, 0, 0],
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docDefinition: any = {
    pageSize: 'A4',
    pageMargins: [40, 30, 40, 30],
    defaultStyle: { font: 'IBMPlexSansThai', fontSize: 11, lineHeight: 1.15 },
    content,
  };

  const finalDef = withOriginalAndCopy(docDefinition);
  const pdfDoc = pdfMake.createPdf(finalDef);
  return pdfDoc.getBlob();
}

// ─────────────────────────────────────────────────────────────────────────────
// เอกสารของสายฝากขาย — ตัวแทน (c_consign) และห้าง (d_consign)
//
// **ทำไมต้องมีไฟล์นี้**: กติกา "ส่งของห้าง → ออกใบกำกับภาษีทันที" เคยถูกเขียน inline
// อยู่ใน route ถึง 3 ก้อน (ตอนส่งใบส่งห้าง · ตอนยืนยันรับไม่ครบ · ตอนส่งใบเติมของ
// ให้ห้าง) แต่ละก้อนดึงข้อมูลลูกค้ามาไม่เท่ากัน — ก้อนของใบเติมของไม่ได้ใส่ชื่อ/
// เลขภาษี/สาขา/ที่อยู่เลย ใบกำกับที่ออกมาจึงไม่มีข้อมูลผู้ซื้อ
// แก้กติกาทีต้องไล่แก้ 3 ที่ และพลาดที่ใดที่หนึ่งก็ไม่มีใครรู้
//
// **กติกาภาษีที่ไฟล์นี้ถือไว้** (อ้างอิง .claude/rules/order-flows.md):
//   ห้างฝากขาย  = ไม่มีสัญญา ม.78(3) → ส่งมอบของเมื่อไร เกิดความรับผิดทันที
//                 → ออก TAX `tax_only` ตอน "ส่งของ"
//   ตัวแทนฝากขาย = มีสัญญาแต่งตั้งตาม ม.78(3) → ความรับผิดเกิดเมื่อ**ตัวแทนขายได้**
//                 → ตอนส่งของออกแค่ DN ไม่มีราคา ใบกำกับไปออกตอนแจ้งยอดขาย
//                 (อยู่ที่ `issueReportDocument` ใน lib/invoice-service.ts)
//
// ทุกฟังก์ชันในนี้ไม่โยน error ออกไป — เอกสารออกไม่ได้ต้องไม่ทำให้การส่งของล้ม
// แต่ต้องมี log เสมอ ห้ามเงียบ
// ─────────────────────────────────────────────────────────────────────────────
import { supabaseAdmin } from '@/lib/supabase-admin';

/** ข้อมูลผู้ซื้อที่ต้องปรากฏบนใบกำกับภาษี — ขาดไปใบจะใช้ไม่ได้จริง */
async function customerTaxSnapshot(customerId: string | null | undefined) {
  if (!customerId) return null;
  const { data } = await supabaseAdmin
    .from('customers')
    .select('name, tax_company_name, tax_id, tax_branch, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code')
    .eq('id', customerId)
    .single();
  if (!data) return null;

  const address = [
    data.billing_address, data.billing_district,
    data.billing_amphoe, data.billing_province, data.billing_postal_code,
  ].filter(Boolean).join(' ');

  return {
    customer_name: data.tax_company_name || data.name || null,
    customer_tax_id: data.tax_id || null,
    customer_branch: data.tax_branch || 'สำนักงานใหญ่',
    customer_address: address || null,
  };
}

async function isVatRegistered(companyId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('companies').select('vat_registered').eq('id', companyId).single();
  return !!data?.vat_registered;
}

interface TaxOnlyParams {
  companyId: string;
  sourceType: 'department_order' | 'replenishment';
  sourceId: string;
  customerId: string | null;
  totalAmount: number;
}

/**
 * ออกใบกำกับภาษีแบบ `tax_only` (หัวเอกสาร "ใบกำกับภาษี" ไม่ใช่ใบเสร็จ)
 * @returns เลขที่ใบกำกับ หรือ null เมื่อบริษัทไม่ได้จด VAT / ออกไม่สำเร็จ
 */
export async function issueTaxOnly(params: TaxOnlyParams): Promise<string | null> {
  const { companyId, sourceType, sourceId, customerId, totalAmount } = params;
  try {
    if (!await isVatRegistered(companyId)) return null;

    const { data: taxNum } = await supabaseAdmin
      .rpc('generate_tax_invoice_number', { p_company_id: companyId });
    if (!taxNum) return null;

    const invoiceDate = new Date().toISOString().split('T')[0];
    const { insertTaxInvoice } = await import('@/lib/invoice-service');

    await insertTaxInvoice({
      company_id: companyId,
      invoice_number: taxNum,
      invoice_date: invoiceDate,
      source_type: sourceType,
      source_id: sourceId,
      customer_id: customerId ?? undefined,
      total_amount: totalAmount,
      is_receipt: false,
      document_subtype: 'tax_only',
      ...(await customerTaxSnapshot(customerId) || {}),
    });

    // เอกสารกับใบต้นเรื่องต้องอ้างถึงกันได้ทั้งสองทาง
    const table = sourceType === 'department_order' ? 'department_orders' : 'replenishments';
    await supabaseAdmin.from(table)
      .update({ tax_invoice_number: taxNum, tax_invoice_date: invoiceDate })
      .eq('id', sourceId);

    return taxNum;
  } catch (err) {
    console.error(`[consignment-documents] ออกใบกำกับภาษีของ ${sourceType} ${sourceId} ไม่สำเร็จ:`, err);
    return null;
  }
}

export interface ShipDocumentsResult {
  dnNumber: string | null;
  docType?: string | null;
  taxNumber: string | null;
}

/**
 * ใบส่งของห้าง กด "จัดส่ง" → DN (มีราคา) + TAX `tax_only` เต็มจำนวนที่ส่ง
 */
export async function issueDepartmentOrderShipDocuments(
  orderId: string,
  companyId: string,
  order: { customer_id: string | null; total_amount: number | null },
): Promise<ShipDocumentsResult> {
  let dnNumber: string | null = null;
  try {
    const { issueOrderDN } = await import('@/lib/invoice-service');
    const dn = await issueOrderDN(orderId, companyId, 'department_order');
    dnNumber = dn?.invoiceNumber || null;
  } catch (err) {
    console.error(`[consignment-documents] ออกใบส่งสินค้าของใบส่งห้าง ${orderId} ไม่สำเร็จ:`, err);
  }

  const taxNumber = await issueTaxOnly({
    companyId,
    sourceType: 'department_order',
    sourceId: orderId,
    customerId: order.customer_id,
    totalAmount: order.total_amount ?? 0,
  });

  return { dnNumber, taxNumber };
}

/**
 * ห้างยืนยันรับไม่ครบ → ยกเลิกใบกำกับใบเดิม แล้วออกใบใหม่ตามยอดที่รับจริง
 *
 * ต้องยกเลิกใบเดิมก่อนเสมอ — ปล่อยไว้สองใบคือแจ้งภาษีเกินจากของที่ส่งไปไม่ถึง
 */
export async function reissueDepartmentOrderTax(
  orderId: string,
  companyId: string,
  order: { customer_id: string | null; department_order_number: string | null },
  confirmedTotal: number,
): Promise<string | null> {
  try {
    await supabaseAdmin.from('tax_invoices')
      .update({
        voided_at: new Date().toISOString(),
        voided_reason: `ยืนยันรับไม่ครบ: ${order.department_order_number || orderId}`,
      })
      .eq('source_type', 'department_order')
      .eq('source_id', orderId)
      .is('voided_at', null);
  } catch (err) {
    console.error(`[consignment-documents] ยกเลิกใบกำกับเดิมของใบส่งห้าง ${orderId} ไม่สำเร็จ:`, err);
    return null;
  }

  return issueTaxOnly({
    companyId,
    sourceType: 'department_order',
    sourceId: orderId,
    customerId: order.customer_id,
    totalAmount: confirmedTotal,
  });
}

/**
 * ใบเติมสินค้า กด "จัดส่ง" → DN เสมอ · TAX เฉพาะเมื่อปลายทางเป็น**ห้างฝากขาย**
 *
 * ตัวแทนฝากขายไม่ออกใบกำกับตอนนี้ (สัญญา ม.78(3) — รอตอนตัวแทนแจ้งยอดขาย)
 */
export async function issueReplenishmentShipDocuments(
  replenishmentId: string,
  companyId: string,
  replenishment: { customer_id: string | null },
): Promise<ShipDocumentsResult> {
  let dnNumber: string | null = null;
  let docType: string | null = null;
  try {
    const { issueReplenishmentDN } = await import('@/lib/invoice-service');
    const dn = await issueReplenishmentDN(replenishmentId, companyId);
    dnNumber = dn?.invoiceNumber || null;
    docType = dn?.docType || null;
  } catch (err) {
    console.error(`[consignment-documents] ออกใบส่งสินค้าของใบเติมสินค้า ${replenishmentId} ไม่สำเร็จ:`, err);
  }

  let taxNumber: string | null = null;
  try {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('customer_type, sale_type')
      .eq('id', replenishment.customer_id || '')
      .single();

    const isDepartmentConsignment = customer?.customer_type === 'department_store'
      && (customer?.sale_type === 'consignment' || !customer?.sale_type);

    if (isDepartmentConsignment) {
      const { data: rp } = await supabaseAdmin
        .from('replenishments').select('total_amount').eq('id', replenishmentId).single();

      taxNumber = await issueTaxOnly({
        companyId,
        sourceType: 'replenishment',
        sourceId: replenishmentId,
        customerId: replenishment.customer_id,
        totalAmount: rp?.total_amount ?? 0,
      });
    }
  } catch (err) {
    console.error(`[consignment-documents] ตัดสินใจออกใบกำกับของใบเติมสินค้า ${replenishmentId} ไม่สำเร็จ:`, err);
  }

  return { dnNumber, docType, taxNumber };
}

/**
 * Invoice issuance service — shared building blocks ที่ทุก flow เรียกใช้ร่วมกัน
 *
 * Building blocks (doc type):
 * - issueAbbreviatedInvoice()    → ABB-YYYYMM-NNNN หรือ REC-YYYYMM-NNNN
 * - issueFullTaxInvoice()        → TAX-YYYYMM-NNNN (จด VAT) หรือ REC-YYYYMM-NNNN (ไม่จด)
 * - issueReceipt()               → REC-YYYYMM-NNNN
 * - issueConsignmentInvoices()   → TAX เลขเดียว (จด VAT) หรือ REC เลขเดียว (ไม่จด) — สำหรับ statement
 *
 * Flow ที่ใช้:
 * - Flow A (a_cash): กดรับออเดอร์ → issueAbbreviatedInvoice()
 * - Flow A: ลูกค้าขอใบเต็ม → issueFullTaxInvoice() (void ABB + issue TAX)
 * - Flow C (c_consign DN): ชำระเงินครบ → issueConsignmentInvoices() (TAX or REC เลขเดียว on statement)
 * - Flow D (d_statement): ส่งของ → issueFullTaxInvoice()
 * - Flow B (b_credit): ชำระเงิน → issueReceipt() (TODO)
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

// ─── Document table insert helpers (dual-write) ─────────
// Non-throwing: failures are logged but never break the business operation.
// All use ON CONFLICT DO NOTHING for idempotency.

export async function insertTaxInvoice(params: {
  company_id: string;
  invoice_number: string;
  invoice_date: string;
  source_type: 'order' | 'statement' | 'replenishment';
  source_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_tax_id?: string | null;
  customer_branch?: string | null;
  customer_address?: string | null;
  total_amount: number;
  vat_amount?: number;
  is_receipt?: boolean;
  replaces_abbreviated_id?: string | null;
}) {
  try {
    await supabaseAdmin.from('tax_invoices').upsert({
      company_id: params.company_id,
      invoice_number: params.invoice_number,
      invoice_date: params.invoice_date,
      source_type: params.source_type,
      source_id: params.source_id,
      customer_id: params.customer_id || null,
      customer_name: params.customer_name || null,
      customer_tax_id: params.customer_tax_id || null,
      customer_branch: params.customer_branch || null,
      customer_address: params.customer_address || null,
      total_amount: params.total_amount,
      vat_amount: params.vat_amount ?? 0,
      is_receipt: params.is_receipt ?? false,
      replaces_abbreviated_id: params.replaces_abbreviated_id || null,
    }, { onConflict: 'company_id,invoice_number', ignoreDuplicates: true });
  } catch (e) {
    console.error('[insertTaxInvoice]', e);
  }
}

export async function insertReceipt(params: {
  company_id: string;
  receipt_number: string;
  receipt_date: string;
  source_type: 'order' | 'statement' | 'replenishment';
  source_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_address?: string | null;
  total_amount: number;
}) {
  try {
    await supabaseAdmin.from('receipts').upsert({
      company_id: params.company_id,
      receipt_number: params.receipt_number,
      receipt_date: params.receipt_date,
      source_type: params.source_type,
      source_id: params.source_id,
      customer_id: params.customer_id || null,
      customer_name: params.customer_name || null,
      customer_address: params.customer_address || null,
      total_amount: params.total_amount,
    }, { onConflict: 'company_id,receipt_number', ignoreDuplicates: true });
  } catch (e) {
    console.error('[insertReceipt]', e);
  }
}

export async function insertAbbreviatedInvoice(params: {
  company_id: string;
  invoice_number: string;
  invoice_date: string;
  order_id: string;
  customer_id?: string | null;
  total_amount: number;
  vat_amount?: number;
}) {
  try {
    await supabaseAdmin.from('abbreviated_invoices').upsert({
      company_id: params.company_id,
      invoice_number: params.invoice_number,
      invoice_date: params.invoice_date,
      order_id: params.order_id,
      customer_id: params.customer_id || null,
      total_amount: params.total_amount,
      vat_amount: params.vat_amount ?? 0,
    }, { onConflict: 'company_id,invoice_number', ignoreDuplicates: true });
  } catch (e) {
    console.error('[insertAbbreviatedInvoice]', e);
  }
}

export async function insertDeliveryNote(params: {
  company_id: string;
  dn_number: string;
  dn_date: string;
  source_type: 'order' | 'replenishment';
  source_id: string;
  customer_id?: string | null;
  total_amount: number;
}) {
  try {
    await supabaseAdmin.from('delivery_notes').upsert({
      company_id: params.company_id,
      dn_number: params.dn_number,
      dn_date: params.dn_date,
      source_type: params.source_type,
      source_id: params.source_id,
      customer_id: params.customer_id || null,
      total_amount: params.total_amount,
    }, { onConflict: 'company_id,dn_number', ignoreDuplicates: true });
  } catch (e) {
    console.error('[insertDeliveryNote]', e);
  }
}

export async function insertInvoice(params: {
  company_id: string;
  invoice_number: string;
  invoice_date: string;
  order_id: string;
  customer_id?: string | null;
  customer_name?: string | null;
  total_amount: number;
  vat_amount?: number;
}) {
  try {
    await supabaseAdmin.from('invoices').upsert({
      company_id: params.company_id,
      invoice_number: params.invoice_number,
      invoice_date: params.invoice_date,
      order_id: params.order_id,
      customer_id: params.customer_id || null,
      customer_name: params.customer_name || null,
      total_amount: params.total_amount,
      vat_amount: params.vat_amount ?? 0,
    }, { onConflict: 'company_id,invoice_number', ignoreDuplicates: true });
  } catch (e) {
    console.error('[insertInvoice]', e);
  }
}

// ─── Shared helper: get company VAT status ───
async function getCompanyVat(companyId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('companies')
    .select('vat_registered')
    .eq('id', companyId)
    .single();
  return data?.vat_registered ?? false;
}

// ─── Result types ───

interface IssueResult {
  success: boolean;
  invoiceNumber?: string;
  docType?: string;
  error?: string;
}

interface IssueAbbreviatedResult {
  success: boolean;
  invoiceNumber?: string;
  docType?: 'abbreviated' | 'receipt';
  error?: string;
}

interface IssueConsignmentResult {
  success: boolean;
  taxNumber?: string;
  recNumber?: string;
  error?: string;
}

/**
 * ออกใบกำกับอย่างย่อ (ABB) หรือใบเสร็จ (REC) — ขึ้นกับ VAT status ของบริษัท
 *
 * เรียกตอน: กดรับออเดอร์ (flow_type=a_cash)
 * - จด VAT → ABB-YYYYMM-NNNN
 * - ไม่จด VAT → REC-YYYYMM-NNNN
 */
export async function issueAbbreviatedInvoice(
  orderId: string,
  companyId: string,
): Promise<IssueAbbreviatedResult> {
  try {
    // Check if already issued — query document tables
    const { data: existingAbb } = await supabaseAdmin
      .from('abbreviated_invoices')
      .select('invoice_number')
      .eq('order_id', orderId)
      .eq('company_id', companyId)
      .is('voided_at', null)
      .maybeSingle();
    if (existingAbb) {
      return { success: true, invoiceNumber: existingAbb.invoice_number, docType: 'abbreviated' };
    }
    const { data: existingRec } = await supabaseAdmin
      .from('receipts')
      .select('receipt_number')
      .eq('source_type', 'order').eq('source_id', orderId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (existingRec) {
      return { success: true, invoiceNumber: existingRec.receipt_number, docType: 'receipt' };
    }

    // Get company VAT status
    const vatRegistered = await getCompanyVat(companyId);
    const rpcName = vatRegistered ? 'generate_abbreviated_number' : 'generate_receipt_number';
    const docType = vatRegistered ? 'abbreviated' : 'receipt';

    // Generate running number
    const { data: invoiceNumber, error: rpcErr } = await supabaseAdmin
      .rpc(rpcName, { p_company_id: companyId });

    if (rpcErr || !invoiceNumber) {
      return { success: false, error: rpcErr?.message || 'ไม่สามารถสร้างเลขที่เอกสารได้' };
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // Insert into document table (single source of truth)
    const { data: orderInfo } = await supabaseAdmin
      .from('orders').select('customer_id, total_amount, vat_amount').eq('id', orderId).single();

    if (docType === 'abbreviated') {
      await insertAbbreviatedInvoice({
        company_id: companyId, invoice_number: invoiceNumber, invoice_date: dateStr,
        order_id: orderId, customer_id: orderInfo?.customer_id,
        total_amount: orderInfo?.total_amount ?? 0, vat_amount: orderInfo?.vat_amount ?? 0,
      });
    } else {
      await insertReceipt({
        company_id: companyId, receipt_number: invoiceNumber, receipt_date: dateStr,
        source_type: 'order', source_id: orderId, customer_id: orderInfo?.customer_id,
        total_amount: orderInfo?.total_amount ?? 0,
      });
    }

    return {
      success: true,
      invoiceNumber,
      docType: docType as 'abbreviated' | 'receipt',
    };
  } catch (err) {
    console.error('[issueAbbreviatedInvoice] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * ออกใบกำกับภาษีแบบเต็ม (TAX) หรือใบเสร็จ (REC) — ขึ้นกับ VAT status
 *
 * ใช้ได้กับ: order-based invoicing (Flow A ขอใบเต็ม, Flow D ส่งของ)
 * - จด VAT → TAX-YYYYMM-NNNN
 * - ไม่จด VAT → REC-YYYYMM-NNNN
 */
export async function issueFullTaxInvoice(
  orderId: string,
  companyId: string,
  taxInfo: {
    name: string;
    taxId: string;
    branch?: string;
    address?: string;
  },
): Promise<IssueResult> {
  try {
    const vatRegistered = await getCompanyVat(companyId);
    const rpcName = vatRegistered ? 'generate_tax_invoice_number' : 'generate_receipt_number';
    const docType = vatRegistered ? 'tax' : 'receipt';

    const { data: invoiceNumber, error: rpcErr } = await supabaseAdmin
      .rpc(rpcName, { p_company_id: companyId });

    if (rpcErr || !invoiceNumber) {
      return { success: false, error: rpcErr?.message || 'ไม่สามารถสร้างเลขที่เอกสารได้' };
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // Insert into document table (single source of truth)
    const { data: orderInfo } = await supabaseAdmin
      .from('orders').select('customer_id, total_amount, vat_amount').eq('id', orderId).single();

    if (docType === 'tax') {
      await insertTaxInvoice({
        company_id: companyId, invoice_number: invoiceNumber, invoice_date: dateStr,
        source_type: 'order', source_id: orderId, customer_id: orderInfo?.customer_id,
        customer_name: taxInfo.name, customer_tax_id: taxInfo.taxId,
        customer_branch: taxInfo.branch || 'สำนักงานใหญ่', customer_address: taxInfo.address || null,
        total_amount: orderInfo?.total_amount ?? 0, vat_amount: orderInfo?.vat_amount ?? 0,
        is_receipt: false,
      });
    } else {
      await insertReceipt({
        company_id: companyId, receipt_number: invoiceNumber, receipt_date: dateStr,
        source_type: 'order', source_id: orderId, customer_id: orderInfo?.customer_id,
        customer_name: taxInfo.name, customer_address: taxInfo.address || null,
        total_amount: orderInfo?.total_amount ?? 0,
      });
    }

    return { success: true, invoiceNumber, docType };
  } catch (err) {
    console.error('[issueFullTaxInvoice] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * ออกใบเสร็จรับเงิน (REC) อย่างเดียว
 *
 * ใช้ได้กับ: Flow B (credit — ลูกค้าจ่ายเงินแล้ว), หรือกรณีอื่นที่ต้องการออก REC แยก
 */
export async function issueReceipt(
  orderId: string,
  companyId: string,
): Promise<IssueResult> {
  try {
    const { data: invoiceNumber, error: rpcErr } = await supabaseAdmin
      .rpc('generate_receipt_number', { p_company_id: companyId });

    if (rpcErr || !invoiceNumber) {
      return { success: false, error: rpcErr?.message || 'ไม่สามารถสร้างเลขที่ใบเสร็จได้' };
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];

    // Insert into document table (single source of truth)
    const { data: orderInfo } = await supabaseAdmin
      .from('orders').select('customer_id, total_amount').eq('id', orderId).single();
    await insertReceipt({
      company_id: companyId, receipt_number: invoiceNumber, receipt_date: dateStr,
      source_type: 'order', source_id: orderId, customer_id: orderInfo?.customer_id,
      total_amount: orderInfo?.total_amount ?? 0,
    });

    return { success: true, invoiceNumber, docType: 'receipt' };
  } catch (err) {
    console.error('[issueReceipt] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * ออกใบกำกับภาษี (TAX) + ใบเสร็จ (REC) สำหรับ consignment statement
 *
 * ใช้กับ: Flow C (consignment DN) — เมื่อชำระเงินครบแล้ว
 * เก็บเลขเอกสารไว้ใน statements table (ไม่ใช่ orders)
 */
/**
 * ออกใบกำกับภาษี (TAX) หรือใบเสร็จ (REC) สำหรับ replenishment (Invoice Mode ship)
 *
 * ใช้กับ: consignment_mode='invoice' — เมื่อจัดส่งของให้ตัวแทน
 * เก็บเลขเอกสารไว้ใน replenishments table
 * - จด VAT → TAX-YYYYMM-NNNN, doc_type='tax'
 * - ไม่จด VAT → REC-YYYYMM-NNNN, doc_type='receipt'
 */
export async function issueReplenishmentInvoice(
  replenishmentId: string,
  companyId: string,
): Promise<IssueResult> {
  try {
    // Check if already issued — query document tables
    const { data: existingTax } = await supabaseAdmin
      .from('tax_invoices')
      .select('invoice_number')
      .eq('source_type', 'replenishment').eq('source_id', replenishmentId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (existingTax) {
      return { success: true, invoiceNumber: existingTax.invoice_number };
    }
    const { data: existingRec } = await supabaseAdmin
      .from('receipts')
      .select('receipt_number')
      .eq('source_type', 'replenishment').eq('source_id', replenishmentId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (existingRec) {
      return { success: true, invoiceNumber: existingRec.receipt_number };
    }

    const vatRegistered = await getCompanyVat(companyId);
    const rpcName = vatRegistered ? 'generate_tax_invoice_number' : 'generate_receipt_number';
    const docType = vatRegistered ? 'tax' : 'receipt';

    const { data: invoiceNumber, error: rpcErr } = await supabaseAdmin
      .rpc(rpcName, { p_company_id: companyId });

    if (rpcErr || !invoiceNumber) {
      return { success: false, error: rpcErr?.message || 'ไม่สามารถสร้างเลขที่เอกสารได้' };
    }

    const now = new Date().toISOString().split('T')[0];

    // Insert into document table (single source of truth)
    const { data: repInfo } = await supabaseAdmin
      .from('replenishments').select('customer_id, total_amount').eq('id', replenishmentId).single();
    if (docType === 'tax') {
      await insertTaxInvoice({
        company_id: companyId, invoice_number: invoiceNumber, invoice_date: now,
        source_type: 'replenishment', source_id: replenishmentId,
        customer_id: repInfo?.customer_id, total_amount: repInfo?.total_amount ?? 0,
        is_receipt: false,
      });
    } else {
      await insertReceipt({
        company_id: companyId, receipt_number: invoiceNumber, receipt_date: now,
        source_type: 'replenishment', source_id: replenishmentId,
        customer_id: repInfo?.customer_id, total_amount: repInfo?.total_amount ?? 0,
      });
    }

    return { success: true, invoiceNumber, docType };
  } catch (err) {
    console.error('[issueReplenishmentInvoice] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * ออกใบกำกับภาษี/ใบเสร็จรับเงิน สำหรับ consignment statement
 *
 * - จด VAT → เลขเดียว TAX-xxx (เป็นทั้งใบกำกับภาษีและใบเสร็จรับเงิน)
 *   เก็บใน tax_invoice_number + receipt_number = เลขเดียวกัน
 * - ไม่จด VAT → เลขเดียว REC-xxx (ใบเสร็จรับเงิน)
 *   เก็บใน receipt_number เท่านั้น
 */
export async function issueConsignmentInvoices(
  statementId: string,
  companyId: string,
): Promise<IssueConsignmentResult> {
  try {
    // Check if already issued — query document tables
    const { data: existingTax } = await supabaseAdmin
      .from('tax_invoices')
      .select('invoice_number')
      .eq('source_type', 'statement').eq('source_id', statementId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (existingTax) {
      return { success: true, taxNumber: existingTax.invoice_number, recNumber: existingTax.invoice_number };
    }
    const { data: existingRec } = await supabaseAdmin
      .from('receipts')
      .select('receipt_number')
      .eq('source_type', 'statement').eq('source_id', statementId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (existingRec) {
      return { success: true, recNumber: existingRec.receipt_number };
    }

    const vatRegistered = await getCompanyVat(companyId);
    const now = new Date().toISOString().split('T')[0];

    let invoiceNumber: string;

    if (vatRegistered) {
      // จด VAT → ใบกำกับภาษี/ใบเสร็จรับเงิน (เลขเดียว TAX-xxx)
      const { data, error } = await supabaseAdmin
        .rpc('generate_tax_invoice_number', { p_company_id: companyId });
      if (error || !data) {
        return { success: false, error: 'ไม่สามารถสร้างเลขที่ใบกำกับภาษีได้' };
      }
      invoiceNumber = data;

      // Insert into document table (single source of truth) — TAX+REC combined
      const { data: stInfo } = await supabaseAdmin
        .from('statements')
        .select('customer_id, total_amount, customer:customers(tax_company_name, name, tax_id, tax_branch, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code)')
        .eq('id', statementId).single();
      const cust = stInfo?.customer as unknown as Record<string, string> | null;
      const custName = cust?.tax_company_name || cust?.name || null;
      const custAddress = cust ? [cust.billing_address, cust.billing_district, cust.billing_amphoe, cust.billing_province, cust.billing_postal_code].filter(Boolean).join(' ') : null;
      await insertTaxInvoice({
        company_id: companyId, invoice_number: invoiceNumber, invoice_date: now,
        source_type: 'statement', source_id: statementId,
        customer_id: stInfo?.customer_id, total_amount: stInfo?.total_amount ?? 0,
        customer_name: custName,
        customer_tax_id: cust?.tax_id || null,
        customer_branch: cust?.tax_branch || null,
        customer_address: custAddress,
        is_receipt: true,
      });

      return { success: true, taxNumber: invoiceNumber, recNumber: invoiceNumber };
    } else {
      // ไม่จด VAT → ใบเสร็จรับเงิน (เลขเดียว REC-xxx)
      const { data, error } = await supabaseAdmin
        .rpc('generate_receipt_number', { p_company_id: companyId });
      if (error || !data) {
        return { success: false, error: 'ไม่สามารถสร้างเลขที่ใบเสร็จได้' };
      }
      invoiceNumber = data;

      // Insert into document table (single source of truth)
      const { data: stInfo2 } = await supabaseAdmin
        .from('statements')
        .select('customer_id, total_amount, customer:customers(tax_company_name, name, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code)')
        .eq('id', statementId).single();
      const cust2 = stInfo2?.customer as unknown as Record<string, string> | null;
      const custName2 = cust2?.tax_company_name || cust2?.name || null;
      const custAddr2 = cust2 ? [cust2.billing_address, cust2.billing_district, cust2.billing_amphoe, cust2.billing_province, cust2.billing_postal_code].filter(Boolean).join(' ') : null;
      await insertReceipt({
        company_id: companyId, receipt_number: invoiceNumber, receipt_date: now,
        source_type: 'statement', source_id: statementId,
        customer_id: stInfo2?.customer_id, total_amount: stInfo2?.total_amount ?? 0,
        customer_name: custName2,
        customer_address: custAddr2,
      });

      return { success: true, recNumber: invoiceNumber };
    }
  } catch (err) {
    console.error('[issueConsignmentInvoices] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Delivery Note (DN) ───────────────────────────────────

/**
 * ออกใบส่งสินค้า (DN) สำหรับ order — บริษัทไม่จด VAT ที่ส่งของก่อนรับเงิน
 *
 * ใช้กับ: Flow B (b_credit, no VAT) — ส่งของ
 * เก็บใน orders.dn_number + dn_date
 */
export async function issueOrderDN(
  orderId: string,
  companyId: string,
): Promise<IssueResult> {
  try {
    // Check if already issued — query document table
    const { data: existing } = await supabaseAdmin
      .from('delivery_notes')
      .select('dn_number')
      .eq('source_type', 'order').eq('source_id', orderId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (existing) {
      return { success: true, invoiceNumber: existing.dn_number, docType: 'dn' };
    }

    const { data: dnNumber, error: rpcErr } = await supabaseAdmin
      .rpc('generate_dn_number', { p_company_id: companyId });

    if (rpcErr || !dnNumber) {
      return { success: false, error: rpcErr?.message || 'ไม่สามารถสร้างเลข DN ได้' };
    }

    const now = new Date().toISOString().split('T')[0];

    // Insert into document table (single source of truth)
    const { data: orderInfo } = await supabaseAdmin
      .from('orders').select('customer_id, total_amount').eq('id', orderId).single();
    await insertDeliveryNote({
      company_id: companyId, dn_number: dnNumber, dn_date: now,
      source_type: 'order', source_id: orderId,
      customer_id: orderInfo?.customer_id, total_amount: orderInfo?.total_amount ?? 0,
    });

    return { success: true, invoiceNumber: dnNumber, docType: 'dn' };
  } catch (err) {
    console.error('[issueOrderDN] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * ออกใบส่งสินค้า (DN) สำหรับ replenishment — บริษัทไม่จด VAT
 *
 * ใช้กับ: Flow C (dn mode, no VAT) + Flow D (invoice mode, no VAT) — ส่งของ
 * เก็บใน replenishments.dn_number + dn_date
 */
export async function issueReplenishmentDN(
  replenishmentId: string,
  companyId: string,
): Promise<IssueResult> {
  try {
    // Check if already issued — query document table
    const { data: existing } = await supabaseAdmin
      .from('delivery_notes')
      .select('dn_number')
      .eq('source_type', 'replenishment').eq('source_id', replenishmentId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (existing) {
      return { success: true, invoiceNumber: existing.dn_number, docType: 'dn' };
    }

    const { data: dnNumber, error: rpcErr } = await supabaseAdmin
      .rpc('generate_dn_number', { p_company_id: companyId });

    if (rpcErr || !dnNumber) {
      return { success: false, error: rpcErr?.message || 'ไม่สามารถสร้างเลข DN ได้' };
    }

    const now = new Date().toISOString().split('T')[0];

    // Insert into document table (single source of truth)
    const { data: repInfo } = await supabaseAdmin
      .from('replenishments').select('customer_id, total_amount').eq('id', replenishmentId).single();
    await insertDeliveryNote({
      company_id: companyId, dn_number: dnNumber, dn_date: now,
      source_type: 'replenishment', source_id: replenishmentId,
      customer_id: repInfo?.customer_id, total_amount: repInfo?.total_amount ?? 0,
    });

    return { success: true, invoiceNumber: dnNumber, docType: 'dn' };
  } catch (err) {
    console.error('[issueReplenishmentDN] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Replenishment Partial Receive — Adjustment Documents ────

/**
 * ออกใบลดหนี้ (Credit Note) สำหรับ replenishment ที่รับขาด
 * เรียกตอน confirm action เมื่อ confirmed_total < total_amount
 */
export async function issueReplenishmentCreditNote(
  replenishmentId: string,
  companyId: string,
  shortfallItems: {
    replenishment_item_id: string;
    variation_id: string;
    product_name: string;
    variation_label: string;
    shortfall_qty: number;
    unit_price: number;
  }[],
  createdBy: string,
): Promise<{ cnNumber: string } | null> {
  try {
    if (!shortfallItems.length) return null;

    // Check if CN already issued for this replenishment
    const { data: existingCN } = await supabaseAdmin
      .from('credit_notes')
      .select('cn_number')
      .eq('source_type', 'replenishment')
      .eq('source_id', replenishmentId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (existingCN) return { cnNumber: existingCN.cn_number };

    // Generate CN number
    const { data: cnNumber, error: rpcErr } = await supabaseAdmin
      .rpc('generate_cn_number', { p_company_id: companyId });
    if (rpcErr || !cnNumber) {
      console.error('[issueReplenishmentCreditNote] RPC error:', rpcErr);
      return null;
    }

    // Calculate totals
    const subtotal = shortfallItems.reduce((sum, i) => sum + i.shortfall_qty * i.unit_price, 0);

    // Insert credit note header
    const { data: cn, error: cnErr } = await supabaseAdmin
      .from('credit_notes')
      .insert({
        company_id: companyId,
        cn_number: cnNumber,
        source_type: 'replenishment',
        source_id: replenishmentId,
        order_id: null,
        type: 'refund',
        status: 'issued',
        reason: 'รับสินค้าไม่ครบตามจำนวนที่ส่ง',
        subtotal,
        discount_amount: 0,
        vat_amount: 0,
        total_amount: subtotal,
        issued_at: new Date().toISOString(),
        created_by: createdBy,
      })
      .select('id')
      .single();

    if (cnErr || !cn) {
      console.error('[issueReplenishmentCreditNote] Insert error:', cnErr);
      return null;
    }

    // Insert credit note items
    const cnItems = shortfallItems.map((i) => ({
      credit_note_id: cn.id,
      replenishment_item_id: i.replenishment_item_id,
      variation_id: i.variation_id,
      product_name: i.product_name,
      variation_label: i.variation_label,
      quantity: i.shortfall_qty,
      unit_price: i.unit_price,
      discount_amount: 0,
      total: i.shortfall_qty * i.unit_price,
    }));

    await supabaseAdmin.from('credit_note_items').insert(cnItems);

    console.log(`[issueReplenishmentCreditNote] Issued ${cnNumber} for replenishment ${replenishmentId}`);
    return { cnNumber };
  } catch (err) {
    console.error('[issueReplenishmentCreditNote] Error:', err);
    return null;
  }
}

/**
 * ออกเอกสารเพิ่มเติมสำหรับ replenishment ที่รับเกิน
 * ออก DN หรือ TAX ใบใหม่สำหรับส่วนเกิน
 */
export async function issueReplenishmentExcessDocument(
  replenishmentId: string,
  companyId: string,
  excessAmount: number,
): Promise<IssueResult> {
  try {
    if (excessAmount <= 0) return { success: false, error: 'No excess amount' };

    // Determine document type based on VAT + consignment mode
    const { data: rep } = await supabaseAdmin
      .from('replenishments')
      .select('customer_id')
      .eq('id', replenishmentId)
      .single();
    if (!rep) return { success: false, error: 'Replenishment not found' };

    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('consignment_mode')
      .eq('id', rep.customer_id)
      .single();

    const vatRegistered = await getCompanyVat(companyId);
    const now = new Date().toISOString().split('T')[0];

    if (vatRegistered && customer?.consignment_mode === 'invoice') {
      // Invoice mode + VAT → additional TAX
      const rpcName = 'generate_tax_invoice_number';
      const { data: invoiceNumber, error: rpcErr } = await supabaseAdmin
        .rpc(rpcName, { p_company_id: companyId });
      if (rpcErr || !invoiceNumber) {
        return { success: false, error: rpcErr?.message || 'ไม่สามารถสร้างเลขที่เอกสารได้' };
      }

      await insertTaxInvoice({
        company_id: companyId,
        invoice_number: invoiceNumber,
        invoice_date: now,
        source_type: 'replenishment',
        source_id: `${replenishmentId}_excess`,
        customer_id: rep.customer_id,
        total_amount: excessAmount,
        is_receipt: false,
      });

      console.log(`[issueReplenishmentExcessDocument] Issued TAX ${invoiceNumber} (excess) for replenishment ${replenishmentId}`);
      return { success: true, invoiceNumber, docType: 'tax' };
    } else {
      // DN mode or no VAT → additional DN
      const { data: dnNumber, error: rpcErr } = await supabaseAdmin
        .rpc('generate_dn_number', { p_company_id: companyId });
      if (rpcErr || !dnNumber) {
        return { success: false, error: rpcErr?.message || 'ไม่สามารถสร้างเลข DN ได้' };
      }

      await insertDeliveryNote({
        company_id: companyId,
        dn_number: dnNumber,
        dn_date: now,
        source_type: 'replenishment',
        source_id: `${replenishmentId}_excess`,
        customer_id: rep.customer_id,
        total_amount: excessAmount,
      });

      console.log(`[issueReplenishmentExcessDocument] Issued DN ${dnNumber} (excess) for replenishment ${replenishmentId}`);
      return { success: true, invoiceNumber: dnNumber, docType: 'dn' };
    }
  } catch (err) {
    console.error('[issueReplenishmentExcessDocument] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Centralized Auto-Issue ───────────────────────────────

/**
 * Auto-issue document based on order's flow_type and current state.
 * Call this after any order_status or payment_status change.
 * It will decide what to issue (or skip) — safe to call multiple times (idempotent).
 *
 * Flow A (a_cash): กดรับ (processing+) AND paid → ABB/REC
 * Flow B (b_credit): ส่งของ (shipping+) → TAX (VAT) or DN (no VAT)
 * Flow B (b_credit): จ่ายเงินครบ (paid) AND shipped → REC
 */
export async function autoIssueDocument(
  orderId: string,
  companyId: string,
): Promise<void> {
  try {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('flow_type, order_status, payment_status')
      .eq('id', orderId)
      .eq('company_id', companyId)
      .single();
    if (!order) return;

    // Helper: check if any ABB/REC/TAX doc already exists for this order
    const hasAbbOrRec = async () => {
      const { count: abbCount } = await supabaseAdmin
        .from('abbreviated_invoices').select('id', { count: 'exact', head: true })
        .eq('order_id', orderId).eq('company_id', companyId).is('voided_at', null);
      if (abbCount && abbCount > 0) return true;
      // Check receipts sourced from this order (non-POS)
      const { count: recCount } = await supabaseAdmin
        .from('receipts').select('id', { count: 'exact', head: true })
        .eq('source_type', 'order').eq('source_id', orderId).eq('company_id', companyId);
      if (recCount && recCount > 0) return true;
      // Check tax invoices sourced from this order
      const { count: taxCount } = await supabaseAdmin
        .from('tax_invoices').select('id', { count: 'exact', head: true })
        .eq('source_type', 'order').eq('source_id', orderId).eq('company_id', companyId);
      return (taxCount && taxCount > 0);
    };

    const hasDN = async () => {
      const { count } = await supabaseAdmin
        .from('delivery_notes').select('id', { count: 'exact', head: true })
        .eq('source_type', 'order').eq('source_id', orderId).eq('company_id', companyId);
      return (count && count > 0);
    };

    // ─── Flow A (a_cash): ABB/REC when accepted (processing+) AND paid ───
    if (order.flow_type === 'a_cash'
        && ['processing', 'shipping', 'completed'].includes(order.order_status)
        && order.payment_status === 'paid') {
      if (!(await hasAbbOrRec())) {
        await issueAbbreviatedInvoice(orderId, companyId);
      }
      return;
    }

    // ─── Flow B (b_credit): ส่งของ → TAX (VAT) or DN (no VAT) ───
    if (order.flow_type === 'b_credit'
        && ['shipping', 'completed'].includes(order.order_status)) {
      const vatRegistered = await getCompanyVat(companyId);
      if (vatRegistered) {
        // จด VAT → ออก TAX (ถ้ายังไม่มี)
        const { count: taxCount } = await supabaseAdmin
          .from('tax_invoices').select('id', { count: 'exact', head: true })
          .eq('source_type', 'order').eq('source_id', orderId).eq('company_id', companyId);
        if (!taxCount || taxCount === 0) {
          const { data: invoiceNumber, error: rpcErr } = await supabaseAdmin
            .rpc('generate_tax_invoice_number', { p_company_id: companyId });
          if (!rpcErr && invoiceNumber) {
            const dateStr = new Date().toISOString().split('T')[0];
            const { data: oi } = await supabaseAdmin
              .from('orders').select('customer_id, total_amount, vat_amount').eq('id', orderId).single();
            await insertTaxInvoice({
              company_id: companyId, invoice_number: invoiceNumber, invoice_date: dateStr,
              source_type: 'order', source_id: orderId, customer_id: oi?.customer_id,
              total_amount: oi?.total_amount ?? 0, vat_amount: oi?.vat_amount ?? 0,
              is_receipt: false,
            });
          }
        }
      } else {
        // ไม่จด VAT → ออก DN
        if (!(await hasDN())) {
          await issueOrderDN(orderId, companyId);
        }
      }
    }

    // ─── Flow B (b_credit): จ่ายเงินครบ → REC ───
    if (order.flow_type === 'b_credit'
        && order.payment_status === 'paid'
        && ['shipping', 'completed'].includes(order.order_status)) {
      // Check if REC already exists for this order
      const { count: recCount } = await supabaseAdmin
        .from('receipts').select('id', { count: 'exact', head: true })
        .eq('source_type', 'order').eq('source_id', orderId).eq('company_id', companyId);
      if (!recCount || recCount === 0) {
        const { data: recNumber } = await supabaseAdmin
          .rpc('generate_receipt_number', { p_company_id: companyId });
        if (recNumber) {
          const recDate = new Date().toISOString().split('T')[0];
          const { data: oi } = await supabaseAdmin
            .from('orders').select('customer_id, total_amount').eq('id', orderId).single();
          await insertReceipt({
            company_id: companyId, receipt_number: recNumber, receipt_date: recDate,
            source_type: 'order', source_id: orderId, customer_id: oi?.customer_id,
            total_amount: oi?.total_amount ?? 0,
          });
        }
      }
    }
  } catch (err) {
    console.error(`[autoIssueDocument] Error for order ${orderId}:`, err);
  }
}

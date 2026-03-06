/**
 * Invoice issuance service — shared building blocks ที่ทุก flow เรียกใช้ร่วมกัน
 *
 * Building blocks (doc type):
 * - issueAbbreviatedInvoice()    → ABB-YYYYMM-NNNN หรือ REC-YYYYMM-NNNN
 * - issueFullTaxInvoice()        → TAX-YYYYMM-NNNN (จด VAT) หรือ REC-YYYYMM-NNNN (ไม่จด)
 * - issueReceipt()               → REC-YYYYMM-NNNN
 * - issueConsignmentInvoices()   → TAX + REC พร้อมกัน (สำหรับ statement)
 *
 * Flow ที่ใช้:
 * - Flow A (a_cash): กดรับออเดอร์ → issueAbbreviatedInvoice()
 * - Flow A: ลูกค้าขอใบเต็ม → issueFullTaxInvoice() (void ABB + issue TAX)
 * - Flow C (c_consign DN): ชำระเงินครบ → issueConsignmentInvoices() (TAX + REC on statement)
 * - Flow D (d_statement): ส่งของ → issueFullTaxInvoice()
 * - Flow B (b_credit): ชำระเงิน → issueReceipt() (TODO)
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

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
    // Check if already issued
    const { data: existing } = await supabaseAdmin
      .from('orders')
      .select('tax_invoice_number')
      .eq('id', orderId)
      .eq('company_id', companyId)
      .single();

    if (existing?.tax_invoice_number) {
      return { success: true, invoiceNumber: existing.tax_invoice_number, docType: 'abbreviated' };
    }

    // Get company VAT status
    const { data: companyData } = await supabaseAdmin
      .from('companies')
      .select('vat_registered')
      .eq('id', companyId)
      .single();

    const vatRegistered = companyData?.vat_registered ?? false;
    const rpcName = vatRegistered ? 'generate_abbreviated_number' : 'generate_receipt_number';
    const docType = vatRegistered ? 'abbreviated' : 'receipt';

    // Generate running number
    const { data: invoiceNumber, error: rpcErr } = await supabaseAdmin
      .rpc(rpcName, { p_company_id: companyId });

    if (rpcErr || !invoiceNumber) {
      return { success: false, error: rpcErr?.message || 'ไม่สามารถสร้างเลขที่เอกสารได้' };
    }

    // Update order
    const now = new Date();
    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({
        tax_invoice_requested: true,
        tax_invoice_type: 'abbreviated',
        tax_invoice_doc_type: docType,
        tax_invoice_number: invoiceNumber,
        tax_invoice_date: now.toISOString().split('T')[0],
        vat_registered_at_issue: vatRegistered,
      })
      .eq('id', orderId)
      .eq('company_id', companyId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
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
    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({
        tax_invoice_requested: true,
        tax_invoice_type: 'full',
        tax_invoice_doc_type: docType,
        tax_invoice_number: invoiceNumber,
        tax_invoice_date: now.toISOString().split('T')[0],
        tax_invoice_name: taxInfo.name,
        tax_invoice_tax_id: taxInfo.taxId,
        tax_invoice_branch: taxInfo.branch || 'สำนักงานใหญ่',
        tax_invoice_address: taxInfo.address || null,
        vat_registered_at_issue: vatRegistered,
      })
      .eq('id', orderId)
      .eq('company_id', companyId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
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
    const { error: updateErr } = await supabaseAdmin
      .from('orders')
      .update({
        tax_invoice_requested: true,
        tax_invoice_type: 'full',
        tax_invoice_doc_type: 'receipt',
        tax_invoice_number: invoiceNumber,
        tax_invoice_date: now.toISOString().split('T')[0],
        vat_registered_at_issue: false,
      })
      .eq('id', orderId)
      .eq('company_id', companyId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

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
    // Check if already issued
    const { data: existing } = await supabaseAdmin
      .from('replenishments')
      .select('tax_invoice_number')
      .eq('id', replenishmentId)
      .eq('company_id', companyId)
      .single();

    if (existing?.tax_invoice_number) {
      return { success: true, invoiceNumber: existing.tax_invoice_number };
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
    const { error: updateErr } = await supabaseAdmin
      .from('replenishments')
      .update({
        tax_invoice_number: invoiceNumber,
        tax_invoice_date: now,
        tax_invoice_doc_type: docType,
        vat_registered_at_issue: vatRegistered,
        updated_at: new Date().toISOString(),
      })
      .eq('id', replenishmentId)
      .eq('company_id', companyId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true, invoiceNumber, docType };
  } catch (err) {
    console.error('[issueReplenishmentInvoice] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function issueConsignmentInvoices(
  statementId: string,
  companyId: string,
): Promise<IssueConsignmentResult> {
  try {
    // Check if already issued
    const { data: statement } = await supabaseAdmin
      .from('statements')
      .select('id, tax_invoice_number, receipt_number, status')
      .eq('id', statementId)
      .eq('company_id', companyId)
      .single();

    if (!statement) {
      return { success: false, error: 'ไม่พบใบวางบิล' };
    }

    if (statement.tax_invoice_number && statement.receipt_number) {
      return {
        success: true,
        taxNumber: statement.tax_invoice_number,
        recNumber: statement.receipt_number,
      };
    }

    const vatRegistered = await getCompanyVat(companyId);
    const now = new Date().toISOString().split('T')[0];

    let taxNumber: string | undefined;
    let recNumber: string | undefined;

    // Generate TAX number (only if VAT registered)
    if (vatRegistered) {
      const { data, error } = await supabaseAdmin
        .rpc('generate_tax_invoice_number', { p_company_id: companyId });
      if (error || !data) {
        return { success: false, error: 'ไม่สามารถสร้างเลขที่ใบกำกับภาษีได้' };
      }
      taxNumber = data;
    }

    // Generate REC number
    {
      const { data, error } = await supabaseAdmin
        .rpc('generate_receipt_number', { p_company_id: companyId });
      if (error || !data) {
        return { success: false, error: 'ไม่สามารถสร้างเลขที่ใบเสร็จได้' };
      }
      recNumber = data;
    }

    // Update statement with invoice numbers
    const { error: updateErr } = await supabaseAdmin
      .from('statements')
      .update({
        tax_invoice_number: taxNumber || null,
        tax_invoice_date: taxNumber ? now : null,
        receipt_number: recNumber,
        receipt_date: now,
        updated_at: new Date().toISOString(),
      })
      .eq('id', statementId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true, taxNumber, recNumber };
  } catch (err) {
    console.error('[issueConsignmentInvoices] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

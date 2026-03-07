/**
 * Centralized print action logic — ตัดสินว่า order state ปัจจุบันควรแสดงปุ่มพิมพ์อะไรบ้าง
 * ใช้แทน inline conditions ที่กระจายใน ProcessingTab, ReadyToShipTab, etc.
 */

export type PrintActionType =
  | 'packing'           // ใบจัดของ
  | 'shipping_label'    // ใบปะหน้า
  | 'invoice'           // ใบแจ้งหนี้ (unpaid)
  | 'abbreviated'       // ออกใบกำกับอย่างย่อ/ใบเสร็จ (issue new)
  | 'print_abbreviated' // พิมพ์ ABB/REC ที่ออกแล้ว
  | 'receipt'           // ออกใบเสร็จรับเงิน (issue new, no-VAT)
  | 'print_receipt'     // พิมพ์ใบเสร็จรับเงิน (existing)
  | 'request_full'      // ขอใบกำกับภาษี (opens TaxInvoiceModal)
  | 'print_full_tax'    // พิมพ์ใบกำกับภาษี (existing)
  | 'dn'                // พิมพ์ใบส่งสินค้า (DN)

export interface PrintAction {
  type: PrintActionType;
  label: string;
  category: 'shipping' | 'financial';
}

export interface PrintActionInput {
  order_status: string;
  payment_status: string;
  flow_type: string | null;
  tax_invoice_number: string | null;
  tax_invoice_doc_type: string | null;
  tax_invoice_voided_at: string | null;
  dn_number: string | null;
  source: string | null;
  is_on_hold?: boolean;
  vatRegistered: boolean;
}

export function getAvailablePrintActions(input: PrintActionInput): PrintAction[] {
  const actions: PrintAction[] = [];

  // === Shipping documents (ถ้าไม่ on hold) ===
  if (!input.is_on_hold) {
    actions.push({ type: 'packing', label: 'ใบจัดของ', category: 'shipping' });
    actions.push({ type: 'shipping_label', label: 'ใบปะหน้า', category: 'shipping' });
  }

  // === DN (ใบส่งสินค้า) — ถ้ามี dn_number ===
  if (input.dn_number) {
    actions.push({ type: 'dn', label: 'ใบส่งสินค้า', category: 'financial' });
  }

  // === Financial documents ===
  if (input.payment_status !== 'paid') {
    // ยังไม่จ่าย → ใบแจ้งหนี้
    actions.push({ type: 'invoice', label: 'ใบแจ้งหนี้', category: 'financial' });
  } else {
    // จ่ายแล้ว — logic ตาม doc_type
    const docType = input.tax_invoice_doc_type;
    const hasDoc = !!input.tax_invoice_number;
    const isVoided = !!input.tax_invoice_voided_at;

    if (!hasDoc) {
      // ยังไม่มีเอกสาร → ออกใหม่
      if (input.vatRegistered) {
        actions.push({ type: 'abbreviated', label: 'ใบกำกับอย่างย่อ', category: 'financial' });
        actions.push({ type: 'request_full', label: 'ขอใบกำกับภาษี', category: 'financial' });
      } else {
        actions.push({ type: 'receipt', label: 'ใบเสร็จรับเงิน', category: 'financial' });
      }
    } else if (docType === 'abbreviated' && !isVoided) {
      // มี ABB ที่ยังไม่ void
      actions.push({ type: 'print_abbreviated', label: 'พิมพ์ใบกำกับอย่างย่อ', category: 'financial' });
      actions.push({ type: 'request_full', label: 'ขอใบกำกับภาษี', category: 'financial' });
    } else if (docType === 'tax') {
      // มี TAX แล้ว
      actions.push({ type: 'print_full_tax', label: 'พิมพ์ใบกำกับภาษี', category: 'financial' });
    } else if (docType === 'receipt') {
      // มี REC แล้ว
      actions.push({ type: 'print_receipt', label: 'พิมพ์ใบเสร็จรับเงิน', category: 'financial' });
    } else {
      // fallback (old INV-* or unknown)
      actions.push({ type: 'invoice', label: 'ใบเสร็จรับเงิน', category: 'financial' });
    }
  }

  return actions;
}

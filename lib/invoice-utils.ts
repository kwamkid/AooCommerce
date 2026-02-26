/**
 * Shared invoice utility functions.
 * Used by ProcessingTab, ReadyToShipTab, orders page, and order detail.
 */

/**
 * Get the correct label for invoice menu items based on payment status and VAT registration.
 *
 * | สถานะ    | ไม่จด VAT       | จด VAT                           |
 * |----------|-----------------|----------------------------------|
 * | paid     | ใบเสร็จรับเงิน   | ใบกำกับอย่างย่อ/ใบเสร็จรับเงิน       |
 * | unpaid   | ใบแจ้งหนี้       | ใบแจ้งหนี้                         |
 */
export function getInvoiceMenuLabel(
  paymentStatus: string,
  vatRegistered: boolean,
  type: 'abbreviated' | 'full' = 'abbreviated',
): string {
  if (paymentStatus !== 'paid') return 'ใบแจ้งหนี้';
  if (!vatRegistered) return 'ใบเสร็จรับเงิน';
  return type === 'full'
    ? 'ใบกำกับแบบเต็ม/ใบเสร็จรับเงิน'
    : 'ใบกำกับอย่างย่อ/ใบเสร็จรับเงิน';
}

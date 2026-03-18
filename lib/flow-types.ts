/**
 * Flow type helpers — centralized logic for determining order/document flow
 *
 * Flow types (new):
 *   r_retail     → ลูกค้าปลีก, Dropship, marketplace
 *   w_cash       → ขายขาดเงินสด (ตัวแทน, ห้าง, corporate)
 *   w_credit     → ขายขาดเครดิต (ตัวแทน, ห้าง, corporate)
 *   c_consign    → ฝากขายตัวแทน
 *   d_department  → ฝากขายห้าง
 *
 * Legacy flow types (still in DB for old orders):
 *   a_cash       → same as r_retail
 *   b_credit     → same as w_credit
 *   d_statement  → same as d_department
 */

/** Check if flow_type is a credit/deferred payment flow (ไม่จ่ายทันที) */
export function isCreditFlow(flowType: string | null | undefined): boolean {
  return [
    'w_credit', 'c_consign', 'd_department',
    // Legacy
    'b_credit', 'd_statement',
  ].includes(flowType || '');
}

/** Check if flow_type is retail/cash (จ่ายทันที) */
export function isCashFlow(flowType: string | null | undefined): boolean {
  return [
    'r_retail', 'w_cash',
    // Legacy
    'a_cash',
  ].includes(flowType || '') || !flowType;
}

/** Check if flow_type is wholesale (ขายขาด — cash or credit) */
export function isWholesaleFlow(flowType: string | null | undefined): boolean {
  return [
    'w_cash', 'w_credit',
    // Legacy
    'b_credit',
  ].includes(flowType || '');
}

/** Check if flow_type is consignment (ฝากขาย) */
export function isConsignmentFlow(flowType: string | null | undefined): boolean {
  return flowType === 'c_consign';
}

/** Check if flow_type is department store (ห้างฝากขาย) */
export function isDepartmentFlow(flowType: string | null | undefined): boolean {
  return ['d_department', 'd_statement'].includes(flowType || '');
}

/** Get flow_type label for display */
export function getFlowLabel(flowType: string | null | undefined): string {
  switch (flowType) {
    case 'r_retail':
    case 'a_cash':
      return 'ขายปลีก';
    case 'w_cash':
      return 'ขายขาด (เงินสด)';
    case 'w_credit':
    case 'b_credit':
      return 'ขายขาด (เครดิต)';
    case 'c_consign':
      return 'ฝากขาย';
    case 'd_department':
    case 'd_statement':
      return 'ห้างฝากขาย';
    default:
      return 'ขายปลีก';
  }
}

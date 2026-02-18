// POS utility functions

export interface PosCartItem {
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variation_label?: string;
  quantity: number;
  unit_price: number;
  discount_type: 'percent' | 'amount';
  discount_value: number;
}

export interface PosOrderTotals {
  subtotalBeforeVAT: number;
  vatAmount: number;
  totalAmount: number;
  discountAmount: number;
  itemsSubtotal: number;
}

/**
 * Calculate POS order totals with VAT 7% reverse-calculation
 * Prices are VAT-inclusive (same logic as regular orders)
 */
export function calculatePosOrderTotals(
  items: PosCartItem[],
  orderDiscount: number = 0
): PosOrderTotals {
  let itemsSubtotal = 0;

  for (const item of items) {
    const lineSubtotal = item.quantity * item.unit_price;
    let lineDiscount = 0;

    if (item.discount_type === 'amount' && item.discount_value) {
      lineDiscount = item.discount_value;
    } else if (item.discount_type === 'percent' && item.discount_value) {
      lineDiscount = lineSubtotal * (item.discount_value / 100);
    }

    itemsSubtotal += lineSubtotal - lineDiscount;
  }

  const totalWithVAT = itemsSubtotal - orderDiscount;
  const subtotalBeforeVAT = Math.round((totalWithVAT / 1.07) * 100) / 100;
  const vatAmount = Math.round((totalWithVAT - subtotalBeforeVAT) * 100) / 100;

  return {
    subtotalBeforeVAT,
    vatAmount,
    totalAmount: totalWithVAT,
    discountAmount: orderDiscount,
    itemsSubtotal,
  };
}

/**
 * Calculate change from cash payment
 */
export function calculateChange(totalDue: number, cashTendered: number): number {
  return Math.max(0, cashTendered - totalDue);
}

/**
 * Thai baht denomination quick buttons
 */
export const CASH_DENOMINATIONS = [20, 50, 100, 500, 1000];

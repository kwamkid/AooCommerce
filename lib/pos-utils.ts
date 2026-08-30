// POS utility functions

import { computeOrderTotals } from './order-totals';

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
  orderDiscount: number = 0,
  vatRegistered: boolean = false
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

  // สูตรยอด/ถอด VAT อยู่ที่ lib/order-totals.ts ที่เดียวทั้งระบบ
  const { subtotal: subtotalBeforeVAT, vatAmount, totalAmount } = computeOrderTotals({
    itemsTotal: itemsSubtotal,
    discountAmount: orderDiscount,
    vatRegistered,
  });

  return {
    subtotalBeforeVAT,
    vatAmount,
    totalAmount,
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

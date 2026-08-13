export const SHOPEE_PUSH_CODES: Record<number, string> = {
  0: 'shop_authorization',
  3: 'order_status',
  4: 'order_tracking',
  5: 'shopee_update',
  7: 'banned_item',
  8: 'item_stock',
  9: 'add_item',
  10: 'webchat',
  12: 'product_comment',
  13: 'shop_penalty',
  14: 'return_refund',
};

export function getPushLabel(code: number): string {
  return SHOPEE_PUSH_CODES[code] || `unknown_${code}`;
}

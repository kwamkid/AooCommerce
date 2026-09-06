// ป้ายชื่อ push code ของ Shopee — ใช้ stamp `marketplace_webhook_log.push_label`
// ให้คนอ่าน log รู้เรื่องโดยไม่ต้องเปิดเอกสาร
//
// ชื่อที่ยืนยันจาก push จริงแล้ว: 3, 4, 8, 10, 14, 15, 16, 22, 28
// (code 8 เดิมจดไว้ว่า 'item_stock' — payload จริงคือ reserved_stock_change_push
//  = ยอดที่ Shopee กันไว้ให้แคมเปญ ไม่ใช่สต็อกจริง จึงแก้ชื่อให้ตรง)
export const SHOPEE_PUSH_CODES: Record<number, string> = {
  0: 'shop_authorization',
  1: 'shop_authorization_push',
  2: 'shop_authorization_canceled_push',
  3: 'order_status',
  4: 'order_tracking',
  5: 'shopee_update',
  7: 'banned_item',
  8: 'reserved_stock_change',
  9: 'add_item',
  10: 'webchat',
  12: 'product_comment',
  13: 'shop_penalty',
  14: 'return_refund',
  16: 'violation_item',
  22: 'item_price_update',
  28: 'shop_penalty_update',
};

export function getPushLabel(code: number): string {
  return SHOPEE_PUSH_CODES[code] || `unknown_${code}`;
}

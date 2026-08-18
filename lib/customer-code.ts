// รหัสลูกค้าอัตโนมัติ
//
// `customers.customer_code` เป็น NOT NULL ที่ DB — โค้ดที่ insert ลูกค้าโดยไม่ใส่
// ค่านี้จะพังด้วย 23502 ตอนรันจริงเท่านั้น (TypeScript จับไม่ได้) และที่ผ่านมา
// แต่ละที่ก็ก็อปสูตรสร้างรหัสไปเขียนเองซ้ำ ๆ บางที่ก็ลืมใส่ไปเลย
// — รวมไว้ที่เดียวเพื่อให้ทุกทางที่สร้างลูกค้าใช้สูตรเดียวกันและไม่ลืม

/**
 * @param prefix ตัวย่อบอกที่มาของลูกค้า เช่น C = สร้างเอง, SP = Shopee,
 *               TT = TikTok, ST = หน้าร้านออนไลน์
 */
export function newCustomerCode(prefix = 'C'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

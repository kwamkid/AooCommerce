/**
 * ข้อความตัวอย่างบรรทัดเดียวของแชท ("ข้อความล่าสุด" ในรายชื่อแชท)
 *
 * ใช้ที่เดียวกันทั้งฝั่ง server (/api/chat/contacts ประกอบรายชื่อ) และฝั่ง client
 * (หน้าแชท patch รายชื่อจาก realtime payload โดยไม่ต้องดึงรายชื่อใหม่) — ถ้าสองฝั่ง
 * แปลคนละแบบ แถวเดิมจะเปลี่ยนหน้าตาไปมาเวลามีข้อความเข้า
 *
 * ชื่อ message_type ของทุกแพลตฟอร์มไม่ชนกัน จึงใช้ตารางเดียวได้ (LINE: sticker/audio/
 * location/file · Shopee/Lazada/TikTok: item/order/voucher) — เพิ่มชนิดใหม่ให้เพิ่มที่นี่
 */
const PREVIEW_BY_TYPE: Record<string, string> = {
  sticker: '🎭 สติกเกอร์',
  image: '🖼️ รูปภาพ',
  video: '🎬 วิดีโอ',
  audio: '🎵 เสียง',
  location: '📍 ตำแหน่ง',
  file: '📎 ไฟล์',
  item: '🛍️ สินค้า',
  order: '📦 คำสั่งซื้อ',
  voucher: '🎟️ คูปอง',
};

export function buildMessagePreview(messageType: string | null | undefined, content: string | null | undefined): string {
  if (messageType && PREVIEW_BY_TYPE[messageType]) return PREVIEW_BY_TYPE[messageType];
  return content || '';
}

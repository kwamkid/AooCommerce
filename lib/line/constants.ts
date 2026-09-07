// ค่าคงที่ของ LINE ที่ทั้งหน้าจอและฝั่งเซิร์ฟเวอร์ต้องใช้ตรงกัน
//
// แยกจาก lib/line/broadcast.ts เพราะไฟล์นั้นแตะ supabaseAdmin (service role) —
// หน้าจอ import ตรง ๆ ไม่ได้ ต้องไม่ลากโค้ดฝั่งเซิร์ฟเวอร์เข้า bundle ของเบราว์เซอร์

/** ข้อความ text ของ LINE ยาวได้ไม่เกิน 5,000 ตัวอักษร */
export const LINE_TEXT_MAX = 5000;

/** LINE รับได้สูงสุด 500 userId ต่อ 1 multicast */
export const MULTICAST_BATCH_SIZE = 500;

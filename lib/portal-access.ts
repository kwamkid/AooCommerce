// ทางเข้าของ "คนนอก" — รหัสลับในลิงก์ (token) กับรหัสที่ต้องกรอก (access code)
//
// ระบบมีทางเข้าสำหรับคนที่ไม่มีบัญชีอยู่ 3 กลุ่ม — **กติกาของแต่ละกลุ่มอยู่ที่นี่ที่เดียว**
//
//   1. เปิดสาธารณะ      หน้าร้าน · legal · install — ไม่มีอะไรกัน (ตั้งใจ)
//   2. token ในลิงก์     บิล · ใบสั่งซื้อ · ใบรับของ · ไฟล์ในแชท · คำเชิญ
//                        → ได้ลิงก์ = เข้าได้ทันที เห็นเฉพาะ "ใบนั้นใบเดียว"
//   3. token + รหัส      พอร์ทัลของคู่ค้า (ตัวแทนฝากขาย · ซัพพลายเออร์)
//                        → เห็น "ทุกอย่างของคู่ค้าคนนั้น" จึงต้องกรอกรหัสเพิ่ม
//
// ⛔ ห้ามเขียนตัวสร้าง token/รหัสเองในไฟล์ใด ๆ อีก — เคยมี `generateAccessCode()`
//    ก๊อปกันอยู่ 2 ไฟล์ และ token สร้างกัน 3 แบบ (uuid ในโค้ด · default ของ DB ·
//    `'po_' + uuid ตัด 24`) ทำให้ความยาว/ความแข็งแรงไม่เท่ากันโดยไม่มีใครตั้งใจ

import crypto from 'crypto';

/** อักขระของรหัสที่ต้องอ่าน/พิมพ์เอง — ตัด 0/O และ 1/I ที่สับสนตาออก */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** ความยาวรหัส — 12 ตัว ≈ 60 bits (หน้าพอร์ทัลเป็นที่เดาสุ่มได้จากภายนอก) */
const CODE_LENGTH = 12;

/**
 * รหัสลับที่ฝังในลิงก์ — ใช้กับกลุ่ม 2 และ 3
 * uuid v4 (122 bits) เดาไม่ได้ในทางปฏิบัติ และเป็นชนิดเดียวกับคอลัมน์ uuid ของ DB
 */
export function newShareToken(): string {
  return crypto.randomUUID();
}

/**
 * รหัสที่คู่ค้าต้องกรอก — ใช้กับกลุ่ม 3
 * เจ้าของร้านอ่านให้ทางโทรศัพท์/พิมพ์ส่งได้ จึงเลี่ยงอักขระที่สับสนตา
 */
export function newAccessCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  return code;
}

/**
 * ทำรหัสที่ผู้ใช้พิมพ์มาให้อยู่ในรูปเดียวกับที่เก็บไว้ ก่อนเทียบ
 * (พิมพ์ตัวเล็ก/มีช่องว่างติดมา ไม่ควรถือว่ารหัสผิด)
 */
export function normalizeAccessCode(input: string): string {
  return input.trim().toUpperCase();
}

/** รหัสที่กรอกมาตรงกับที่เก็บไว้ไหม — เทียบแบบเวลาคงที่ กัน timing attack */
export function accessCodeMatches(input: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const a = Buffer.from(normalizeAccessCode(input));
  const b = Buffer.from(normalizeAccessCode(stored));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

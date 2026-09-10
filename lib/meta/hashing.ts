// Path: lib/meta/hashing.ts
//
// แปลงข้อมูลลูกค้าเป็น "ตัวจับคู่" ตามกติกาของ Meta — **server เท่านั้น** (ใช้ node:crypto)
//
// ทำไมต้อง normalize ก่อน hash: Meta เทียบด้วยค่า hash ตรง ๆ ⇒ ถ้าเรา hash '081-234-5678'
// แต่ฝั่ง Meta เก็บ '66812345678' จะจับคู่ไม่ได้เลยแม้เป็นคนเดียวกัน กติกาที่ Meta กำหนด:
//   • อีเมล   — ตัดช่องว่างหัวท้าย + ตัวพิมพ์เล็กทั้งหมด
//   • เบอร์โทร — ตัวเลขล้วน **มีรหัสประเทศ** ไม่มี 0 นำ ไม่มี + ไม่มีขีด ('66812345678')
//   • ประเทศ  — รหัส 2 ตัวอักษรพิมพ์เล็ก ('th')
//   • ทุกค่า  — SHA-256 hex ตัวพิมพ์เล็ก
//
// ⛔ **ตั้งใจไม่ส่ง fn/ln (ชื่อ-นามสกุล)** — `customers.name` ของระบบนี้เป็นชื่อร้าน/ชื่อบริษัท
// หรือชื่อเล่นที่พนักงานพิมพ์เองเสียส่วนใหญ่ ('คุณเอ ร้านหน้าปากซอย') ส่งไปแล้วไม่มีทางตรงกับ
// ชื่อในโปรไฟล์ Facebook — ได้แต่ทำให้คุณภาพการจับคู่ที่ Meta รายงานดูแย่ลงโดยไม่ได้อะไรกลับมา
//
// หมายเหตุ import: ใช้ path แบบสัมพัทธ์ '../numeric-input' (ไม่ใช่ '@/lib/numeric-input')
// เพราะไฟล์นี้ถูก transpile ด้วย tsc CLI ตรง ๆ ในชุดทดสอบซึ่งไม่รู้จัก alias ของ tsconfig
// — tsconfig ของโปรเจกต์ resolve ได้ทั้งสองแบบ ผลตอนรันจริงจึงเหมือนกัน

import { createHash } from 'node:crypto';
import { toE164Digits } from '../numeric-input';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** อีเมลตามกติกา Meta — ตัดช่องว่าง + พิมพ์เล็ก · ไม่ใช่รูปอีเมล = null (อย่า hash ขยะส่งไป) */
export function normalizeEmail(raw?: string | null): string | null {
  const v = (raw ?? '').trim().toLowerCase();
  if (!v) return null;
  if (!v.includes('@') || !v.includes('.')) return null;
  return v;
}

/** เบอร์ตามกติกา Meta — '0812345678' → '66812345678' · แปลงไม่ได้ = null */
export function normalizePhoneForMeta(raw?: string | null): string | null {
  return toE164Digits(raw);
}

export interface IdentityInput {
  phone?: string | null;
  email?: string | null;
  /** id ของลูกค้าในระบบเรา — ช่วยให้ Meta เชื่อม event ของคนเดียวกันข้ามอุปกรณ์ */
  externalId?: string | null;
  /** รหัสประเทศ 2 ตัวอักษร (ไม่ระบุ = 'th') */
  country?: string;
}

/** user_data ที่ hash แล้ว — ทุกคีย์เป็น array ตามสเปคของ Meta (ส่งได้หลายค่าต่อคน) */
export interface HashedUserData {
  ph?: string[];
  em?: string[];
  external_id?: string[];
  country?: string[];
}

/**
 * ประกอบ user_data ที่ hash แล้ว — **ใส่เฉพาะคีย์ที่ normalize ผ่าน**
 * (คีย์ที่ hash ค่าว่าง/ค่าขยะไปให้ Meta = ลดคะแนนคุณภาพการจับคู่เปล่า ๆ)
 *
 * `country` ใส่ให้เสมอ (ค่าเริ่มต้น 'th') — ไม่ได้ใช้จับคู่คนเดียว แต่ช่วยตัดคนละประเทศออก
 */
export function buildHashedUserData(input: IdentityInput): HashedUserData {
  const out: HashedUserData = {};

  const phone = normalizePhoneForMeta(input.phone);
  if (phone) out.ph = [sha256Hex(phone)];

  const email = normalizeEmail(input.email);
  if (email) out.em = [sha256Hex(email)];

  const externalId = (input.externalId ?? '').trim();
  if (externalId) out.external_id = [sha256Hex(externalId)];

  const country = (input.country ?? 'th').trim().toLowerCase();
  if (country) out.country = [sha256Hex(country)];

  return out;
}

/**
 * มีอะไรให้ Meta จับคู่คนได้จริงไหม — **country/external_id อย่างเดียวไม่นับ**
 * (external_id จับคู่ได้เฉพาะคนที่ Meta เคยเห็น id นี้มาก่อนจาก event อื่น)
 */
export function hasMatchableIdentity(u: HashedUserData): boolean {
  return (u.ph?.length ?? 0) > 0 || (u.em?.length ?? 0) > 0;
}

/**
 * กุญแจไว้เทียบว่า "คนนี้อยู่ในกลุ่มที่ส่งไปแล้วหรือยัง" โดยไม่ต้องเก็บเบอร์/อีเมลดิบ
 * — ใช้ตอนคำนวณส่วนต่างของ Custom Audience (ใครต้องเพิ่ม ใครต้องถอด)
 */
export function identityKeys(input: IdentityInput): { phoneKey?: string; emailKey?: string } {
  const out: { phoneKey?: string; emailKey?: string } = {};
  const phone = normalizePhoneForMeta(input.phone);
  if (phone) out.phoneKey = `ph:${sha256Hex(phone)}`;
  const email = normalizeEmail(input.email);
  if (email) out.emailKey = `em:${sha256Hex(email)}`;
  return out;
}

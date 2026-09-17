// กติกา slug ของ master data (แบรนด์ · หมวดหมู่) — ตัวที่ไปโผล่ใน URL หน้าร้าน
// `?brand=<slug>` · `?cat=<slug>`
//
// ⛔ กติกามีที่เดียวคือไฟล์นี้ — ทั้งช่องกรอก (SlugField) และ API ต้อง import ไปใช้
//    พิมพ์ regex ซ้ำเมื่อไหร่ = หน้าจอบอกว่าใช้ได้แล้วเซิร์ฟเวอร์ปฏิเสธ
//
// **ยอมรับภาษาไทยโดยตั้งใจ** (ต่างจาก `STOREFRONT_SLUG_RE` ของชื่อร้านที่บังคับ a–z)
// เพราะคำไทยใน URL ช่วย SEO ภาษาไทย และ slug เดิมที่ trigger `slugify_th` เติมไว้ก็เป็นไทย
// อยู่แล้ว — บังคับ ASCII เมื่อไหร่ ของเก่าทั้งหมดจะกลายเป็น "ค่าที่ผิดกติกา" ทันที
// หน้าจอจึง **แนะนำ** อังกฤษ (ลิงก์สั้นกว่ามากตอน copy) แต่ไม่ห้ามไทย

export const MASTER_SLUG_MIN = 2;
export const MASTER_SLUG_MAX = 60;

/** อักษรไทย · a–z · 0–9 · ขีดกลาง — ห้ามขึ้นต้น/ลงท้ายด้วยขีดกลาง */
export const MASTER_SLUG_RE = /^[a-z0-9฀-๿][a-z0-9฀-๿-]*[a-z0-9฀-๿]$/;

export const MASTER_SLUG_RULE =
  `ใช้ได้เฉพาะตัวอักษรอังกฤษตัวเล็ก a–z ตัวเลข 0–9 ขีดกลาง (-) และภาษาไทย ยาว ${MASTER_SLUG_MIN}–${MASTER_SLUG_MAX} ตัว`;

/** กรองระหว่างพิมพ์ — ตัวพิมพ์ใหญ่เป็นตัวเล็ก · เว้นวรรคเป็นขีดกลาง · ตัวที่ใช้ไม่ได้ทิ้งไปเลย */
export function normalizeMasterSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9฀-๿-]/g, '')
    .slice(0, MASTER_SLUG_MAX);
}

export type MasterSlugError = 'empty' | 'too_short' | 'too_long' | 'invalid' | 'taken';

/**
 * ตรวจ slug ให้ครบทุกกติกาในที่เดียว
 * `takenSlugs` = slug ของรายการอื่นในบริษัทเดียวกัน (ไม่รวมตัวเอง) — DB มี unique index
 * `(company_id, slug)` กันซ้ำอยู่แล้ว ตัวนี้แค่บอกผู้ใช้ก่อนกดบันทึก
 */
export function validateMasterSlug(slug: string, takenSlugs: string[] = []): MasterSlugError | null {
  const value = slug.trim();
  if (!value) return 'empty';
  if (value.length < MASTER_SLUG_MIN) return 'too_short';
  if (value.length > MASTER_SLUG_MAX) return 'too_long';
  if (!MASTER_SLUG_RE.test(value)) return 'invalid';
  if (takenSlugs.includes(value)) return 'taken';
  return null;
}

export function masterSlugErrorMessage(error: MasterSlugError): string {
  switch (error) {
    case 'empty': return 'กรุณากรอกลิงก์';
    case 'too_short': return `ลิงก์ต้องยาวอย่างน้อย ${MASTER_SLUG_MIN} ตัวอักษร`;
    case 'too_long': return `ลิงก์ยาวเกิน ${MASTER_SLUG_MAX} ตัวอักษร`;
    case 'invalid': return MASTER_SLUG_RULE;
    case 'taken': return 'ลิงก์นี้ถูกใช้ไปแล้วในร้านนี้';
  }
}

/** มีอักษรไทยอยู่ไหม — ใช้ตัดสินว่าจะขึ้นคำแนะนำเรื่องความยาวลิงก์หรือเปล่า */
export function hasThai(slug: string): boolean {
  return /[฀-๿]/.test(slug);
}

/**
 * ความยาวของ slug **หลังเข้ารหัสลง URL จริง** — อักษรไทย 1 ตัวกลายเป็น `%E0%B8%99` (9 ตัว)
 * ใช้โชว์ให้ร้านเห็นตอนพิมพ์ว่าลิงก์ที่ copy ไปวางในแชทจะยาวแค่ไหน
 */
export function encodedSlugLength(slug: string): number {
  return encodeURIComponent(slug).length;
}

// Path: lib/email.ts
//
// กติกาอีเมล **ที่เดียวของทั้งระบบ** — เดิม regex ถูกเขียน inline ซ้ำอย่างน้อย 3 ที่และไม่ตรงกัน
// (OrderForm ใช้ `^[^\s@]+@[^\s@]+\.[^\s@]+$` · ตัวอย่างในเอกสารใช้ `^[^@]+@[^@]+$`)
// เจ้าของขอให้ช่องอีเมลเตือนเมื่อไม่ใช่อีเมลจริง และเป็นตัวกลาง (9 ก.ย. 2026)
//
// ต่างจากเบอร์โทร: **บล็อกอักขระตอนพิมพ์ไม่ได้** เพราะ "dv12" คือสถานะกลางทางของ
// "dv12@gmail.com" — ต้องเตือนตอนออกจากช่อง (blur) หรือตอนบันทึกเท่านั้น
//
// ใช้ยังไง:
//   <FormInput type="email" …>            → FormInput ตรวจให้เองตอน blur (ไม่ต้องส่ง pattern)
//   <input> ดิบ                            → isValidEmail(value) แล้วโชว์ EMAIL_INVALID_MESSAGE เอง

/** สตริงสำหรับ prop `pattern` ของ FormInput — สร้าง RegExp ใหม่ทุกครั้งเพื่อกัน state ของ /g */
export const EMAIL_PATTERN = '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$';

export const EMAIL_INVALID_MESSAGE = 'อีเมลไม่ถูกต้อง — ต้องมี @ และโดเมน เช่น name@example.com';

/**
 * ว่างถือว่าผ่าน (ช่องอีเมลส่วนใหญ่ไม่บังคับ) · "-" ถือว่าว่าง — ธรรมเนียมกรอกแทน "ไม่มี"
 * ที่ OrderForm ใช้อยู่แล้ว ห้ามทำให้ "-" กลายเป็น error
 */
export function isValidEmail(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  if (!v || v === '-') return true;
  return new RegExp(EMAIL_PATTERN).test(v);
}

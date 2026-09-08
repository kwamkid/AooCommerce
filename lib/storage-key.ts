// Path: lib/storage-key.ts
//
// ชื่อไฟล์ที่ปลอดภัยพอจะเป็น "key" ของ Supabase Storage
//
// ⚠️ Supabase Storage ปฏิเสธ key ที่มีอักขระนอกชุด S3-safe ด้วย **HTTP 400 `InvalidKey`**
// (ฝั่งเซิร์ฟเวอร์ตรวจด้วย `/^(\w|\/|!|-|\.|\*|'|\(|\)| |&|\$|@|=|;|:|\+|,|\?)*$/`
// ซึ่ง `\w` ของ JS คือ ASCII ล้วน) ⇒ **ชื่อไฟล์ภาษาไทย · อีโมจิ · `#` · `%` · `[]` อัปไม่ขึ้น**
// ยืนยันกับ Storage จริงแล้ว 8 ก.ย. 2026: `ภาพถ่ายหน้าจอ.jpg` → 400 InvalidKey ·
// `photo (1).jpg` → 200 · เคสนี้ทำให้ "ส่งรูปในแชทไม่ไปเลย" แบบสุ่ม ๆ ตามชื่อไฟล์ที่พนักงานเลือก
// (พลาดตั้งแต่ก่อนถึง API แชท จึงไม่มี log ที่เซิร์ฟเวอร์สักบรรทัดให้ไล่ — ดู fix-bug.md)
//
// **ทุกที่ที่ประกอบ path ของ Storage จากชื่อไฟล์ของผู้ใช้ต้องผ่านตัวนี้**

/** ความยาวสูงสุดของส่วนชื่อไฟล์ (กัน key ยาวเกินจนอ่านไม่ออก — Storage เองจำกัดที่ 1024) */
const MAX_NAME_LEN = 60;

/**
 * แปลงชื่อไฟล์ของผู้ใช้เป็นชื่อที่ Supabase Storage รับแน่นอน
 * - อักขระนอก `[a-zA-Z0-9._-]` → `_` (ยุบ `_` ติดกันให้เหลือตัวเดียว)
 * - ตัดความยาวส่วนชื่อ แต่คงนามสกุลไว้เสมอ
 * - ชื่อที่เหลือว่าง (เช่นไทยล้วน) → `file`
 */
export function storageSafeName(fileName: string): string {
  const raw = (fileName || '').trim();
  const dot = raw.lastIndexOf('.');
  // นามสกุลนับเฉพาะที่ดูเป็นนามสกุลจริง (ไม่ใช่จุดกลางชื่อ)
  const hasExt = dot > 0 && dot < raw.length - 1 && raw.length - dot <= 6;
  const base = hasExt ? raw.slice(0, dot) : raw;
  const ext = hasExt ? raw.slice(dot + 1) : '';

  const clean = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');

  const safeBase = clean(base).slice(0, MAX_NAME_LEN) || 'file';
  const safeExt = clean(ext).toLowerCase();
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

/**
 * ชื่อไฟล์พร้อมใช้เป็น key — กันชนกันด้วยเวลา + สุ่ม แล้วบังคับนามสกุลตามชนิดจริงของไฟล์
 * (`compressImage` คืนไฟล์เดิมเมื่อรูปเล็กอยู่แล้ว นามสกุลจึงไม่ใช่ `.jpg` เสมอไป)
 */
export function storageKeyFor(fileName: string, ext?: string): string {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const safe = storageSafeName(fileName);
  if (!ext) return `${stamp}-${safe}`;
  const cleanExt = ext.replace(/^\./, '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
  const base = safe.replace(/\.[^.]+$/, '') || 'file';
  return `${stamp}-${base}.${cleanExt}`;
}

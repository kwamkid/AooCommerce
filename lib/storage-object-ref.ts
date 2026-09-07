/**
 * แปลง public URL ของ Supabase Storage กลับเป็น `{ bucket, path }` สำหรับสั่งลบไฟล์
 *
 * ใช้ตอน "ลบบริษัทถาวร" — แถวใน DB ถูก purge ไปหมดแล้ว ไฟล์ในสตอเรจจะกลายเป็นขยะ
 * ที่ไม่มีใครอ้างถึงอีกเลย ต้องเก็บ URL ไว้ก่อนลบแถว แล้วแปลงกลับเป็น path เพื่อลบตาม
 *
 * รับได้ทั้งสองรูปแบบที่ระบบเราสร้าง:
 *   - `/storage/v1/object/public/{bucket}/{path}`        (URL ปกติ)
 *   - `/storage/v1/render/image/public/{bucket}/{path}`  (รูปย่อจาก thumbUrl())
 * และตัด query string ทิ้งเสมอ — URL ของเราต่อ `?v=` (cache buster) และ `?width=` กันหมด
 *
 * ⚠️ รับเฉพาะ URL ที่อยู่บนโฮสต์ Supabase ของเราเอง (`NEXT_PUBLIC_SUPABASE_URL`)
 * รูปที่ host อยู่ CDN ของ Shopee/Lazada/LINE ไม่ใช่ของเรา ลบไม่ได้และไม่ควรพยายาม
 *
 * (ค่าคงที่ path สองตัวนี้ซ้ำกับ lib/image-thumb.ts ซึ่งไม่ได้ export ออกมา —
 *  เป็นสตริงคงที่ของ Supabase เอง ไม่ใช่ค่าที่เราตั้ง จึงไม่มีทางหลุดกันคนละค่า)
 */

const SUPABASE_PUBLIC_PATH = '/storage/v1/object/public/';
const SUPABASE_RENDER_PATH = '/storage/v1/render/image/public/';

export interface StorageObjectRef {
  bucket: string;
  path: string;
}

/** โฮสต์ของโปรเจกต์ Supabase เรา — คำนวณครั้งเดียว (env ไม่เปลี่ยนระหว่างรัน) */
let cachedHost: string | null | undefined;

function ourHost(): string | null {
  if (cachedHost !== undefined) return cachedHost;
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    cachedHost = raw ? new URL(raw).host : null;
  } catch {
    cachedHost = null;
  }
  return cachedHost;
}

/**
 * @returns `{ bucket, path }` เมื่อเป็นไฟล์ในสตอเรจของเรา · `null` เมื่อไม่ใช่
 */
export function parseStorageObjectRef(url: string | null | undefined): StorageObjectRef | null {
  if (!url || typeof url !== 'string') return null;

  const host = ourHost();
  if (!host) return null;

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null; // relative path / URL เพี้ยน
  }
  if (u.host !== host) return null;

  const prefix = u.pathname.startsWith(SUPABASE_PUBLIC_PATH)
    ? SUPABASE_PUBLIC_PATH
    : u.pathname.startsWith(SUPABASE_RENDER_PATH)
      ? SUPABASE_RENDER_PATH
      : null;
  if (!prefix) return null;

  const rest = u.pathname.slice(prefix.length);
  const slash = rest.indexOf('/');
  if (slash <= 0 || slash === rest.length - 1) return null;

  const bucket = decodeURIComponent(rest.slice(0, slash));
  const path = decodeURIComponent(rest.slice(slash + 1));
  if (!bucket || !path) return null;

  return { bucket, path };
}

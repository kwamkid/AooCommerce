/**
 * URL รูปสินค้าขนาดย่อสำหรับ thumbnail — client-safe, pure, ไม่ import อะไร
 *
 * ปัญหาที่แก้: กรอบรูป 32–64px แต่ `<img src>` ชี้รูปเต็ม (วัดจากร้าน ABC the Baby)
 *   - Shopee CDN `cf.shopee.co.th/file/<hash>` 1000×1000 ≈ 190KB → ต่อ `_tn` = 320×320 ≈ 42KB
 *     (4,932 จาก ~5,300 รูปของร้านเป็นแบบนี้ = 93%)
 *   - Storage ของเรา (อัปโหลดย่อไว้ 1200px) ≈ 150–300KB → Supabase Image Transformation ≈ 1–2KB
 *   - Lazada CDN `*.slatic.net` ≈ 150KB → `_120x120q80.jpg` ≈ 6KB
 *   - โฮสต์อื่น (WordPress ของลูกค้า, TikTok CDN) → คืน URL เดิม
 *
 * ห้ามใช้กับ: อวาตาร์/รูปโปรไฟล์แชท · โลโก้ร้าน/เพจ · สลิป · QR · รูปใน ImageUploader
 * (ตัวจัดการรูปต้องเห็นของจริง) · lightbox (กดขยายต้องได้รูปเต็ม)
 */

/** ขนาดรูปย่อที่ใช้ทั้งระบบ — จำกัดไว้ไม่กี่ค่าเพื่อให้ CDN แคชโดนซ้ำ (ทุกหน้าขอไฟล์เดียวกัน) */
export type ThumbPx = 96 | 160 | 320;

/** Lazada รับเฉพาะขนาดที่มันรู้จัก — map ค่า px ของเราเป็นขนาดที่ CDN ของ Lazada มีจริง */
const LAZADA_SIZE: Record<ThumbPx, number> = { 96: 120, 160: 200, 320: 400 };

/** path ของ Supabase Storage แบบ public — ไม่ผูกกับ hostname จะได้ใช้กับทุกโปรเจกต์/บัคเก็ต */
const SUPABASE_PUBLIC_PATH = '/storage/v1/object/public/';
const SUPABASE_RENDER_PATH = '/storage/v1/render/image/public/';

/** Shopee CDN — `cf.shopee.*` (ทุก TLD) และ `down-*.img.susercontent.com` */
const SHOPEE_HOST = /^cf\.shopee\.|^down-[a-z0-9-]+\.img\.susercontent\.com$/;

/** Lazada CDN ที่ย่อแล้ว เช่น `<hash>_120x120q80.jpg` — ห้ามต่อซ้ำ (idempotent) */
const LAZADA_ALREADY_SIZED = /_\d+x\d+q\d+\.(jpg|jpeg|png)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png)$/i;

/**
 * URL รูปสินค้าขนาดย่อสำหรับ thumbnail — คืน URL เดิมเมื่อไม่รู้จักโฮสต์
 *
 * @param url URL รูปเต็ม (ค่าว่าง/null → undefined)
 * @param px ความกว้าง/สูงสูงสุดที่ต้องการ (คิด DPR 2× แล้ว: กรอบ 32–48px ใช้ 96 · 64px ใช้ 160 · การ์ด POS ใช้ 320)
 *
 * idempotent — `thumbUrl(thumbUrl(u)) === thumbUrl(u)`
 */
export function thumbUrl(url: string | null | undefined, px: ThumbPx = 96): string | undefined {
  if (!url) return undefined;
  // data:/blob: แปลงไม่ได้ (และไม่ต้อง — อยู่ในเครื่องอยู่แล้ว)
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    // relative path หรือ URL เพี้ยน → คืนของเดิม ปล่อยให้เบราว์เซอร์จัดการ
    return url;
  }

  // 1) Supabase Storage ของเรา → render endpoint (Image Transformation เปิดใช้อยู่)
  //    resize=contain คงสัดส่วน — รูป 3:4 ต้องไม่ถูกครอป (ดู comment ใน ProductImageThumb)
  const publicIdx = u.pathname.indexOf(SUPABASE_PUBLIC_PATH);
  if (publicIdx !== -1) {
    u.pathname = u.pathname.slice(0, publicIdx) + SUPABASE_RENDER_PATH + u.pathname.slice(publicIdx + SUPABASE_PUBLIC_PATH.length);
    u.searchParams.set('width', String(px));
    u.searchParams.set('height', String(px));
    u.searchParams.set('resize', 'contain');
    u.searchParams.set('quality', '75');
    return u.toString();
  }
  // แปลงแล้ว (เรียกซ้ำ) → คืนของเดิม
  if (u.pathname.includes(SUPABASE_RENDER_PATH)) return url;

  // 2) Shopee — `/file/<hash>` ต่อท้าย `_tn` ได้ 320×320 (Shopee มีขนาดเดียว ไม่สน px)
  if (SHOPEE_HOST.test(u.hostname) && u.pathname.startsWith('/file/')) {
    if (u.pathname.endsWith('_tn')) return url;
    u.pathname = `${u.pathname}_tn`;
    return u.toString();
  }

  // 3) Lazada — `<hash>.jpg` และ `/original/<hash>.jpg` ต่อท้าย `_{s}x{s}q80.jpg`
  if (u.hostname.endsWith('.slatic.net') && IMAGE_EXT.test(u.pathname)) {
    if (LAZADA_ALREADY_SIZED.test(u.pathname)) return url;
    const s = LAZADA_SIZE[px];
    u.pathname = `${u.pathname}_${s}x${s}q80.jpg`;
    return u.toString();
  }

  // 4) โฮสต์อื่น (WordPress ของลูกค้า, TikTok CDN) → ของเดิม
  return url;
}

// Path: lib/chat/saved-replies.ts
//
// ข้อความสำเร็จรูปของแชท — type + กติกาของ "ชื่อเรียก" + ตัวช่วยค้นหา
// (client-safe · ตัวแปรในข้อความอยู่ที่ [saved-reply-vars.ts](./saved-reply-vars.ts))
//
// **หน้าจอกับ API ต้องใช้ฟังก์ชันในไฟล์นี้ตัวเดียวกัน** ไม่งั้นจะเกิดกรณีที่หน้าจอบอกว่า
// ชื่อนี้ใช้ได้ แต่บันทึกแล้วโดนปฏิเสธ (หรือแย่กว่า: หน้าจอกันแต่ API ปล่อยผ่าน)

/** รูปแนบได้สูงสุดกี่ใบต่อหนึ่งข้อความสำเร็จรูป — ดูเหตุผลที่ MAX_IMAGES_HINT */
export const MAX_SAVED_REPLY_IMAGES = 3;

export interface SavedReply {
  id: string;
  title: string;
  content: string;
  /** รูปแนบตามลำดับที่จะส่ง (ไม่เกิน MAX_SAVED_REPLY_IMAGES ใบ) */
  image_urls: string[];
  /** ลิงก์แนบ (คลิปยูทูป · หน้าสินค้า) — ต่อท้ายข้อความตอนแทรกลงช่องพิมพ์ */
  link_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ─────────────────────────── ชื่อเรียก ───────────────────────────

export const MAX_SAVED_REPLY_TITLE = 60;

/**
 * อักขระที่ยอมให้อยู่ในชื่อเรียก: **ตัวอักษรกับตัวเลขเท่านั้น**
 * ไม่มีเว้นวรรค ไม่มี `- . # ? !` หรืออีโมจิ
 *
 * ทำไมห้ามเว้นวรรค: ชื่อนี้ถูกพิมพ์ต่อจาก `/` ในช่องแชท (`/ค่าส่ง`) — เว้นวรรคกลางชื่อ
 * ทำให้แยกไม่ออกว่าคำที่พิมพ์ต่อมาเป็นส่วนหนึ่งของชื่อ หรือเริ่มพิมพ์ข้อความจริงแล้ว
 *
 * ⚠️ `\p{M}` (combining mark) ขาดไม่ได้เด็ดขาด — สระบน/ล่างและวรรณยุกต์ไทย
 * (่ ้ ๊ ๋ ั ิ ี ุ ู ็) เป็น mark ไม่ใช่ letter · ตัดทิ้ง = "ค่าส่ง" กลายเป็น "คาสง"
 */
const DISALLOWED_TITLE_CHARS = /[^\p{L}\p{M}\p{N}]/gu;

export const SAVED_REPLY_TITLE_HINT = 'ใช้ได้เฉพาะตัวอักษรและตัวเลข ห้ามเว้นวรรคและอักขระพิเศษ';

/** ตัดอักขระที่ใช้ไม่ได้ออกระหว่างพิมพ์ — กันตั้งแต่แป้นพิมพ์ ไม่ใช่ไปดักตอนกดบันทึก */
export function sanitizeSavedReplyTitle(value: string): string {
  return value.replace(DISALLOWED_TITLE_CHARS, '').slice(0, MAX_SAVED_REPLY_TITLE);
}

/** มีอักขระต้องห้ามอยู่ไหม — ใช้บอกผู้ใช้ว่าทำไมตัวที่เพิ่งพิมพ์ถึงไม่ขึ้น */
export function hasDisallowedTitleChars(value: string): boolean {
  return sanitizeSavedReplyTitle(value) !== value.slice(0, MAX_SAVED_REPLY_TITLE);
}

/**
 * รูปแบบมาตรฐานสำหรับ**เทียบว่าซ้ำ** — ไม่ใช่ค่าที่เอาไปเก็บ (เก็บตามที่ผู้ใช้พิมพ์)
 *
 * ⚠️ **ลำดับการแปลงต้องตรงกับ unique index ใน DB เป๊ะ ๆ**
 *    (migration `saved_replies_multi_image_link_unique_title`)
 *    ไม่ตรง = หน้าจอบอกว่าว่าง แต่ DB ตีตกด้วย 409 ตอนกดบันทึก
 *
 * `เเ` (สระเอ 2 ตัว) → `แ` (สระแอ) : หน้าตาเหมือนกัน**เป๊ะ** แต่คนละ code point
 * คนไทยพิมพ์ผิดกันประจำ ไม่รวบตรงนี้ = ได้ชื่อซ้ำที่ตาแยกไม่ออกเลยว่าต่างกันตรงไหน
 */
export function normalizeSavedReplyTitle(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFC')
    .replace(/เเ/g, 'แ');
}

/** ชื่อนี้ชนกับใบอื่นไหม (ไม่นับใบที่กำลังแก้อยู่) */
export function findDuplicateTitle(
  list: SavedReply[],
  title: string,
  excludeId?: string,
): SavedReply | null {
  const norm = normalizeSavedReplyTitle(title);
  if (!norm) return null;
  return list.find(r => r.id !== excludeId && normalizeSavedReplyTitle(r.title) === norm) || null;
}

// ─────────────────────────── ค้นหา / พรีวิว ───────────────────────────

/**
 * กรองตามคำค้น — ค้นทั้ง **ชื่อและเนื้อข้อความ** เพราะพนักงานจำได้ทั้งสองแบบ
 * ("ค่าส่ง" อาจเป็นชื่อใบ หรือเป็นคำที่อยู่ในข้อความก็ได้) · ชื่อที่ตรงมาก่อนเสมอ
 */
export function filterSavedReplies(list: SavedReply[], query: string): SavedReply[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const byTitle: SavedReply[] = [];
  const byContent: SavedReply[] = [];
  for (const r of list) {
    if (r.title.toLowerCase().includes(q)) byTitle.push(r);
    else if (r.content.toLowerCase().includes(q)) byContent.push(r);
  }
  return [...byTitle, ...byContent];
}

/** ตัวอย่างข้อความบรรทัดเดียวสำหรับรายการ/พรีวิว */
export function savedReplyPreview(reply: SavedReply, max = 80): string {
  const body = reply.content.replace(/\s+/g, ' ').trim();
  if (body) return body.length > max ? `${body.slice(0, max)}…` : body;
  if (reply.link_url) return reply.link_url;
  const n = reply.image_urls?.length || 0;
  return n > 1 ? `[รูปภาพ ${n} ใบ]` : n === 1 ? '[รูปภาพ]' : '';
}

/** รูปแรกไว้โชว์เป็นไอคอนในรายการ */
export function savedReplyThumb(reply: SavedReply): string | null {
  return reply.image_urls?.[0] || null;
}

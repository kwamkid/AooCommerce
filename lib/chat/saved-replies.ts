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
  sort_order: number;
  is_active: boolean;
  /** จำนวนครั้งที่ถูกหยิบไปใช้ (นับตอนแทรกลงช่องพิมพ์) */
  use_count?: number;
  last_used_at?: string | null;
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
  const n = reply.image_urls?.length || 0;
  return n > 1 ? `[รูปภาพ ${n} ใบ]` : n === 1 ? '[รูปภาพ]' : '';
}

/**
 * จำนวนใบขั้นต่ำที่ทำให้กลุ่ม "ใช้บ่อย" มีประโยชน์
 *
 * คลังเล็ก ๆ (5-6 ใบ) เห็นครบในจอเดียวอยู่แล้ว การตัดหัวมา 5 ใบทำให้เหลือกลุ่มล่าง
 * ใบเดียวสองใบ ซึ่งดูเหมือนระบบเสียมากกว่าช่วยอะไร
 */
export const SAVED_REPLY_FREQUENT_MIN_TOTAL = 9;
/** โชว์กี่ใบในกลุ่ม "ใช้บ่อย" */
export const SAVED_REPLY_FREQUENT_COUNT = 5;

/**
 * แบ่งรายการเป็น "ใช้บ่อย" กับ "ทั้งหมด" — **ไม่ซ้ำกัน** ใบที่ขึ้นข้างบนถูกตัดออกจากข้างล่าง
 *
 * ลำดับที่คนตั้งเองในหน้าจัดการ (`sort_order`) ยังคุมกลุ่มล่างเหมือนเดิม —
 * "ใช้บ่อย" เป็นทางลัดที่วางทับ ไม่ใช่ตัวแทนของการเรียงลำดับที่ตั้งไว้
 */
export function splitFrequentReplies(list: SavedReply[]): { frequent: SavedReply[]; rest: SavedReply[] } {
  if (list.length < SAVED_REPLY_FREQUENT_MIN_TOTAL) return { frequent: [], rest: list };
  const used = list.filter(r => (r.use_count || 0) > 0);
  // ยังไม่มีข้อมูลพอให้เรียง = อย่าเดา แสดงลำดับที่คนตั้งไว้ไปตามเดิม
  if (used.length < SAVED_REPLY_FREQUENT_COUNT) return { frequent: [], rest: list };
  const frequent = [...used]
    .sort((a, b) => (b.use_count || 0) - (a.use_count || 0)
      || (b.last_used_at || '').localeCompare(a.last_used_at || ''))
    .slice(0, SAVED_REPLY_FREQUENT_COUNT);
  const ids = new Set(frequent.map(r => r.id));
  return { frequent, rest: list.filter(r => !ids.has(r.id)) };
}

/** รูปแรกไว้โชว์เป็นไอคอนในรายการ */
export function savedReplyThumb(reply: SavedReply): string | null {
  return reply.image_urls?.[0] || null;
}

/**
 * ข้อความตัวอย่างบรรทัดเดียวของแชท ("ข้อความล่าสุด" ในรายชื่อแชท)
 *
 * ใช้ที่เดียวกันทั้งฝั่ง server (/api/chat/contacts ประกอบรายชื่อ · แจ้งเตือน push) และ
 * ฝั่ง client (หน้าแชท patch รายชื่อจาก realtime payload โดยไม่ต้องดึงรายชื่อใหม่) —
 * ถ้าสองฝั่งแปลคนละแบบ แถวเดิมจะเปลี่ยนหน้าตาไปมาเวลามีข้อความเข้า
 *
 * ⚠️ ไฟล์นี้ถูก import เข้า bundle ของ browser ด้วย — **ห้ามแตะ DOM และห้าม import
 * อะไรที่ลาก server-only เข้ามา** (ทุกอย่างในนี้เป็นฟังก์ชันบริสุทธิ์)
 *
 * ชื่อ message_type ของทุกแพลตฟอร์มไม่ชนกัน จึงใช้ตารางเดียวได้ (LINE: sticker/audio/
 * location/file · Shopee/Lazada/TikTok: item/order/voucher) — เพิ่มชนิดใหม่ให้เพิ่มที่นี่
 */
const PREVIEW_BY_TYPE: Record<string, string> = {
  sticker: '🎭 สติกเกอร์',
  image: '🖼️ รูปภาพ',
  video: '🎬 วิดีโอ',
  audio: '🎵 เสียง',
  location: '📍 ตำแหน่ง',
  file: '📎 ไฟล์',
  item: '🛍️ สินค้า',
  order: '📦 คำสั่งซื้อ',
  voucher: '🎟️ คูปอง',
  follow_invite: '🏪 ชวนติดตามร้าน',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&'); // ต้องท้ายสุด ไม่งั้น &amp;lt; จะถูกถอดสองรอบ
}

/** มีแท็ก HTML ปนมาไหม — ไม่มี = ข้อความธรรมดา ไม่ต้องแปลง */
function hasMarkup(text: string): boolean {
  return /<(img|a|br|p|div|span|ul|li|table|strong|em|b|i)\b[^>]*>/i.test(text);
}

/**
 * HTML → ข้อความบรรทัดเดียวสำหรับพรีวิว
 *
 * ข้อความ "text" ของ Lazada (ประกาศที่ Lazada ยิงหาผู้ขายเอง) ฝัง HTML มาเต็ม —
 * รายชื่อแชทเคยโชว์ `<img width="250" …` ดิบ ๆ ทั้งแถว · ที่นี่ถอดแท็กทิ้งแล้วเอา
 * บรรทัดแรกที่มีเนื้อ (ฟองข้อความในหน้าแชทวาดของจริงผ่าน app/chat/lib/richText.ts)
 */
export function htmlToPlainText(input: string): string {
  if (!input) return '';
  // <script>/<style> ทิ้งทั้งบล็อกพร้อมเนื้อใน — ไม่ใช่แค่ตัวแท็ก
  const withoutBlocks = input.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
  const hadImage = /<img\b/i.test(withoutBlocks);
  const withBreaks = withoutBlocks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li|tr|h[1-6])\s*>/gi, '\n');
  const lines = decodeEntities(withBreaks.replace(/<[^>]*>/g, ''))
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (lines.length === 0) return hadImage ? '🖼️ รูปภาพ' : '';
  return lines[0];
}

/**
 * ข้อความที่แพลตฟอร์มเก็บเป็น JSON หลายภาษา → ภาษาที่คนอ่าน
 *
 * Lazada เก็บข้อความตอบอัตโนมัติของร้าน (template 10015) เป็น `{"th":"…","en":"…"}`
 * ทั้งก้อนในช่อง txt — โชว์ดิบ ๆ คือ JSON เต็มฟอง
 */
export function unwrapI18nText(txt: unknown): string {
  if (typeof txt !== 'string') return '';
  const trimmed = txt.trim();
  if (!trimmed.startsWith('{')) return txt;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      const pick = (key: string) => (typeof obj[key] === 'string' && obj[key] ? (obj[key] as string) : undefined);
      const first = Object.values(obj).find(v => typeof v === 'string' && v.trim()) as string | undefined;
      return pick('th') ?? pick('en') ?? first ?? txt;
    }
  } catch {
    /* ไม่ใช่ JSON — เป็นข้อความธรรมดาที่บังเอิญขึ้นต้นด้วย { */
  }
  return txt;
}

/** ข้อความล้วนของ content: ถอด i18n JSON → ถอด HTML → ตัดหมาย `[image]` นำหน้าทิ้ง */
function plainPreview(content: string | null | undefined): string {
  let text = content || '';
  if (!text) return '';
  text = unwrapI18nText(text);
  if (hasMarkup(text)) text = htmlToPlainText(text);
  return text.replace(/^\[image\]\s*/i, '').trim();
}

export function buildMessagePreview(messageType: string | null | undefined, content: string | null | undefined): string {
  // ข้อความจากระบบของแพลตฟอร์ม (เตือนเรื่องความปลอดภัย ฯลฯ) — เนื้อความคือสิ่งที่ต้องอ่าน
  // ป้าย "ข้อความจากระบบ" ไม่ได้บอกอะไรเพิ่ม
  if (messageType === 'system') return plainPreview(content);
  if (messageType && PREVIEW_BY_TYPE[messageType]) return PREVIEW_BY_TYPE[messageType];
  return plainPreview(content);
}

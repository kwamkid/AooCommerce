// Path: app/chat/lib/richText.ts
//
// แปลงข้อความแชทที่มี HTML ปนมา → token ที่ React วาดเองได้อย่างปลอดภัย
//
// ทำไมต้องมี: ข้อความ "text" ของ Lazada (โดยเฉพาะที่ Lazada ยิงหาผู้ขายเอง) ฝัง
// HTML มาเต็ม — `<img src=...>`, `<a href=...>คลิก</a>`, `<p>` — ถ้าโชว์ดิบๆ
// ผู้ใช้เห็นเป็นแท็กเต็มจอ อ่านไม่รู้เรื่องและรูปไม่ขึ้น (เจอจริง 2026-08-28)
//
// ทำไมไม่ใช้ dangerouslySetInnerHTML: ข้อความมาจากคนนอก (ผู้ซื้อพิมพ์เองก็ได้)
// การยัด HTML ดิบเข้า DOM = ช่องโหว่ XSS · ที่นี่จึง **parse เป็น token แล้วให้
// React วาด** — แท็กที่ไม่รู้จักถูกทิ้ง, URL ที่ไม่ใช่ http(s) ถูกทิ้ง
// จึงไม่มีทางมี event handler หรือ javascript: หลุดเข้าไป

export type RichToken =
  | { kind: 'text'; value: string }
  | { kind: 'image'; url: string }
  | { kind: 'link'; url: string; label: string }
  | { kind: 'br' };

/** มีแท็ก HTML ปนมาไหม — ไม่มี = ข้อความธรรมดา ไม่ต้อง parse */
export function hasHtmlMarkup(text: string): boolean {
  return /<(img|a|br|p|div|span|ul|li|table|strong|em|b|i)\b[^>]*>/i.test(text);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&'); // ต้องท้ายสุด ไม่งั้น &amp;lt; จะถูกถอดสองรอบ
}

/** อนุญาตเฉพาะ http/https — กัน javascript:, data:, vbscript: */
function safeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const url = decodeEntities(raw.trim());
  return /^https?:\/\/\S+$/i.test(url) ? url : null;
}

function attr(tag: string, name: string): string | undefined {
  const quoted = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
  if (quoted) return quoted[1];
  const bare = new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(tag);
  return bare?.[1];
}

// ตัวที่ต้องรู้จัก + `<[^>]+>` ปิดท้ายไว้กวาดแท็กที่เหลือทิ้ง
const TOKEN_RE = /<img\b[^>]*>|<a\b[^>]*>|<\/a\s*>|<br\s*\/?>|<\/(?:p|div|li|tr|h[1-6])\s*>|<[^>]*>/gi;

/**
 * แตกข้อความเป็น token · ข้อความธรรมดา (ไม่มีแท็ก) คืน `[{kind:'text'}]` ตัวเดียว
 * ช่องว่าง/บรรทัดว่างซ้อนกันถูกยุบให้เหลือพอดีอ่าน
 */
export function parseRichText(input: string): RichToken[] {
  // <script>/<style> ทิ้งทั้งบล็อกพร้อมเนื้อใน — ไม่ใช่แค่ตัวแท็ก
  const text = input.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');

  const tokens: RichToken[] = [];
  let cursor = 0;
  // อยู่ระหว่าง <a>...</a> → เก็บข้อความไว้เป็น label ของลิงก์แทนที่จะ push เลย
  let openLink: { url: string | null; label: string } | null = null;

  const pushText = (value: string) => {
    if (!value) return;
    if (openLink) { openLink.label += value; return; }
    tokens.push({ kind: 'text', value });
  };

  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    pushText(decodeEntities(text.slice(cursor, match.index)));
    cursor = match.index + match[0].length;

    const tag = match[0];
    const lower = tag.toLowerCase();

    if (lower.startsWith('<img')) {
      const url = safeUrl(attr(tag, 'src'));
      if (url) tokens.push({ kind: 'image', url });
    } else if (lower.startsWith('</a')) {
      if (openLink) {
        const label = openLink.label.trim();
        if (openLink.url) tokens.push({ kind: 'link', url: openLink.url, label: label || openLink.url });
        else pushTextAfterClose(tokens, label);
        openLink = null;
      }
    } else if (lower.startsWith('<a')) {
      // <a> ซ้อน <a> ไม่ควรเกิด — ถ้าเจอ ปิดตัวเดิมก่อนไม่ให้ label กลืนกันยาว
      if (openLink?.url) tokens.push({ kind: 'link', url: openLink.url, label: openLink.label.trim() || openLink.url });
      openLink = { url: safeUrl(attr(tag, 'href')), label: '' };
    } else if (/^<br|^<\/(p|div|li|tr|h[1-6])/.test(lower)) {
      if (!openLink) tokens.push({ kind: 'br' });
    }
    // แท็กอื่นทั้งหมด = ทิ้ง (เนื้อข้างในยังอยู่เพราะเก็บจาก slice)
  }
  pushText(decodeEntities(text.slice(cursor)));

  if (openLink) {
    const label = openLink.label.trim();
    if (openLink.url) tokens.push({ kind: 'link', url: openLink.url, label: label || openLink.url });
    else pushTextAfterClose(tokens, label);
  }

  return collapse(tokens);
}

function pushTextAfterClose(tokens: RichToken[], value: string) {
  if (value) tokens.push({ kind: 'text', value });
}

/** ยุบ br ซ้อนเกิน 2 ตัว + ตัดช่องว่างหัวท้าย ไม่ให้บับเบิลยืดเปล่าๆ */
function collapse(tokens: RichToken[]): RichToken[] {
  const out: RichToken[] = [];
  let brRun = 0;
  for (const token of tokens) {
    if (token.kind === 'br') {
      brRun++;
      if (brRun > 2 || out.length === 0) continue;
      out.push(token);
      continue;
    }
    if (token.kind === 'text') {
      const value = token.value.replace(/[ \t]+/g, ' ');
      if (!value.trim()) continue;
      brRun = 0;
      out.push({ kind: 'text', value });
      continue;
    }
    brRun = 0;
    out.push(token);
  }
  while (out.length && out[out.length - 1].kind === 'br') out.pop();
  return out;
}

// ดูดสีเด่นออกจากรูป (ใช้กับโลโก้ร้าน)
//
// ทำฝั่ง client ด้วย canvas ล้วน ไม่มี dependency และไม่ต้องส่งรูปขึ้น server
//
// เป้าหมายคือ "สีที่เอาไปเป็นสีแบรนด์ได้จริง" ไม่ใช่สีที่พบมากที่สุด — โลโก้
// ส่วนใหญ่มีพื้นขาวเยอะสุดเสมอ ถ้านับตรง ๆ จะได้สีขาวมาเป็นอันดับหนึ่งทุกครั้ง
// จึงตัดสีที่จืด (เกือบเทา) และสว่าง/มืดจนเกินไปออกก่อนนับ

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // ต้องขอแบบ CORS ไม่งั้น canvas จะ tainted แล้วอ่าน pixel ไม่ได้
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load failed'));
    img.src = src;
  });
}

/** องศาสีบนวงล้อ (0-360) — ใช้ตัดสินว่า "เป็นสีเดียวกันคนละความสว่าง" หรือเปล่า */
function hue(r: number, g: number, b: number): number {
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), d = hi - lo;
  if (d === 0) return 0;
  const h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;

/**
 * คืนสีเด่นเรียงตามพื้นที่ที่ครอง (มากไปน้อย)
 * คืน [] เมื่ออ่านรูปไม่ได้ (โดเมนไม่ส่ง CORS header) — caller ต้องรองรับ
 */
export async function extractPalette(src: string, max = 6): Promise<string[]> {
  try {
    const img = await loadImage(src);
    const size = 64;   // ย่อก่อนอ่าน — เร็วขึ้นมากและช่วยเกลี่ยสัญญาณรบกวนไปในตัว
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    ctx.drawImage(img, 0, 0, size, size);

    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;            // โปร่งใส
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const hi = Math.max(r, g, b), lo = Math.min(r, g, b);
      if (hi - lo < 24) continue;                 // เกือบเทา/ขาว/ดำ
      const lum = (hi + lo) / 2;
      if (lum > 225 || lum < 20) continue;        // สว่างหรือมืดจนใช้ไม่ได้

      // รวมสีใกล้เคียงเป็นถังเดียว (16 ระดับต่อช่อง) ไม่งั้นได้เฉดเดียวกันซ้ำเต็มไปหมด
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      cur.n++; cur.r += r; cur.g += g; cur.b += b;
      buckets.set(key, cur);
    }

    const all = [...buckets.values()];
    const counted = all.reduce((n, c) => n + c.n, 0);
    if (!counted) return [];

    const ranked = all
      // ต่ำกว่า 0.5% ของพื้นที่คือขอบภาพที่เกิดจากการย่อรูป ไม่ใช่สีที่มีอยู่จริง
      .filter(c => c.n / counted >= 0.005)
      .sort((a, b) => b.n - a.n)
      .map(c => [Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n)] as const);

    // โลโก้ส่วนใหญ่เป็นสีเดียวไล่ความสว่าง ถ้าไม่กรองจะได้แดง 6 ช่องที่ตาแยกไม่ออก
    // ถือว่า "สีเดียวกัน" เมื่อองศาสีใกล้กัน แม้ค่า RGB จะห่างกันมากก็ตาม
    const picked: (readonly [number, number, number])[] = [];
    for (const c of ranked) {
      if (picked.length >= max) break;
      const h = hue(c[0], c[1], c[2]);
      const dup = picked.some(p => {
        const dh = Math.abs(hue(p[0], p[1], p[2]) - h);
        return Math.min(dh, 360 - dh) < 25;
      });
      if (!dup) picked.push(c);
    }
    return picked.map(c => toHex(c[0], c[1], c[2]));
  } catch {
    return [];
  }
}

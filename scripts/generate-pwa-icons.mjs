// Generate PWA icons from public/logo.svg → public/icons/
// Usage: node scripts/generate-pwa-icons.mjs
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'fs';

const SRC = 'public/logo.svg';
const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

const LOGO_SVG = readFileSync(SRC, 'utf8');

// ── สีของโลโก้ในไฟล์ต้นฉบับ ──
// logo.svg เป็นแดงสองเฉด (.cls-2 ตัวสว่าง / .cls-1 เงาเข้ม) — เฉดคู่นี้คือสิ่งที่ทำให้
// เห็น "รอยพับ" ของโลโก้ · เปลี่ยนสีต้องเปลี่ยนเป็น**คู่** ไม่งั้นโลโก้แบนเป็นแผ่นเดียว
const LOGO_LIGHT = '#ee2f2e';
const LOGO_SHADE = '#d32727';

/** คืน SVG ที่ทาสีใหม่ — ส่งคู่สี [ตัวสว่าง, เงา] */
function recolored([light, shade]) {
  return Buffer.from(
    LOGO_SVG.replace(LOGO_LIGHT, light).replace(LOGO_SHADE, shade),
    'utf8'
  );
}

// ── จานสีของแต่ละแอป ── (ตัดสินใจ 2026-09-05 หลังลองมาแล้ว 2 รอบ)
//
// ทั้งสองแอป = **โลโก้สีบนพื้นขาว** แล้วแยกแอปกันด้วย "สีของโลโก้" ไม่ใช่สีพื้น
//
// เหตุผล: iOS 18+ **ย้อมไอคอนที่ไม่มีเวอร์ชัน dark ให้เอง** เมื่อผู้ใช้ตั้งหน้าจอโฮมเป็น
// โหมดมืด — พื้นถูกทำให้เกือบดำ ส่วนโลโก้คงสีเดิม (PWA ไม่มีทางส่งไอคอน dark แยกให้)
//   • พื้นขาว + โลโก้แดง  → โหมดมืด = พื้นดำ + โลโก้แดง   ← ตรงที่ต้องการพอดี
//   • พื้นขาว + โลโก้ม่วง → โหมดมืด = พื้นดำ + โลโก้ม่วง  ← แยกจากแอปร้านได้ทั้งสองโหมด
// ⚠️ เคยลอง "พื้นแดงอิ่ม + โลโก้ขาว" (รอบ 4 ก.ย.) หวังให้พื้นสีอิ่มรอดจากการย้อม —
//   **ไม่รอด** iOS ย้อมพื้นแดงเป็นดำเหมือนกันแล้วโลโก้ขาวกลายเป็นชมพูอ่อน (จอจริง 5 ก.ย.)
//   → อย่ากลับไปพึ่งสีพื้น สีที่รอดจากการย้อมมีแต่สีของ**โลโก้**เท่านั้น
const WHITE_BG = { r: 255, g: 255, b: 255, alpha: 1 };

// แอปร้าน = โลโก้แดงเดิมของ logo.svg
const APP_BG = WHITE_BG;
const APP_LOGO = [LOGO_LIGHT, LOGO_SHADE];

// แอปผู้ดูแลระบบ = โลโก้ม่วง (คู่สี purple-600 / purple-700 — เข้มขึ้นสัดส่วนเดียวกับคู่แดง
// รอยพับจึงยังเห็น) · ต้องดูต่างจากแอปร้านตั้งแต่ไกล ๆ เพราะอยู่บนหน้าจอโฮมเครื่องเดียวกัน
const ADMIN_BG = WHITE_BG;
const ADMIN_LOGO = ['#9333ea', '#7e22ce'];

async function icon(size, ratio, file, bg, logoColors) {
  const logoSize = Math.round(size * ratio);
  const logo = await sharp(recolored(logoColors))
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/${file}`);
  console.log(`✓ ${file} (${size}x${size})`);
}

// Badge (Android status bar) — ต้องเป็น silhouette ขาวบนพื้นใส
async function badge(size, file) {
  const logo = await sharp(SRC).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: logo, blend: 'dest-in' }])
    .png()
    .toFile(`${OUT}/${file}`);
  console.log(`✓ ${file} (badge ${size}x${size})`);
}

// ── สัดส่วนโลโก้ต่อ canvas — คิดจาก "ทรงของโลโก้" ไม่ใช่ค่ามาตรฐานลอย ๆ ──
//
// โลโก้ AooCommerce เป็น **ข้าวหลามตัด** (สี่เหลี่ยมหมุน 45°) ปลายแหลมทั้ง 4 อยู่ที่
// กึ่งกลางขอบบน/ล่าง/ซ้าย/ขวา จุดที่ไกลจากศูนย์กลางที่สุด = ครึ่งความกว้างพอดี
// → คิด safe zone ต่างจากโลโก้ทรงสี่เหลี่ยมตรง (ที่ต้องหาร √2)
//
// ⚠️ **เปลี่ยนโลโก้เป็นทรงอื่นเมื่อไหร่ต้องคิดเลขพวกนี้ใหม่** — เอาค่าเดิมไปใช้กับ
// โลโก้สี่เหลี่ยม/แนวนอน จะโดนมุมกัด
const MASKABLE = 0.78;  // safe zone = วงกลม Ø80% ของไอคอน · ข้าวหลามตัดใส่ได้ถึง 0.80 พอดี เผื่อขอบไว้นิด
// ⚠️ APPLE เคยลองดัน 0.86 (ค่าที่ "ใส่ได้โดยไม่โดนตัด" ทางเรขาคณิต) แล้ว**ดูแย่**
// — โลโก้ชนขอบกรอบจนไม่มีที่หายใจ ไอคอนแอปต้องมีขอบว่างถึงจะดูเป็นไอคอน
// พอดีที่สุดของโลโก้นี้คือ 0.78 (ค่าที่ใช้มาแต่เดิม) · **ไม่โดนตัด ≠ สวย** อย่าดันขึ้นอีก
const APPLE = 0.73;     // ไอคอนบนหน้าจอโฮมของ iOS — เว้นขอบราว 13.5% ของแต่ละด้าน
const PLAIN = 0.82;     // ไอคอน purpose 'any' — แท็บเบราว์เซอร์ / หน้าต่างติดตั้ง / เดสก์ท็อป

await icon(192, PLAIN, 'icon-192.png', APP_BG, APP_LOGO);
await icon(512, PLAIN, 'icon-512.png', APP_BG, APP_LOGO);
await icon(512, MASKABLE, 'maskable-512.png', APP_BG, APP_LOGO);
await icon(180, APPLE, 'apple-touch-icon.png', APP_BG, APP_LOGO);
await badge(96, 'badge-96.png');

await icon(192, PLAIN, 'admin-icon-192.png', ADMIN_BG, ADMIN_LOGO);
await icon(512, PLAIN, 'admin-icon-512.png', ADMIN_BG, ADMIN_LOGO);
await icon(512, MASKABLE, 'admin-maskable-512.png', ADMIN_BG, ADMIN_LOGO);
await icon(180, APPLE, 'admin-apple-touch-icon.png', ADMIN_BG, ADMIN_LOGO);
console.log('Done.');

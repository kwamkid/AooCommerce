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

// ── จานสีของแต่ละแอป ──
// แอปร้าน = พื้นแดงแบรนด์ + โลโก้ขาว
//   เดิมเป็นโลโก้แดงบนพื้นขาว แต่ iOS 18 **ย้อมไอคอนที่ไม่มีเวอร์ชัน dark ให้เข้มเอง**
//   เมื่อผู้ใช้ตั้งหน้าจอโฮมเป็นโหมดมืด → พื้นขาวกลายเป็นเกือบดำ จนหน้าตาเหมือน
//   ไอคอนของแอปผู้ดูแลระบบ (พื้น slate เข้ม) แยกไม่ออกบนจอเดียวกัน
//   พื้นสีอิ่มตัวรอดจากการย้อมนั้น จึงยังเป็นสีแดงและแยกออกเสมอ
const APP_BG = { r: 244, g: 81, b: 30, alpha: 1 };   // #F4511E สีแบรนด์ (= theme_color)
// เงาของโลโก้ขาวบนพื้นแดง = ขาว 82% ทับพื้น — คงรอยพับไว้โดยไม่ตัดกันจนแข็ง
const APP_LOGO = ['#ffffff', '#fde0d6'];

// แอปผู้ดูแลระบบ = พื้น slate เข้มเท่าสี shell ของหน้านั้น + โลโก้แดงเดิม
// ต้องดูต่างจากแอปร้านตั้งแต่ไกล ๆ เพราะอยู่บนหน้าจอโฮมเครื่องเดียวกัน
const ADMIN_BG = { r: 15, g: 23, b: 42, alpha: 1 };  // slate-900
const ADMIN_LOGO = [LOGO_LIGHT, LOGO_SHADE];

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

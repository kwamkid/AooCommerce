// Generate PWA icons from public/logo.svg → public/icons/
// Usage: node scripts/generate-pwa-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'fs';

const SRC = 'public/logo.svg';
const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

// โลโก้บนพื้นขาว มี padding รอบๆ (ratio = สัดส่วนโลโก้ต่อ canvas)
async function iconOnWhite(size, ratio, file) {
  const logoSize = Math.round(size * ratio);
  const logo = await sharp(SRC).resize(logoSize, logoSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
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

// ไอคอนของ "แอปผู้ดูแลระบบ" (/superadmin) — พื้นเข้มสีเดียวกับ shell ของหน้านั้น
// ต้องดูต่างจากแอปร้านตั้งแต่ไกล ๆ เพราะอยู่บนหน้าจอโฮมเครื่องเดียวกัน
const ADMIN_BG = { r: 15, g: 23, b: 42, alpha: 1 }; // slate-900
async function iconOnColor(size, ratio, file, bg) {
  const logoSize = Math.round(size * ratio);
  const logo = await sharp(SRC).resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(`${OUT}/${file}`);
  console.log(`✓ ${file} (${size}x${size})`);
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
                        // (ของเดิมใช้ 0.6 = สูตรของโลโก้สี่เหลี่ยมตรง เลยย่อเกินจำเป็น ~25% บนหน้าจอโฮม Android)
const APPLE = 0.86;     // iOS ตัดแค่ "มุม" (squircle) — ปลายแหลมอยู่กึ่งกลางขอบจึงไม่โดนตัด ใหญ่กว่านี้ได้
const PLAIN = 0.82;     // ไอคอน purpose 'any' — แท็บเบราว์เซอร์ / หน้าต่างติดตั้ง / เดสก์ท็อป

await iconOnWhite(192, PLAIN, 'icon-192.png');
await iconOnWhite(512, PLAIN, 'icon-512.png');
await iconOnWhite(512, MASKABLE, 'maskable-512.png');
await iconOnWhite(180, APPLE, 'apple-touch-icon.png');
await badge(96, 'badge-96.png');

await iconOnColor(192, PLAIN, 'admin-icon-192.png', ADMIN_BG);
await iconOnColor(512, PLAIN, 'admin-icon-512.png', ADMIN_BG);
await iconOnColor(512, MASKABLE, 'admin-maskable-512.png', ADMIN_BG);
await iconOnColor(180, APPLE, 'admin-apple-touch-icon.png', ADMIN_BG);
console.log('Done.');

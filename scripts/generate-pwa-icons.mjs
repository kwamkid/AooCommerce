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

await iconOnWhite(192, 0.82, 'icon-192.png');
await iconOnWhite(512, 0.82, 'icon-512.png');
await iconOnWhite(512, 0.6, 'maskable-512.png'); // maskable ต้องเผื่อ safe zone 60%
await iconOnWhite(180, 0.78, 'apple-touch-icon.png');
await badge(96, 'badge-96.png');
console.log('Done.');

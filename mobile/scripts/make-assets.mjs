// สร้างไฟล์ต้นทางให้ @capacitor/assets จาก ../public/logo.svg (คู่กับ scripts/generate-pwa-icons.mjs ของเว็บ)
//   assets/icon-only.png        1024×1024 โลโก้แดงบนพื้นขาว (ไอคอนหลัก iOS)
//   assets/icon-foreground.png  1024×1024 โลโก้บนพื้นโปร่ง (Android adaptive foreground)
//   assets/icon-background.png  1024×1024 พื้นขาวล้วน (Android adaptive background)
//   assets/splash.png / splash-dark.png  2732×2732 โลโก้กลางจอ
// ⚠️ iOS ไม่รับไอคอนพื้นโปร่ง (ถมดำให้) — ไอคอนหลักต้องมีพื้นเสมอ
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'fs';

const SRC = '../public/logo.svg';
const OUT = 'assets';
mkdirSync(OUT, { recursive: true });
const LOGO = readFileSync(SRC);

async function logoPng(size, ratio) {
  return sharp(LOGO).resize(Math.round(size * ratio), Math.round(size * ratio), {
    fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 },
  }).png().toBuffer();
}
async function canvas(size, bg, logo) {
  const img = sharp({ create: { width: size, height: size, channels: 4, background: bg } });
  return (logo ? img.composite([{ input: logo, gravity: 'center' }]) : img).png();
}

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const DARK = { r: 15, g: 23, b: 42, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// ข้าวหลามตัดใส่ได้ 0.78 ของกรอบโดยไม่โดนมุมกัด (ดู scripts/generate-pwa-icons.mjs)
await (await canvas(1024, WHITE, await logoPng(1024, 0.72))).toFile(`${OUT}/icon-only.png`);
await (await canvas(1024, CLEAR, await logoPng(1024, 0.62))).toFile(`${OUT}/icon-foreground.png`);
await (await canvas(1024, WHITE, null)).toFile(`${OUT}/icon-background.png`);
await (await canvas(2732, WHITE, await logoPng(2732, 0.22))).toFile(`${OUT}/splash.png`);
await (await canvas(2732, DARK, await logoPng(2732, 0.22))).toFile(`${OUT}/splash-dark.png`);
console.log('✓ assets/ ready — next: npm run assets (needs ios/ + android/ from `cap add`)');

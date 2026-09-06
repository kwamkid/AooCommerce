// ไอคอนบนแจ้งเตือน — รูปช่องทาง + ตราแพลตฟอร์มมุมขวาล่าง (PNG 192×192)
//
// แจ้งเตือนแชท/ออเดอร์มาจากหลายร้านหลายแพลตฟอร์มปนกันในสายเดียว ไอคอนแอปอย่างเดียว
// จึงบอกอะไรไม่ได้เลย — ใบนี้ประกอบ "รูปร้าน/เพจ/OA + ตราแพลตฟอร์ม" ให้รู้ตั้งแต่ยัง
// ไม่อ่านข้อความว่าเป็นของใคร (iOS ไม่รองรับไอคอนของแจ้งเตือน จะเห็นแค่ไอคอนแอป —
// ข้อความจึงต้องบอกช่องทางด้วยเสมอ ดู lib/push/send.ts)
//
// ⚠️ ห้ามโยน error ออกไปเด็ดขาด — ไอคอนพังต้องไม่ทำให้แจ้งเตือนทั้งใบพัง
// ทุกทางที่ล้มจบที่ไอคอนแอปเสมอ (200 + PNG) ไม่มี 500
//
// ไม่ต้อง auth เหมือน /api/chat/profile-picture — พารามิเตอร์เป็น uuid เดาไม่ได้
// และรูปที่คืนคือโลโก้ที่เปิดเผยต่อสาธารณะอยู่แล้ว
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveAccountPicture } from '@/lib/chat/account-picture';

// sharp เป็น native module — edge runtime รันไม่ได้
export const runtime = 'nodejs';

const SIZE = 192;
const BADGE_DISC = 80; // โลโก้ 72px + วงแหวนขาว 4px รอบ
const BADGE_LOGO = 72;
const BADGE_RING = (BADGE_DISC - BADGE_LOGO) / 2;
const BADGE_MARGIN = 2; // เว้นจากขอบรูปนิดหน่อย ไม่ให้ตราโดนมุมตัด
/** ตราตอนไม่มีรูปช่องทาง — ใหญ่กว่า เพราะเป็นพระเอกของไอคอนแทนรูปร้าน */
const SOLO_BADGE_DISC = 120;

// `s-maxage` คือสิ่งเดียวที่ทำให้ edge ของ Vercel ยอมแคช response ของ function
// (cache key = URL เต็ม → ต่อร้าน) ไม่งั้นแจ้งเตือนทุกใบ = ประกอบรูปใหม่ 1 รอบ
const ICON_CACHE = 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800';

const REMOTE_TIMEOUT_MS = 5000;

type BadgePlatform = 'shopee' | 'lazada' | 'tiktok' | 'line' | 'facebook' | 'instagram';

const BADGE_FILE: Record<BadgePlatform, string> = {
  facebook: 'social/facebook.svg',
  instagram: 'social/instagram.svg',
  line: 'social/line_oa.svg',
  // แชทและออเดอร์ TikTok ของระบบนี้เป็น TikTok Shop ทั้งคู่ → ใช้ตราของ Shop
  tiktok: 'marketplace/tiktok_shop.svg',
  shopee: 'marketplace/shopee.svg',
  lazada: 'marketplace/lazada.svg',
};

/** สีประจำแพลตฟอร์ม — ใช้เป็นพื้นวงกลมเมื่อร้านไม่มีโลโก้ */
const BRAND_COLOR: Record<BadgePlatform, string> = {
  shopee: '#EE4D2D',
  lazada: '#0F146E',
  tiktok: '#161823',
  line: '#06C755',
  facebook: '#1877F2',
  instagram: '#E4405F',
};

function isBadgePlatform(v: string | null | undefined): v is BadgePlatform {
  return !!v && v in BADGE_FILE;
}

/** มาสก์วงกลม — ใช้กับ blend 'dest-in' เพื่อครอบรูปสี่เหลี่ยมให้กลม */
function circleMask(size: number): Buffer {
  return Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
}

/** โหลดรูปจากปลายทางภายนอก — ล้ม/ช้า = คืน null แล้วไปใช้พื้นสีแบรนด์แทน */
async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * ตราแพลตฟอร์ม = โลโก้บนจานขาวกลม
 * มาสก์ทั้งใบเป็นวงกลมหลังแปะโลโก้ — โลโก้บางตัวเป็นสี่เหลี่ยม มุมจะโผล่พ้นวงแหวน
 */
async function buildBadge(platform: BadgePlatform, disc: number): Promise<Buffer> {
  const ring = Math.round((BADGE_RING / BADGE_DISC) * disc);
  const logoSize = disc - ring * 2;
  const svg = await readFile(path.join(process.cwd(), 'public', BADGE_FILE[platform]));
  // density สูงเพื่อให้ SVG rasterize คมที่ขนาดนี้ (ค่า default 72dpi จะแตก)
  const logo = await sharp(svg, { density: 600 })
    .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: { width: disc, height: disc, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite([
      { input: logo, left: ring, top: ring },
      { input: circleMask(disc), blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
}

/** รูปช่องทางครอบวงกลม + ตราแพลตฟอร์มมุมขวาล่าง */
async function composeWithPicture(picture: Buffer, platform: BadgePlatform | null): Promise<Buffer> {
  const base = await sharp(picture)
    .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
    .composite([{ input: circleMask(SIZE), blend: 'dest-in' }])
    .png()
    .toBuffer();

  if (!platform) return base;

  const badge = await buildBadge(platform, BADGE_DISC);
  const offset = SIZE - BADGE_DISC - BADGE_MARGIN;
  return sharp(base)
    .composite([{ input: badge, left: offset, top: offset }])
    .png()
    .toBuffer();
}

/** ไม่มีรูปช่องทาง → วงกลมสีแบรนด์ + ตราแพลตฟอร์มตัวใหญ่ตรงกลาง */
async function composeBrandDisc(platform: BadgePlatform): Promise<Buffer> {
  const disc = Buffer.from(
    `<svg width="${SIZE}" height="${SIZE}"><circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="${BRAND_COLOR[platform]}"/></svg>`
  );
  const badge = await buildBadge(platform, SOLO_BADGE_DISC);
  const offset = Math.round((SIZE - SOLO_BADGE_DISC) / 2);
  return sharp(disc)
    .composite([{ input: badge, left: offset, top: offset }])
    .png()
    .toBuffer();
}

/** ทางลงสุดท้ายเมื่ออะไรก็ตามพัง — ไอคอนแอปธรรมดา (ห้ามตอบ 500) */
async function appIcon(): Promise<NextResponse> {
  try {
    const buf = await readFile(path.join(process.cwd(), 'public', 'icons', 'icon-192.png'));
    return png(buf);
  } catch {
    // อ่านไฟล์ในเครื่องยังพัง = ผิดปกติมาก แต่ก็ยังต้องไม่ 500
    return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=60' } });
  }
}

function png(buf: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': ICON_CACHE },
  });
}

/** โลโก้ร้าน marketplace + แพลตฟอร์มของร้านนั้น */
async function readMarketplaceAccount(
  id: string
): Promise<{ platform: BadgePlatform | null; picture: string | null }> {
  const { data } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('platform, metadata')
    .eq('id', id)
    .maybeSingle();
  if (!data) return { platform: null, picture: null };

  // แถวยุคก่อนมีหลายแพลตฟอร์มไม่มีค่า platform — ตอนนั้นมีแต่ Shopee
  const platform = isBadgePlatform(data.platform) ? data.platform : 'shopee';
  const logo = (data.metadata as Record<string, unknown> | null)?.shop_logo;
  return { platform, picture: typeof logo === 'string' && logo ? logo : null };
}

/** รูป + แพลตฟอร์มของช่องทางแชทหนึ่งช่อง */
async function readChatAccount(id: string): Promise<{ platform: BadgePlatform | null; picture: string | null }> {
  const { data } = await supabaseAdmin
    .from('chat_accounts')
    .select('platform, credentials')
    .eq('id', id)
    .maybeSingle();
  if (!data) return { platform: null, picture: null };

  const creds = data.credentials as Record<string, unknown> | null;
  const platform = isBadgePlatform(data.platform) ? data.platform : null;

  // แชท marketplace: โลโก้ร้านอยู่ที่ marketplace_accounts ไม่ได้อยู่ใน credentials
  const shopLogos: Record<string, string> = {};
  const mpId = creds?.marketplace_account_id;
  if (typeof mpId === 'string') {
    const shop = await readMarketplaceAccount(mpId);
    if (shop.picture) shopLogos[mpId] = shop.picture;
  }

  return {
    platform,
    picture: resolveAccountPicture(data.platform as string, creds, shopLogos, { facebookSize: 'large' }),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const chatAccountId = searchParams.get('chat_account');
    const marketplaceAccountId = searchParams.get('marketplace_account');
    const platformParam = searchParams.get('platform');

    let platform: BadgePlatform | null = null;
    let pictureUrl: string | null = null;

    if (chatAccountId) {
      ({ platform, picture: pictureUrl } = await readChatAccount(chatAccountId));
    } else if (marketplaceAccountId) {
      ({ platform, picture: pictureUrl } = await readMarketplaceAccount(marketplaceAccountId));
    } else if (isBadgePlatform(platformParam)) {
      platform = platformParam;
    }

    if (!platform && !pictureUrl) return appIcon();

    const picture = pictureUrl ? await fetchImage(pictureUrl) : null;
    const buf = picture
      ? await composeWithPicture(picture, platform)
      : platform
        ? await composeBrandDisc(platform)
        : null;

    return buf ? png(buf) : appIcon();
  } catch (err) {
    console.error('[PushIcon] compose failed:', err);
    return appIcon();
  }
}

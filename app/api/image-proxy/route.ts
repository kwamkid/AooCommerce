// Path: app/api/image-proxy/route.ts
// ดึงรูปจากภายนอกผ่าน origin เราเอง — แก้ปัญหา CORS 2 กรณี:
//   1) Google Drive ในแท็ก <img> (รวมหน้าบิลสาธารณะ) → **ไม่ auth** ล็อกด้วย host allowlist
//   2) รูปสินค้าจากเว็บลูกค้าเอง (WordPress ฯลฯ) ตอนสร้าง PDF — pdfMake ต้องแปลงรูป
//      เป็น data URL ซึ่งต้อง fetch() จริง และเว็บทั่วไปไม่ส่ง CORS header มาให้
//      (แสดงใน <img> ได้ แต่ fetch() โดนบล็อก → ใบจัดของขึ้น "-" แทนรูป)
//      → host อื่นนอก allowlist ต้อง **ล็อกอินก่อน** ถึงจะ proxy ให้
//
// ⚠️ นี่คือ endpoint ที่ server ยิง request ตาม URL ที่ผู้เรียกกำหนด = จุดคลาสสิกของ
// SSRF ห้ามผ่อนเงื่อนไขพวกนี้: https เท่านั้น · ปลายทางต้องเป็น IP สาธารณะจริง
// (กัน 169.254.169.254 / 127.0.0.1 / วง LAN) · redirect ต้องตรวจซ้ำทุก hop ·
// ต้องเป็น content-type image/* · มีเพดานขนาด
import { NextRequest, NextResponse } from 'next/server';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { checkAuth } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

// Host ที่ proxy ให้ได้โดยไม่ต้องล็อกอิน (ใช้ในหน้าบิลสาธารณะ)
const PUBLIC_HOST_SUFFIXES = [
  'drive.google.com',
  'drive.usercontent.google.com',
  'googleusercontent.com', // lh3.googleusercontent.com, *.googleusercontent.com
];

function isPublicAllowlistedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return PUBLIC_HOST_SUFFIXES.some(s => h === s || h.endsWith(`.${s}`));
}

const MAX_BYTES = 15 * 1024 * 1024; // 15MB cap
const MAX_REDIRECTS = 3;

/** IP ที่ห้ามให้ server ยิงไปหา (loopback / LAN / metadata / multicast) */
function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedIpv4(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped (::ffff:10.0.0.1) → ตรวจเป็น v4
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIpv4(mapped[1]);
    if (lower === '::' || lower === '::1') return true;
    const head = parseInt(lower.split(':')[0] || '0', 16);
    if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((head & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    return false;
  }
  return true; // parse ไม่ได้ = ไม่ให้ผ่าน
}

function isBlockedIpv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT
  if (a === 169 && b === 254) return true;             // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;               // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a >= 224) return true;                            // multicast + reserved
  return false;
}

/** ปลายทางต้องเป็น https + ชี้ไปที่ IP สาธารณะทุกตัวที่ DNS ตอบมา */
async function assertSafeTarget(target: URL): Promise<string | null> {
  if (target.protocol !== 'https:') return 'URL not allowed';
  const host = target.hostname;
  if (isIP(host)) {
    return isBlockedIp(host) ? 'URL not allowed' : null;
  }
  try {
    const addrs = await lookup(host, { all: true });
    if (addrs.length === 0) return 'URL not allowed';
    if (addrs.some(a => isBlockedIp(a.address))) return 'URL not allowed';
  } catch {
    return 'URL not allowed';
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
    }

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    // นอก allowlist สาธารณะ = ต้องล็อกอิน (ใช้ตอนสร้างเอกสารในระบบหลังบ้าน)
    if (!isPublicAllowlistedHost(target.hostname)) {
      const auth = await checkAuth(request);
      if (!auth.isAuth) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    // ไล่ redirect เอง เพื่อตรวจความปลอดภัยของ "ทุก hop" ไม่ใช่แค่ URL แรก
    let response: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const unsafe = await assertSafeTarget(target);
      if (unsafe) return NextResponse.json({ error: unsafe }, { status: 400 });

      const res = await fetch(target.toString(), { redirect: 'manual' });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
        try {
          target = new URL(location, target);
        } catch {
          return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
        }
        continue;
      }
      response = res;
      break;
    }

    if (!response) {
      return NextResponse.json({ error: 'Too many redirects' }, { status: 502 });
    }
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status });
    }

    // ต้องเป็นรูปจริง — หน้า login/HTML ของปลายทางห้าม echo ผ่าน origin เรา
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ error: 'Not an image' }, { status: 415 });
    }

    const imageBuffer = await response.arrayBuffer();
    if (imageBuffer.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

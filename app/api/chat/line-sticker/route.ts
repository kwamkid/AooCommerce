// Path: app/api/chat/line-sticker/route.ts
// เสิร์ฟรูปสติกเกอร์/อีโมจิของ LINE ผ่าน origin ของเราเอง
//
// ทำไมต้องมี: ของเดิม `<img>` ชี้ `stickershop.line-scdn.net` ตรง ๆ ⇒ รูปจะขึ้นหรือไม่
// ขึ้นอยู่กับ "เน็ตของคนเปิดหน้าจอ" ล้วน ๆ — เครื่องที่โดน DNS ของ ISP บล็อก / มีตัวบล็อก
// โฆษณา / อยู่หลังไฟร์วอลล์ จะเห็นรูปแตกทั้งหน้าโดยที่โค้ดกับ CDN ไม่มีอะไรผิดเลย
// (เจ้าของร้านเปิดได้ แต่แอดมินเปิดไม่ได้ — 9 ก.ย. 2026)
//
// ไม่ต้องล็อกอิน: id ของสติกเกอร์เป็นค่าสาธารณะ ไม่มีข้อมูลของร้านหรือของลูกค้าเลย
// และ **ไม่ใช่ open proxy** — เรารับแค่ id/ชื่อไฟล์แล้วประกอบ URL ปลายทางเองบนโฮสต์
// ที่ hardcode ไว้ ผู้เรียกกำหนดปลายทางไม่ได้ (ต่างจาก /api/image-proxy ที่รับ URL เต็ม)
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const CDN = 'https://stickershop.line-scdn.net';
const MAX_BYTES = 4 * 1024 * 1024;

// รูปสติกเกอร์ของ LINE ไม่เคยเปลี่ยนเนื้อในภายหลัง — แคชยาวได้เต็มที่
const HIT_CACHE = 'public, max-age=604800, s-maxage=31536000, immutable';
// ไม่เจอก็ต้องแคชสั้น ๆ ไม่งั้น id ที่ไม่มีจริงจะปลุกฟังก์ชันใหม่ทุกครั้งที่ทุกคนเปิดหน้า
const MISS_CACHE = 'public, max-age=600, s-maxage=3600';

function fail(status: number) {
  return new NextResponse(null, { status, headers: { 'Cache-Control': MISS_CACHE } });
}

/** ลองตามลำดับเดิมที่ฝั่งจอเคยไล่ผ่าน onError — ย้ายมาทำฝั่งเซิร์ฟเวอร์ให้จบในคำขอเดียว */
function candidatesFor(params: URLSearchParams): string[] | null {
  const id = params.get('id');
  if (id) {
    if (!/^\d{1,20}$/.test(id)) return null;
    return [
      `${CDN}/stickershop/v1/sticker/${id}/iPhone/sticker@2x.png`,
      `${CDN}/stickershop/v1/sticker/${id}/iPhone/sticker.png`,
      `${CDN}/stickershop/v1/sticker/${id}/android/sticker.png`,
    ];
  }

  const product = params.get('product');
  const emoji = params.get('emoji');
  if (product && emoji) {
    if (!/^[A-Za-z0-9]{1,64}$/.test(product)) return null;
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(emoji)) return null;
    return [`${CDN}/sticonshop/v1/sticon/${product}/android/${emoji}.png`];
  }

  return null;
}

export async function GET(request: NextRequest) {
  const candidates = candidatesFor(request.nextUrl.searchParams);
  if (!candidates) return fail(400);

  for (const url of candidates) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      continue;
    }
    if (!res.ok) continue;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) continue;

    const body = await res.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_BYTES) continue;

    return new NextResponse(body, {
      headers: { 'Content-Type': contentType, 'Cache-Control': HIT_CACHE },
    });
  }

  return fail(404);
}

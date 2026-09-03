// Path: app/api/auth/persist-session/route.ts
//
// ต่ออายุ "คุกกี้ session" ด้วยการให้ **เซิร์ฟเวอร์** เขียนทับ ไม่ใช่ JavaScript
//
// ปัญหา: Safari (ITP) **บีบอายุคุกกี้ที่ถูกเขียนด้วย `document.cookie` เหลือ 7 วัน**
// ไม่ว่าจะสั่ง Max-Age ไว้เท่าไหร่ · @supabase/ssr ฝั่งเบราว์เซอร์เขียนคุกกี้แบบนั้น
// (สั่ง 400 วัน แต่ Safari ให้จริง 7 วัน) → ผู้ใช้ iPhone ที่ไม่ได้เปิดแอปเกินสัปดาห์
// กลับมาเจอหน้า login ทุกครั้ง และในแอปที่ติดตั้ง (PWA) เจ็บกว่าเพราะมีถังคุกกี้
// ของตัวเอง แยกจาก Safari — ล็อกอินใน Safari ไว้ก็ไม่ช่วย
//
// คุกกี้ที่มาจาก `Set-Cookie` ของเซิร์ฟเวอร์ (first-party) **ไม่โดนเพดาน 7 วันนั้น**
// route นี้จึงแค่อ่านคุกกี้ชุดเดิมจาก request แล้วเขียนกลับด้วยค่าเดิมเป๊ะ + อายุยาว
// — ไม่แตะ token ไม่ยิง Supabase ไม่มี network call
//
// เรียกจาก lib/auth/session-manager.ts ทุกครั้งที่ SDK เขียนคุกกี้ใหม่
// (SIGNED_IN / TOKEN_REFRESHED) เพื่อให้ "คนเขียนคนสุดท้าย" เป็นเซิร์ฟเวอร์เสมอ
import { NextRequest, NextResponse } from 'next/server';

// ตรงกับ DEFAULT_COOKIE_OPTIONS.maxAge ของ @supabase/ssr (400 วัน = เพดานของ Chrome)
const MAX_AGE = 400 * 24 * 60 * 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
function authCookieBase(): string {
  return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;
}

export async function POST(request: NextRequest) {
  const base = authCookieBase();
  const res = NextResponse.json({ ok: true });

  let renewed = 0;
  for (const cookie of request.cookies.getAll()) {
    // ตัวเต็มหรือ chunk (`.0`, `.1`, …) — ต้องต่ออายุครบทุกชิ้น ขาดชิ้นเดียว session พัง
    if (cookie.name !== base && !cookie.name.startsWith(`${base}.`)) continue;
    res.cookies.set({
      name: cookie.name,
      value: cookie.value,
      // ต้องตรงกับที่ฝั่งเบราว์เซอร์ตั้งไว้ทุกช่อง ไม่งั้นได้คุกกี้ซ้อนสองใบ
      // httpOnly: false เพราะ SDK ฝั่งเบราว์เซอร์ต้องอ่าน/เขียนคุกกี้นี้เองต่อ
      path: '/',
      sameSite: 'lax',
      httpOnly: false,
      secure: request.nextUrl.protocol === 'https:',
      maxAge: MAX_AGE,
    });
    renewed++;
  }

  // ยังไม่ได้ล็อกอิน (หรือคุกกี้หายไปแล้ว) — ไม่ใช่ error ของใคร แค่ไม่มีอะไรให้ต่ออายุ
  if (renewed === 0) return new NextResponse(null, { status: 204 });
  return res;
}

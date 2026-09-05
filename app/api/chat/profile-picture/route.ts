import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SECRET_KEY!)
);

// In-memory cache for chat account credentials (avoids DB lookup per profile picture)
const credentialsCache = new Map<string, { credentials: Record<string, string>; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getCachedCredentials(accountId: string): Promise<Record<string, string> | null> {
  const cached = credentialsCache.get(accountId);
  if (cached && cached.expiresAt > Date.now()) return cached.credentials;

  const { data } = await supabaseAdmin
    .from('chat_accounts')
    .select('credentials')
    .eq('id', accountId)
    .single();

  if (!data?.credentials) return null;
  credentialsCache.set(accountId, { credentials: data.credentials as Record<string, string>, expiresAt: Date.now() + CACHE_TTL_MS });
  return data.credentials as Record<string, string>;
}

// Proxy for FB/IG/LINE customer profile pictures — avoids CDN URL expiry
// Usage: /api/chat/profile-picture?platform=facebook&psid=XXX&account_id=YYY
//    or: /api/chat/profile-picture?platform=line&uid=XXX&account_id=YYY
//
// ⚠️ `s-maxage` คือสิ่งเดียวที่ทำให้ edge cache ของ Vercel ยอมเก็บ response ของ function ไว้
// — cache key คือ URL เต็ม (psid + account_id) ดังนั้นดึงครั้งเดียวเสิร์ฟได้ทั้งร้านทั้งวัน
// ของเดิมมีแต่ `max-age` (แคชในเบราว์เซอร์ของแต่ละคน) → เปิดรายชื่อแชท 1 ครั้ง = ปลุกฟังก์ชัน
// 1 ครั้ง + ยิง Graph API 2 ครั้ง **ต่อผู้ติดต่อ FB หนึ่งคน ต่อผู้ใช้หนึ่งคน**
const IMAGE_CACHE = 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800';
// ไม่มีรูป/ไม่มี token/ปลายทางล่ม — ต้องแคชด้วย ไม่งั้นผู้ติดต่อที่ไม่มีรูปจะปลุกฟังก์ชันใหม่
// ทุกครั้งที่ทุกคนเปิดหน้า · สั้นกว่าขามีรูปเพราะรูปอาจถูกเพิ่มทีหลัง
const EMPTY_CACHE = 'public, max-age=600, s-maxage=3600';

/** 204 = ไม่มีรูปให้ (UI แสดง avatar ตัวอักษรแทน) */
function noPicture() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': EMPTY_CACHE } });
}
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform');
  const accountId = searchParams.get('account_id');
  // FB/IG use psid, LINE uses uid
  const psid = searchParams.get('psid');
  const uid = searchParams.get('uid');

  const userId = psid || uid;
  if (!userId || !accountId) {
    return noPicture();
  }

  // Get access token from cache or DB
  const credentials = await getCachedCredentials(accountId);
  if (!credentials) {
    return noPicture();
  }

  try {
    let imageUrl: string | null = null;

    if (platform === 'line') {
      const accessToken = credentials.channel_access_token;
      if (!accessToken) return noPicture();

      const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        imageUrl = data.pictureUrl || null;
      }
    } else if (platform === 'instagram') {
      const accessToken = credentials.page_access_token;
      if (!accessToken) return noPicture();

      const res = await fetch(
        `https://graph.facebook.com/v21.0/${userId}?fields=profile_pic&access_token=${accessToken}`
      );
      if (res.ok) {
        const data = await res.json();
        imageUrl = data.profile_pic || null;
      }
    } else {
      // Facebook Messenger
      const accessToken = credentials.page_access_token;
      if (!accessToken) return noPicture();

      imageUrl = `https://graph.facebook.com/v21.0/${userId}/picture?type=normal&access_token=${accessToken}`;
    }

    if (!imageUrl) return noPicture();

    // Fetch actual image and pipe through with cache headers
    const imgRes = await fetch(imageUrl, { redirect: 'follow' });
    if (!imgRes.ok) return noPicture();

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const body = await imgRes.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': IMAGE_CACHE,
      },
    });
  } catch {
    return noPicture();
  }
}

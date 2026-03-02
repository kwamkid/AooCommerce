import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Proxy for FB/IG/LINE customer profile pictures — avoids CDN URL expiry
// Usage: /api/chat/profile-picture?platform=facebook&psid=XXX&account_id=YYY
//    or: /api/chat/profile-picture?platform=line&uid=XXX&account_id=YYY
// Returns the image directly with cache headers (browser caches 1h)
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const platform = searchParams.get('platform');
  const accountId = searchParams.get('account_id');
  // FB/IG use psid, LINE uses uid
  const psid = searchParams.get('psid');
  const uid = searchParams.get('uid');

  const userId = psid || uid;
  if (!userId || !accountId) {
    return new NextResponse(null, { status: 204 });
  }

  // Get access token from chat_accounts
  const { data: account } = await supabaseAdmin
    .from('chat_accounts')
    .select('credentials')
    .eq('id', accountId)
    .single();

  if (!account?.credentials) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    let imageUrl: string | null = null;

    if (platform === 'line') {
      const accessToken = account.credentials.channel_access_token as string;
      if (!accessToken) return new NextResponse(null, { status: 204 });

      const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        imageUrl = data.pictureUrl || null;
      }
    } else if (platform === 'instagram') {
      const accessToken = account.credentials.page_access_token as string;
      if (!accessToken) return new NextResponse(null, { status: 204 });

      const res = await fetch(
        `https://graph.facebook.com/v21.0/${userId}?fields=profile_pic&access_token=${accessToken}`
      );
      if (res.ok) {
        const data = await res.json();
        imageUrl = data.profile_pic || null;
      }
    } else {
      // Facebook Messenger
      const accessToken = account.credentials.page_access_token as string;
      if (!accessToken) return new NextResponse(null, { status: 204 });

      imageUrl = `https://graph.facebook.com/v21.0/${userId}/picture?type=normal&access_token=${accessToken}`;
    }

    if (!imageUrl) return new NextResponse(null, { status: 204 });

    // Fetch actual image and pipe through with cache headers
    const imgRes = await fetch(imageUrl, { redirect: 'follow' });
    if (!imgRes.ok) return new NextResponse(null, { status: 204 });

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    const body = await imgRes.arrayBuffer();

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}

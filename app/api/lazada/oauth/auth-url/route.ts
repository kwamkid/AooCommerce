import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { generateLazadaAuthUrl, isChatAppConfigured, type LazadaApp } from '@/lib/lazada/api';
import { signOAuthState } from '@/lib/oauth-state';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles, userId } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !userId || !can(companyRoles, 'marketplace.connect')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!process.env.LAZADA_APP_KEY || !process.env.LAZADA_APP_SECRET) {
      return NextResponse.json({ error: 'Lazada not configured' }, { status: 500 });
    }

    // ?app=chat = ขาแชท (มีเฉพาะเมื่อตั้ง LAZADA_CHAT_APP_* แยก — ไม่ตั้ง =
    // token หลักใช้แชทได้เลย ไม่มีขาที่สอง) — ผู้ใช้เลือกเชื่อมเองจาก dialog
    // หลังเชื่อมร้าน หรือปุ่มในหน้าช่องทางแชท
    const app: LazadaApp = new URL(request.url).searchParams.get('app') === 'chat' ? 'chat' : 'main';
    if (app === 'chat' && !isChatAppConfigured()) {
      return NextResponse.json({ error: 'Lazada chat app not configured' }, { status: 400 });
    }

    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUri = `${protocol}://${host}/api/lazada/oauth/callback`;

    // Signed, user-bound, expiring state — callback verifies this + the session
    const state = app === 'chat'
      ? signOAuthState({ companyId, userId, platform: 'lazada', app: 'chat' })
      : signOAuthState({ companyId, userId, platform: 'lazada' });
    const url = generateLazadaAuthUrl(redirectUri, state, app);

    const response = NextResponse.json({ url });
    response.cookies.set('lazada_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Lazada auth URL error:', error);
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
  }
}

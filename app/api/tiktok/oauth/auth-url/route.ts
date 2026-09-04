import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { generateAuthUrl, isChatAppConfigured, type TikTokApp } from '@/lib/tiktok/api';
import { signOAuthState } from '@/lib/oauth-state';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles, userId } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !userId || !can(companyRoles, 'marketplace.connect')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appKey = process.env.TIKTOK_SHOP_APP_KEY;
    const appSecret = process.env.TIKTOK_SHOP_APP_SECRET;
    if (!appKey || !appSecret) {
      return NextResponse.json({ error: 'TikTok not configured' }, { status: 500 });
    }

    // ?app=chat = ขาแชท (app หมวด Customer Support แยกจาก app ออเดอร์) —
    // ผู้ใช้เลือกเชื่อมเองจาก dialog หลังเชื่อมร้าน หรือปุ่มในหน้าช่องทางแชท
    const app: TikTokApp = new URL(request.url).searchParams.get('app') === 'chat' ? 'chat' : 'order';
    if (app === 'chat' && !isChatAppConfigured()) {
      return NextResponse.json({ error: 'TikTok chat app not configured' }, { status: 400 });
    }

    // Signed, user-bound, expiring state (not the raw companyId).
    const state = signOAuthState({ companyId, userId, platform: 'tiktok', app });
    const url = generateAuthUrl(state, app);
    console.log('[TikTok OAuth] Generated auth URL');

    // Backup the signed state in a cookie for the callback.
    const response = NextResponse.json({ url });
    response.cookies.set('tiktok_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('TikTok auth URL error:', error);
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
  }
}

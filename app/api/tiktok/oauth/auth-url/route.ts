import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { generateAuthUrl } from '@/lib/tiktok/api';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const appKey = process.env.TIKTOK_APP_KEY;
    const appSecret = process.env.TIKTOK_APP_SECRET;
    if (!appKey || !appSecret) {
      return NextResponse.json({ error: 'TikTok not configured' }, { status: 500 });
    }

    const url = generateAuthUrl(companyId);
    console.log('[TikTok OAuth] Generated auth URL');

    // Store companyId in cookie for callback
    const response = NextResponse.json({ url });
    response.cookies.set('tiktok_company_id', companyId, {
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

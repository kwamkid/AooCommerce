import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { generateAuthUrl } from '@/lib/shopee/api';
import { signOAuthState } from '@/lib/oauth-state';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles, userId } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !userId || !can(companyRoles, 'marketplace.connect')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const partnerId = process.env.SHOPEE_PARTNER_ID;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY;
    if (!partnerId || !partnerKey) {
      return NextResponse.json({ error: 'Shopee not configured' }, { status: 500 });
    }

    // Build redirect URL
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUrl = `${protocol}://${host}/api/shopee/oauth/callback`;

    // Signed, user-bound, expiring state (not the raw companyId) — the callback
    // verifies this + the completing session before attaching any shop.
    const state = signOAuthState({ companyId, userId, platform: 'shopee' });
    const url = generateAuthUrl(redirectUrl, state);
    console.log('[Shopee OAuth] Generated auth URL, redirect:', redirectUrl);

    // Backup the signed state in a cookie (Shopee doesn't reliably forward state).
    const response = NextResponse.json({ url });
    response.cookies.set('shopee_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600, // 10 minutes — enough for OAuth flow
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Shopee auth URL error:', error);
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
  }
}

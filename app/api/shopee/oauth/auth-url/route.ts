import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { generateAuthUrl } from '@/lib/shopee-api';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRole)) {
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

    const url = generateAuthUrl(redirectUrl, companyId);
    console.log('[Shopee OAuth] Generated auth URL, redirect:', redirectUrl);

    // Store companyId in cookie (Shopee doesn't reliably forward state param)
    const response = NextResponse.json({ url });
    response.cookies.set('shopee_company_id', companyId, {
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

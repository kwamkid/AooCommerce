import { checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// POST - Exchange short-lived FB token for long-lived token and return pages
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { shortLivedToken } = await request.json();
    if (!shortLivedToken) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      return NextResponse.json({ error: 'Facebook OAuth not configured' }, { status: 500 });
    }

    // Exchange short-lived token for long-lived user token
    const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
    const exchangeRes = await fetch(exchangeUrl);
    if (!exchangeRes.ok) {
      const err = await exchangeRes.json();
      return NextResponse.json(
        { error: err.error?.message || 'Token exchange failed' },
        { status: 400 }
      );
    }
    const { access_token: longLivedToken } = await exchangeRes.json();

    // Fetch ALL user's managed pages (with pagination) + Instagram business account info
    const allPages: Record<string, unknown>[] = [];
    let nextUrl: string | null = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,picture,instagram_business_account&limit=100&access_token=${longLivedToken}`;

    while (nextUrl) {
      const pagesRes: Response = await fetch(nextUrl);
      if (!pagesRes.ok) {
        const err = await pagesRes.json();
        return NextResponse.json(
          { error: err.error?.message || 'Failed to fetch pages' },
          { status: 400 }
        );
      }
      const pagesData = await pagesRes.json();
      allPages.push(...(pagesData.data || []));
      nextUrl = pagesData.paging?.next || null;
    }

    console.log(`FB OAuth: fetched ${allPages.length} pages`);

    // Page tokens from long-lived user token are already long-lived (non-expiring)
    // Also fetch IG profile for pages that have instagram_business_account
    const pages = await Promise.all(allPages.map(async (page) => {
      const igAccount = page.instagram_business_account as Record<string, string> | undefined;
      let igInfo: { id: string; name: string; profile_picture_url: string } | null = null;

      if (igAccount?.id) {
        try {
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${igAccount.id}?fields=id,name,username,profile_picture_url&access_token=${page.access_token}`
          );
          if (igRes.ok) {
            const igData = await igRes.json();
            igInfo = {
              id: igData.id,
              name: igData.username || igData.name || '',
              profile_picture_url: igData.profile_picture_url || '',
            };
          }
        } catch {
          // Non-critical, skip IG info
        }
      }

      return {
        id: page.id,
        name: page.name,
        access_token: page.access_token,
        picture_url: (page.picture as Record<string, Record<string, string>> | undefined)?.data?.url || null,
        instagram: igInfo,
      };
    }));

    return NextResponse.json({ pages });
  } catch (error) {
    console.error('FB OAuth exchange error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

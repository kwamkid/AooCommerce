import { checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// POST - Subscribe a page to the app's webhook (Messenger + IG)
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRole)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { pageId, pageAccessToken } = await request.json();
    if (!pageId || !pageAccessToken) {
      return NextResponse.json({ error: 'pageId and pageAccessToken are required' }, { status: 400 });
    }

    // Subscribe the page to the app's webhook for messages
    const subscribeUrl = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`;
    const subscribeRes = await fetch(subscribeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: pageAccessToken,
        subscribed_fields: 'messages,messaging_postbacks',
      }),
    });

    if (!subscribeRes.ok) {
      const err = await subscribeRes.json();
      return NextResponse.json(
        { error: err.error?.message || 'Failed to subscribe webhook' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('FB webhook subscribe error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

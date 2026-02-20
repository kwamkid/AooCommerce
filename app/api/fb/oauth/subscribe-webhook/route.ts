import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

const SUBSCRIBED_FIELDS = 'messages,messaging_postbacks,message_echoes';

// POST - Subscribe a page to the app's webhook (Messenger + IG)
// Body: { pageId, pageAccessToken } — single page
// Body: { resubscribeAll: true } — re-subscribe all FB pages for this company
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Re-subscribe all existing FB pages for this company
    if (body.resubscribeAll) {
      const { data: accounts } = await supabaseAdmin
        .from('chat_accounts')
        .select('id, credentials')
        .eq('company_id', companyId)
        .eq('platform', 'facebook')
        .eq('is_active', true);

      if (!accounts || accounts.length === 0) {
        return NextResponse.json({ success: true, updated: 0 });
      }

      let successCount = 0;
      for (const acc of accounts) {
        const creds = acc.credentials as Record<string, string>;
        const pageId = creds?.page_id;
        const pageAccessToken = creds?.page_access_token;
        if (!pageId || !pageAccessToken) continue;

        try {
          const res = await fetch(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: pageAccessToken, subscribed_fields: SUBSCRIBED_FIELDS }),
          });
          const resBody = await res.json().catch(() => ({}));
          console.log(`FB subscribe pageId=${pageId}: status=${res.status}`, resBody);
          if (res.ok) successCount++;
        } catch (e) { console.error(`FB subscribe error for pageId=${pageId}:`, e); }
      }

      return NextResponse.json({ success: true, updated: successCount, total: accounts.length });
    }

    // Single page subscribe
    const { pageId, pageAccessToken } = body;
    if (!pageId || !pageAccessToken) {
      return NextResponse.json({ error: 'pageId and pageAccessToken are required' }, { status: 400 });
    }

    const subscribeUrl = `https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`;
    const subscribeRes = await fetch(subscribeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: pageAccessToken, subscribed_fields: SUBSCRIBED_FIELDS }),
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

import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// messaging_referrals = ลูกค้าที่ทักมาจากโฆษณา (Click-to-Messenger) / ลิงก์ m.me?ref= — เพจที่มีแชทค้างอยู่แล้ว
// Meta ส่ง referral มาเป็น event แยกซึ่งต้อง subscribe ฟิลด์นี้ ไม่งั้นไม่ได้เลย (ตรวจ 9 ก.ย. 2026: ทั้ง 9 เพจ
// ไม่มีฟิลด์นี้ → fb_contacts ไม่เคยมี referral จากโฆษณาสักราย ทั้งที่ webhook/หน้าแชทรองรับอยู่แล้ว)
// ⚠️ เพิ่มฟิลด์ที่นี่แล้วต้องกด "subscribe ใหม่ทุกเพจ" ในหน้าช่องทางแชท หรือรัน resubscribeAll — เพจเดิมไม่อัปเดตเอง
const SUBSCRIBED_FIELDS = 'messages,messaging_postbacks,message_echoes,messaging_referrals';

// POST - Subscribe a page to the app's webhook (Messenger + IG)
// Body: { pageId, pageAccessToken } — single page
// Body: { resubscribeAll: true } — re-subscribe all FB pages for this company
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth || !companyId || !can(auth, 'masterdata.chat_channels')) {
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

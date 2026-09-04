import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { generateAuthUrl, isSellerAppConfigured, type ShopeeApp } from '@/lib/shopee/api';
import { signOAuthState } from '@/lib/oauth-state';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles, userId } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !userId || !can(companyRoles, 'marketplace.connect')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ?check=1 = หน้า settings ถามเฉย ๆ ว่าจะโชว์ปุ่ม "เชื่อมผ่าน app ของร้าน" ไหม
    // ไม่ตั้ง env = ซ่อนปุ่มไปเลย ดีกว่าให้กดแล้วเด้ง error · ตอบอย่างเดียว
    // ไม่ปั๊ม state/cookie (ยังไม่ใช่การเริ่ม OAuth จริง)
    const params = new URL(request.url).searchParams;
    if (params.get('check') === '1') {
      return NextResponse.json({ available: isSellerAppConfigured() });
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
    // ?app=seller = เชื่อมผ่าน app ที่จดในนามบัญชี seller (Chat API มีเฉพาะ app แบบนี้)
    // ต้องฝังไว้ใน state ด้วย เพราะ callback ต้องแลก token ด้วย app ตัวเดียวกัน
    // — แลกผิด app = ลายเซ็นไม่ผ่านตั้งแต่ก้าวแรก
    const app: ShopeeApp = params.get('app') === 'seller' ? 'seller' : 'partner';
    if (app === 'seller' && !isSellerAppConfigured()) {
      return NextResponse.json({ error: 'ยังไม่ได้ตั้งค่า app แบบ seller (SHOPEE_SELLER_PARTNER_ID/KEY)' }, { status: 400 });
    }

    // state ใช้คำว่า 'seller' เฉพาะขา seller — ขาปกติไม่ต้องใส่ (undefined = ขาหลัก)
    const state = signOAuthState({
      companyId, userId, platform: 'shopee',
      ...(app === 'seller' ? { app: 'seller' as const } : {}),
    });
    const url = generateAuthUrl(redirectUrl, state, app);
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

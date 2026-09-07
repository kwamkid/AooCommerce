import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { generateAuthUrl, resolveAppKeys, type ShopeeApp } from '@/lib/shopee/api';
import { getCompanyShopeeApp } from '@/lib/shopee/app-credentials';
import { signOAuthState } from '@/lib/oauth-state';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId, userId } = auth;
    if (!isAuth || !companyId || !userId || !can(auth, 'marketplace.connect')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = new URL(request.url).searchParams;
    // ?app=seller = เชื่อมผ่าน app ที่จดในนามบัญชี seller ของบริษัทนี้ (Chat API มีเฉพาะ app แบบนี้)
    // ต้องฝังไว้ใน state ด้วย เพราะ callback ต้องแลก token ด้วย app ตัวเดียวกัน
    // — แลกผิด app = ลายเซ็นไม่ผ่านตั้งแต่ก้าวแรก
    const app: ShopeeApp = params.get('app') === 'seller' ? 'seller' : 'partner';

    // ?check=1 = หน้า settings ถามเฉย ๆ ว่าจะโชว์ปุ่ม "เชื่อมผ่าน app ของร้าน" ไหม
    // ตอบอย่างเดียว ไม่ปั๊ม state/cookie (ยังไม่ใช่การเริ่ม OAuth จริง)
    if (params.get('check') === '1') {
      // app แบบ seller เป็น "ของบริษัท" — ตอบตามบริษัทที่ผู้ใช้อยู่ ไม่ใช่ตาม env ของ server
      // env บอกด้วยว่าปุ่มจะพาไปที่ไหน (sandbox/production) ผู้ใช้จะได้ไม่เอาบัญชี
      // sandbox ไป login หน้า production (หรือกลับกัน)
      const sellerApp = await getCompanyShopeeApp(companyId, 'seller');
      return NextResponse.json({
        available: !!sellerApp,
        env: sellerApp?.env || 'production',
        // full = app ของบริษัทเป็นทางเข้าหลัก ⇒ หน้าเชื่อมร้านต้องชูปุ่มนี้เป็นตัวหลัก
        usage: sellerApp?.usage || null,
        source: sellerApp ? sellerApp.source : null,
      });
    }

    const keys = await resolveAppKeys(app, companyId);
    if (!keys) {
      return app === 'seller'
        ? NextResponse.json({
            error: 'บริษัทนี้ยังไม่ได้เพิ่ม app ของร้าน (Shopee Seller In House) — ไปเพิ่มที่ ตั้งค่า > ช่องทางแชท > Shopee ก่อน',
          }, { status: 400 })
        : NextResponse.json({ error: 'Shopee not configured' }, { status: 500 });
    }

    // Build redirect URL
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const redirectUrl = `${protocol}://${host}/api/shopee/oauth/callback`;

    // Signed, user-bound, expiring state (not the raw companyId) — the callback
    // verifies this + the completing session before attaching any shop.
    // state ใช้คำว่า 'seller' เฉพาะขา seller — ขาปกติไม่ต้องใส่ (undefined = ขาหลัก)
    const state = signOAuthState({
      companyId, userId, platform: 'shopee',
      ...(app === 'seller' ? { app: 'seller' as const } : {}),
    });
    const url = generateAuthUrl(redirectUrl, state, app, keys);
    console.log('[Shopee OAuth] Generated auth URL, app:', app, 'redirect:', redirectUrl);

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

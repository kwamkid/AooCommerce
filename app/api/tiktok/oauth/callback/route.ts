import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  exchangeCodeForToken, getAuthorizedShops, generateAuthUrl,
  isChatAppConfigured, type TikTokApp,
} from '@/lib/tiktok/api';
import { authorizeMarketplaceCallback, signOAuthState } from '@/lib/oauth-state';

/**
 * TikTok OAuth callback — ปลายทางร่วมของ **สอง** app
 *
 * แชท TikTok ต้องใช้ app หมวด Customer Support (scope seller.customer_service
 * มีเฉพาะหมวดนั้น และหมวดแก้ทีหลังไม่ได้) ส่วนออเดอร์อยู่ app หมวด Order
 * Management ที่ใช้งานจริงอยู่แล้ว — จะรวมเป็น app เดียวต้องรื้อของที่ approved
 * แล้วมายื่นใหม่ทั้งชุด ซึ่งเสี่ยงกว่ามาก
 *
 * ผู้ใช้ต้องไม่รับรู้เรื่องนี้: กดเชื่อมร้านครั้งเดียวแล้วได้ทั้งออเดอร์และแชท
 * จึงต่อขาให้เอง — จบขาออเดอร์แล้ว redirect เข้าขาแชททันที ผู้ใช้ยัง login
 * TikTok ค้างอยู่ในเบราว์เซอร์ ขาที่สองจึงเหลือแค่กดยืนยัน ไม่ต้องล็อกอินใหม่
 *
 * ขาแชทล้มไม่กระทบออเดอร์ — ออเดอร์บันทึกเสร็จไปแล้วตั้งแต่ขาแรก
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;
  const settingsUrl = `${baseUrl}/settings/sales-channels?tab=marketplace`;

  // Verify signed state + completing session; companyId from trusted state only.
  const rawState = searchParams.get('state') || request.cookies.get('tiktok_oauth_state')?.value || null;
  const authz = await authorizeMarketplaceCallback(request, rawState);
  if (!authz.ok) {
    console.error('[TikTok Callback] Authorization failed:', authz.reason);
    return NextResponse.redirect(`${settingsUrl}&error=auth_${authz.reason}`);
  }
  const companyId = authz.companyId;
  const app: TikTokApp = authz.payload.app === 'chat' ? 'chat' : 'order';
  const userId = authz.payload.userId;

  console.log('[TikTok Callback] app:', app, 'code:', code ? `${code.substring(0, 10)}...` : null);

  if (!code) {
    console.error('[TikTok Callback] Missing code');
    // ขาแชทไม่มี code (ผู้ใช้กดยกเลิก) — ออเดอร์เชื่อมสำเร็จไปแล้ว ไม่ใช่ error
    return NextResponse.redirect(app === 'chat'
      ? `${settingsUrl}&tiktok=connected&chat=skipped`
      : `${settingsUrl}&error=missing_params`);
  }

  try {
    const tokens = await exchangeCodeForToken(code, app);
    console.log('[TikTok Callback] Token exchange success for', app);

    const now = new Date();
    const accessExpiry = new Date(now.getTime() + tokens.access_token_expire_in * 1000);
    const refreshExpiry = new Date(now.getTime() + tokens.refresh_token_expire_in * 1000);

    let shops: { id: string; name: string; region: string; cipher: string; code: string; seller_type: string }[] = [];
    try {
      shops = await getAuthorizedShops(tokens.access_token, app);
      console.log('[TikTok Callback] Authorized shops:', shops.map(s => ({ id: s.id, name: s.name })));
    } catch (e) {
      console.error('[TikTok Callback] Failed to get shops:', e);
      return NextResponse.redirect(app === 'chat'
        ? `${settingsUrl}&tiktok=connected&chat=failed`
        : `${settingsUrl}&error=no_shops`);
    }

    if (shops.length === 0) {
      console.error('[TikTok Callback] No shops found');
      return NextResponse.redirect(app === 'chat'
        ? `${settingsUrl}&tiktok=connected&chat=failed`
        : `${settingsUrl}&error=no_shops`);
    }

    for (const shop of shops) {
      const shopIdNum = parseInt(shop.id) || 0;

      if (app === 'chat') {
        // ขาแชทเติม token ลงแถวที่ขาออเดอร์สร้างไว้แล้ว — ไม่ upsert
        // เพราะถ้าแถวยังไม่มี แปลว่าขาออเดอร์ล้ม การสร้างแถวที่มีแต่ token แชท
        // จะได้ร้านที่ดูดออเดอร์ไม่ได้ (แย่กว่าไม่มีแถวเลย)
        const { error } = await supabaseAdmin
          .from('marketplace_accounts')
          .update({
            chat_access_token: tokens.access_token,
            chat_refresh_token: tokens.refresh_token,
            chat_access_token_expires_at: accessExpiry.toISOString(),
            chat_refresh_token_expires_at: refreshExpiry.toISOString(),
            updated_at: now.toISOString(),
          })
          .eq('company_id', companyId)
          .eq('platform', 'tiktok')
          .eq('shop_id', shopIdNum);
        if (error) console.error('[TikTok Callback] Chat token update failed for shop', shop.id, ':', error);
        else console.log('[TikTok Callback] Chat enabled for shop:', shop.name);
        continue;
      }

      const { error } = await supabaseAdmin
        .from('marketplace_accounts')
        .upsert({
          company_id: companyId,
          platform: 'tiktok',
          shop_id: shopIdNum,
          shop_name: shop.name,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          access_token_expires_at: accessExpiry.toISOString(),
          refresh_token_expires_at: refreshExpiry.toISOString(),
          is_active: true,
          metadata: {
            shop_cipher: shop.cipher,
            shop_code: shop.code,
            region: shop.region,
            seller_type: shop.seller_type,
            seller_name: tokens.seller_name,
            seller_base_region: tokens.seller_base_region,
            open_id: tokens.open_id,
          },
          updated_at: now.toISOString(),
        }, {
          onConflict: 'company_id,platform,shop_id',
        });

      if (error) {
        console.error('[TikTok Callback] Upsert error for shop', shop.id, ':', error);
        continue;
      }
      console.log('[TikTok Callback] Connected shop:', shop.name, '(', shop.id, ')');
    }

    // ── ขาออเดอร์เสร็จ → ต่อขาแชทให้เลย ──────────────────────────────
    if (app === 'order' && isChatAppConfigured()) {
      const chatState = signOAuthState({ companyId, userId, platform: 'tiktok', app: 'chat' });
      const chatUrl = generateAuthUrl(chatState, 'chat');
      console.log('[TikTok Callback] Chaining to chat app authorization');
      const chained = NextResponse.redirect(chatUrl);
      chained.cookies.set('tiktok_oauth_state', chatState, {
        httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600, path: '/',
      });
      return chained;
    }

    const response = NextResponse.redirect(
      `${settingsUrl}&tiktok=connected${app === 'chat' ? '&chat=connected' : ''}`
    );
    response.cookies.delete('tiktok_oauth_state');

    console.log('[TikTok Callback] Success! app:', app, 'shops:', shops.length);
    return response;
  } catch (err) {
    console.error('[TikTok Callback] Error:', err);
    // ขาแชทล้ม = ออเดอร์ยังใช้ได้ ไม่ควรรายงานว่าเชื่อมร้านไม่สำเร็จ
    return NextResponse.redirect(app === 'chat'
      ? `${settingsUrl}&tiktok=connected&chat=failed`
      : `${settingsUrl}&error=tiktok_auth_failed`);
  }
}

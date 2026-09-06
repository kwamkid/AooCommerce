import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  exchangeCodeForToken, getAuthorizedShops, generateAuthUrl,
  isChatAppConfigured, type TikTokApp,
  tiktokExpiryToDate,
} from '@/lib/tiktok/api';
import { authorizeMarketplaceCallback, signOAuthState } from '@/lib/oauth-state';
import { isLoginKitConfigured } from '@/lib/tiktok/login-kit';

/**
 * TikTok OAuth callback — ปลายทางร่วมของ **สอง** app
 *
 * แชท TikTok ต้องใช้ app หมวด Customer Support (scope seller.customer_service
 * มีเฉพาะหมวดนั้น และหมวดแก้ทีหลังไม่ได้) ส่วนออเดอร์อยู่ app หมวด Order
 * Management ที่ใช้งานจริงอยู่แล้ว — จะรวมเป็น app เดียวต้องรื้อของที่ approved
 * แล้วมายื่นใหม่ทั้งชุด ซึ่งเสี่ยงกว่ามาก
 *
 * **จบขาออเดอร์แล้วพาไปอนุญาตแชทต่อทันที** (เหมือน Lazada · แก้ 2026-09-02)
 * ไม่มี dialog ถามคั่น — บังคับสองรอบอยู่แล้ว ถามเพิ่มก็ไม่ได้ทางเลือกใหม่
 * (ยกเลิกที่หน้า TikTok ได้ผลเดียวกัน) · ต่อเฉพาะเมื่อยังมีร้านที่ไม่มี token แชท
 * ขาแชทจบที่หน้า ช่องทางแชท (ยกเลิก = `skipped` ไม่ใช่ error)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;
  const settingsUrl = `${baseUrl}/settings/sales-channels?tab=marketplace`;
  // ขาแชทจบที่หน้าช่องทางแชท — ขั้นถัดไปของผู้ใช้ (เปิดสวิตช์รับแชท) อยู่ที่นั่น
  const chatSettingsUrl = (result: string) =>
    `${baseUrl}/settings/chat-channels?tiktok_chat=${result}#tiktok`;

  // Verify signed state + completing session; companyId from trusted state only.
  const rawState = searchParams.get('state') || request.cookies.get('tiktok_oauth_state')?.value || null;
  const authz = await authorizeMarketplaceCallback(request, rawState);
  if (!authz.ok) {
    console.error('[TikTok Callback] Authorization failed:', authz.reason);
    return NextResponse.redirect(`${settingsUrl}&error=auth_${authz.reason}`);
  }
  const companyId = authz.companyId;
  const app: TikTokApp = authz.payload.app === 'chat' ? 'chat' : 'order';

  console.log('[TikTok Callback] app:', app, 'code:', code ? `${code.substring(0, 10)}...` : null);

  if (!code) {
    console.error('[TikTok Callback] Missing code');
    // ขาแชทไม่มี code (ผู้ใช้กดยกเลิก) — ไม่ใช่ error
    return NextResponse.redirect(app === 'chat'
      ? chatSettingsUrl('skipped')
      : `${settingsUrl}&error=missing_params`);
  }

  try {
    const tokens = await exchangeCodeForToken(code, app);
    console.log('[TikTok Callback] Token exchange success for', app);

    const now = new Date();
    // TikTok ส่ง expire_in เป็น unix วินาที (สัมบูรณ์) — ดู tiktokExpiryToDate
    const accessExpiry = tiktokExpiryToDate(tokens.access_token_expire_in, now);
    const refreshExpiry = tiktokExpiryToDate(tokens.refresh_token_expire_in, now);

    let shops: { id: string; name: string; region: string; cipher: string; code: string; seller_type: string }[] = [];
    try {
      shops = await getAuthorizedShops(tokens.access_token, app);
      console.log('[TikTok Callback] Authorized shops:', shops.map(s => ({ id: s.id, name: s.name })));
    } catch (e) {
      console.error('[TikTok Callback] Failed to get shops:', e);
      return NextResponse.redirect(app === 'chat'
        ? chatSettingsUrl('failed')
        : `${settingsUrl}&error=no_shops`);
    }

    if (shops.length === 0) {
      console.error('[TikTok Callback] No shops found');
      return NextResponse.redirect(app === 'chat'
        ? chatSettingsUrl('failed')
        : `${settingsUrl}&error=no_shops`);
    }

    // อ่าน metadata เดิมของทุกร้านไว้ก่อน — ต้อง merge ไม่ใช่ทับ
    // (ค่าที่ผู้ใช้ตั้งเองอย่าง shop_logo อยู่ในนั้น และแพลตฟอร์มไม่ได้ส่งกลับมา)
    const existingMeta = new Map<number, Record<string, unknown>>();
    {
      const { data: rows } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('shop_id, metadata')
        .eq('company_id', companyId)
        .eq('platform', 'tiktok');
      for (const r of rows || []) {
        existingMeta.set(r.shop_id as number, (r.metadata || {}) as Record<string, unknown>);
      }
    }

    // ร้านที่เชื่อมสำเร็จ "ในรอบนี้" — ใช้เจาะจงว่าจะชวนตั้งโลโก้ให้ร้านไหนต่อ
    const connectedShopIds: number[] = [];

    for (const shop of shops) {
      const shopIdNum = parseInt(shop.id) || 0;

      if (app === 'chat') {
        // ขาแชทเติม token ลงแถวที่ขาออเดอร์สร้างไว้แล้ว — ไม่ upsert
        // เพราะถ้าแถวยังไม่มี แปลว่าขาออเดอร์ล้ม การสร้างแถวที่มีแต่ token แชท
        // จะได้ร้านที่ดูดออเดอร์ไม่ได้ (แย่กว่าไม่มีแถวเลย)
        const { data: updated, error } = await supabaseAdmin
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
          .eq('shop_id', shopIdNum)
          .select('id');
        // update ที่ไม่ตรงแถวไหนเลยไม่ใช่ error ของ Supabase — ต้องเช็คจำนวนแถวเอง
        // ไม่งั้นจะเงียบแล้วผู้ใช้เห็นว่า "เชื่อมแล้ว" ทั้งที่ token ไม่ได้ลง
        if (error) console.error('[TikTok Callback] Chat token update failed for shop', shop.id, ':', error);
        else if ((updated?.length ?? 0) === 0) console.error('[TikTok Callback] Chat token update matched no row for shop', shop.id, '— order leg may not have run');
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
          // ⚠️ ต้อง merge ของเดิม ไม่ใช่ทับ — ค่าที่ผู้ใช้ตั้งเอง (เช่น shop_logo ที่กรอกมือ
          // เพราะ TikTok ไม่ส่งโลโก้มาให้) จะหายทุกครั้งที่ re-authorize เปิด scope เพิ่ม
          // เกิดจริงเมื่อ 2026-08-29: เปิด scope Finance แล้วโลโก้ร้านหายไปเฉย ๆ
          metadata: {
            ...(existingMeta.get(shopIdNum) || {}),
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
      connectedShopIds.push(shopIdNum);
      console.log('[TikTok Callback] Connected shop:', shop.name, '(', shop.id, ')');
    }

    // ── ขาออเดอร์เสร็จ → พาไปอนุญาตแชทต่อทันที (เหมือน Lazada) ──
    // TikTok บังคับ authorize สองรอบอยู่แล้ว (app หมวด Order Management กับ
    // Customer Support คนละตัว) การเด้งกล่องถามคั่นกลางไม่ได้ให้ทางเลือกอะไรใหม่
    // — กด "ยกเลิก" ที่หน้า TikTok ได้ผลเดียวกัน แต่เพิ่มจังหวะให้ผู้ใช้อีกหนึ่ง
    // ต่อเฉพาะเมื่อ app แชทตั้งค่าไว้ และยังมีร้านที่ไม่มี token แชท
    let chainChat = false;
    if (app === 'order' && isChatAppConfigured()) {
      const { data: pendingChat } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('id')
        .eq('company_id', companyId)
        .eq('platform', 'tiktok')
        .eq('is_active', true)
        .is('chat_access_token', null)
        .limit(1);
      chainChat = !!pendingChat && pendingChat.length > 0;
    }

    // ── ต่อด้วยโลโก้ร้าน ──
    // TikTok Shop ไม่มี API โลโก้ร้าน ต้องดึง avatar ของบัญชีผ่าน Login Kit ซึ่งเป็น
    // OAuth คนละระบบอีกขา · ถ้าไม่ชวนต่อตรงนี้ ผู้ใช้ต้องไปตามหาปุ่มเองทีหลัง
    // ซึ่งแทบไม่มีใครทำ แล้วการ์ดร้านก็เป็นไอคอนเปล่าตลอดไป
    // ⚠️ ต่อขาโลโก้เฉพาะตอน**ไม่ได้**พาไปต่อขาแชท — ไม่งั้นผู้ใช้ต้องกดอนุญาต
    //    รวดเดียว 3 หน้า (ออเดอร์ → แชท → Login Kit) ซึ่งวุ่นวายกว่าเดิม
    //    ร้านที่ข้ามไปยังใส่โลโก้เองได้จากปุ่มบนการ์ด (ตอนนี้มีป้ายให้เห็นชัดแล้ว)
    let logoSuffix = '';
    if (app === 'order' && !chainChat && isLoginKitConfigured() && connectedShopIds.length > 0) {
      // ⚠️ ต้องเจาะจง **ร้านที่เพิ่งเชื่อมในรอบนี้** ไม่ใช่ร้านไหนก็ได้ที่ยังไม่มีโลโก้
      //    ของเดิมหยิบตัวแรกที่เจอ → เชื่อม gb Thailand แล้วไปแปะรูปให้ ABC the Baby
      //    (เกิดจริง 2026-08-30 · ผู้ใช้เจอทันทีในรอบทดสอบแรก)
      const { data: rows } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('id, metadata')
        .eq('company_id', companyId)
        .eq('platform', 'tiktok')
        .in('shop_id', connectedShopIds);
      const target = (rows || []).find(
        a => !((a.metadata || {}) as Record<string, unknown>).shop_logo
      );
      if (target) logoSuffix = `&logo=prompt&logo_account=${target.id}`;
    }

    if (chainChat) {
      const chatState = signOAuthState({
        companyId,
        userId: authz.payload.userId,
        platform: 'tiktok',
        app: 'chat',
      });
      const chained = NextResponse.redirect(generateAuthUrl(chatState, 'chat'));
      chained.cookies.set('tiktok_oauth_state', chatState, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 600,
        path: '/',
      });
      console.log('[TikTok Callback] Order leg done → chaining chat authorization');
      return chained;
    }

    const response = NextResponse.redirect(app === 'chat'
      ? chatSettingsUrl('connected')
      : `${settingsUrl}&tiktok=connected${logoSuffix}`);
    response.cookies.delete('tiktok_oauth_state');

    console.log('[TikTok Callback] Success! app:', app, 'shops:', shops.length);
    return response;
  } catch (err) {
    console.error('[TikTok Callback] Error:', err);
    // ขาแชทล้ม = ออเดอร์ยังใช้ได้ ไม่ควรรายงานว่าเชื่อมร้านไม่สำเร็จ
    return NextResponse.redirect(app === 'chat'
      ? chatSettingsUrl('failed')
      : `${settingsUrl}&error=tiktok_auth_failed`);
  }
}

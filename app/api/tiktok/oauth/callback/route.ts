import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  exchangeCodeForToken, getAuthorizedShops,
  isChatAppConfigured, type TikTokApp,
} from '@/lib/tiktok/api';
import { authorizeMarketplaceCallback } from '@/lib/oauth-state';

/**
 * TikTok OAuth callback — ปลายทางร่วมของ **สอง** app
 *
 * แชท TikTok ต้องใช้ app หมวด Customer Support (scope seller.customer_service
 * มีเฉพาะหมวดนั้น และหมวดแก้ทีหลังไม่ได้) ส่วนออเดอร์อยู่ app หมวด Order
 * Management ที่ใช้งานจริงอยู่แล้ว — จะรวมเป็น app เดียวต้องรื้อของที่ approved
 * แล้วมายื่นใหม่ทั้งชุด ซึ่งเสี่ยงกว่ามาก
 *
 * ขาแชท**ไม่ต่ออัตโนมัติแล้ว** — ผู้ใช้บางคนเชื่อมแชทไว้ก่อนแล้ว บางคนไม่ใช้แชท
 * จบขาออเดอร์จึงกลับหน้า settings พร้อม `chat=prompt` ให้ UI เปิด dialog ถามก่อน
 * (เฉพาะเมื่อยังมีร้านที่ไม่มี token แชท) — ขาแชทเริ่มจาก
 * `/api/tiktok/oauth/auth-url?app=chat` แล้วจบที่หน้า ช่องทางแชท
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
    const accessExpiry = new Date(now.getTime() + tokens.access_token_expire_in * 1000);
    const refreshExpiry = new Date(now.getTime() + tokens.refresh_token_expire_in * 1000);

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
      console.log('[TikTok Callback] Connected shop:', shop.name, '(', shop.id, ')');
    }

    // ── ขาออเดอร์เสร็จ → ถามผู้ใช้ก่อนว่าจะเชื่อมแชทต่อมั้ย (ไม่ต่ออัตโนมัติ) ──
    // chat=prompt เฉพาะเมื่อ app แชทตั้งค่าไว้ และยังมีร้านที่ไม่มี token แชท
    // (คนที่เชื่อมแชทครบแล้วไม่ต้องโดนถามซ้ำ)
    let chatSuffix = '';
    if (app === 'order' && isChatAppConfigured()) {
      const { data: pendingChat } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('id')
        .eq('company_id', companyId)
        .eq('platform', 'tiktok')
        .eq('is_active', true)
        .is('chat_access_token', null)
        .limit(1);
      if (pendingChat && pendingChat.length > 0) chatSuffix = '&chat=prompt';
    }

    const response = NextResponse.redirect(app === 'chat'
      ? chatSettingsUrl('connected')
      : `${settingsUrl}&tiktok=connected${chatSuffix}`);
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

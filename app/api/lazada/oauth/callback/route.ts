import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  exchangeCodeForToken, getSellerInfo, getLazadaAppCredentials,
  isChatAppConfigured, type LazadaApp, type LazadaCredentials,
} from '@/lib/lazada/api';
import { authorizeMarketplaceCallback } from '@/lib/oauth-state';
import { logIntegration } from '@/lib/integration-logger';

/**
 * Lazada OAuth callback — ปลายทางร่วมของ **สอง** app
 *
 * Lazada ให้สิทธิ์เป็น category ต่อความสามารถ (Seller In-house APP = ออเดอร์ ·
 * In-house IM Chat = แชท) และสร้าง app ต่อ category → ถ้าได้ key คนละชุด
 * ต้อง authorize สองรอบ
 *
 * ขาแชท**ไม่ต่ออัตโนมัติแล้ว** (เหมือน TikTok) — บางร้านเชื่อมแชทไว้แล้ว
 * บางร้านไม่ใช้แชท · จบขาออเดอร์กลับหน้า settings พร้อม `chat=prompt` ให้ UI
 * เปิด dialog ถามก่อน (เฉพาะเมื่อยังมีร้านที่ไม่มี token แชท) — ขาแชทเริ่มจาก
 * `/api/lazada/oauth/auth-url?app=chat` แล้วจบที่หน้า ช่องทางแชท
 *
 * ถ้ายังไม่ตั้ง LAZADA_CHAT_APP_* (app เดียวถือทั้งสอง category) ไม่มีขาที่สอง
 * เลย — token ชุดเดียวใช้ได้ทั้งออเดอร์และแชทอยู่แล้ว
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;
  // ขาแชทจบที่หน้าช่องทางแชท — ขั้นถัดไปของผู้ใช้ (เปิดสวิตช์รับแชท) อยู่ที่นั่น
  const chatSettingsUrl = (result: string) =>
    `${baseUrl}/settings/chat-channels?lazada_chat=${result}#lazada`;

  // Verify signed state + completing session — companyId comes only from the
  // trusted state (same pattern as Shopee/TikTok callbacks)
  const rawState = searchParams.get('state') || request.cookies.get('lazada_oauth_state')?.value || null;
  const authz = await authorizeMarketplaceCallback(request, rawState);
  if (!authz.ok) {
    console.error('[Lazada Callback] Authorization failed:', authz.reason);
    return NextResponse.redirect(`${baseUrl}/settings/sales-channels?tab=marketplace&error=auth_${authz.reason}`);
  }
  const companyId = authz.companyId;
  const app: LazadaApp = authz.payload.app === 'chat' ? 'chat' : 'main';
  const settingsUrl = `${baseUrl}/settings/sales-channels?tab=marketplace`;

  if (!code) {
    // ขาแชทไม่มี code (ผู้ใช้กดยกเลิก) — ไม่ใช่ error
    return NextResponse.redirect(app === 'chat'
      ? chatSettingsUrl('skipped')
      : `${settingsUrl}&error=missing_params`);
  }

  try {
    const tokens = await exchangeCodeForToken(code, app);
    const now = Date.now();

    // Seller identity — prefer country_user_info (per-country seller_id)
    const userInfo = tokens.country_user_info?.[0];
    const country = (userInfo?.country || tokens.country || 'th').toLowerCase();
    let sellerId = userInfo?.seller_id ? Number(userInfo.seller_id) : 0;
    let shopName = tokens.account || userInfo?.short_code || null;

    // Enrich with /seller/get (name + seller_id fallback)
    const creds: LazadaCredentials = {
      ...getLazadaAppCredentials(app),
      access_token: tokens.access_token,
      region: country,
    };
    const seller = await getSellerInfo(creds);
    if (seller) {
      shopName = seller.name || shopName;
      if (!sellerId && seller.seller_id) sellerId = seller.seller_id;
    }

    if (!sellerId) {
      console.error('[Lazada Callback] Could not determine seller_id');
      return NextResponse.redirect(app === 'chat'
        ? chatSettingsUrl('failed')
        : `${settingsUrl}&error=no_seller_id`);
    }

    // ── ขาแชท: เติม token ลงแถวที่ขาออเดอร์สร้างไว้แล้ว ไม่ upsert ──────
    // ถ้าแถวยังไม่มีแปลว่าขาออเดอร์ล้ม — สร้างแถวที่มีแต่ token แชทจะได้ร้าน
    // ที่ดูดออเดอร์ไม่ได้ (แย่กว่าไม่มีแถวเลย)
    if (app === 'chat') {
      const { error: chatErr } = await supabaseAdmin
        .from('marketplace_accounts')
        .update({
          chat_access_token: tokens.access_token,
          chat_refresh_token: tokens.refresh_token,
          chat_access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
          chat_refresh_token_expires_at: tokens.refresh_expires_in
            ? new Date(now + tokens.refresh_expires_in * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq('company_id', companyId)
        .eq('platform', 'lazada')
        .eq('shop_id', sellerId);

      if (chatErr) {
        console.error('[Lazada Callback] Chat token update failed:', chatErr);
        return NextResponse.redirect(chatSettingsUrl('failed'));
      }

      logIntegration({
        company_id: companyId,
        integration: 'lazada',
        direction: 'incoming',
        action: 'oauth_chat_connected',
        status: 'success',
        reference_type: 'account',
        reference_id: String(sellerId),
        reference_label: `Lazada chat connected: ${shopName || sellerId}`,
      });

      const done = NextResponse.redirect(chatSettingsUrl('connected'));
      done.cookies.delete('lazada_oauth_state');
      return done;
    }

    const { error } = await supabaseAdmin
      .from('marketplace_accounts')
      .upsert({
        company_id: companyId,
        platform: 'lazada',
        shop_id: sellerId,
        shop_name: shopName,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
        refresh_token_expires_at: tokens.refresh_expires_in
          ? new Date(now + tokens.refresh_expires_in * 1000).toISOString()
          : null,
        is_active: true,
        metadata: {
          country,
          account: tokens.account || null,
          short_code: userInfo?.short_code || seller?.short_code || null,
          user_id: userInfo?.user_id || null,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id,platform,shop_id' })
      .select('id')
      .single();

    if (error) throw error;

    logIntegration({
      company_id: companyId,
      integration: 'lazada',
      direction: 'incoming',
      action: 'oauth_connected',
      status: 'success',
      reference_type: 'account',
      reference_id: String(sellerId),
      reference_label: `Lazada connected: ${shopName || sellerId}`,
    });

    // ── ขาออเดอร์เสร็จ → ถามผู้ใช้ก่อนว่าจะเชื่อมแชทต่อมั้ย (ไม่ต่ออัตโนมัติ) ──
    // chat=prompt เฉพาะเมื่อมี app แชทแยก และยังมีร้านที่ไม่มี token แชท
    // (ไม่มี app แชทแยก = token หลักใช้แชทได้เลย ไม่ต้องถาม)
    let chatSuffix = '';
    if (isChatAppConfigured()) {
      const { data: pendingChat } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('id')
        .eq('company_id', companyId)
        .eq('platform', 'lazada')
        .eq('is_active', true)
        .is('chat_access_token', null)
        .limit(1);
      if (pendingChat && pendingChat.length > 0) chatSuffix = '&chat=prompt';
    }

    const response = NextResponse.redirect(`${settingsUrl}&success=lazada_connected${chatSuffix}`);
    response.cookies.delete('lazada_oauth_state');
    return response;
  } catch (error) {
    console.error('[Lazada Callback] Error:', error);
    // ขาแชทล้ม = ออเดอร์ยังใช้ได้ ไม่ควรรายงานว่าเชื่อมร้านไม่สำเร็จ
    return NextResponse.redirect(app === 'chat'
      ? chatSettingsUrl('failed')
      : `${settingsUrl}&error=lazada_token_exchange`);
  }
}

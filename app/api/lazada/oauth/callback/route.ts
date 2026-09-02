import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  exchangeCodeForToken, getSellerInfo, getLazadaAppCredentials, isReachableImage,
  isChatAppConfigured, generateLazadaAuthUrl, type LazadaApp, type LazadaCredentials,
} from '@/lib/lazada/api';
import { authorizeMarketplaceCallback, signOAuthState } from '@/lib/oauth-state';
import { logIntegration } from '@/lib/integration-logger';

/**
 * Lazada OAuth callback — ปลายทางร่วมของ **สอง** app
 *
 * Lazada ให้สิทธิ์เป็น category ต่อความสามารถ (Seller In-house APP = ออเดอร์ ·
 * In-house IM Chat = แชท) และสร้าง app ต่อ category → ถ้าได้ key คนละชุด
 * ต้อง authorize สองรอบ
 *
 * **จบขาออเดอร์แล้วพาไปอนุญาตแชทต่อทันที** (ไม่มี dialog ถามคั่น) — Lazada
 * บังคับสองรอบอยู่แล้ว การถามเพิ่มอีกจังหวะไม่ได้ให้ทางเลือกที่มีความหมาย
 * เพราะยกเลิกที่หน้า Lazada ก็ได้ผลเดียวกัน · ต่อเฉพาะเมื่อยังมีร้านที่ไม่มี
 * token แชท · ขาแชทจบที่หน้า ช่องทางแชท (ยกเลิก = `skipped` ไม่ใช่ error)
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
      const chatPatch = {
        chat_access_token: tokens.access_token,
        chat_refresh_token: tokens.refresh_token,
        chat_access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
        chat_refresh_token_expires_at: tokens.refresh_expires_in
          ? new Date(now + tokens.refresh_expires_in * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      };

      const { data: updated, error: chatErr } = await supabaseAdmin
        .from('marketplace_accounts')
        .update(chatPatch)
        .eq('company_id', companyId)
        .eq('platform', 'lazada')
        .eq('shop_id', sellerId)
        .select('id');

      // app แชทอาจคืน seller_id คนละชุดกับ app ออเดอร์ → shop_id ไม่ตรง แล้ว
      // update จะ "สำเร็จแบบ 0 แถว" (Supabase ไม่ถือเป็น error) = บอกว่าเชื่อมแล้ว
      // ทั้งที่ไม่มี token ลงจริง — ต้องเช็คจำนวนแถวเสมอ แล้วลองจับด้วย short_code
      // ซึ่งคงที่ต่อผู้ขายและได้จาก /seller/get ของทั้งสอง app
      let matched = updated?.length ?? 0;
      const shortCode = userInfo?.short_code || seller?.short_code || null;
      if (matched === 0 && shortCode) {
        const { data: byCode } = await supabaseAdmin
          .from('marketplace_accounts')
          .update(chatPatch)
          .eq('company_id', companyId)
          .eq('platform', 'lazada')
          .eq('metadata->>short_code', shortCode)
          .select('id');
        matched = byCode?.length ?? 0;
      }

      if (chatErr || matched === 0) {
        console.error('[Lazada Callback] Chat token update failed:', chatErr
          || `no marketplace_accounts row matched (seller_id=${sellerId}, short_code=${shortCode})`);
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

    // โลโก้จาก /seller/get อาจเป็นไฟล์ archive ที่ตายแล้ว — เก็บเฉพาะที่โหลดได้จริง
    // ไม่งั้นคงค่าเดิมของแถวเดิมไว้ (เช่นโลโก้หน้าร้านที่เก็บไว้ก่อนหน้า)
    // อ่าน metadata เดิมเสมอ — ต้อง merge ไม่ใช่ทับ ไม่งั้นค่าที่ผู้ใช้ตั้งเองหายตอน re-auth
    const { data: prev } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('metadata')
      .eq('company_id', companyId)
      .eq('platform', 'lazada')
      .eq('shop_id', sellerId)
      .maybeSingle();
    const prevMeta = (prev?.metadata || {}) as Record<string, unknown>;

    let shopLogo: string | null =
      seller?.logo_url && (await isReachableImage(seller.logo_url)) ? seller.logo_url : null;
    if (!shopLogo) shopLogo = (prevMeta.shop_logo as string) || null;

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
          ...prevMeta,
          country,
          account: tokens.account || null,
          short_code: userInfo?.short_code || seller?.short_code || null,
          user_id: userInfo?.user_id || null,
          shop_logo: shopLogo,
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

    // ── ขาออเดอร์เสร็จ → พาไปอนุญาตแชทต่อทันที ──
    //
    // Lazada บังคับ authorize สองรอบ (Seller In-house = ออเดอร์ · In-house IM
    // Chat = แชท คนละ app คนละ token) **เลี่ยงไม่ได้** — แต่ทำให้เป็นจังหวะเดียว
    // ได้ · ของเดิมเด้งกล่องถาม "จะต่อแชทมั้ย" คั่นกลาง กลายเป็น 3 จังหวะและ
    // ผู้ใช้รู้สึกว่าวุ่นวาย · ร้านที่ไม่ใช้แชทกด "ยกเลิก" ที่หน้า Lazada ได้
    // แล้วจะไปจบที่หน้าช่องทางแชทพร้อมข้อความว่าร้านเชื่อมแล้ว (ไม่ใช่ error)
    //
    // ต่อเฉพาะเมื่อมี app แชทแยก และยังมีร้านที่ไม่มี token แชท
    // (ไม่มี app แชทแยก = token หลักใช้แชทได้เลย ไม่มีขาที่สอง)
    if (isChatAppConfigured()) {
      const { data: pendingChat } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('id')
        .eq('company_id', companyId)
        .eq('platform', 'lazada')
        .eq('is_active', true)
        .is('chat_access_token', null)
        .limit(1);

      if (pendingChat && pendingChat.length > 0) {
        const chatState = signOAuthState({
          companyId,
          userId: authz.payload.userId,
          platform: 'lazada',
          app: 'chat',
        });
        const chatAuthUrl = generateLazadaAuthUrl(
          `${baseUrl}/api/lazada/oauth/callback`,
          chatState,
          'chat'
        );
        const chained = NextResponse.redirect(chatAuthUrl);
        chained.cookies.set('lazada_oauth_state', chatState, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 600,
          path: '/',
        });
        return chained;
      }
    }

    const response = NextResponse.redirect(`${settingsUrl}&success=lazada_connected`);
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

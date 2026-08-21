import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { exchangeCodeForToken, getSellerInfo, LazadaCredentials } from '@/lib/lazada/api';
import { authorizeMarketplaceCallback } from '@/lib/oauth-state';
import { logIntegration } from '@/lib/integration-logger';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  // Verify signed state + completing session — companyId comes only from the
  // trusted state (same pattern as Shopee/TikTok callbacks)
  const rawState = searchParams.get('state') || request.cookies.get('lazada_oauth_state')?.value || null;
  const authz = await authorizeMarketplaceCallback(request, rawState);
  if (!authz.ok) {
    console.error('[Lazada Callback] Authorization failed:', authz.reason);
    return NextResponse.redirect(`${baseUrl}/settings/sales-channels?tab=marketplace&error=auth_${authz.reason}`);
  }
  const companyId = authz.companyId;

  if (!code) {
    return NextResponse.redirect(`${baseUrl}/settings/sales-channels?tab=marketplace&error=missing_params`);
  }

  try {
    const tokens = await exchangeCodeForToken(code);
    const now = Date.now();

    // Seller identity — prefer country_user_info (per-country seller_id)
    const userInfo = tokens.country_user_info?.[0];
    const country = (userInfo?.country || tokens.country || 'th').toLowerCase();
    let sellerId = userInfo?.seller_id ? Number(userInfo.seller_id) : 0;
    let shopName = tokens.account || userInfo?.short_code || null;

    // Enrich with /seller/get (name + seller_id fallback)
    const creds: LazadaCredentials = {
      app_key: process.env.LAZADA_APP_KEY || '',
      app_secret: process.env.LAZADA_APP_SECRET || '',
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
      return NextResponse.redirect(`${baseUrl}/settings/sales-channels?tab=marketplace&error=no_seller_id`);
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

    return NextResponse.redirect(`${baseUrl}/settings/sales-channels?tab=marketplace&success=lazada_connected`);
  } catch (error) {
    console.error('[Lazada Callback] Error:', error);
    return NextResponse.redirect(`${baseUrl}/settings/sales-channels?tab=marketplace&error=lazada_token_exchange`);
  }
}

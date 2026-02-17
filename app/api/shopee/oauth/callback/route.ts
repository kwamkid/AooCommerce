import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { exchangeCodeForToken, getShopListByMerchant, ensureValidToken, getShopInfo } from '@/lib/shopee-api';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const shopId = parseInt(searchParams.get('shop_id') || '0');
  const mainAccountId = parseInt(searchParams.get('main_account_id') || '0');

  // companyId: try state param first, fallback to cookie
  const companyId = searchParams.get('state') || request.cookies.get('shopee_company_id')?.value || null;

  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  console.log('[Shopee Callback] Received params:', {
    code: code ? `${code.substring(0, 10)}...` : null,
    shop_id: shopId,
    main_account_id: mainAccountId,
    state: companyId,
    all_params: Object.fromEntries(searchParams.entries()),
  });

  if (!code || !companyId) {
    console.error('[Shopee Callback] Missing params:', { code: !!code, companyId });
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=missing_params`);
  }

  if (!shopId && !mainAccountId) {
    console.error('[Shopee Callback] No shop_id or main_account_id');
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=missing_params`);
  }

  try {
    // Exchange code for tokens
    console.log('[Shopee Callback] Exchanging code for tokens...');
    const tokens = await exchangeCodeForToken(code, {
      shopId: shopId || undefined,
      mainAccountId: mainAccountId || undefined,
    });
    console.log('[Shopee Callback] Token exchange success, expire_in:', tokens.expire_in);

    const now = new Date();
    const accessExpiry = new Date(now.getTime() + tokens.expire_in * 1000);
    const refreshExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Determine which shops to connect
    let shopIds: number[] = [];

    if (shopId) {
      // Direct shop-level auth (sub-account login)
      shopIds = [shopId];
    } else if (mainAccountId) {
      // Merchant-level auth — get shop list from token response or API
      if (tokens.shop_id_list && tokens.shop_id_list.length > 0) {
        shopIds = tokens.shop_id_list;
        console.log('[Shopee Callback] Shop IDs from token response:', shopIds);
      } else {
        // Fetch shop list via merchant API
        console.log('[Shopee Callback] Fetching shop list for merchant:', mainAccountId);
        const shops = await getShopListByMerchant(mainAccountId, tokens.access_token);
        shopIds = shops.map(s => s.shop_id);
        console.log('[Shopee Callback] Shop IDs from merchant API:', shopIds);
      }
    }

    if (shopIds.length === 0) {
      console.error('[Shopee Callback] No shops found for this account');
      return NextResponse.redirect(`${baseUrl}/settings/integrations?error=no_shops`);
    }

    // For each shop, we need shop-level tokens
    // If main_account_id flow, we need to get individual shop tokens
    for (const sid of shopIds) {
      let shopAccessToken = tokens.access_token;
      let shopRefreshToken = tokens.refresh_token;
      let shopExpireIn = tokens.expire_in;

      // If merchant flow and multiple shops, the token from exchange might be merchant-level
      // For shop-level API calls, we may need to refresh per shop
      // But first let's save with the merchant token and refresh per-shop later

      // Upsert shop connection
      const { data: account, error } = await supabaseAdmin
        .from('shopee_accounts')
        .upsert({
          company_id: companyId,
          shop_id: sid,
          access_token: shopAccessToken,
          refresh_token: shopRefreshToken,
          access_token_expires_at: accessExpiry.toISOString(),
          refresh_token_expires_at: refreshExpiry.toISOString(),
          is_active: true,
          metadata: mainAccountId ? { main_account_id: mainAccountId } : {},
          updated_at: now.toISOString(),
        }, {
          onConflict: 'company_id,shop_id',
        })
        .select()
        .single();

      console.log('[Shopee Callback] Upsert shop:', { shop_id: sid, account_id: account?.id, error: error?.message });

      if (error) {
        console.error('[Shopee Callback] Upsert error for shop', sid, ':', error);
        continue;
      }

      // Fetch shop name + logo (best effort)
      try {
        const creds = await ensureValidToken(account);
        const shopInfo = await getShopInfo(creds);
        console.log('[Shopee Callback] Shop info for', sid, ':', shopInfo);
        if (shopInfo) {
          const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (shopInfo.shop_name) updateData.shop_name = shopInfo.shop_name;
          if (shopInfo.shop_logo) {
            updateData.metadata = { ...(account.metadata || {}), shop_logo: shopInfo.shop_logo };
          }
          await supabaseAdmin
            .from('shopee_accounts')
            .update(updateData)
            .eq('id', account.id);
        }
      } catch (e) {
        console.error('[Shopee Callback] Failed to fetch shop info for', sid, ':', e);
      }
    }

    // Clear the cookie
    const response = NextResponse.redirect(`${baseUrl}/settings/integrations?shopee=connected`);
    response.cookies.delete('shopee_company_id');

    console.log('[Shopee Callback] Success! Connected', shopIds.length, 'shop(s)');
    return response;
  } catch (err) {
    console.error('[Shopee Callback] Error:', err);
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=shopee_auth_failed`);
  }
}

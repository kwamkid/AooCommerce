import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { exchangeCodeForToken, getAuthorizedShops } from '@/lib/tiktok/api';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  // companyId: try state param first, fallback to cookie
  const companyId = searchParams.get('state') || request.cookies.get('tiktok_company_id')?.value || null;

  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  console.log('[TikTok Callback] Received params:', {
    code: code ? `${code.substring(0, 10)}...` : null,
    state: companyId,
  });

  if (!code || !companyId) {
    console.error('[TikTok Callback] Missing params:', { code: !!code, companyId });
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=missing_params`);
  }

  try {
    // Exchange code for tokens
    console.log('[TikTok Callback] Exchanging code for tokens...');
    const tokens = await exchangeCodeForToken(code);
    console.log('[TikTok Callback] Token exchange success, access_token_expire_in:', tokens.access_token_expire_in);

    const now = new Date();
    const accessExpiry = new Date(now.getTime() + tokens.access_token_expire_in * 1000);
    const refreshExpiry = new Date(now.getTime() + tokens.refresh_token_expire_in * 1000);

    // Get authorized shops
    let shops: { id: string; name: string; region: string; cipher: string; code: string; seller_type: string }[] = [];
    try {
      shops = await getAuthorizedShops(tokens.access_token);
      console.log('[TikTok Callback] Authorized shops:', shops.map(s => ({ id: s.id, name: s.name })));
    } catch (e) {
      console.error('[TikTok Callback] Failed to get shops:', e);
      return NextResponse.redirect(`${baseUrl}/settings/integrations?error=no_shops`);
    }

    if (shops.length === 0) {
      console.error('[TikTok Callback] No shops found');
      return NextResponse.redirect(`${baseUrl}/settings/integrations?error=no_shops`);
    }

    // Upsert each shop
    for (const shop of shops) {
      const shopIdNum = parseInt(shop.id) || 0;

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

    // Clear cookie and redirect
    const response = NextResponse.redirect(`${baseUrl}/settings/integrations?tiktok=connected`);
    response.cookies.delete('tiktok_company_id');

    console.log('[TikTok Callback] Success! Connected', shops.length, 'shop(s)');
    return response;
  } catch (err) {
    console.error('[TikTok Callback] Error:', err);
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=tiktok_auth_failed`);
  }
}

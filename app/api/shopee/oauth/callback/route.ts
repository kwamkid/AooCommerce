import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { exchangeCodeForToken, ensureValidToken, getShopInfo } from '@/lib/shopee-api';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const shopId = parseInt(searchParams.get('shop_id') || '0');
  const companyId = searchParams.get('state');

  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  if (!code || !shopId || !companyId) {
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=missing_params`);
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForToken(code, shopId);

    const now = new Date();
    const accessExpiry = new Date(now.getTime() + tokens.expire_in * 1000);
    const refreshExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Upsert shop connection
    const { data: account, error } = await supabaseAdmin
      .from('shopee_accounts')
      .upsert({
        company_id: companyId,
        shop_id: shopId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_token_expires_at: accessExpiry.toISOString(),
        refresh_token_expires_at: refreshExpiry.toISOString(),
        is_active: true,
        updated_at: now.toISOString(),
      }, {
        onConflict: 'company_id,shop_id',
      })
      .select()
      .single();

    if (error) throw error;

    // Fetch shop name (non-blocking best effort)
    try {
      const creds = await ensureValidToken(account);
      const shopInfo = await getShopInfo(creds);
      if (shopInfo?.shop_name) {
        await supabaseAdmin
          .from('shopee_accounts')
          .update({
            shop_name: shopInfo.shop_name,
            updated_at: new Date().toISOString(),
          })
          .eq('id', account.id);
      }
    } catch (e) {
      console.error('Failed to fetch shop info:', e);
    }

    return NextResponse.redirect(`${baseUrl}/settings/integrations?shopee=connected`);
  } catch (err) {
    console.error('Shopee OAuth callback error:', err);
    return NextResponse.redirect(`${baseUrl}/settings/integrations?error=shopee_auth_failed`);
  }
}

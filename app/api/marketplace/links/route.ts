import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');
    const productId = searchParams.get('product_id');
    const platform = searchParams.get('platform');

    let query = supabaseAdmin
      .from('marketplace_product_links')
      .select(`
        id,
        platform,
        account_id,
        account_name,
        product_id,
        variation_id,
        external_item_id,
        external_model_id,
        external_sku,
        external_item_status,
        platform_price,
        platform_discount_price,
        platform_barcode,
        platform_primary_image,
        last_synced_at,
        last_price_pushed_at,
        last_stock_pushed_at,
        shopee_category_id,
        shopee_category_name,
        weight,
        sync_enabled,
        products!inner (
          id,
          code,
          name,
          image,
          source,
          is_active,
          variation_label
        ),
        product_variations (
          id,
          variation_label,
          sku,
          default_price,
          discount_price,
          stock,
          is_active
        )
      `)
      .eq('company_id', companyId);

    if (accountId) query = query.eq('account_id', accountId);
    if (productId) query = query.eq('product_id', productId);
    if (platform) query = query.eq('platform', platform);

    query = query.order('created_at', { ascending: false });

    const { data: links, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich links with shop_id from shopee_accounts
    const accountIds = [...new Set((links || []).map((l: { account_id: string }) => l.account_id))];
    let shopIdMap: Record<string, string> = {};
    if (accountIds.length > 0) {
      const { data: accounts } = await supabaseAdmin
        .from('shopee_accounts')
        .select('id, shop_id')
        .in('id', accountIds);
      if (accounts) {
        shopIdMap = Object.fromEntries(accounts.map((a: { id: string; shop_id: string }) => [a.id, a.shop_id]));
      }
    }

    const enrichedLinks = (links || []).map((link: { account_id: string }) => ({
      ...link,
      shop_id: shopIdMap[link.account_id] || null,
    }));

    return NextResponse.json({ links: enrichedLinks });
  } catch (error) {
    console.error('Get marketplace links error:', error);
    return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
  }
}

// PATCH - Update marketplace link (platform_price override)
export async function PATCH(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { link_id, platform_price, platform_discount_price, platform_barcode, platform_primary_image, shopee_category_id, shopee_category_name, weight } = await request.json();
    if (!link_id) {
      return NextResponse.json({ error: 'Missing link_id' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (platform_price !== undefined) updateData.platform_price = platform_price ?? null;
    if (platform_discount_price !== undefined) updateData.platform_discount_price = platform_discount_price ?? null;
    if (platform_barcode !== undefined) updateData.platform_barcode = platform_barcode ?? null;
    if (platform_primary_image !== undefined) updateData.platform_primary_image = platform_primary_image ?? null;
    if (shopee_category_id !== undefined) updateData.shopee_category_id = shopee_category_id ?? null;
    if (shopee_category_name !== undefined) updateData.shopee_category_name = shopee_category_name ?? null;
    if (weight !== undefined) updateData.weight = weight ?? null;

    const { data, error } = await supabaseAdmin
      .from('marketplace_product_links')
      .update(updateData)
      .eq('id', link_id)
      .eq('company_id', companyId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, link: data });
  } catch (error) {
    console.error('Patch marketplace link error:', error);
    return NextResponse.json({ error: 'Failed to update link' }, { status: 500 });
  }
}

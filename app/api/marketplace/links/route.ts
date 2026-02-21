import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';
import { ensureValidToken, getShopeeCategories, ShopeeAccountRow } from '@/lib/shopee-api';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');
    const productId = searchParams.get('product_id');
    const productIds = searchParams.get('product_ids'); // comma-separated
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
        platform_product_name,
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
        shopee_attributes,
        shopee_brand_id,
        shopee_brand_name,
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
    if (productIds) query = query.in('product_id', productIds.split(','));
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

    // Backfill shopee_category_name for links that have category_id but no name
    const linksNeedingCategoryName = (links || []).filter(
      (l: { shopee_category_id: string | null; shopee_category_name: string | null }) =>
        l.shopee_category_id && !l.shopee_category_name
    );

    if (linksNeedingCategoryName.length > 0) {
      const backfillAccountIds = [...new Set(linksNeedingCategoryName.map((l: { account_id: string }) => l.account_id))];

      // Load category caches for all relevant accounts
      let { data: caches } = await supabaseAdmin
        .from('shopee_category_cache')
        .select('account_id, category_data')
        .in('account_id', backfillAccountIds);

      // If cache is missing for some accounts, fetch from Shopee API and create cache
      const cachedAccountIds = new Set((caches || []).map(c => c.account_id));
      const missingAccountIds = backfillAccountIds.filter(id => !cachedAccountIds.has(id));
      if (missingAccountIds.length > 0) {
        const { data: shopeeAccounts } = await supabaseAdmin
          .from('shopee_accounts')
          .select('*')
          .in('id', missingAccountIds)
          .eq('is_active', true);

        if (shopeeAccounts) {
          for (const acc of shopeeAccounts) {
            try {
              const creds = await ensureValidToken(acc as ShopeeAccountRow);
              const { data: catData } = await getShopeeCategories(creds);
              const catResponse = catData as { category_list?: unknown[] };
              const categoryList = catResponse?.category_list || [];
              if (categoryList.length > 0) {
                await supabaseAdmin
                  .from('shopee_category_cache')
                  .upsert({
                    account_id: acc.id,
                    company_id: companyId,
                    category_data: categoryList,
                    fetched_at: new Date().toISOString(),
                  }, { onConflict: 'account_id' });

                // Add to caches array
                if (!caches) caches = [];
                caches.push({ account_id: acc.id, category_data: categoryList });
              }
            } catch (e) {
              console.error('[backfill] error fetching categories for', acc.id, e);
            }
          }
        }
      }

      if (caches && caches.length > 0) {
        // Build lookup: accountId → categoryId → full path name
        const catLookup: Record<string, Map<string, string>> = {};
        for (const cache of caches) {
          const categories = (cache.category_data || []) as Array<{
            category_id: number;
            parent_category_id: number;
            display_category_name: string;
          }>;
          const catMap = new Map(categories.map(c => [c.category_id, c]));
          const nameMap = new Map<string, string>();

          for (const cat of categories) {
            const path: string[] = [];
            let current: typeof cat | undefined = cat;
            while (current) {
              path.unshift(current.display_category_name);
              if (current.parent_category_id === 0) break;
              current = catMap.get(current.parent_category_id);
            }
            nameMap.set(String(cat.category_id), path.join(' > '));
          }
          catLookup[cache.account_id] = nameMap;
        }

        // Update each link with the resolved name
        for (const link of linksNeedingCategoryName as Array<{ id: string; account_id: string; shopee_category_id: string; shopee_category_name: string | null }>) {
          const name = catLookup[link.account_id]?.get(String(link.shopee_category_id));
          if (name) {
            link.shopee_category_name = name;
            // Fire-and-forget DB update
            supabaseAdmin
              .from('marketplace_product_links')
              .update({ shopee_category_name: name })
              .eq('id', link.id)
              .then();
          }
        }
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

    const { link_id, platform_product_name, platform_price, platform_discount_price, platform_barcode, platform_primary_image, shopee_category_id, shopee_category_name, weight } = await request.json();
    if (!link_id) {
      return NextResponse.json({ error: 'Missing link_id' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (platform_product_name !== undefined) updateData.platform_product_name = platform_product_name ?? null;
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

    // Auto-sync price to Shopee if platform_price changed
    if (platform_price !== undefined && data?.product_id) {
      const { triggerShopeePriceSync } = await import('@/lib/shopee-auto-sync');
      triggerShopeePriceSync(data.product_id);
    }

    return NextResponse.json({ success: true, link: data });
  } catch (error) {
    console.error('Patch marketplace link error:', error);
    return NextResponse.json({ error: 'Failed to update link' }, { status: 500 });
  }
}

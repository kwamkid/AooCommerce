import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { ensureValidToken, getShopeeCategories, getShopeeCategoryAttributes, ShopeeAccountRow } from '@/lib/shopee-api';

const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * GET /api/shopee/categories
 * - ?account_id=xxx → return cached category tree (refresh if > 24h)
 * - ?account_id=xxx&category_id=123 → return attributes for that category
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');
    const categoryId = searchParams.get('category_id');

    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    }

    // Fetch account
    const { data: account, error: accErr } = await supabaseAdmin
      .from('shopee_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    if (accErr || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const creds = await ensureValidToken(account as ShopeeAccountRow);

    // If category_id is provided, return attributes for that category
    if (categoryId) {
      const { data, error } = await getShopeeCategoryAttributes(creds, parseInt(categoryId));
      if (error) {
        return NextResponse.json({ error }, { status: 500 });
      }
      const response = data as { attribute_list?: unknown[] };
      return NextResponse.json({ attributes: response.attribute_list || [] });
    }

    // Return category tree (with cache)
    const { data: cached } = await supabaseAdmin
      .from('shopee_category_cache')
      .select('*')
      .eq('account_id', accountId)
      .single();

    const now = new Date();
    const isFresh = cached?.fetched_at &&
      (now.getTime() - new Date(cached.fetched_at).getTime()) < CACHE_DURATION_MS;

    if (cached && isFresh) {
      return NextResponse.json({ categories: cached.category_data });
    }

    // Fetch from Shopee API
    const { data, error } = await getShopeeCategories(creds);
    if (error) {
      return NextResponse.json({ error }, { status: 500 });
    }

    const response = data as { category_list?: unknown[] };
    const categoryList = response.category_list || [];

    // Upsert cache
    await supabaseAdmin
      .from('shopee_category_cache')
      .upsert({
        account_id: accountId,
        company_id: auth.companyId,
        category_data: categoryList,
        fetched_at: now.toISOString(),
      }, { onConflict: 'account_id' });

    return NextResponse.json({ categories: categoryList });
  } catch (error) {
    console.error('GET shopee categories error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

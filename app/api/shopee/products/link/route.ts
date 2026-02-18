import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';

// GET - Fetch marketplace links for an account
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');

    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('id, product_id, variation_id, external_item_id')
      .eq('company_id', companyId)
      .eq('account_id', accountId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ links: data || [] });
  } catch (error) {
    console.error('GET links error:', error);
    return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRole)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { product_id, variation_id, shopee_account_id, shopee_item_id, shopee_model_id } = await request.json();

    if (!product_id || !shopee_account_id || !shopee_item_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify account belongs to company
    const { data: account } = await supabaseAdmin
      .from('shopee_accounts')
      .select('id, shop_name')
      .eq('id', shopee_account_id)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Verify product belongs to company
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('id', product_id)
      .eq('company_id', companyId)
      .single();

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Create link
    const { data: link, error } = await supabaseAdmin
      .from('marketplace_product_links')
      .upsert({
        company_id: companyId,
        platform: 'shopee',
        account_id: shopee_account_id,
        account_name: account.shop_name,
        product_id,
        variation_id: variation_id || null,
        external_item_id: String(shopee_item_id),
        external_model_id: String(shopee_model_id || 0),
        sync_enabled: true,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'account_id,external_item_id,external_model_id' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, link });
  } catch (error) {
    console.error('Link product error:', error);
    return NextResponse.json({ error: 'Failed to link product' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRole)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get('link_id');

    if (!linkId) {
      return NextResponse.json({ error: 'Missing link_id' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('marketplace_product_links')
      .delete()
      .eq('id', linkId)
      .eq('company_id', companyId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unlink product error:', error);
    return NextResponse.json({ error: 'Failed to unlink product' }, { status: 500 });
  }
}

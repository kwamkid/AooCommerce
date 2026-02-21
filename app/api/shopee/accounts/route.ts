import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import { ensureValidToken, getShopInfo, ShopeeAccountRow } from '@/lib/shopee-api';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: accounts, error } = await supabaseAdmin
      .from('shopee_accounts')
      .select('id, company_id, shop_id, shop_name, is_active, last_sync_at, last_product_sync_at, access_token_expires_at, refresh_token_expires_at, auto_sync_stock, auto_sync_product_info, metadata, created_at, updated_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get linked product counts per account
    const accountIds = (accounts || []).filter(a => a.is_active).map(a => a.id);
    let linkCounts: Record<string, number> = {};
    if (accountIds.length > 0) {
      const { data: countRows } = await supabaseAdmin
        .from('marketplace_product_links')
        .select('account_id')
        .in('account_id', accountIds)
        .eq('platform', 'shopee')
        .eq('sync_enabled', true);

      if (countRows) {
        // Count distinct product_id per account
        const seen = new Map<string, Set<string>>();
        for (const row of countRows) {
          if (!seen.has(row.account_id)) seen.set(row.account_id, new Set());
          seen.get(row.account_id)!.add(row.account_id); // count rows as links
        }
        // Simple count per account
        const countMap: Record<string, number> = {};
        for (const row of countRows) {
          countMap[row.account_id] = (countMap[row.account_id] || 0) + 1;
        }
        linkCounts = countMap;
      }
    }

    // Add connection status and linked count to each account
    const now = new Date();
    const accountsWithStatus = (accounts || []).map(a => {
      const refreshExpiry = a.refresh_token_expires_at ? new Date(a.refresh_token_expires_at) : null;
      const isExpired = refreshExpiry ? refreshExpiry.getTime() < now.getTime() : true;
      return {
        ...a,
        connection_status: !a.is_active ? 'disconnected' : isExpired ? 'expired' : 'connected',
        linked_product_count: linkCounts[a.id] || 0,
      };
    });

    return NextResponse.json(accountsWithStatus);
  } catch (error) {
    console.error('Shopee accounts GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('id');
    if (!accountId) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    // Soft delete - set is_active to false and clear tokens
    const { error } = await supabaseAdmin
      .from('shopee_accounts')
      .update({
        is_active: false,
        access_token: null,
        refresh_token: null,
        access_token_expires_at: null,
        refresh_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)
      .eq('company_id', companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shopee accounts DELETE error:', error);
    return NextResponse.json({ error: 'Failed to disconnect shop' }, { status: 500 });
  }
}

// PATCH - Refresh shop profile (name + logo)
export async function PATCH(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const accountId = body.id;
    if (!accountId) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    const { data: account, error: accError } = await supabaseAdmin
      .from('shopee_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (accError || !account) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const creds = await ensureValidToken(account as ShopeeAccountRow);
    const shopInfo = await getShopInfo(creds);

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

    return NextResponse.json({
      success: true,
      shop_name: shopInfo?.shop_name || account.shop_name,
      shop_logo: shopInfo?.shop_logo || '',
    });
  } catch (error) {
    console.error('Shopee accounts PATCH error:', error);
    return NextResponse.json({ error: 'Failed to refresh profile' }, { status: 500 });
  }
}

// PUT - Update account settings (auto-sync toggles)
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, auto_sync_stock, auto_sync_product_info } = body;
    if (!id) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof auto_sync_stock === 'boolean') updateData.auto_sync_stock = auto_sync_stock;
    if (typeof auto_sync_product_info === 'boolean') updateData.auto_sync_product_info = auto_sync_product_info;

    const { error } = await supabaseAdmin
      .from('shopee_accounts')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shopee accounts PUT error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}

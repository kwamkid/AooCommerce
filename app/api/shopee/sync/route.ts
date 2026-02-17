import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow, ensureValidToken, getShopInfo } from '@/lib/shopee-api';
import { syncOrdersByTimeRange, SyncResult } from '@/lib/shopee-sync';

export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRole)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { shopee_account_id, time_from, time_to } = body;

    if (!shopee_account_id) {
      return NextResponse.json({ error: 'Missing shopee_account_id' }, { status: 400 });
    }

    // Get account
    const { data: account, error: accError } = await supabaseAdmin
      .from('shopee_accounts')
      .select('*')
      .eq('id', shopee_account_id)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (accError || !account) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Default: last 24 hours
    const now = Math.floor(Date.now() / 1000);
    const from = time_from || (now - 24 * 60 * 60);
    const to = time_to || now;

    // Create sync log
    const { data: log } = await supabaseAdmin
      .from('shopee_sync_log')
      .insert({
        shopee_account_id: account.id,
        company_id: companyId,
        sync_type: 'manual',
      })
      .select()
      .single();

    const result = await syncOrdersByTimeRange(account as ShopeeAccountRow, from, to);

    // Update sync log
    if (log) {
      await supabaseAdmin
        .from('shopee_sync_log')
        .update({
          orders_fetched: result.orders_created + result.orders_updated + result.orders_skipped,
          orders_created: result.orders_created,
          orders_updated: result.orders_updated,
          errors: result.errors.length > 0 ? result.errors : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', log.id);
    }

    // Also refresh shop profile (best effort)
    try {
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
    } catch (e) {
      console.error('[Shopee Sync] Failed to refresh profile:', e);
    }

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Shopee sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}

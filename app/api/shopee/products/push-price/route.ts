import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee-api';
import { pushPriceToShopee } from '@/lib/shopee-product-sync';
import { logIntegration } from '@/lib/integration-logger';

export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRole)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { product_id, shopee_account_id } = await request.json();
    if (!product_id || !shopee_account_id) {
      return NextResponse.json({ error: 'Missing product_id or shopee_account_id' }, { status: 400 });
    }

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

    const startMs = Date.now();
    const result = await pushPriceToShopee(account as ShopeeAccountRow, product_id);
    const durationMs = Date.now() - startMs;

    logIntegration({
      company_id: companyId,
      integration: 'shopee',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'push_price',
      method: 'POST',
      api_path: '/api/v2/product/update_price',
      request_body: { product_id },
      response_body: result,
      status: result.success ? 'success' : 'error',
      error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      duration_ms: durationMs,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Push price error:', error);
    return NextResponse.json({ error: 'Push price failed' }, { status: 500 });
  }
}

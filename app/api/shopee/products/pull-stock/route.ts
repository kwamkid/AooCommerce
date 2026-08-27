import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow, isShopeeQuotaBlocked } from '@/lib/shopee/api';
import { pullStockFromShopee } from '@/lib/shopee/product-sync';
import { logIntegration } from '@/lib/integration-logger';

// ร้านใหญ่ ~1,000 สินค้า = ~30 Shopee calls — เผื่อเวลาไว้
export const maxDuration = 120;

/**
 * ดึงยอดสต็อกจาก Shopee ลงคลัง default (ตั้งยอดตั้งต้นต่อร้าน)
 * เติมเฉพาะช่องที่ยอดปัจจุบันเป็น 0 — ไม่ทับยอดจริงที่พนักงานตั้งไว้
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !can(companyRoles, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const quota = await isShopeeQuotaBlocked();
    if (quota.blocked) {
      return NextResponse.json({ error: `Shopee quota หมดชั่วคราว — ลองใหม่หลัง ${quota.until}` }, { status: 429 });
    }

    const { marketplace_account_id } = await request.json();
    if (!marketplace_account_id) {
      return NextResponse.json({ error: 'Missing marketplace_account_id' }, { status: 400 });
    }

    const { data: account, error: accError } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('id', marketplace_account_id)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();
    if (accError || !account) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    const startMs = Date.now();
    const result = await pullStockFromShopee(account as ShopeeAccountRow);

    logIntegration({
      company_id: companyId,
      integration: 'shopee',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'incoming',
      action: 'pull_stock',
      method: 'POST',
      api_path: '/api/v2/product/get_model_list',
      response_body: { checked: result.checked, filled: result.filled, skipped_nonzero: result.skipped_nonzero },
      status: result.success ? 'success' : 'error',
      error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      duration_ms: Date.now() - startMs,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Pull stock error:', error);
    return NextResponse.json({ error: 'Pull stock failed' }, { status: 500 });
  }
}

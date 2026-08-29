import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee/api';
import { pushStockToShopee } from '@/lib/shopee/product-sync';
import { logIntegration } from '@/lib/integration-logger';

// ย้ายคลังแล้วส่งยอดทั้งร้าน — ร้านใหญ่ ~300 สินค้า ใช้เวลานาน
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !can(companyRoles, 'marketplace.push')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { product_id, marketplace_account_id } = await request.json();
    if (!marketplace_account_id) {
      return NextResponse.json({ error: 'Missing marketplace_account_id' }, { status: 400 });
    }
    // ไม่ส่ง product_id = ส่งยอดของทั้งร้าน (ใช้ตอนย้ายคลังที่ผูกไว้ ยอดทั้งร้านต้องเปลี่ยนตาม)

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
    let result: { success: boolean; updated_models: number; errors: string[] };

    if (product_id) {
      result = await pushStockToShopee(account as ShopeeAccountRow, product_id);
    } else {
      // ทั้งร้าน — ยิงทีละสินค้า คุม concurrency ไว้ 3 กันชน rate limit ของ Shopee
      const { data: links } = await supabaseAdmin
        .from('marketplace_product_links')
        .select('product_id')
        .eq('account_id', account.id)
        .eq('sync_enabled', true);
      const productIds = [...new Set((links || []).map(l => l.product_id as string))].filter(Boolean);
      const { parallelLimit } = await import('@/lib/parallel');
      const results = await parallelLimit(productIds, (pid) =>
        pushStockToShopee(account as ShopeeAccountRow, pid), 3);
      result = {
        success: results.every(r => r.success),
        updated_models: results.reduce((n, r) => n + r.updated_models, 0),
        errors: results.flatMap(r => r.errors).slice(0, 20),
      };
    }
    const durationMs = Date.now() - startMs;

    logIntegration({
      company_id: companyId,
      integration: 'shopee',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'push_stock',
      method: 'POST',
      api_path: '/api/v2/product/update_stock',
      request_body: { product_id: product_id || 'ทั้งร้าน' },
      response_body: result,
      status: result.success ? 'success' : 'error',
      error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      duration_ms: durationMs,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Push stock error:', error);
    return NextResponse.json({ error: 'Push stock failed' }, { status: 500 });
  }
}

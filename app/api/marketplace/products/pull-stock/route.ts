import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { pullStockForAccount } from '@/lib/marketplace/stock-push';
import { getStockAdapter, stockPlatformLabel } from '@/lib/marketplace/stock-adapter';
import type { PullStockMode, StockSyncAccount } from '@/lib/marketplace/stock-adapter';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import type { QuotaPlatform } from '@/lib/marketplace/platforms';
import { logIntegration } from '@/lib/integration-logger';

// ร้านใหญ่ ~1,000 สินค้า = หลายสิบคอล — เผื่อเวลาไว้
export const maxDuration = 300;

/**
 * ดึงยอดสต็อกจากร้านลงคลังของช่องทางนั้น (ตั้งยอดตั้งต้นต่อร้าน)
 * `fill_blank` (ค่าตั้งต้น) = เติมเฉพาะช่องที่ยอดปัจจุบันเป็น 0 — ไม่ทับยอดจริงที่พนักงานตั้งไว้
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth || !companyId || !can(auth, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { marketplace_account_id, mode, dry_run } = await request.json();
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

    const platform = account.platform as string;
    const adapter = getStockAdapter(platform);
    if (!adapter) {
      return NextResponse.json(
        { error: `ยังไม่รองรับดึงสต็อกจาก ${stockPlatformLabel(platform)}` },
        { status: 400 }
      );
    }

    // ขา pull อ่านข้อมูลสินค้า → ถัง product (ไม่ใช่ inventory เหมือนขา push)
    const quota = await isQuotaBlocked(platform as QuotaPlatform, 'product');
    if (quota.blocked) {
      return NextResponse.json(
        { error: `โควตา ${stockPlatformLabel(platform)} เต็มชั่วคราว — ลองใหม่หลัง ${quota.until}` },
        { status: 429 }
      );
    }

    const startMs = Date.now();
    const result = await pullStockForAccount(account as StockSyncAccount, {
      mode: mode as PullStockMode | undefined,
      dryRun: dry_run === true,
    });

    logIntegration({
      company_id: companyId,
      integration: platform,
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'incoming',
      action: 'pull_stock',
      method: 'POST',
      api_path: adapter.pullApiPath,
      request_body: { mode: mode || 'fill_blank', dry_run: dry_run === true },
      response_body: { checked: result.checked, filled: result.filled, skipped_nonzero: result.skipped_nonzero, overwritten: result.overwritten },
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

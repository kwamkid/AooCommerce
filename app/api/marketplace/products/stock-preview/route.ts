import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { previewStockSync, summarizeStockPlans, toRunItemInput } from '@/lib/marketplace/stock-push';
import type { StockPreviewRow } from '@/lib/marketplace/stock-push';
import { getStockAdapter, stockPlatformLabel } from '@/lib/marketplace/stock-adapter';
import type { PullStockMode, StockSyncAccount } from '@/lib/marketplace/stock-adapter';
import { createRun, discardPendingPreviews, isActionablePlan, replaceRunItems } from '@/lib/marketplace/sync-runs';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import type { QuotaPlatform } from '@/lib/marketplace/platforms';
import { logIntegrationNow } from '@/lib/integration-logger';

// อ่านยอดทั้งร้าน (~1,000 ตัวเลือก) = หลายสิบคอล — เผื่อเวลาเท่ากับ route ที่ลงมือจริง
export const maxDuration = 300;

/** พรีวิวมีอายุ 15 นาที — เท่ากับที่ route pull/push ใช้ตัดสินว่า `preview_expired` */
const PREVIEW_TTL_MS = 15 * 60_000;

/**
 * "ถ้ากดแล้วจะเกิดอะไร" — อ่านยอดสองฝั่งแล้วคืนแผนรายตัวเลือก โดย**ยังไม่เขียนอะไร**
 *
 * body: `{ marketplace_account_id, direction: 'pull' | 'push', mode?: 'fill_blank' | 'overwrite' }`
 * (`mode` มีความหมายเฉพาะขา pull — ขา push ยึดยอดคลังเราเป็นต้นทางเสมอ)
 *
 * ผลลัพธ์ถูกบันทึกเป็นรอบสถานะ `previewed` พร้อมรายการทุกแถว ผู้ใช้ติ๊กแล้วส่ง `run_id`
 * ไปที่ `/pull-stock` หรือ `/push-stock` เพื่อลงมือ — **ตัวเลขที่เห็นบนจอกับที่ลงมือจึงชุดเดียวกัน**
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth || !companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const marketplaceAccountId = body?.marketplace_account_id as string | undefined;
    const direction = body?.direction as 'pull' | 'push' | undefined;
    const mode = (body?.mode as PullStockMode | undefined) || 'fill_blank';

    if (!marketplaceAccountId) {
      return NextResponse.json({ error: 'Missing marketplace_account_id' }, { status: 400 });
    }
    if (direction !== 'pull' && direction !== 'push') {
      return NextResponse.json({ error: 'direction ต้องเป็น pull หรือ push' }, { status: 400 });
    }

    // สิทธิ์ต่างกันตามทิศ — ดึงลงคลังคือ "ซิงค์" ส่วนส่งขึ้นร้านคือ "เขียนข้อมูลบนร้านคนอื่น"
    const capability = direction === 'pull' ? 'marketplace.sync' : 'marketplace.push';
    if (!can(auth, capability)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: account, error: accError } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('id', marketplaceAccountId)
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
        { error: `ยังไม่รองรับซิงค์สต็อกกับ ${stockPlatformLabel(platform)}` },
        { status: 400 }
      );
    }

    // พรีวิวทั้งสองทิศอ่านข้อมูลสินค้าจากร้าน → ถังโควตา 'product' เสมอ (ยังไม่ได้เขียนอะไร)
    const quota = await isQuotaBlocked(platform as QuotaPlatform, 'product');
    if (quota.blocked) {
      return NextResponse.json(
        {
          error: `โควตา ${stockPlatformLabel(platform)} เต็มชั่วคราว — ลองใหม่หลัง ${quota.until}`,
          until: quota.until,
        },
        { status: 429 }
      );
    }

    const startMs = Date.now();
    const preview = await previewStockSync(account as StockSyncAccount, { direction, mode });

    // อ่านร้านไม่ได้เลย = ไม่มีอะไรให้ดู — สร้างรอบเปล่าไว้ก็มีแต่ขยะในประวัติ
    if (preview.rows.length === 0 && preview.errors.length > 0) {
      return NextResponse.json(
        { error: preview.errors[0], errors: preview.errors },
        { status: 502 }
      );
    }

    /**
     * ติ๊กให้ล่วงหน้า = แถวที่ลงมือได้ **ยกเว้น**ขา push ที่จะส่ง 0 ทับร้านทั้งที่ระบบยัง
     * ไม่เคยมีแถวคลังของตัวนั้นเลย — นั่นคือ "ยอดของเราเป็น 0 เพราะยังไม่เคยตั้ง" ไม่ใช่
     * "ของหมดจริง" ส่งขึ้นไปคือปิดการขายบนร้านทั้งที่ของยังอยู่ (กติกาใน CLAUDE.md)
     */
    const isRisky = (row: StockPreviewRow) =>
      direction === 'push' && isActionablePlan(row.plan) && row.target === 0 && !row.has_inventory_row;
    const pickedFor = (row: StockPreviewRow) => isActionablePlan(row.plan) && !isRisky(row);

    const planCounts = summarizeStockPlans(preview.rows);
    const selected = preview.rows.filter(pickedFor).length;

    const job = direction === 'pull' ? 'pull_stock' : 'push_stock';
    // พรีวิวใบเก่าที่ยังไม่ได้ลงมือของร้าน+งานนี้ = ขยะ ทิ้งก่อนสร้างใบใหม่
    await discardPendingPreviews(account.id, job);
    const run = await createRun({
      company_id: companyId,
      account_id: account.id,
      platform,
      job,
      mode: direction === 'pull' ? mode : null,
      status: 'previewed',
      warehouse_id: preview.warehouseId,
      trigger: 'manual',
      created_by: auth.userId ?? null,
      quota_used: preview.quotaUsed,
      counts: { ...planCounts, selected },
    });

    await replaceRunItems(run.id, preview.rows.map(row => toRunItemInput(row, pickedFor(row))));

    const rows = preview.rows.map(row => ({
      ...row,
      selected: pickedFor(row),
      ...(isRisky(row) ? { risky: true as const } : {}),
    }));

    // ขา push เสียโควตาตอนลงมือ = 1 call ต่อสินค้า (ตัวเลือกไปด้วยกันในใบเดียว)
    // ขา pull เขียนลงคลังเราล้วน ๆ ไม่ยิงขึ้นร้านเลย
    const applyCalls = direction === 'push'
      ? new Set(preview.rows.filter(r => isActionablePlan(r.plan) && r.product_id).map(r => r.product_id)).size
      : 0;

    const previewAt = run.preview_at;
    const expiresAt = new Date(new Date(previewAt).getTime() + PREVIEW_TTL_MS).toISOString();

    await logIntegrationNow({
      company_id: companyId,
      integration: platform,
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'incoming',
      action: 'stock_preview',
      method: 'POST',
      api_path: adapter.pullApiPath,
      request_body: { direction, mode: direction === 'pull' ? mode : null },
      response_body: { rows: rows.length, selected, quota_used: preview.quotaUsed },
      status: preview.errors.length > 0 ? 'error' : 'success',
      error_message: preview.errors.length > 0 ? preview.errors.join('; ') : undefined,
      reference_type: 'sync_run',
      reference_id: run.id,
      duration_ms: Date.now() - startMs,
    });

    return NextResponse.json({
      run_id: run.id,
      preview_at: previewAt,
      expires_at: expiresAt,
      direction,
      mode: direction === 'pull' ? mode : null,
      warehouse_id: preview.warehouseId,
      rows,
      counts: { ...planCounts, selected },
      quota: { preview_used: preview.quotaUsed, apply_calls: applyCalls },
      errors: preview.errors,
    });
  } catch (error) {
    console.error('Stock preview error:', error);
    return NextResponse.json({ error: 'พรีวิวสต็อกไม่สำเร็จ' }, { status: 500 });
  }
}

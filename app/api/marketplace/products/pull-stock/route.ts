import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { pullStockForAccount, markStockInitialized } from '@/lib/marketplace/stock-push';
import { getStockAdapter, stockPlatformLabel } from '@/lib/marketplace/stock-adapter';
import type { PullStockMode, StockSyncAccount } from '@/lib/marketplace/stock-adapter';
import {
  createRun,
  findRunningRun,
  finishRun,
  getRunHead,
  selectRunItems,
  selectedVariationIds,
  startRun,
} from '@/lib/marketplace/sync-runs';
import type { SyncRunTrigger } from '@/lib/marketplace/sync-runs';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import type { QuotaPlatform } from '@/lib/marketplace/platforms';
import { logIntegrationNow } from '@/lib/integration-logger';

// ร้านใหญ่ ~1,000 สินค้า = หลายสิบคอล — เผื่อเวลาไว้
export const maxDuration = 300;

/** พรีวิวที่ค้างไว้นานเกินนี้ถือว่าเก่า — ยอดสองฝั่งขยับไปแล้ว ต้องดูใหม่ก่อนกด */
const PREVIEW_MAX_AGE_MS = 15 * 60_000;

/**
 * ดึงยอดสต็อกจากร้านลงคลังของช่องทางนั้น (ตั้งยอดตั้งต้นต่อร้าน)
 * `fill_blank` (ค่าตั้งต้น) = เติมเฉพาะช่องที่ยอดปัจจุบันเป็น 0 — ไม่ทับยอดจริงที่พนักงานตั้งไว้
 *
 * body: `{ marketplace_account_id, mode?, dry_run?, run_id?, variation_ids?, trigger? }`
 * - `run_id` = ลงมือตามที่ผู้ใช้ติ๊กไว้จากหน้าพรีวิว (`variation_ids` = แถวที่ติ๊ก · ไม่ส่ง = ทุกแถวที่ทำได้)
 * - ไม่ส่ง `run_id` = route สร้างรอบให้เอง (ผู้เรียกเดิมทุกตัวยังใช้ได้เหมือนเดิม)
 * ตอบกลับรูปเดิม **บวก `run_id`**
 */
export async function POST(request: NextRequest) {
  let createdRunId: string | null = null;
  let handedToLib = false;
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth || !companyId || !can(auth, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { marketplace_account_id, mode, dry_run, run_id, variation_ids, trigger } =
      await request.json();
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

    const dryRun = dry_run === true;
    let runId: string | undefined;
    let seedRunItems = false;
    let selected: string[] | undefined;
    let runMode: PullStockMode = (mode as PullStockMode | undefined) || 'fill_blank';

    if (!dryRun) {
      // กันกดซ้อน — สองรอบที่เขียนคลังเดียวกันพร้อมกันทำให้ยอดสุดท้ายเดาไม่ได้
      const running = await findRunningRun(account.id, 'pull_stock');
      if (running) {
        return NextResponse.json(
          { error: 'run_in_progress', run_id: running.id },
          { status: 409 }
        );
      }

      if (run_id) {
        const run = await getRunHead(run_id as string, companyId);
        if (!run || run.account_id !== account.id || run.job !== 'pull_stock') {
          return NextResponse.json({ error: 'run_not_found' }, { status: 404 });
        }
        if (run.status !== 'previewed') {
          return NextResponse.json({ error: 'run_already_used', run_id: run.id }, { status: 409 });
        }
        if (Date.now() - new Date(run.preview_at).getTime() > PREVIEW_MAX_AGE_MS) {
          return NextResponse.json({ error: 'preview_expired', run_id: run.id }, { status: 409 });
        }

        await selectRunItems(run.id, Array.isArray(variation_ids) ? variation_ids : null);
        selected = await selectedVariationIds(run.id);
        runId = run.id;
        runMode = (run.mode as PullStockMode | null) || runMode;
      } else {
        // ไม่มีพรีวิว = สร้างรอบใหม่แล้วให้ชั้นกลางเขียนรายการจากแผนที่คิดได้ตอนทำจริง
        // (ขา pull ต้องอ่านยอดร้านอยู่แล้ว การเก็บรายการจึงไม่เสียโควตาเพิ่ม)
        const run = await createRun({
          company_id: companyId,
          account_id: account.id,
          platform,
          job: 'pull_stock',
          mode: runMode,
          status: 'running',
          warehouse_id: (account.warehouse_id as string | null) ?? null,
          trigger: (trigger as SyncRunTrigger | undefined) || 'manual',
          created_by: auth.userId ?? null,
          started_at: new Date().toISOString(),
        });
        runId = run.id;
        createdRunId = run.id;
        seedRunItems = true;
        if (Array.isArray(variation_ids) && variation_ids.length > 0) selected = variation_ids;
      }

      if (run_id && runId) await startRun(runId);
    }

    const startMs = Date.now();
    handedToLib = true;
    const result = await pullStockForAccount(account as StockSyncAccount, {
      mode: runMode,
      dryRun,
      variationIds: selected,
      runId,
      seedRunItems,
      createdBy: auth.userId ?? null,
    });

    // ดึงจริง (ไม่ใช่ dry run) และผ่าน = ร้านนี้ถือว่าตั้งยอดตั้งต้นแล้ว (ขั้น 2 ของลำดับต้อนรับ)
    if (result.success && !dryRun) {
      await markStockInitialized(account as { id: string; metadata?: Record<string, unknown> | null });
    }

    // log ต้องไม่หาย — route นี้จบแล้ว response ออกทันที ปล่อยลอยไว้ Vercel freeze ทิ้งได้
    await logIntegrationNow({
      company_id: companyId,
      integration: platform,
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'incoming',
      action: 'pull_stock',
      method: 'POST',
      api_path: adapter.pullApiPath,
      request_body: { mode: runMode, dry_run: dryRun, run_id: result.run_id, selected: selected?.length },
      response_body: { checked: result.checked, filled: result.filled, skipped_nonzero: result.skipped_nonzero, overwritten: result.overwritten },
      status: result.success ? 'success' : 'error',
      error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      reference_type: result.run_id ? 'sync_run' : undefined,
      reference_id: result.run_id,
      duration_ms: Date.now() - startMs,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Pull stock error:', error);
    // รอบที่สร้างไว้แต่ยังไม่ทันส่งให้ชั้นกลาง ต้องไม่ค้างสถานะ running ตลอดกาล
    if (createdRunId && !handedToLib) {
      await finishRun(createdRunId, { status: 'failed', errors: ['ดึงสต็อกล้มเหลวก่อนเริ่มทำงาน'] });
    }
    return NextResponse.json({ error: 'Pull stock failed' }, { status: 500 });
  }
}

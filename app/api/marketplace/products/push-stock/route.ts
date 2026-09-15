import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import {
  buildPushPlan,
  pushStockForAccount,
  markStockInitialized,
  summarizeStockPlans,
  toRunItemInput,
} from '@/lib/marketplace/stock-push';
import { getStockAdapter, stockPlatformLabel } from '@/lib/marketplace/stock-adapter';
import type { PushStockResult, StockSyncAccount } from '@/lib/marketplace/stock-adapter';
import {
  createRun,
  findRunningRun,
  finishRun,
  getRun,
  getRunHead,
  latestRunForAccount,
  replaceRunItems,
  selectRunItems,
  startRun,
  updateRunCursor,
} from '@/lib/marketplace/sync-runs';
import type { SyncRun, SyncRunItem, SyncRunTrigger } from '@/lib/marketplace/sync-runs';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import type { QuotaPlatform } from '@/lib/marketplace/platforms';
import { logIntegrationNow } from '@/lib/integration-logger';

// ย้ายคลังแล้วส่งยอดทั้งร้าน — ร้านใหญ่ ~300 สินค้า ใช้เวลานาน
export const maxDuration = 300;

/** พรีวิวที่ค้างไว้นานเกินนี้ถือว่าเก่า — ยอดสองฝั่งขยับไปแล้ว ต้องดูใหม่ก่อนกด */
const PREVIEW_MAX_AGE_MS = 15 * 60_000;

/**
 * ส่งสต็อกขึ้นร้าน — ทุก platform ที่มี adapter (`lib/marketplace/stock-adapter.ts`)
 * `product_id` ว่าง = ส่งยอดของทั้งร้าน (ใช้ตอนย้ายคลังที่ผูกไว้ ยอดทั้งร้านต้องเปลี่ยนตาม)
 *
 * body: `{ marketplace_account_id, product_id?, cursor?, run_id?, variation_ids?, trigger? }`
 * - `run_id` = ลงมือตามที่ผู้ใช้ติ๊กไว้จากหน้าพรีวิว · ไม่ส่ง = route สร้างรอบให้เอง
 * - เรียกซ้ำพร้อม `cursor` เพื่อทำต่อ — จะทำต่อในรอบเดิม (ไม่เปิดรอบใหม่ทุกยก)
 * ตอบกลับรูปเดิม **บวก `run_id`**
 */
export async function POST(request: NextRequest) {
  let runId: string | null = null;
  let handedToAdapter = false;
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth || !companyId || !can(auth, 'marketplace.push')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { product_id, marketplace_account_id, cursor, run_id, variation_ids, trigger } =
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
        { error: `ยังไม่รองรับส่งสต็อกขึ้น ${stockPlatformLabel(platform)}` },
        { status: 400 }
      );
    }

    // โควตาของถัง inventory เต็ม = ยิงไปก็ fail ทุกใบ แถมเผาคะแนน success rate ทิ้ง
    const quota = await isQuotaBlocked(platform as QuotaPlatform, 'inventory');
    if (quota.blocked) {
      return NextResponse.json(
        { error: `โควตา ${stockPlatformLabel(platform)} เต็มชั่วคราว — ลองใหม่หลัง ${quota.until}` },
        { status: 429 }
      );
    }

    // กันกดซ้อน — สองรอบที่ยิงยอดขึ้นร้านเดียวกันพร้อมกันทำให้เลขสุดท้ายบนร้านเดาไม่ได้
    const running = await findRunningRun(account.id, 'push_stock');
    if (running) {
      return NextResponse.json({ error: 'run_in_progress', run_id: running.id }, { status: 409 });
    }

    const startIndex = Math.max(0, Number(cursor) || 0);
    let run: SyncRun | null = null;

    if (run_id) {
      const head = await getRunHead(run_id as string, companyId);
      if (!head || head.account_id !== account.id || head.job !== 'push_stock') {
        return NextResponse.json({ error: 'run_not_found' }, { status: 404 });
      }
      // รอบที่ทำค้างไว้ (partial) กลับมาทำต่อได้ · รอบที่จบแล้วห้ามใช้ซ้ำ
      if (head.status !== 'previewed' && head.status !== 'partial') {
        return NextResponse.json({ error: 'run_already_used', run_id: head.id }, { status: 409 });
      }
      if (head.status === 'previewed' && Date.now() - new Date(head.preview_at).getTime() > PREVIEW_MAX_AGE_MS) {
        return NextResponse.json({ error: 'preview_expired', run_id: head.id }, { status: 409 });
      }
      if (head.status === 'previewed') {
        await selectRunItems(head.id, Array.isArray(variation_ids) ? variation_ids : null);
      }
      run = head;
    } else if (startIndex > 0) {
      // เรียกซ้ำเพื่อทำต่อ (ผู้เรียกเดิมส่งมาแค่ cursor) — ต่อในรอบเดิม ไม่เปิดรอบใหม่ทุกยก
      const latest = await latestRunForAccount(account.id, 'push_stock');
      if (latest && latest.company_id === companyId && latest.status === 'partial' && latest.cursor === startIndex) {
        run = latest;
      }
    }

    if (!run) {
      // ไม่มีพรีวิว — วางแผนจากยอดคลังของเราอย่างเดียว (`shop_before` = null แปลว่า
      // "ยังไม่รู้ว่าบนร้านเท่าไร") เพราะการอ่านทั้งร้านซ้ำเปลืองโควตาโดยไม่เปลี่ยนผลลัพธ์
      const plan = await buildPushPlan(account as StockSyncAccount, {
        productId: (product_id as string | undefined) || undefined,
      });
      run = await createRun({
        company_id: companyId,
        account_id: account.id,
        platform,
        job: 'push_stock',
        status: 'running',
        warehouse_id: plan.warehouseId,
        trigger: (trigger as SyncRunTrigger | undefined) || 'manual',
        created_by: auth.userId ?? null,
        started_at: new Date().toISOString(),
      });
      const picked = Array.isArray(variation_ids) && variation_ids.length > 0
        ? new Set(variation_ids as string[])
        : null;
      await replaceRunItems(
        run.id,
        plan.rows.map(row => toRunItemInput(row, picked ? picked.has(row.variation_id) : undefined)),
      );
    }
    runId = run.id;
    if (run.status !== 'running') await startRun(run.id);

    const loaded = await getRun(run.id, companyId);
    const items: SyncRunItem[] = loaded?.items || [];
    const selectedItems = items.filter(i => i.selected);

    // สินค้าหนึ่งตัว = หนึ่ง call ขึ้นร้าน (ตัวเลือกของมันไปด้วยกันในใบเดียว)
    const byProduct = new Map<string, string[]>();
    for (const item of selectedItems) {
      if (!item.product_id) continue;
      if (product_id && item.product_id !== product_id) continue;
      const list = byProduct.get(item.product_id) || [];
      list.push(item.variation_id);
      byProduct.set(item.product_id, list);
    }

    const startMs = Date.now();
    let result: PushStockResult;
    let stoppedAt: number | null = null;
    const allIds = [...byProduct.keys()];

    handedToAdapter = true;
    if (product_id) {
      const picked = byProduct.get(product_id as string);
      // ไม่มีตัวเลือกไหนถูกติ๊กของสินค้านี้ = ไม่ต้องยิง (ยิงโดยไม่ระบุตัวเลือกจะกลายเป็นส่งทั้งตัว)
      result = picked && picked.length > 0
        ? await pushStockForAccount(account as StockSyncAccount, product_id as string, {
            variationIds: picked,
            runId: run.id,
          })
        : { success: true, updated_models: 0, errors: [] };
    } else {
      // ทั้งร้าน — ยิงทีละสินค้า คุม concurrency ไว้ 3 กันชน rate limit ของแพลตฟอร์ม
      const productIds = allIds.slice(startIndex);

      // หยุดก่อน maxDuration แล้วคืน cursor กลับไป ไม่ใช่ปล่อยให้ platform ตัดกลางคัน
      // แล้วไม่มีใครรู้ว่าทำถึงไหน (pattern เดียวกับ bulk-ship — ดู CLAUDE.md Scale & Queue)
      const TIME_BUDGET_MS = 240_000;
      const { parallelLimit } = await import('@/lib/parallel');
      let done = 0;
      const collected: PushStockResult[] = [];

      const CHUNK = 15;
      for (let i = 0; i < productIds.length; i += CHUNK) {
        if (Date.now() - startMs > TIME_BUDGET_MS) {
          stoppedAt = startIndex + done;
          break;
        }
        const chunk = productIds.slice(i, i + CHUNK);
        const rs = await parallelLimit(chunk, (pid) =>
          pushStockForAccount(account as StockSyncAccount, pid, {
            variationIds: byProduct.get(pid),
            runId: run!.id,
          }), 3);
        collected.push(...rs);
        done += chunk.length;
        // จดความคืบหน้าทุก chunk — ฟังก์ชันโดนตัดกลางทางแล้วยังรู้ว่าทำถึงไหน
        await updateRunCursor(run.id, startIndex + done);
      }

      result = {
        success: stoppedAt === null && collected.every(r => r.success),
        updated_models: collected.reduce((n, r) => n + r.updated_models, 0),
        errors: collected.flatMap(r => r.errors).slice(0, 20),
      };
    }

    const durationMs = Date.now() - startMs;
    const counts = {
      ...summarizeStockPlans(items),
      selected: selectedItems.length,
      changed: result.updated_models,
      failed: Math.max(0, selectedItems.length - result.updated_models),
    };

    if (stoppedAt !== null) {
      await finishRun(run.id, {
        status: 'partial',
        counts,
        errors: result.errors,
        cursor: stoppedAt,
      });
      return NextResponse.json({
        ...result,
        run_id: run.id,
        partial: true,
        next_cursor: stoppedAt,
        total: allIds.length,
        done: stoppedAt,
        message: `ส่งไปแล้ว ${stoppedAt}/${allIds.length} สินค้า — เรียกซ้ำพร้อม cursor เพื่อทำต่อ`,
      });
    }

    await finishRun(run.id, {
      status: result.success ? 'done' : (result.updated_models > 0 ? 'partial' : 'failed'),
      counts,
      errors: result.errors,
      cursor: null,
    });

    // ส่งยอด**ทั้งร้าน**จบครบ = ร้านนี้ถือว่าตั้งยอดตั้งต้นแล้ว (ขั้น 2 ของลำดับต้อนรับ)
    // ส่งทีละสินค้า (product_id) ไม่นับ — เป็นการซิงค์ประจำวัน ไม่ใช่การตั้งยอดทั้งร้าน
    if (!product_id && result.success) {
      await markStockInitialized(account as { id: string; metadata?: Record<string, unknown> | null });
    }

    // log ต้องไม่หาย — response ออกแล้ว Vercel freeze ทิ้งทันที ปล่อยลอยไม่ได้
    await logIntegrationNow({
      company_id: companyId,
      integration: platform,
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'push_stock',
      method: 'POST',
      api_path: adapter.pushApiPath,
      request_body: { product_id: product_id || 'ทั้งร้าน', run_id: run.id, selected: selectedItems.length },
      response_body: result,
      status: result.success ? 'success' : 'error',
      error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      reference_type: 'sync_run',
      reference_id: run.id,
      duration_ms: durationMs,
    });

    return NextResponse.json({ ...result, run_id: run.id });
  } catch (error) {
    console.error('Push stock error:', error);
    // รอบที่เปิดไว้ต้องไม่ค้างสถานะ running ตลอดกาล (ตัวกันกดซ้อนจะล็อกร้านนั้นไว้)
    if (runId) {
      await finishRun(runId, {
        status: handedToAdapter ? 'partial' : 'failed',
        errors: [error instanceof Error ? error.message : 'ส่งสต็อกล้มเหลว'],
      });
    }
    return NextResponse.json({ error: 'Push stock failed' }, { status: 500 });
  }
}

import { NextRequest, NextResponse, after } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { getRun, findRunningRun } from '@/lib/marketplace/sync-runs';
import { assessRevertability, revertSyncRun } from '@/lib/marketplace/sync-revert';
import type { RevertAccount } from '@/lib/marketplace/sync-revert';
import { syncStockNow } from '@/lib/marketplace/stock-push';
import { getStockAdapter, stockPlatformLabel } from '@/lib/marketplace/stock-adapter';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import type { QuotaPlatform } from '@/lib/marketplace/platforms';
import { logIntegrationNow } from '@/lib/integration-logger';
import { guardFeature } from '@/lib/package-gates-server';

// ย้อนทั้งร้านอาจต้องยิงขึ้นร้านเป็นร้อยใบ — งบเวลาเท่ากับ route ที่ลงมือจริง
export const maxDuration = 300;

/**
 * ย้อนรอบซิงค์สต็อกหนึ่งรอบ — สร้าง "รอบย้อน" ที่ชี้กลับมาที่รอบเดิม ไม่ใช่ลบประวัติ
 *
 * ขา pull คืนยอดในคลังเราด้วยส่วนต่าง (ของที่ขายไประหว่างนั้นจะไม่ถูกกลืน)
 * ขา push ส่งเลขเดิมกลับขึ้นร้าน **เฉพาะตัวที่ยอดบนร้านยังเป็นเลขที่เราส่งไป**
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth || !companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(companyId, 'marketplace_sync');
    if (blocked) return blocked;

    const { id } = await params;
    const loaded = await getRun(id, companyId);
    if (!loaded) return NextResponse.json({ error: 'run_not_found' }, { status: 404 });
    const { run, items } = loaded;

    // สิทธิ์ตามงานที่กำลังย้อน — ย้อน push = เขียนข้อมูลบนร้านอีกครั้ง
    const capability = run.job === 'push_stock' ? 'marketplace.push' : 'marketplace.sync';
    if (!can(auth, capability)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: accountRow } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('id', run.account_id)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .maybeSingle();
    if (!accountRow) return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    const account = accountRow as RevertAccount;

    const platform = run.platform;
    if (!getStockAdapter(platform)) {
      return NextResponse.json(
        { error: `ยังไม่รองรับซิงค์สต็อกกับ ${stockPlatformLabel(platform)}` },
        { status: 400 }
      );
    }

    const revertability = await assessRevertability(run, items, account);
    if (!revertability.can_revert) {
      return NextResponse.json(
        {
          error: revertability.reason,
          reason: revertability.reason,
          ...(revertability.newer_run_id ? { newer_run_id: revertability.newer_run_id } : {}),
          warnings: revertability.warnings,
        },
        { status: 409 }
      );
    }

    // กันกดซ้อน — รอบที่กำลังเขียนอยู่กับการย้อนพร้อมกันทำให้ยอดสุดท้ายเดาไม่ได้
    const running = await findRunningRun(run.account_id, run.job);
    if (running) {
      return NextResponse.json(
        { error: 'run_in_progress', reason: 'run_in_progress', run_id: running.id },
        { status: 409 }
      );
    }

    if (run.job === 'push_stock') {
      // ย้อน push ต้องทั้ง "อ่านยอดร้าน" (ถัง product) และ "ยิงยอดขึ้นร้าน" (ถัง inventory)
      // ถังใดถังหนึ่งเต็ม = ทำไม่จบอยู่ดี อย่าเพิ่งเปิดรอบทิ้งไว้
      for (const scope of ['product', 'inventory'] as const) {
        const quota = await isQuotaBlocked(platform as QuotaPlatform, scope);
        if (quota.blocked) {
          return NextResponse.json(
            {
              error: `โควตา ${stockPlatformLabel(platform)} เต็มชั่วคราว — ลองใหม่หลัง ${quota.until}`,
              until: quota.until,
            },
            { status: 429 }
          );
        }
      }
    }

    const startMs = Date.now();
    const result = await revertSyncRun(run, { userId: auth.userId ?? null, items, account });

    await logIntegrationNow({
      company_id: companyId,
      integration: platform,
      account_id: account.id,
      account_name: account.shop_name,
      direction: run.job === 'push_stock' ? 'outgoing' : 'incoming',
      action: run.job === 'push_stock' ? 'revert_push_stock' : 'revert_pull_stock',
      method: 'POST',
      api_path: getStockAdapter(platform)?.[run.job === 'push_stock' ? 'pushApiPath' : 'pullApiPath'],
      request_body: { source_run_id: run.id, items: result.items.length },
      response_body: { status: result.status, counts: result.counts, oversold: result.oversold.length },
      status: result.status === 'reverted' ? 'success' : 'error',
      error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      reference_type: 'sync_run',
      reference_id: result.revert_run_id,
      duration_ms: Date.now() - startMs,
    });

    // ยอดคลังเพิ่งถูกแก้ → ร้านอื่นที่ผูก variation เดียวกันต้องได้เลขใหม่ ไม่งั้นค้างเลขผิด
    // ⚠️ ต้องอยู่ใน after() — ปล่อยลอยแล้ว Vercel freeze ทิ้งทันทีที่ response ออก
    const resync = result.resync;
    if (resync) {
      after(async () => {
        await syncStockNow(resync.variationIds, [resync.warehouseId]);
      });
    }

    return NextResponse.json({
      revert_run_id: result.revert_run_id,
      status: result.status,
      counts: result.counts,
      oversold: result.oversold,
      items: result.items,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Revert sync run error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'ย้อนรอบซิงค์ไม่สำเร็จ' },
      { status: 500 }
    );
  }
}

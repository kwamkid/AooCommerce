// Path: lib/marketplace/webhook-retry.ts
//
// ตาข่ายรับ webhook ที่ทำไม่สำเร็จ — **ใช้ร่วมทุก marketplace**
// เดิม Shopee กับ TikTok มี worker ของตัวเองที่โค้ดเหมือนกันเกือบบรรทัดต่อบรรทัด
// ส่วน Lazada ไม่มีเลย → webhook ที่ fail ของ Lazada ไม่มีใครหยิบไปทำต่อ
//
// เพิ่ม marketplace ใหม่ = สร้าง route 3 บรรทัดที่เรียก `runWebhookRetry()`
// แล้วบอกว่า "งานหนึ่งใบทำยังไง" เท่านั้น — ห้าม copy worker ไปทั้งก้อนอีก
//
// สิ่งที่ worker นี้จัดการให้:
//   • ตรวจ CRON_SECRET (fail closed — ไม่ตั้ง env = ปฏิเสธ ไม่ใช่ปล่อยผ่าน)
//   • เช็ค circuit breaker ก่อนยิง (โควตาหมดแล้วอย่าเผา retry_count ทิ้ง)
//   • หยิบทั้งใบที่ `failed` ถึงรอบ **และใบที่ค้าง `processing` เกินเวลา**
//     (ฟังก์ชันโดน freeze กลางทาง = ใบนั้นค้างตลอดกาล ไม่มี worker ไหนหยิบ
//      เพราะทุกตัวมองแค่ `failed` — เคยค้างจริง 16 ใบ ดู fix-bug.md 2026-08-30)
//   • ตอบ 200 ทันทีแล้วไล่คิวใน after() — งานทั้งชุดเกิน timeout เมื่อไหร่
//     cron-job.org เห็น fail ซ้ำ ๆ แล้วปิด job ให้เอง (เคยเกิด ก.ค. 2026)
//   • backoff + dead letter + log สรุปรอบ
import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logIntegration } from '@/lib/integration-logger';
import { isQuotaBlocked, type QuotaPlatform, type QuotaScope } from '@/lib/marketplace/quota';

/** ค้าง `processing` นานกว่านี้ = ตัวที่ทำงานอยู่ตายไปแล้ว ให้ worker ยึดมาทำต่อ */
const STUCK_PROCESSING_MS = 10 * 60 * 1000;

export interface WebhookRetryJob {
  id: string;
  company_id: string | null;
  account_id: string | null;
  push_code: number;
  raw_payload: Record<string, unknown>;
  retry_count: number | null;
  max_retries: number | null;
}

export interface WebhookRetryOptions<TAccount> {
  /** แพลตฟอร์มของ worker นี้ — ใช้ทั้งกรอง job และเช็ค breaker */
  platform: QuotaPlatform;
  /** scope ของโควตาที่งานนี้กิน (ค่าเริ่มต้น: order) */
  scope?: QuotaScope;
  /**
   * รับใบที่ account.platform เป็น null ด้วย (ข้อมูลยุคก่อนมีหลาย marketplace)
   * — จริงเฉพาะ Shopee ซึ่งเป็นเจ้าแรกของระบบ
   */
  includeLegacyNullPlatform?: boolean;
  /** จำนวนใบต่อรอบ (ค่าเริ่มต้น 10) */
  limit?: number;
  /** งบเวลาต่อรอบ — หมดแล้วหยุด รอบหน้ามาต่อ (ค่าเริ่มต้น 45 วิ) */
  timeBudgetMs?: number;
  /** ทำงานหนึ่งใบ — throw = ล้มเหลว ให้ worker จัดการ backoff/dead letter เอง */
  process: (job: WebhookRetryJob, account: TAccount) => Promise<void>;
}

function authorizeCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const bearerToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const xCronHeader = request.headers.get('x-cron-secret') || '';
  // Fail closed: ไม่ได้ตั้ง CRON_SECRET = ปฏิเสธ (ไม่ใช่ข้ามการตรวจ)
  return !!cronSecret && (bearerToken === cronSecret || xCronHeader === cronSecret);
}

export async function runWebhookRetry<TAccount>(
  request: NextRequest,
  opts: WebhookRetryOptions<TAccount>,
): Promise<NextResponse> {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    platform,
    scope = 'order',
    includeLegacyNullPlatform = false,
    limit = 10,
    timeBudgetMs = 45_000,
    process: processJob,
  } = opts;

  const startTime = Date.now();

  // โควตาหมด/โดน rate limit — รอ reset ก่อน อย่าเผา retry_count ทิ้งเปล่า ๆ
  const quota = await isQuotaBlocked(platform, scope);
  if (quota.blocked) {
    return NextResponse.json({
      message: `${platform} quota/rate limit — retries deferred until ${quota.until}`,
      skipped: true,
    });
  }

  const belongsToPlatform = (row: { marketplace_accounts?: { platform?: string | null } | null }) => {
    const p = row.marketplace_accounts?.platform;
    return p === platform || (includeLegacyNullPlatform && !p);
  };

  // (1) ใบที่ fail แล้วถึงรอบ retry
  // `next_retry_at IS NULL` ต้องนับว่า "ถึงรอบแล้ว" ด้วย — ผู้เขียนบางเส้นทาง
  // mark failed โดยไม่ได้ตั้งเวลานัด ถ้ากรองด้วย lte เฉย ๆ NULL จะหลุดตะแกรง
  // แล้วใบนั้นไม่มีวันถูกหยิบ (เคยค้างจริง ดู fix-bug.md 2026-08-30)
  const nowIso = new Date().toISOString();
  const { data: failedRows } = await supabaseAdmin
    .from('marketplace_webhook_log')
    .select('*, marketplace_accounts!account_id(platform)')
    .eq('processing_status', 'failed')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('next_retry_at', { ascending: true, nullsFirst: true })
    .limit(limit * 3);

  // (2) ใบที่ค้าง processing — ตัวที่เคยจับไปทำแล้วตายกลางทาง
  const { data: stuckRows } = await supabaseAdmin
    .from('marketplace_webhook_log')
    .select('*, marketplace_accounts!account_id(platform)')
    .eq('processing_status', 'processing')
    .lt('created_at', new Date(Date.now() - STUCK_PROCESSING_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(limit * 3);

  const seen = new Set<string>();
  const jobs = [...(failedRows || []), ...(stuckRows || [])]
    .filter(belongsToPlatform)
    .filter((j) => (seen.has(j.id) ? false : (seen.add(j.id), true)))
    .slice(0, limit);

  if (jobs.length === 0) {
    return NextResponse.json({ processed: 0, duration_ms: Date.now() - startTime });
  }

  after(async () => {
    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
      // เหลือเวลาไม่พอก็หยุด — กันโดนตัดกลาง DB write รอบหน้ามาต่อ
      if (Date.now() - startTime > timeBudgetMs) break;
      const jobStart = Date.now();

      await supabaseAdmin
        .from('marketplace_webhook_log')
        .update({ processing_status: 'processing' })
        .eq('id', job.id);

      let account: TAccount | null = null;
      if (job.account_id) {
        const { data } = await supabaseAdmin
          .from('marketplace_accounts')
          .select('*')
          .eq('id', job.account_id)
          .eq('is_active', true)
          .maybeSingle();
        account = (data as TAccount) || null;
      }

      if (!account) {
        await supabaseAdmin
          .from('marketplace_webhook_log')
          .update({
            processing_status: 'dead_letter',
            processing_error: 'Account not found or inactive on retry',
            processed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        failed++;
        processed++;
        continue;
      }

      try {
        await processJob(job as unknown as WebhookRetryJob, account);
        await supabaseAdmin
          .from('marketplace_webhook_log')
          .update({
            processing_status: 'processed',
            processing_error: null,
            processing_duration_ms: Date.now() - jobStart,
            processed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        succeeded++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        const retryCount = (job.retry_count || 0) + 1;
        const maxRetries = job.max_retries || 3;

        if (retryCount >= maxRetries) {
          await supabaseAdmin
            .from('marketplace_webhook_log')
            .update({
              processing_status: 'dead_letter',
              processing_error: errorMsg,
              retry_count: retryCount,
              processing_duration_ms: Date.now() - jobStart,
              processed_at: new Date().toISOString(),
            })
            .eq('id', job.id);
        } else {
          const backoffMs = 30_000 * Math.pow(2, retryCount - 1);
          await supabaseAdmin
            .from('marketplace_webhook_log')
            .update({
              processing_status: 'failed',
              processing_error: errorMsg,
              retry_count: retryCount,
              next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
              processing_duration_ms: Date.now() - jobStart,
              processed_at: new Date().toISOString(),
            })
            .eq('id', job.id);
        }
        failed++;
      }
      processed++;
    }

    const companyId = jobs.find((j) => j.company_id)?.company_id;
    if (companyId) {
      logIntegration({
        company_id: companyId,
        integration: platform,
        direction: 'outgoing',
        action: 'webhook_queue_retry',
        status: failed > 0 ? 'error' : 'success',
        reference_label: `Retried ${processed} webhooks: ${succeeded} ok, ${failed} failed`,
        duration_ms: Date.now() - startTime,
      });
    }

    console.log(
      `[${platform} Retry] processed=${processed} ok=${succeeded} failed=${failed} in ${Date.now() - startTime}ms`,
    );
  });

  return NextResponse.json({ started: true, queued: jobs.length });
}

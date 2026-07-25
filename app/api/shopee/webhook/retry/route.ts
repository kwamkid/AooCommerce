import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee/api';
import { syncSingleOrder } from '@/lib/shopee/webhook-processor';
import { logIntegration } from '@/lib/integration-logger';

export const maxDuration = 60;

/**
 * Queue worker: retry failed/pending webhooks.
 * Called by cron job (Vercel cron or external) every 30-60 seconds.
 * Protected by CRON_SECRET header.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret (supports both Authorization: Bearer and x-cron-secret headers)
  // Fail closed: if CRON_SECRET isn't configured, reject — previously the
  // whole check was skipped when unset, leaving this endpoint public.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const xCronHeader = request.headers.get('x-cron-secret') || '';
  const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!cronSecret || (bearerToken !== cronSecret && xCronHeader !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  // Pick up failed Shopee webhooks ready for retry (limit 10 per run to avoid timeout)
  // Filter by push_code (Shopee uses numeric codes 3, 4, 14 etc. — not prefixed with 'tiktok_')
  // Also filter by account platform to ensure we only process Shopee webhooks
  const { data: jobs } = await supabaseAdmin
    .from('marketplace_webhook_log')
    .select('*, marketplace_accounts!account_id(platform)')
    .eq('processing_status', 'failed')
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(20);

  // Filter to Shopee only (platform = 'shopee' or null for legacy)
  const shopeeJobs = (jobs || []).filter((j: any) => {
    const platform = j.marketplace_accounts?.platform;
    return !platform || platform === 'shopee';
  }).slice(0, 10);

  if (shopeeJobs.length === 0) {
    return NextResponse.json({ processed: 0, duration_ms: Date.now() - startTime });
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const job of shopeeJobs) {
    const jobStart = Date.now();

    // Mark as processing
    await supabaseAdmin
      .from('marketplace_webhook_log')
      .update({ processing_status: 'processing' })
      .eq('id', job.id);

    // Look up account
    let account: ShopeeAccountRow | null = null;
    if (job.account_id) {
      const { data } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', job.account_id)
        .eq('is_active', true)
        .single();
      account = data as ShopeeAccountRow | null;
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

    const payload = job.raw_payload as { shop_id?: number; code?: number; data?: Record<string, unknown> };
    const pushCode = job.push_code;

    try {
      if (pushCode === 3 || pushCode === 14) {
        const orderSn = (payload.data?.ordersn as string) || '';
        if (orderSn) {
          await syncSingleOrder(account, orderSn, (payload.data?.status as string) || undefined);
        }
      }
      // Tracking (code 4) — handled by original webhook, skip on retry since tracking updates are idempotent

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

  // Log the queue worker run
  if (shopeeJobs.length > 0 && shopeeJobs[0].company_id) {
    logIntegration({
      company_id: shopeeJobs[0].company_id,
      integration: 'shopee',
      direction: 'outgoing',
      action: 'webhook_queue_retry',
      status: failed > 0 ? 'error' : 'success',
      reference_label: `Retried ${processed} webhooks: ${succeeded} ok, ${failed} failed`,
      duration_ms: Date.now() - startTime,
    });
  }

  return NextResponse.json({
    processed,
    succeeded,
    failed,
    duration_ms: Date.now() - startTime,
  });
}

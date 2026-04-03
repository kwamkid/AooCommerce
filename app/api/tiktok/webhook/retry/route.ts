import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { TikTokAccountRow } from '@/lib/tiktok/api';
import { syncSingleOrder } from '@/lib/tiktok/webhook-processor';
import { logIntegration } from '@/lib/integration-logger';

export const maxDuration = 60;

/**
 * Queue worker: retry failed TikTok webhooks.
 * Called by cron job every 5 minutes.
 * Protected by CRON_SECRET header.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization') || '';
    const xCronHeader = request.headers.get('x-cron-secret') || '';
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '');
    if (bearerToken !== cronSecret && xCronHeader !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const startTime = Date.now();

  // Pick up failed webhooks that are TikTok-related (push_label starts with tiktok_ or is ORDER_STATUS_CHANGE etc.)
  // We identify TikTok webhooks by checking the account platform
  const { data: jobs } = await supabaseAdmin
    .from('marketplace_webhook_log')
    .select('*, marketplace_accounts!account_id(platform)')
    .eq('processing_status', 'failed')
    .lte('next_retry_at', new Date().toISOString())
    .order('next_retry_at', { ascending: true })
    .limit(10);

  // Filter to TikTok only
  const tiktokJobs = (jobs || []).filter((j: any) => {
    const platform = j.marketplace_accounts?.platform;
    return platform === 'tiktok';
  });

  if (tiktokJobs.length === 0) {
    return NextResponse.json({ processed: 0, duration_ms: Date.now() - startTime });
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const job of tiktokJobs) {
    const jobStart = Date.now();

    // Mark as processing
    await supabaseAdmin
      .from('marketplace_webhook_log')
      .update({ processing_status: 'processing' })
      .eq('id', job.id);

    // Look up account
    let account: TikTokAccountRow | null = null;
    if (job.account_id) {
      const { data } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', job.account_id)
        .eq('is_active', true)
        .single();
      account = data as TikTokAccountRow | null;
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

    const payload = job.raw_payload as { type?: number; data?: Record<string, unknown> };
    const pushCode = job.push_code;

    try {
      // Order-related webhooks (type 1, 2, 4, 12)
      if ([1, 2, 4, 12].includes(pushCode)) {
        const orderId = (payload.data?.order_id as string) || '';
        if (orderId) {
          await syncSingleOrder(account, orderId, (payload.data?.order_status as string) || undefined);
        }
      }

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
  if (tiktokJobs.length > 0 && tiktokJobs[0].company_id) {
    logIntegration({
      company_id: tiktokJobs[0].company_id,
      integration: 'tiktok',
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

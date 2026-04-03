import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyWebhookSignature, TikTokAccountRow } from '@/lib/tiktok/api';
import { syncSingleOrder } from '@/lib/tiktok/webhook-processor';
import { logIntegration } from '@/lib/integration-logger';

export const maxDuration = 60;

/**
 * TikTok Shop Webhook endpoint.
 *
 * Webhook payload format:
 * {
 *   type: number (1=order_status, 2=reverse, 3=address, 4=package, 5=product, ...),
 *   shop_id: string,
 *   data: { order_id: string, order_status?: string, ... },
 *   timestamp: number
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  // Verify signature
  const signature = request.headers.get('authorization') || '';
  const appKey = process.env.TIKTOK_APP_KEY;
  if (!appKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  let signatureValid = false;
  try {
    signatureValid = verifyWebhookSignature(rawBody, signature);
  } catch {
    signatureValid = false;
  }

  // Parse payload
  let payload: {
    type: number;
    shop_id: string;
    data: Record<string, unknown>;
    timestamp: number;
  };

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const shopIdStr = payload.shop_id || '';
  const shopIdNum = parseInt(shopIdStr) || 0;
  const pushCode = payload.type;

  // Look up account
  let account: TikTokAccountRow | null = null;
  let companyId: string | null = null;

  if (shopIdNum) {
    const { data } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('platform', 'tiktok')
      .eq('shop_id', shopIdNum)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (data) {
      account = data as TikTokAccountRow;
      companyId = account.company_id;
    }
  }

  // Determine push label
  const PUSH_LABELS: Record<number, string> = {
    1: 'ORDER_STATUS_CHANGE',
    2: 'REVERSE_ORDER_STATUS_UPDATE',
    3: 'RECIPIENT_ADDRESS_UPDATE',
    4: 'PACKAGE_UPDATE',
    5: 'PRODUCT_STATUS_CHANGE',
    6: 'SELLER_DEAUTHORIZATION',
    7: 'UPCOMING_AUTHORIZATION_EXPIRATION',
    12: 'RETURN_STATUS_UPDATE',
  };

  // Save to webhook log immediately
  const { data: logEntry } = await supabaseAdmin
    .from('marketplace_webhook_log')
    .insert({
      shop_id: shopIdNum,
      company_id: companyId,
      account_id: account?.id || null,
      push_code: pushCode,
      push_label: PUSH_LABELS[pushCode] || `tiktok_type_${pushCode}`,
      raw_payload: payload,
      signature,
      signature_valid: signatureValid,
      processing_status: 'pending',
    })
    .select('id')
    .single();

  // Return 200 immediately (TikTok requires fast response)
  const response = NextResponse.json({ code: 0, message: 'success' });

  // Process in background
  after(async () => {
    if (!logEntry) return;
    const logId = logEntry.id;
    const jobStart = Date.now();

    // Mark as processing
    await supabaseAdmin
      .from('marketplace_webhook_log')
      .update({ processing_status: 'processing' })
      .eq('id', logId);

    if (!account) {
      await supabaseAdmin
        .from('marketplace_webhook_log')
        .update({
          processing_status: 'skipped',
          processing_error: 'Account not found',
          processed_at: new Date().toISOString(),
          processing_duration_ms: Date.now() - jobStart,
        })
        .eq('id', logId);
      return;
    }

    try {
      // Type 1: Order status change
      if (pushCode === 1) {
        const orderId = (payload.data?.order_id as string) || '';
        const orderStatus = (payload.data?.order_status as string) || '';
        if (orderId) {
          await syncSingleOrder(account, orderId, orderStatus);
        }
      }
      // Type 4: Package update (tracking number etc.)
      else if (pushCode === 4) {
        const orderId = (payload.data?.order_id as string) || '';
        if (orderId) {
          await syncSingleOrder(account, orderId);
        }
      }
      // Type 2: Reverse order (cancellation/return status change)
      else if (pushCode === 2 || pushCode === 12) {
        const orderId = (payload.data?.order_id as string) || '';
        if (orderId) {
          await syncSingleOrder(account, orderId);
        }
      }
      // Other types: skip
      else {
        await supabaseAdmin
          .from('marketplace_webhook_log')
          .update({
            processing_status: 'skipped',
            processing_error: `Unhandled push type: ${pushCode}`,
            processed_at: new Date().toISOString(),
            processing_duration_ms: Date.now() - jobStart,
          })
          .eq('id', logId);
        return;
      }

      await supabaseAdmin
        .from('marketplace_webhook_log')
        .update({
          processing_status: 'processed',
          processing_error: null,
          processed_at: new Date().toISOString(),
          processing_duration_ms: Date.now() - jobStart,
        })
        .eq('id', logId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      const backoffMs = 30_000; // 30s for first retry
      await supabaseAdmin
        .from('marketplace_webhook_log')
        .update({
          processing_status: 'failed',
          processing_error: errorMsg,
          retry_count: 0,
          next_retry_at: new Date(Date.now() + backoffMs).toISOString(),
          processed_at: new Date().toISOString(),
          processing_duration_ms: Date.now() - jobStart,
        })
        .eq('id', logId);
    }
  });

  return response;
}

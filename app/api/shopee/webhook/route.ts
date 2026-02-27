import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee/api';
import { logIntegration } from '@/lib/integration-logger';
import { getPushLabel } from '@/lib/shopee/webhook-codes';
import crypto from 'crypto';

// Allow up to 60s — sync runs in background via after() but Vercel
// still needs the function alive for background work to complete.
export const maxDuration = 60;

function verifySignature(url: string, rawBody: string, signature: string, partnerKey: string): boolean {
  try {
    const baseString = `${url}|${rawBody}`;
    const expectedSig = crypto
      .createHmac('sha256', partnerKey)
      .update(baseString)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSig)
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const rawBody = await request.text();
    const authorization = request.headers.get('authorization') || '';

    let payload: { shop_id?: number; code?: number; data?: Record<string, unknown> };
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new NextResponse('', { status: 200 });
    }

    const shopId = payload.shop_id;
    if (!shopId) {
      return new NextResponse('', { status: 200 });
    }

    const pushCode = payload.code ?? -1;

    // Look up account by shop_id (best-effort, don't fail if not found)
    const { data: account } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .single();

    // Verify signature (record but don't block)
    let signatureValid: boolean | null = null;
    const partnerKey = process.env.SHOPEE_PARTNER_KEY || '';
    if (authorization && partnerKey) {
      const publicUrl = 'https://aoocommerce.vercel.app/api/shopee/webhook';
      signatureValid = verifySignature(publicUrl, rawBody, authorization, partnerKey)
        || verifySignature(request.url, rawBody, authorization, partnerKey);
      if (!signatureValid) {
        console.error('Shopee webhook: invalid signature for shop_id:', shopId);
      }
    }

    // === SAVE TO DB IMMEDIATELY ===
    const { data: webhookLog } = await supabaseAdmin
      .from('shopee_webhook_log')
      .insert({
        shop_id: shopId,
        company_id: account?.company_id || null,
        account_id: account?.id || null,
        push_code: pushCode,
        push_label: getPushLabel(pushCode),
        raw_payload: payload,
        signature: authorization || null,
        signature_valid: signatureValid,
        processing_status: 'pending',
      })
      .select('id')
      .single();

    const logId = webhookLog?.id;

    // === RETURN 200 FAST → process in background ===
    const acct = account as ShopeeAccountRow | null;
    after(async () => {
      await processWebhook(logId, pushCode, payload, acct, startTime);
    });

    return new NextResponse('', { status: 200 });
  } catch (error) {
    console.error('Shopee webhook error:', error);
    return new NextResponse('', { status: 200 });
  }
}

// Webhook verification endpoint
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

// ─── Background processing ───────────────────────────────────────────

async function processWebhook(
  logId: string | undefined,
  pushCode: number,
  payload: { shop_id?: number; code?: number; data?: Record<string, unknown> },
  account: ShopeeAccountRow | null,
  startTime: number,
) {
  const updateLog = async (status: string, error?: string) => {
    if (!logId) return;
    await supabaseAdmin
      .from('shopee_webhook_log')
      .update({
        processing_status: status,
        processing_error: error || null,
        processing_duration_ms: Date.now() - startTime,
        processed_at: new Date().toISOString(),
      })
      .eq('id', logId);
  };

  try {
    if (logId) {
      await supabaseAdmin
        .from('shopee_webhook_log')
        .update({ processing_status: 'processing' })
        .eq('id', logId);
    }

    // Handle order-related pushes: code=3 (order_status), code=14 (return/refund)
    if (pushCode === 3 || pushCode === 14) {
      if (!account) {
        await updateLog('skipped', 'No matching marketplace account');
        return;
      }

      const orderSn = payload.data?.ordersn as string;
      const shopeeStatus = (payload.data?.status as string) || '';
      const actionLabel = pushCode === 3 ? 'webhook_order_status' : 'webhook_return_refund';

      if (!orderSn) {
        await updateLog('skipped', 'No ordersn in payload');
        return;
      }

      // Log incoming webhook to integration_logs (per-company visibility)
      logIntegration({
        company_id: account.company_id,
        integration: 'shopee',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'incoming',
        action: actionLabel,
        method: 'POST',
        api_path: '/api/shopee/webhook',
        request_body: payload,
        status: 'success',
        reference_type: 'order',
        reference_id: orderSn,
        reference_label: shopeeStatus
          ? `Order ${orderSn} → ${shopeeStatus}`
          : `Order ${orderSn}`,
        duration_ms: Date.now() - startTime,
      });

      try {
        await syncSingleOrder(account, orderSn, shopeeStatus || undefined);
        await updateLog('processed');
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown sync error';
        console.error('Shopee webhook sync error:', err);
        await updateLog('failed', errorMsg);
      }
      return;
    }

    // All other push codes — not handled yet, mark as skipped
    if (!account) {
      await updateLog('skipped', 'No matching marketplace account');
    } else {
      await updateLog('skipped', `Unhandled push code: ${pushCode}`);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Shopee webhook processing error:', err);
    await updateLog('failed', errorMsg);
  }
}

// ─── Order sync (unchanged) ──────────────────────────────────────────

async function syncSingleOrder(account: ShopeeAccountRow, orderSn: string, webhookStatus?: string) {
  const { syncOrdersByOrderSn } = await import('@/lib/shopee/sync');

  // Dedup: skip only if this exact order was updated within 10s AND already has the correct status
  if (webhookStatus) {
    const { data: existingOrder } = await supabaseAdmin
      .from('orders')
      .select('id, external_status, updated_at')
      .eq('company_id', account.company_id)
      .eq('external_order_sn', orderSn)
      .gte('updated_at', new Date(Date.now() - 10_000).toISOString())
      .maybeSingle();

    if (existingOrder && existingOrder.external_status === webhookStatus) {
      console.log(`[Shopee Webhook] Skipping duplicate sync for ${orderSn} — already ${webhookStatus}`);
      return;
    }
  }

  // Create sync log entry (before sync, so we can track failures)
  const { data: log } = await supabaseAdmin
    .from('marketplace_sync_log')
    .insert({
      marketplace_account_id: account.id,
      company_id: account.company_id,
      sync_type: 'webhook',
    })
    .select()
    .single();

  try {
    const webhookStatusHint = webhookStatus ? { [orderSn]: webhookStatus } : undefined;
    const result = await syncOrdersByOrderSn(account, [orderSn], undefined, webhookStatusHint);

    // Update sync log with results
    if (log) {
      await supabaseAdmin
        .from('marketplace_sync_log')
        .update({
          orders_fetched: 1,
          orders_created: result.orders_created,
          orders_updated: result.orders_updated,
          errors: result.errors.length > 0 ? result.errors : null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', log.id);
    }

    // Log sync error to integration_logs for UI visibility
    if (result.errors.length > 0) {
      logIntegration({
        company_id: account.company_id,
        integration: 'shopee',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'incoming',
        action: 'webhook_sync_error',
        method: 'POST',
        api_path: '/api/shopee/webhook',
        status: 'error',
        error_message: result.errors.join('; '),
        reference_type: 'order',
        reference_id: orderSn,
        reference_label: `Sync failed: ${orderSn}`,
      });
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown sync error';
    if (log) {
      await supabaseAdmin
        .from('marketplace_sync_log')
        .update({
          orders_fetched: 1,
          errors: [errorMsg],
          completed_at: new Date().toISOString(),
        })
        .eq('id', log.id);
    }

    logIntegration({
      company_id: account.company_id,
      integration: 'shopee',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'incoming',
      action: 'webhook_sync_error',
      method: 'POST',
      api_path: '/api/shopee/webhook',
      status: 'error',
      error_message: errorMsg,
      reference_type: 'order',
      reference_id: orderSn,
      reference_label: `Sync failed: ${orderSn}`,
    });

    throw err;
  }
}

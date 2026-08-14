import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyLazadaPushSignature, LazadaAccountRow } from '@/lib/lazada/api';
import { logIntegration } from '@/lib/integration-logger';

export const maxDuration = 60;

/**
 * Lazada Push Mechanism webhook.
 *
 * ⚠️ Lazada requires a 200 within 500ms — respond IMMEDIATELY and do ALL work
 * (including the audit log insert) in after(). >50% failure rate → Lazada
 * stops pushing to this URL.
 *
 * Payload: { seller_id, message_type, data: {...}, timestamp, site }
 * Signature: Authorization header = HEX(HMAC-SHA256(app_key + rawBody, app_secret))
 *
 * IM pushes are handled notify-then-pull (lib/services/chat/lazada.ts) —
 * whatever the payload shape, we pull the session truth from the IM API.
 * Order pushes (message_type 0) are logged and skipped (no Lazada order sync yet).
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse('', { status: 200 });
  }
  const authorization = request.headers.get('authorization') || '';

  // Return 200 NOW — everything else happens in the background
  after(async () => {
    try {
      let payload: { seller_id?: string; message_type?: number; data?: Record<string, unknown>; timestamp?: number; site?: string };
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return;
      }

      const sellerId = parseInt(payload.seller_id || '0') || 0;
      const messageType = payload.message_type ?? -1;
      const signatureValid = verifyLazadaPushSignature(rawBody, authorization);

      // Look up account by seller_id
      let account: LazadaAccountRow | null = null;
      if (sellerId) {
        const { data } = await supabaseAdmin
          .from('marketplace_accounts')
          .select('*')
          .eq('platform', 'lazada')
          .eq('shop_id', sellerId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        account = (data as LazadaAccountRow) || null;
      }

      // Audit log (valid AND rejected)
      const { data: webhookLog } = await supabaseAdmin
        .from('marketplace_webhook_log')
        .insert({
          shop_id: sellerId,
          company_id: account?.company_id || null,
          account_id: account?.id || null,
          push_code: messageType,
          push_label: `lazada_${messageType}`,
          raw_payload: payload,
          signature: authorization || null,
          signature_valid: signatureValid,
          processing_status: signatureValid && account ? 'processing' : 'skipped',
          processing_error: !signatureValid ? 'Invalid signature' : !account ? 'No matching marketplace account' : null,
        })
        .select('id')
        .single();

      if (!signatureValid || !account) return;
      const logId = webhookLog?.id;

      const updateLog = async (status: string, error?: string) => {
        if (!logId) return;
        await supabaseAdmin
          .from('marketplace_webhook_log')
          .update({
            processing_status: status,
            processing_error: error || null,
            processing_duration_ms: Date.now() - startTime,
            processed_at: new Date().toISOString(),
          })
          .eq('id', logId);
      };

      // Order pushes — no Lazada order sync yet, keep for audit
      if (messageType === 0) {
        await updateLog('skipped', 'Lazada order sync not implemented');
        return;
      }

      // Everything else → treat as chat-relevant, notify-then-pull
      logIntegration({
        company_id: account.company_id,
        integration: 'lazada',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'incoming',
        action: 'webhook_push',
        method: 'POST',
        api_path: '/api/lazada/webhook',
        request_body: payload,
        status: 'success',
        reference_type: 'chat',
        reference_label: `Lazada push type ${messageType}`,
        duration_ms: Date.now() - startTime,
      });

      try {
        const { processLazadaPush } = await import('@/lib/services/chat/lazada');
        const result = await processLazadaPush(account, payload);
        await updateLog(result.status, result.detail);
      } catch (err) {
        await updateLog('failed', err instanceof Error ? err.message : 'Unknown error');
      }
    } catch (err) {
      console.error('Lazada webhook background error:', err);
    }
  });

  return new NextResponse('', { status: 200 });
}

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

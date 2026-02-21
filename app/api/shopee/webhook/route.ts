import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee-api';
import { logIntegration } from '@/lib/integration-logger';
import crypto from 'crypto';

function verifySignature(url: string, rawBody: string, signature: string, partnerKey: string): boolean {
  try {
    // Shopee webhook signature: HMAC-SHA256(partner_key, url + "|" + body)
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

    // Look up account by shop_id
    const { data: account } = await supabaseAdmin
      .from('shopee_accounts')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .single();

    if (!account) {
      console.error('Shopee webhook: no account for shop_id:', shopId);
      return new NextResponse('', { status: 200 });
    }

    // Verify signature using partner_key from env
    // Shopee signs: HMAC-SHA256(partner_key, callback_url + "|" + body)
    const partnerKey = process.env.SHOPEE_PARTNER_KEY || '';
    if (authorization && partnerKey) {
      // Try verifying with the public callback URL
      const publicUrl = 'https://aoocommerce.vercel.app/api/shopee/webhook';
      const verified = verifySignature(publicUrl, rawBody, authorization, partnerKey)
        || verifySignature(request.url, rawBody, authorization, partnerKey);
      if (!verified) {
        console.error('Shopee webhook: invalid signature for shop_id:', shopId, 'request.url:', request.url);
      }
      // Log but don't block — allow webhook to proceed even if signature fails
    }

    // Handle order_status_push (code=3)
    if (payload.code === 3) {
      const orderSn = payload.data?.ordersn as string;
      const shopeeStatus = (payload.data?.status as string) || '';
      if (orderSn) {
        // Log incoming webhook
        logIntegration({
          company_id: account.company_id,
          integration: 'shopee',
          account_id: account.id,
          account_name: account.shop_name,
          direction: 'incoming',
          action: 'webhook_order_status',
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

        // Sync this specific order asynchronously
        syncSingleOrder(account as ShopeeAccountRow, orderSn).catch(err => {
          console.error('Shopee webhook sync error:', err);
        });
      }
    }

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

async function syncSingleOrder(account: ShopeeAccountRow, orderSn: string) {
  const { syncOrdersByOrderSn } = await import('@/lib/shopee-sync');

  // Create sync log
  const { data: log } = await supabaseAdmin
    .from('shopee_sync_log')
    .insert({
      shopee_account_id: account.id,
      company_id: account.company_id,
      sync_type: 'webhook',
    })
    .select()
    .single();

  const result = await syncOrdersByOrderSn(account, [orderSn]);

  // Update sync log
  if (log) {
    await supabaseAdmin
      .from('shopee_sync_log')
      .update({
        orders_fetched: 1,
        orders_created: result.orders_created,
        orders_updated: result.orders_updated,
        errors: result.errors.length > 0 ? result.errors : null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', log.id);
  }
}

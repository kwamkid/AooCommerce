import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/shopee/webhook/test
 *
 * Simulate a Shopee webhook by forwarding payload to the real webhook handler.
 * Accepts the Push Message JSON from Shopee Push Log.
 *
 * Usage: POST with body = the Push Message JSON from Shopee, e.g.:
 * {"msg_id":"...","data":{"ordersn":"2602170UW9P98E","status":"COMPLETED",...},"shop_id":1582975737,"code":3,"timestamp":...}
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    // Only allow in production if caller knows the partner key
    const testKey = request.headers.get('x-test-key');
    if (testKey !== process.env.SHOPEE_PARTNER_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const body = await request.text();

  // Forward to real webhook handler (without authorization header so signature check is skipped)
  const webhookUrl = new URL('/api/shopee/webhook', request.url);
  const res = await fetch(webhookUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const responseText = await res.text();

  return NextResponse.json({
    success: true,
    message: 'Webhook test payload forwarded',
    webhook_status: res.status,
    webhook_response: responseText || '(empty)',
    payload_preview: JSON.parse(body),
  });
}

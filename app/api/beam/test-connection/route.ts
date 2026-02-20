// Test Beam API credentials + webhook endpoint reachability
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { merchant_id, api_key, environment, webhook_url } = await request.json();

    if (!merchant_id || !api_key) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    const baseUrl = environment === 'production'
      ? 'https://api.beamcheckout.com'
      : 'https://playground.api.beamcheckout.com';

    // 1. Test Beam API credentials
    const res = await fetch(`${baseUrl}/api/v1/payment-links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${merchant_id}:${api_key}`).toString('base64'),
      },
      body: JSON.stringify({
        order: {
          currency: 'THB',
          netAmount: 100,
          description: 'Connection test',
          referenceId: `test-${Date.now()}`,
        },
        linkSettings: {
          qrPromptPay: { isEnabled: true },
        },
      }),
    });

    let credentialsOk = false;

    if (res.status === 401 || res.status === 403) {
      return NextResponse.json({
        credentials: false,
        webhook: false,
        error: 'Merchant ID หรือ API Key ไม่ถูกต้อง',
      });
    }

    if (res.ok) {
      credentialsOk = true;
      // Cancel the test payment link
      const result = await res.json();
      if (result.paymentLinkId) {
        fetch(`${baseUrl}/api/v1/payment-links/${result.paymentLinkId}/cancel`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${merchant_id}:${api_key}`).toString('base64'),
          },
        }).catch(() => {});
      }
    } else {
      const errBody = await res.text();
      const errLower = errBody.toLowerCase();
      // 400 validation error = credentials OK, just validation issue
      if (res.status === 400 && !errLower.includes('unauthorized') && !errLower.includes('forbidden')) {
        credentialsOk = true;
      }
    }

    // 2. Test webhook endpoint (send a mock POST to our own webhook)
    let webhookOk = false;
    if (webhook_url) {
      try {
        const webhookRes = await fetch(webhook_url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Beam-Event': 'test.ping',
          },
          body: JSON.stringify({
            event: 'test.ping',
            data: { test: true, timestamp: new Date().toISOString() },
          }),
        });
        webhookOk = webhookRes.ok;
      } catch {
        webhookOk = false;
      }
    }

    return NextResponse.json({
      credentials: credentialsOk,
      webhook: webhookOk,
    });
  } catch (error) {
    console.error('Beam test connection error:', error);
    return NextResponse.json({
      credentials: false,
      webhook: false,
      error: 'ไม่สามารถทดสอบการเชื่อมต่อได้',
    });
  }
}

// Test Beam API credentials + webhook endpoint reachability
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    // Was unauthenticated + fetched a client-supplied webhook_url (blind SSRF).
    // Now: settings-level auth, and the webhook target is derived server-side
    // from our own origin — never taken from the request body.
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'masterdata.payment_channels')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { merchant_id, api_key, environment } = await request.json();

    if (!merchant_id || !api_key) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }

    // Our own webhook endpoint — derived from the request origin, not the body,
    // so this route can never be used to probe arbitrary hosts.
    const webhook_url = new URL('/api/beam/webhook', request.nextUrl.origin).toString();

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

    // 2. Test webhook endpoint reachability (ping our own webhook).
    // The webhook now rejects unsigned requests with 401 by design, so
    // "reachable" = we got any HTTP response back (not a network failure).
    let webhookOk = false;
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
      webhookOk = webhookRes.status > 0;
    } catch {
      webhookOk = false;
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

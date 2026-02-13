// Beam Checkout webhook receiver
// Receives payment confirmation events and updates order/payment status
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function verifyBeamSignature(body: string, signature: string, hmacKey: string): boolean {
  try {
    // Beam uses HMAC-SHA256 with base64-encoded key and signature
    const keyBuffer = Buffer.from(hmacKey, 'base64');
    const computed = crypto
      .createHmac('sha256', keyBuffer)
      .update(body)
      .digest('base64');
    return computed === signature;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-beam-signature') || '';
    const eventType = request.headers.get('x-beam-event') || '';

    console.log('Beam webhook received:', eventType);

    // Parse the event payload
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(body);
    } catch {
      console.error('Invalid JSON in webhook body');
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Fetch gateway config for signature verification
    const { data: gatewayChannel } = await supabaseAdmin
      .from('payment_channels')
      .select('config')
      .eq('channel_group', 'bill_online')
      .eq('type', 'payment_gateway')
      .eq('is_active', true)
      .single();

    if (!gatewayChannel) {
      console.error('No gateway channel configured for webhook verification');
      return NextResponse.json({ success: true }); // Ack to prevent retries
    }

    const cfg = gatewayChannel.config as Record<string, unknown>;
    const hmacKey = cfg.webhook_secret as string || cfg.api_key as string;

    // Verify signature if we have a key and signature
    if (signature && hmacKey) {
      if (!verifyBeamSignature(body, signature, hmacKey)) {
        console.error('Invalid Beam webhook signature');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    // Handle payment success events
    if (eventType === 'payment_link.paid' || eventType === 'charge.succeeded') {
      // Extract payment link ID from event data
      const eventData = (event.data || event) as Record<string, unknown>;
      const paymentLinkId = eventData.paymentLinkId as string
        || (eventData as Record<string, unknown>).id as string;
      const chargeId = eventData.chargeId as string || null;

      if (!paymentLinkId) {
        console.error('No paymentLinkId in webhook event:', JSON.stringify(event).slice(0, 500));
        return NextResponse.json({ success: true }); // Ack
      }

      // Find payment_record by gateway_payment_link_id
      const { data: paymentRecord } = await supabaseAdmin
        .from('payment_records')
        .select('id, order_id, status')
        .eq('gateway_payment_link_id', paymentLinkId)
        .single();

      if (!paymentRecord) {
        console.error('No payment record found for paymentLinkId:', paymentLinkId);
        return NextResponse.json({ success: true }); // Ack
      }

      // Idempotency: skip if already verified
      if (paymentRecord.status === 'verified') {
        console.log('Payment already verified for paymentLinkId:', paymentLinkId);
        return NextResponse.json({ success: true });
      }

      // Update payment record to verified
      await supabaseAdmin.from('payment_records').update({
        status: 'verified',
        gateway_charge_id: chargeId,
        gateway_status: 'PAID',
        gateway_raw_response: event,
        updated_at: new Date().toISOString(),
      }).eq('id', paymentRecord.id);

      // Update order payment_status to paid
      await supabaseAdmin.from('orders').update({
        payment_status: 'paid',
        updated_at: new Date().toISOString(),
      }).eq('id', paymentRecord.order_id);

      console.log('Payment verified via webhook for order:', paymentRecord.order_id);
    } else {
      console.log('Unhandled webhook event type:', eventType);
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Beam webhook error:', error);
    // Return 200 even on error to prevent Beam from retrying endlessly
    return NextResponse.json({ success: true });
  }
}

// GET — for webhook endpoint verification
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

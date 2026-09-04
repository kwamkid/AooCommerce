// Beam Checkout webhook receiver
// Receives payment confirmation events and updates order/payment status
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { logIntegrationNow } from '@/lib/integration-logger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SECRET_KEY!),
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
    // Timing-safe compare — reject length mismatch before timingSafeEqual (which throws on it)
    const a = Buffer.from(computed);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
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
      .select('config, company_id')
      .eq('channel_group', 'bill_online')
      .eq('type', 'payment_gateway')
      .eq('is_active', true)
      .single();

    if (!gatewayChannel) {
      // Can't verify without the gateway config — refuse rather than process
      // an unverifiable event (previously acked 200, which let forged events
      // through when config was missing).
      console.error('No gateway channel configured for webhook verification');
      return NextResponse.json({ error: 'Not configured' }, { status: 401 });
    }

    const cfg = gatewayChannel.config as Record<string, unknown>;
    const hmacKey = cfg.webhook_secret as string || cfg.api_key as string;

    // Signature is MANDATORY. Previously verification only ran when the
    // caller chose to send a signature header — omitting it skipped the
    // check and let anyone mark an order paid. Now: no signature, no key,
    // or bad signature → 401 before any state change.
    if (!signature) {
      console.error('Beam webhook rejected: missing x-beam-signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }
    if (!hmacKey) {
      console.error('Beam webhook rejected: no verification key configured');
      return NextResponse.json({ error: 'Not configured' }, { status: 401 });
    }
    if (!verifyBeamSignature(body, signature, hmacKey)) {
      console.error('Beam webhook rejected: invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // บันทึกทุก event ที่ผ่านการตรวจลายเซ็นแล้ว — เวลาสถานะไม่ขยับจะได้ตอบได้ว่า
    // "webhook มาถึงไหม / ชื่อ event อะไร / จับคู่ออเดอร์ได้ไหม" (เดิมมีแต่ console.log
    // บน Vercel ซึ่งย้อนดูยากและหายตามอายุ log)
    const logWebhook = (
      status: 'success' | 'error',
      note: string,
      companyId?: string | null,
      orderId?: string | null,
    ) => logIntegrationNow({
      company_id: companyId || (gatewayChannel as { company_id?: string }).company_id || '',
      integration: 'beam',
      direction: 'incoming',
      action: `webhook_${eventType || 'unknown'}`,
      api_path: '/api/beam/webhook',
      request_body: event,
      status,
      error_message: status === 'error' ? note : undefined,
      response_body: { note },
      reference_type: orderId ? 'order' : undefined,
      reference_id: orderId || undefined,
    }).catch(() => { /* log ห้ามทำให้ webhook ล้ม */ });

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
      const { data: existingRecord } = await supabaseAdmin
        .from('payment_records')
        .select('id, order_id, status')
        .eq('gateway_payment_link_id', paymentLinkId)
        .single();

      let paymentRecord = existingRecord;

      // ไม่เจอแถว = ตอนสร้างลิงก์บันทึกไม่ติด — **ห้ามปล่อยผ่าน** เพราะเงินเข้าจริงแล้ว
      // กู้จาก referenceId (เราส่ง order.id ไปกับ order ตอนสร้างลิงก์) แล้วสร้างแถวย้อนหลัง
      if (!paymentRecord) {
        const orderRef = (eventData.referenceId
          || (eventData.order as Record<string, unknown> | undefined)?.referenceId) as string | undefined;
        console.error('No payment record for paymentLinkId:', paymentLinkId, '— referenceId:', orderRef);

        if (!orderRef) {
          await logWebhook('error', `หาแถวจาก paymentLinkId=${paymentLinkId} ไม่เจอ และไม่มี referenceId ให้กู้`);
          return NextResponse.json({ success: true }); // Ack — ไม่มีอะไรให้กู้
        }

        const { data: refOrder } = await supabaseAdmin
          .from('orders')
          .select('id, company_id, total_amount')
          .eq('id', orderRef)
          .single();
        if (!refOrder) return NextResponse.json({ success: true }); // Ack

        const { data: created, error: createError } = await supabaseAdmin
          .from('payment_records')
          .insert({
            company_id: refOrder.company_id,
            order_id: refOrder.id,
            payment_method: 'payment_gateway',
            amount: refOrder.total_amount,
            status: 'pending',
            gateway_provider: 'beam',
            gateway_payment_link_id: paymentLinkId,
            gateway_status: 'PAID',
            gateway_raw_response: event,
          })
          .select('id, order_id, status')
          .single();
        if (createError || !created) {
          console.error('Beam webhook: could not backfill payment record:', createError);
          return NextResponse.json({ success: true }); // Ack — กัน Beam retry ไม่จบ
        }
        paymentRecord = created;
      }

      // Idempotency: skip if already verified
      if (paymentRecord.status === 'verified') {
        console.log('Payment already verified for paymentLinkId:', paymentLinkId);
        return NextResponse.json({ success: true });
      }

      // Update payment record to verified
      const { error: verifyError } = await supabaseAdmin.from('payment_records').update({
        status: 'verified',
        gateway_charge_id: chargeId,
        gateway_status: 'PAID',
        gateway_raw_response: event,
        updated_at: new Date().toISOString(),
      }).eq('id', paymentRecord.id);
      if (verifyError) {
        // เงินเข้าแล้วแต่บันทึกไม่ติด — ต้องเห็นใน log ไม่ใช่เงียบ (เคยล้มเงียบมาแล้ว)
        console.error('Beam webhook: mark payment record verified failed:', verifyError);
      }

      // Update order payment_status to paid
      //
      // เลื่อน order_status ด้วย (new → ready_to_ship) ให้ตรงกับทางแจ้งโอนสลิป
      // ใน /api/bills — ไม่งั้นออเดอร์ที่ "จ่ายเงินเข้ามาจริงแล้ว" จะค้างอยู่แท็บ
      // "ใหม่" ขณะที่ออเดอร์แนบสลิปที่ยังไม่ตรวจกลับไปอยู่ "รอกดรับ" ก่อน
      // (ลูกค้าฝั่งหน้าร้านก็จะเห็นแถบสถานะไม่ขยับทั้งที่ตัดบัตรผ่านแล้ว)
      const { data: paidOrder } = await supabaseAdmin
        .from('orders')
        .select('order_status')
        .eq('id', paymentRecord.order_id)
        .single();

      const { error: orderError } = await supabaseAdmin.from('orders').update({
        payment_status: 'paid',
        ...(paidOrder?.order_status === 'new' ? { order_status: 'ready_to_ship' } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', paymentRecord.order_id);
      if (orderError) {
        console.error('Beam webhook: mark order paid failed:', orderError, paymentRecord.order_id);
      }

      console.log('Payment verified via webhook for order:', paymentRecord.order_id);
      await logWebhook('success', 'อัพเดทออเดอร์เป็นชำระแล้ว', null, paymentRecord.order_id);
    } else {
      // event ที่เราไม่ได้รองรับ — ต้องเห็นใน log ไม่งั้นจะไม่มีวันรู้ว่า Beam
      // ส่งชื่อ event อะไรมาจริง ๆ แล้วเราตกไปกี่ใบ
      console.log('Unhandled webhook event type:', eventType);
      await logWebhook('error', `ไม่รองรับ event นี้: ${eventType || '(ไม่มีชื่อ event)'}`);
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

// Beam Checkout webhook receiver — รับ event "จ่ายแล้ว" แล้วอัพเดทออเดอร์
//
// เอกสาร: https://docs.beamcheckout.com/webhook-authentication · /webhook-event-types
//   header  X-Beam-Event      = ชื่อ event (payment_link.paid · charge.succeeded · …)
//   header  X-Beam-Signature  = base64( HMAC-SHA256( key = base64decode(HMAC key จาก Lighthouse), body ดิบ ) )
//   body    payment_link.paid = { paymentLinkId, merchantId, status:'PAID', order:{ referenceId, … } }
//           charge.succeeded  = { chargeId, merchantId, referenceId, status, source, sourceId, … }
//
// ⚠️ บทเรียน 2026-09-06 (จ่ายบัตรผ่าน 3 ใบ ไม่มีใบไหนอัพเดทเอง):
//   1. เดิมหา config ด้วย `.single()` โดยไม่กรองบริษัท — พอมีร้านเปิด gateway มากกว่า 1 ร้าน
//      `.single()` คืน error → ตอบ 401 "Not configured" ให้ Beam **ทุกใบ** โดยไม่ log อะไรเลย
//      → ตอนนี้เลือก config จาก `merchantId` ที่ Beam ส่งมาใน body (แต่ละร้านมี merchant คนละตัว)
//   2. HMAC key ของ webhook เป็น**คนละตัวกับ API key** (Lighthouse ให้ตอนสร้าง webhook) —
//      เดิม fallback ไปใช้ API key จึงไม่มีทางตรง · ไม่ตั้ง key = บอกตรง ๆ ใน log ว่าต้องไปตั้ง
//   3. **ทุกทางที่ปฏิเสธต้องลง integration_logs** — 401 ที่มีแต่ console.error คือความเงียบ
//      ที่ทำให้ไล่ไม่เจอมา 3 รอบ
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logIntegrationNow } from '@/lib/integration-logger';
import { loadBeamGateways, type BeamGateway } from '@/lib/beam/client';
import { settleGatewayPayment, type GatewayPaymentRecord } from '@/lib/beam/settle';

function verifyBeamSignature(body: string, signature: string, hmacKey: string): boolean {
  try {
    const keyBuffer = Buffer.from(hmacKey, 'base64');
    const computed = crypto.createHmac('sha256', keyBuffer).update(body).digest('base64');
    const a = Buffer.from(computed);
    const b = Buffer.from(signature);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('x-beam-signature') || '';
    const eventType = request.headers.get('x-beam-event') || '';

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    // บาง event ห่อใน data — รองรับทั้งสองทรง
    const data = asRecord(event.data ?? event);
    const merchantId = typeof data.merchantId === 'string' ? data.merchantId : undefined;

    // ── เลือกร้านจาก merchantId ── (ไม่มี merchantId = ลองทุกร้านที่เปิด gateway แล้วให้ลายเซ็นตัดสิน)
    const candidates = await loadBeamGateways(merchantId ? { merchantId } : {});
    const logFor = (
      companyIds: string[],
      status: 'success' | 'error',
      note: string,
      orderId?: string | null,
    ) => Promise.all(companyIds.map(companyId => logIntegrationNow({
      company_id: companyId,
      integration: 'beam',
      direction: 'incoming',
      action: `webhook_${eventType || 'unknown'}`,
      api_path: '/api/beam/webhook',
      request_body: event,
      status,
      error_message: status === 'error' ? note : undefined,
      response_body: { note, merchantId: merchantId || null },
      reference_type: orderId ? 'order' : undefined,
      reference_id: orderId || undefined,
    }).catch(() => { /* log ห้ามทำให้ webhook ล้ม */ })));

    if (candidates.length === 0) {
      console.error('[Beam webhook] no active gateway for merchantId:', merchantId);
      return NextResponse.json({ error: 'Not configured' }, { status: 401 });
    }
    const candidateCompanies = [...new Set(candidates.map(c => c.companyId))];

    if (!signature) {
      await logFor(candidateCompanies, 'error', 'Beam ส่งมาโดยไม่มี X-Beam-Signature — ปฏิเสธ');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const withKey = candidates.filter(c => c.webhookSecret);
    if (withKey.length === 0) {
      await logFor(candidateCompanies, 'error',
        'ยังไม่ได้ตั้ง Webhook HMAC key — ไปที่ ตั้งค่า › ช่องทางชำระเงิน › Beam วาง key ที่ได้จาก Beam Lighthouse ตอนสร้าง webhook แล้วบันทึก (ระหว่างนี้ระบบถามสถานะกับ Beam เองทุก 15 นาที)');
      return NextResponse.json({ error: 'Webhook key not configured' }, { status: 401 });
    }

    const gateway: BeamGateway | undefined = withKey.find(c => verifyBeamSignature(body, signature, c.webhookSecret!));
    if (!gateway) {
      await logFor(withKey.map(c => c.companyId), 'error',
        'ลายเซ็นไม่ตรง — HMAC key ในระบบไม่ใช่ key ของ webhook ตัวนี้ใน Beam Lighthouse (คนละตัวกับ API key) ตรวจแล้ววางใหม่');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    const companyId = gateway.companyId;
    const logWebhook = (status: 'success' | 'error', note: string, orderId?: string | null) =>
      logFor([companyId], status, note, orderId);

    // ── event ที่แปลว่า "เงินเข้าแล้ว" ──
    if (eventType === 'payment_link.paid' || eventType === 'charge.succeeded') {
      // payment_link.paid มี paymentLinkId ตรง ๆ · charge.succeeded บอกผ่าน source/sourceId
      const paymentLinkId = (typeof data.paymentLinkId === 'string' && data.paymentLinkId)
        || (data.source === 'PAYMENT_LINK' && typeof data.sourceId === 'string' ? data.sourceId : '')
        || '';
      const chargeId = typeof data.chargeId === 'string' ? data.chargeId : null;
      const orderRef = (typeof data.referenceId === 'string' && data.referenceId)
        || (typeof asRecord(data.order).referenceId === 'string' ? (asRecord(data.order).referenceId as string) : '')
        || '';

      if (!paymentLinkId && !orderRef) {
        await logWebhook('error', 'event นี้ไม่มีทั้ง paymentLinkId และ referenceId — จับคู่ออเดอร์ไม่ได้');
        return NextResponse.json({ success: true }); // ack — ไม่มีอะไรให้ทำ
      }

      // 1) หาแถวจากลิงก์ (เฉพาะร้านนี้ — กันข้ามบริษัท)
      let record: GatewayPaymentRecord | null = null;
      if (paymentLinkId) {
        const { data: found } = await supabaseAdmin
          .from('payment_records')
          .select('id, order_id, company_id, status, gateway_payment_link_id')
          .eq('gateway_payment_link_id', paymentLinkId)
          .eq('company_id', companyId)
          .maybeSingle();
        record = (found as GatewayPaymentRecord | null) || null;
      }

      // 2) ไม่เจอ = ตอนสร้างลิงก์บันทึกไม่ติด — **ห้ามปล่อยผ่าน** เพราะเงินเข้าจริงแล้ว
      //    กู้จาก referenceId (เราส่ง order.id ไปกับ order ตอนสร้างลิงก์) แล้วสร้างแถวย้อนหลัง
      if (!record) {
        if (!orderRef) {
          await logWebhook('error', `หาแถวจาก paymentLinkId=${paymentLinkId} ไม่เจอ และไม่มี referenceId ให้กู้`);
          return NextResponse.json({ success: true });
        }
        const { data: refOrder } = await supabaseAdmin
          .from('orders')
          .select('id, company_id, total_amount')
          .eq('id', orderRef)
          .eq('company_id', companyId)
          .maybeSingle();
        if (!refOrder) {
          await logWebhook('error', `referenceId=${orderRef} ไม่ใช่ออเดอร์ของร้านนี้`);
          return NextResponse.json({ success: true });
        }
        const { data: created, error: createError } = await supabaseAdmin
          .from('payment_records')
          .insert({
            company_id: refOrder.company_id,
            order_id: refOrder.id,
            payment_method: 'payment_gateway',
            amount: refOrder.total_amount,
            status: 'pending',
            gateway_provider: 'beam',
            gateway_payment_link_id: paymentLinkId || null,
            gateway_status: 'PAID',
            gateway_raw_response: event,
          })
          .select('id, order_id, company_id, status, gateway_payment_link_id')
          .single();
        if (createError || !created) {
          await logWebhook('error', `สร้างแถวชำระย้อนหลังไม่ติด: ${createError?.message || 'unknown'}`, refOrder.id);
          return NextResponse.json({ success: true }); // ack — กัน Beam retry ไม่จบ
        }
        record = created as GatewayPaymentRecord;
      }

      const result = await settleGatewayPayment({ record, chargeId, raw: event, via: 'webhook' });
      if (result === 'already_verified') {
        await logWebhook('success', 'แถวนี้ verified อยู่แล้ว (Beam ส่งซ้ำ) — ข้าม', record.order_id);
      }
      return NextResponse.json({ success: true });
    }

    // event ที่เราไม่ได้ใช้ (refund/failed/…) — จดไว้ให้รู้ว่า Beam ส่งอะไรมาบ้าง
    await logWebhook('success', `รับแล้วแต่ไม่ได้ใช้ event นี้: ${eventType || '(ไม่มีชื่อ event)'}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Beam webhook] error:', error);
    // 200 แม้ error ภายใน — กัน Beam retry ไม่จบ (ทางกู้คือ reconcile ที่ถาม Beam เอง)
    return NextResponse.json({ success: true });
  }
}

// GET — ให้ Beam/คนกดเช็คว่า endpoint มีอยู่จริง
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}

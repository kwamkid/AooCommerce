// Beam Checkout webhook receiver — รับ event "จ่ายแล้ว / จ่ายไม่ผ่าน / คืนเงิน / ค่าธรรมเนียม" แล้วอัพเดทออเดอร์
//
// เอกสาร: https://docs.beamcheckout.com/webhook-authentication · /webhook-event-types
//   header  X-Beam-Event      = ชื่อ event (payment_link.paid · charge.succeeded · …)
//   header  X-Beam-Signature  = base64( HMAC-SHA256( key = base64decode(HMAC key จาก Lighthouse), body ดิบ ) )
//   body    payment_link.paid = { paymentLinkId, merchantId, status:'PAID', order:{ referenceId, … } }
//           charge.succeeded  = { chargeId, merchantId, referenceId, status, source, sourceId, paymentMethod, … }
//           charge.failed     = เหมือน charge.succeeded + failureCode → ป้าย "จ่ายไม่ผ่าน" บนออเดอร์
//           refund.succeeded  = { refundId, chargeId, merchantId, referenceId, amount, status, refundReason, … }
//           transaction.created = { transactionId, referenceId, transactionType, grossAmount, feeAmount, vatAmount, netAmount, … }
//                                 → marketplace_settlements platform 'beam' (lib/beam/transactions.ts)
//
// **merchant เดียวใช้ได้หลายบริษัท** (เจ้าของหลายแบรนด์ใช้บัญชี Beam เดียว): ลายเซ็นตรวจด้วย HMAC key
// ของบริษัทไหนก็ได้ที่ตั้ง merchant นี้ไว้ (webhook ต่อ merchant มีตัวเดียว key จึงตัวเดียวกัน) แล้ว
// **หาบริษัทจากออเดอร์** (referenceId = order.id ที่เราส่งไปตอนสร้างลิงก์) ไม่ใช่จาก config ที่ key ตรง
// — ผู้ใช้ทักถูก 7 ก.ย. 2026 ว่า "มัน link กลับมาก็รู้อยู่แล้วว่า order ของบริษัทไหน"
// ด่านความปลอดภัยคือ ออเดอร์ต้องเป็นของบริษัทที่ตั้ง merchant นี้ไว้เท่านั้น
//
// ⚠️ บทเรียน 2026-09-06 (จ่ายบัตรผ่าน 3 ใบ ไม่มีใบไหนอัพเดทเอง):
//   1. เดิมหา config ด้วย `.single()` โดยไม่กรองบริษัท — พอมีร้านเปิด gateway มากกว่า 1 ร้าน
//      `.single()` คืน error → ตอบ 401 "Not configured" ให้ Beam **ทุกใบ** โดยไม่ log อะไรเลย
//   2. HMAC key ของ webhook เป็น**คนละตัวกับ API key** (Lighthouse ให้ตอนสร้าง webhook) —
//      เดิม fallback ไปใช้ API key จึงไม่มีทางตรง · ไม่ตั้ง key = บอกตรง ๆ ใน log ว่าต้องไปตั้ง
//   3. **ทุกทางที่ปฏิเสธต้องลง integration_logs** — 401 ที่มีแต่ console.error คือความเงียบ
//      ที่ทำให้ไล่ไม่เจอมา 3 รอบ
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logIntegrationNow } from '@/lib/integration-logger';
import { loadBeamGateways, type BeamGateway } from '@/lib/beam/client';
import {
  settleGatewayPayment,
  findGatewayRecord,
  markGatewayAttemptFailed,
  markGatewayRefund,
  type GatewayPaymentRecord,
} from '@/lib/beam/settle';
import { isOurReference, saveBeamSettlementForOrder, type BeamTransaction } from '@/lib/beam/transactions';

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
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

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
    const merchantId = str(data.merchantId) || undefined;

    // ── ทุกบริษัทที่ตั้ง merchant นี้ไว้ ── (ไม่มี merchantId = ทุกร้านที่เปิด gateway แล้วให้ลายเซ็นตัดสิน)
    const candidates = await loadBeamGateways(merchantId ? { merchantId } : {});
    const scopeCompanies = [...new Set(candidates.map(c => c.companyId))];
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

    if (!signature) {
      // ปุ่ม "ทดสอบ" ในหน้าตั้งค่ายิง test.ping มาเช็คว่า endpoint ถึง (ไม่มีลายเซ็นโดยตั้งใจ)
      // — ตอบให้รู้ว่าถึงแล้วพอ ไม่ต้องลง log แดงให้ทุกร้าน (เคยขึ้น 3 แถวต่อการกดหนึ่งครั้ง)
      if (eventType === 'test.ping') return NextResponse.json({ ok: true, note: 'reachable (unsigned ping)' });
      await logFor(scopeCompanies, 'error', 'Beam ส่งมาโดยไม่มี X-Beam-Signature — ปฏิเสธ');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const withKey = candidates.filter(c => c.webhookSecret);
    if (withKey.length === 0) {
      await logFor(scopeCompanies, 'error',
        'ยังไม่ได้ตั้ง Webhook HMAC key — ไปที่ ตั้งค่า › ช่องทางชำระเงิน › Beam วาง key ที่ได้จาก Beam Lighthouse ตอนสร้าง webhook แล้วบันทึก (ระหว่างนี้ระบบถามสถานะกับ Beam เองทุก 15 นาที)');
      return NextResponse.json({ error: 'Webhook key not configured' }, { status: 401 });
    }

    // key ของบริษัทไหนก็ได้ที่ใช้ merchant นี้ตรง = ของจริงจาก Beam (บริษัทที่แชร์ merchant ไม่ต้องวาง key ซ้ำ)
    if (!withKey.some(c => verifyBeamSignature(body, signature, c.webhookSecret!))) {
      await logFor(withKey.map(c => c.companyId), 'error',
        'ลายเซ็นไม่ตรง — HMAC key ในระบบไม่ใช่ key ของ webhook ตัวนี้ใน Beam Lighthouse (คนละตัวกับ API key) ตรวจแล้ววางใหม่');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // ── หาออเดอร์ + บริษัทจาก payload (ในขอบเขตบริษัทที่ตั้ง merchant นี้เท่านั้น) ──
    // payment_link.paid มี paymentLinkId ตรง ๆ · charge.* บอกผ่าน source/sourceId · refund.* มี chargeId
    const paymentLinkId = str(data.paymentLinkId)
      || (data.source === 'PAYMENT_LINK' ? str(data.sourceId) : '');
    const chargeId = str(data.chargeId) || null;
    const orderRef = str(data.referenceId) || str(asRecord(data.order).referenceId);

    const record = await findGatewayRecord(scopeCompanies, {
      paymentLinkId: paymentLinkId || null,
      chargeId: eventType.startsWith('refund.') ? chargeId : null,
      orderId: isOurReference(orderRef) ? orderRef : null,
    });
    // ประกาศ type แยก — `typeof orderRow` หลัง `= null` ถูก TS narrow เป็น null แล้ว cast จะกลายเป็น never
    type OrderRow = { id: string; company_id: string; total_amount: number };
    let orderRow: OrderRow | null = null;
    if (!record && isOurReference(orderRef)) {
      const { data: found } = await supabaseAdmin
        .from('orders')
        .select('id, company_id, total_amount')
        .eq('id', orderRef)
        .in('company_id', scopeCompanies)
        .maybeSingle();
      orderRow = (found as OrderRow | null) ?? null;
    }
    const companyId = record?.company_id || orderRow?.company_id || null;
    const gateway: BeamGateway | undefined = companyId ? candidates.find(c => c.companyId === companyId) : undefined;

    if (!companyId || !gateway) {
      if (eventType === 'transaction.created' && !isOurReference(orderRef)) {
        // merchant เดียวถูกระบบอื่นใช้ด้วย (referenceId แบบ ONL…) — ไม่ใช่ของเราก็แค่ ack เงียบ ๆ
        return NextResponse.json({ success: true });
      }
      await logFor(scopeCompanies, 'error',
        `${eventType}: จับคู่ออเดอร์ไม่ได้ (paymentLinkId=${paymentLinkId || '-'} chargeId=${chargeId || '-'} referenceId=${orderRef || '-'}) — ไม่ใช่ออเดอร์ของบริษัทที่ใช้ merchant นี้`);
      return NextResponse.json({ success: true }); // ack — ไม่มีอะไรให้ทำ
    }
    const logWebhook = (status: 'success' | 'error', note: string, orderId?: string | null) =>
      logFor([companyId], status, note, orderId);

    // ── เงินเข้าแล้ว ──
    if (eventType === 'payment_link.paid' || eventType === 'charge.succeeded') {
      let paid: GatewayPaymentRecord | null = record;
      // ไม่มีแถว = ตอนสร้างลิงก์บันทึกไม่ติด — **ห้ามปล่อยผ่าน** เพราะเงินเข้าจริงแล้ว สร้างแถวย้อนหลังจากออเดอร์
      if (!paid && orderRow) {
        const { data: created, error: createError } = await supabaseAdmin
          .from('payment_records')
          .insert({
            company_id: orderRow.company_id,
            order_id: orderRow.id,
            payment_method: 'payment_gateway',
            amount: orderRow.total_amount,
            status: 'pending',
            gateway_provider: 'beam',
            gateway_payment_link_id: paymentLinkId || null,
            gateway_status: 'PAID',
            gateway_raw_response: event,
          })
          .select('id, order_id, company_id, status, gateway_payment_link_id')
          .single();
        if (createError || !created) {
          await logWebhook('error', `สร้างแถวชำระย้อนหลังไม่ติด: ${createError?.message || 'unknown'}`, orderRow.id);
          return NextResponse.json({ success: true }); // ack — กัน Beam retry ไม่จบ
        }
        paid = created as GatewayPaymentRecord;
      }
      if (!paid) {
        await logWebhook('error', 'ไม่มีแถวชำระและไม่มีออเดอร์ให้กู้');
        return NextResponse.json({ success: true });
      }
      // ยอดที่ตัดจริง: charge.succeeded = amount · payment_link.paid = order.netAmount (สตางค์) · เบอร์จาก charge
      const satang = (v: unknown) => (typeof v === 'number' ? v / 100 : null);
      const paidAmount = satang(data.amount) ?? satang(asRecord(data.order).netAmount);
      const phone = asRecord(asRecord(data.customer).primaryPhone);
      const result = await settleGatewayPayment({
        record: paid, chargeId, raw: event, via: 'webhook', gateway, paidAmount,
        customerPhone: phone.number ? { countryCode: str(phone.countryCode), number: str(phone.number) } : null,
      });
      if (result === 'already_verified') {
        await logWebhook('success', 'แถวนี้ verified อยู่แล้ว (Beam ส่งซ้ำ) — ข้าม', paid.order_id);
      }
      return NextResponse.json({ success: true });
    }

    // ── จ่ายไม่ผ่าน (ลิงก์ยังเปิด ลูกค้าลองใหม่ได้) ──
    if (eventType === 'charge.failed' || eventType === 'card_authorization.failed' || eventType === 'card_authorization.canceled') {
      if (!record) {
        await logWebhook('error', `${eventType}: ไม่มีแถว gateway ของออเดอร์นี้ให้ติดป้าย`, orderRow?.id);
        return NextResponse.json({ success: true });
      }
      await markGatewayAttemptFailed(record, { event: eventType, raw: data });
      return NextResponse.json({ success: true });
    }

    // ── คืนเงิน — เงินออกจากร้านจริง ต้องเห็นบนออเดอร์และเด้งเตือน ──
    if (eventType === 'refund.succeeded' || eventType === 'refund.failed') {
      if (!record) {
        await logWebhook('error', `${eventType}: ไม่มีแถว gateway ของออเดอร์นี้ (chargeId=${chargeId || '-'})`, orderRow?.id);
        return NextResponse.json({ success: true });
      }
      await markGatewayRefund(record, { succeeded: eventType === 'refund.succeeded', raw: data, gateway });
      return NextResponse.json({ success: true });
    }

    // ── ค่าธรรมเนียมต่อธุรกรรม → settlement (รายงานยอดขาย-ค่าธรรมเนียม-กำไร) ──
    if (eventType === 'transaction.created') {
      const tx = data as unknown as BeamTransaction;
      const orderId = record?.order_id || orderRow?.id || orderRef;
      const result = await saveBeamSettlementForOrder(gateway, orderId, tx);
      await logWebhook(
        result.saved ? 'success' : 'error',
        result.saved
          ? `เก็บค่าธรรมเนียมแล้ว (${result.transactions} ธุรกรรม) ${tx.transactionType || ''} gross ${tx.grossAmount} fee ${tx.feeAmount} vat ${tx.vatAmount} net ${tx.netAmount}`
          : 'ไม่มีธุรกรรมของออเดอร์นี้ให้เก็บ',
        orderId,
      );
      return NextResponse.json({ success: true });
    }

    // event ที่เราไม่ได้ใช้ (card_authorization.authorized · bolt_intent.* · purchase V0) — จดไว้ให้รู้ว่า Beam ส่งอะไรมาบ้าง
    await logWebhook('success', `รับแล้วแต่ไม่ได้ใช้ event นี้: ${eventType || '(ไม่มีชื่อ event)'}`, record?.order_id || orderRow?.id);
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

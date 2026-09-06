// Beam — ถามสถานะลิงก์จ่ายเงินกับ Beam โดยตรง แล้วอัพเดทออเดอร์ให้ตรง (ทางสำรองของ webhook)
//
// POST { order_id }  — public เหมือน create-payment-link: หน้าบิลเรียกตอนลูกค้ากลับมาหลังจ่าย
//                      (Beam redirect กลับ ?payment=success) · ปลอดภัยเพราะความจริงมาจาก API ของ Beam
//                      ด้วย credentials ของร้าน ไม่ได้เชื่ออะไรจาก client นอกจาก order_id
// GET  (cron)        — กวาดแถว pending ที่ค้างทั้งระบบ · header x-cron-secret / Bearer CRON_SECRET
//                      (ตอนนี้ cron ตัวเฝ้า /api/marketplace/watchdog เรียกให้ทุก 15 นาทีอยู่แล้ว
//                       ไม่ต้องตั้ง job เพิ่ม — route นี้เผื่อกดมือ/ตั้งแยก)
import { NextRequest, NextResponse } from 'next/server';
import { reconcileBeamForOrder, reconcilePendingBeamPayments } from '@/lib/beam/settle';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { order_id } = await request.json().catch(() => ({}));
    if (!order_id || typeof order_id !== 'string') {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }
    const result = await reconcileBeamForOrder(order_id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[Beam] reconcile order error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const header = request.headers.get('x-cron-secret') || '';
  if (!cronSecret || (bearer !== cronSecret && header !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await reconcilePendingBeamPayments();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Beam] reconcile sweep error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

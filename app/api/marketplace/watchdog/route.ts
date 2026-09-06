import { NextRequest, NextResponse } from 'next/server';
import { runWatchdog } from '@/lib/marketplace/watchdog';
import { reconcilePendingBeamPayments } from '@/lib/beam/settle';

// ตัวเฝ้าสุขภาพ integration — cron ทุก 15 นาที (cron-job.org, header x-cron-secret)
//
// ⚠️ **ตัวเฝ้าเองก็ตายเงียบได้** — ชั้นนอกสุดต้องเป็นของนอกระบบเรา:
// เปิด "Notify on failure" ของ job นี้ใน cron-job.org ด้วยเสมอ
// ไม่งั้นเราจะกลับไปอยู่จุดเดิม คือมีตัวเฝ้าที่ตายไปแล้วโดยไม่มีใครรู้
// (หน้า superadmin แสดง "ตรวจล่าสุดเมื่อ ..." จาก heartbeat ที่ runWatchdog เขียนไว้)
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const header = request.headers.get('x-cron-secret') || '';
  if (!cronSecret || (bearer !== cronSecret && header !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // ตาข่ายของ Beam: ลิงก์จ่ายเงินที่ค้าง pending ให้ไปถาม Beam เองก่อนตรวจสุขภาพ
    // (webhook ไม่เข้า = ลูกค้าจ่ายแล้วแต่ออเดอร์ไม่ขยับ — เกิดจริง ก.ย. 2026) · ล้มแยกจากตัวเฝ้า
    const beam = await reconcilePendingBeamPayments().catch((e) => {
      console.error('[Watchdog] beam reconcile failed:', e instanceof Error ? e.message : e);
      return null;
    });
    const result = await runWatchdog();
    return NextResponse.json({ ok: true, ...result, beam });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[Watchdog] run failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

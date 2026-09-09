import { NextRequest, NextResponse, after } from 'next/server';
import { runWatchdog } from '@/lib/marketplace/watchdog';
import { reconcilePendingBeamPayments } from '@/lib/beam/settle';
import { pruneOldLogs } from '@/lib/maintenance/log-retention';
import { sweepUnsentPurchaseEvents } from '@/lib/meta/conversions';

// ตัวเฝ้าสุขภาพ integration — cron ทุก 15 นาที (cron-job.org, header x-cron-secret)
//
// ⚠️ **ตัวเฝ้าเองก็ตายเงียบได้** — ชั้นนอกสุดต้องเป็นของนอกระบบเรา:
// เปิด "Notify on failure" ของ job นี้ใน cron-job.org ด้วยเสมอ
// ไม่งั้นเราจะกลับไปอยู่จุดเดิม คือมีตัวเฝ้าที่ตายไปแล้วโดยไม่มีใครรู้
// (หน้า superadmin แสดง "ตรวจล่าสุดเมื่อ ..." จาก heartbeat ที่ runWatchdog เขียนไว้)
//
// **ตอบ 200 ทันทีแล้วทำงานใน after()** — cron-job.org รอได้แค่ 30 วิ แต่รอบหนึ่งรวมกันเกินได้
// (ตรวจช่องทางแชทจริงงบ 15 วิ + ถาม Beam + ล้าง log วันละครั้ง) ทำในสายที่ cron รอ = โดนนับว่าล้ม
// แล้ว job ถูกปิดเองเมื่อล้มติดกัน · งานข้างในตายให้ดูจาก heartbeat `watchdog_last_run` ค้าง
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const header = request.headers.get('x-cron-secret') || '';
  if (!cronSecret || (bearer !== cronSecret && header !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  after(async () => {
    // ตาข่ายของ Beam: ลิงก์จ่ายเงินที่ค้าง pending ให้ไปถาม Beam เองก่อนตรวจสุขภาพ
    // (webhook ไม่เข้า = ลูกค้าจ่ายแล้วแต่ออเดอร์ไม่ขยับ — เกิดจริง ก.ย. 2026) · ล้มแยกจากตัวเฝ้า
    const beam = await reconcilePendingBeamPayments().catch((e) => {
      console.error('[Watchdog] beam reconcile failed:', e instanceof Error ? e.message : e);
      return null;
    });
    // ตาข่ายของ Meta CAPI: ออเดอร์ที่ชำระแล้วแต่ Purchase event ไม่เคยไปถึง Meta
    // (ตอนนั้นเพจยังไม่มีสิทธิ์ page_events / Meta ล่ม / token หมดอายุอยู่พอดี)
    // Meta รับย้อนหลังได้ 7 วัน — พลาดในกรอบนี้จึงเยียวยาตัวเองได้ทุก 15 นาที
    const capi = await sweepUnsentPurchaseEvents({ deadlineAt: Date.now() + 20_000 }).catch((e) => {
      console.error('[Watchdog] meta capi sweep failed:', e instanceof Error ? e.message : e);
      return null;
    });
    const result = await runWatchdog().catch((e) => {
      console.error('[Watchdog] run failed:', e instanceof Error ? e.message : e);
      return null;
    });
    // งานดูแลรายวันเกาะมากับ cron ตัวนี้ (ตัวมันเองคุมให้ทำจริงวันละครั้ง) — จะได้ไม่ต้องตั้ง
    // cron เพิ่มอีกใบ · ล้มไม่กระทบตัวเฝ้า
    const logs = await pruneOldLogs().catch((e) => {
      console.error('[Watchdog] log retention failed:', e instanceof Error ? e.message : e);
      return null;
    });
    console.log('[Watchdog] done', JSON.stringify({ beam, capi, result, logs }));
  });

  return NextResponse.json({ ok: true, started: true });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

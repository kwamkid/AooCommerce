import { NextRequest, NextResponse } from 'next/server';
import { runScheduledBroadcasts } from '@/lib/broadcast/scheduler';

// ตัวส่งบรอดแคสต์ตามเวลาที่ตั้งไว้ — cron ทุก 5 นาที (cron-job.org, header x-cron-secret)
// ⚠️ **ต้องเปิด "Notify on failure" ของ job นี้เสมอ** — cron ตายเงียบ = ใบที่ตั้งเวลาไว้
// ค้างสถานะ "ตั้งเวลาไว้" โดยไม่มีใครรู้ (ตัวเฝ้าจับได้อีกชั้นเมื่อค้างเกิน 20 นาที)
//
// แยกจาก cron ตัวเฝ้าเพราะงานนี้ยาวได้ถึงหลักนาที ส่วน route ตัวเฝ้าตั้ง maxDuration ไว้ 60 วิ
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const header = request.headers.get('x-cron-secret') || '';
  if (!cronSecret || (bearer !== cronSecret && header !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runScheduledBroadcasts();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.error('[broadcast-scheduler] run failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

import { NextRequest, NextResponse, after } from 'next/server';
import { countDueScheduledBroadcasts, runScheduledBroadcasts } from '@/lib/broadcast/scheduler';

// ตัวส่งบรอดแคสต์ตามเวลาที่ตั้งไว้ — cron ทุก 5 นาที (cron-job.org, header x-cron-secret)
// ⚠️ **ต้องเปิด "Notify on failure" ของ job นี้เสมอ** — cron ตายเงียบ = ใบที่ตั้งเวลาไว้
// ค้างสถานะ "ตั้งเวลาไว้" โดยไม่มีใครรู้ (ตัวเฝ้าจับได้อีกชั้นเมื่อค้างเกิน 20 นาที)
//
// **ตอบ 200 ทันทีแล้วส่งจริงใน after()** — cron-job.org รอได้สูงสุด 30 วิ ส่วนตัวส่งใช้เวลา
// ได้ถึง 240 วิ (ใบใหญ่หลายล็อต) ถ้าส่งในสายที่ cron รอ job จะถูกนับว่าล้มทั้งที่ส่งสำเร็จ
// แล้วโดนปิดเองเมื่อ "ล้ม" ติดกันหลายรอบ · Vercel ให้ after() วิ่งต่อได้จนถึง maxDuration
// แยกจาก cron ตัวเฝ้าเพราะ route ตัวเฝ้าตั้ง maxDuration ไว้ 60 วิ
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const header = request.headers.get('x-cron-secret') || '';
  if (!cronSecret || (bearer !== cronSecret && header !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const due = await countDueScheduledBroadcasts();
    if (due === 0) return NextResponse.json({ ok: true, due: 0 });

    // ผลจริงดูที่สถานะของแถวในตาราง (หน้ารายการ/รายงาน) — response นี้บอกแค่ว่ารับงานไปกี่ใบ
    after(() => runScheduledBroadcasts());
    return NextResponse.json({ ok: true, due });
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

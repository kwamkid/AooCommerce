import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { sweepUnsentPurchaseEvents } from '@/lib/meta/conversions';

// กวาดส่ง Purchase event (Meta CAPI) ของออเดอร์ที่ชำระแล้วแต่ยิงไม่สำเร็จ — **สายที่กดเอง**
//
// ตัวจริงเกาะไปกับ cron ตัวเฝ้า (`/api/marketplace/watchdog` ทุก 15 นาที) อยู่แล้ว
// ใบนี้มีไว้เพื่อ (1) กวาดทันทีหลังเจ้าของเพิ่งกดเชื่อมเพจใหม่ ไม่ต้องรอรอบถัดไป
// (2) ทดสอบ/ตรวจของจริงแล้วเห็นตัวเลขทันที — จึง **ทำงานในสายที่ผู้เรียกรอ** ไม่ใช่ใน after()
// (after() ตอบไปแล้วจะไม่มีตัวเลขให้ดู ซึ่งขัดกับเหตุผลที่มีใบนี้)
export const maxDuration = 60;

async function handle(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const header = request.headers.get('x-cron-secret') || '';
    const isCron = !!cronSecret && (bearer === cronSecret || header === cronSecret);

    // ขอบเขตต่างกันตามคนเรียก: cron = ทุกบริษัท · คนกดเอง = บริษัทตัวเองเท่านั้น
    let companyId: string | undefined;
    if (!isCron) {
      const auth = await checkAuthWithCompany(request);
      if (!auth.isAuth || !auth.companyId || !can(auth, 'masterdata.chat_channels')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      companyId = auth.companyId;
    }

    const { searchParams } = new URL(request.url);
    let raw: Record<string, unknown> = {};
    if (request.method === 'POST') {
      raw = ((await request.json().catch(() => null)) as Record<string, unknown> | null) || {};
    }

    const num = (key: string): number | undefined => {
      const v = raw[key] ?? searchParams.get(key);
      const n = Number(v);
      return v == null || v === '' || !Number.isFinite(n) ? undefined : n;
    };

    const days = num('days');
    const limit = num('limit');

    const counts = await sweepUnsentPurchaseEvents({
      companyId,
      days: days == null ? undefined : Math.min(7, Math.max(1, Math.floor(days))),
      limit: limit == null ? undefined : Math.min(500, Math.max(1, Math.floor(limit))),
      deadlineAt: Date.now() + 50_000,
    });

    return NextResponse.json({ ok: true, ...counts });
  } catch (err) {
    console.error('[MetaCAPI] sweep route failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

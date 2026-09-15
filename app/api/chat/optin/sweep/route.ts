// Path: app/api/chat/optin/sweep/route.ts
//
// cron: กวาดห้องแชท Facebook ที่คุยจบแล้วเงียบไป เพื่อชวนกดรับข่าวสาร
// ตั้งที่ cron-job.org ทุก ~10 นาที (โปรเจกต์นี้ไม่ได้ใช้ Vercel Cron)
//
// ⚠️ ต้องตอบ 200 ทันทีแล้วทำงานใน after() — cron-job.org รอ response ได้แค่ 30 วิ
// ทำงานในสายที่ cron รอ = job ถูกนับว่าล้มทั้งที่สำเร็จ แล้วโดนปิดอัตโนมัติเมื่อล้มติดกัน
import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sweepQuietOptinInvites } from '@/lib/facebook/optin-sweep';

export const maxDuration = 300;

/** ค่านี้ค้าง = cron ตาย (ตัวเฝ้าอ่านไปแจ้งเตือนได้แบบเดียวกับงานอื่น) */
const HEARTBEAT_KEY = 'optin_sweep_last_run';

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const header = request.headers.get('x-cron-secret') || '';
  if (!cronSecret || (bearer !== cronSecret && header !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  after(async () => {
    try {
      const result = await sweepQuietOptinInvites({ timeBudgetMs: 240_000 });
      await supabaseAdmin
        .from('app_flags')
        .upsert({ key: HEARTBEAT_KEY, value: { at: new Date().toISOString(), ...result } }, { onConflict: 'key' });
    } catch (err) {
      console.error('[optin-sweep] failed:', err instanceof Error ? err.message : String(err));
    }
  });

  return NextResponse.json({ ok: true, started: true });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

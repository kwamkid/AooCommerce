// งานเบื้องหลังของสายโฆษณา — cron ทุก 15 นาที (cron-job.org, header x-cron-secret)
//
// ทำ 3 อย่าง: (1) กวาดออเดอร์ที่ชำระแล้วแต่ Purchase ยังไม่ถึง dataset ของบัญชีโฆษณา
// (2) ตรวจบัญชีที่ไม่ได้ตรวจมาเกิน 6 ชม. (token หมดอายุเงียบ ๆ ได้ตลอด — ใบจาก Login
// Facebook อายุ ~60 วัน) แล้วจดผลไว้ให้ตัวเฝ้าเอาไปแจ้ง (3) อัปกลุ่มเป้าหมายที่ถึงรอบขึ้น
// Custom Audience ของ Meta (ส่งเฉพาะส่วนต่าง — ใครเข้าใหม่ ใครหลุดเงื่อนไข)
//
// ⚠️ **ทำไมไม่เกาะ cron ตัวเฝ้า** — `/api/marketplace/watchdog` ตั้ง `maxDuration = 60` และ
// ใช้เกือบหมดไปกับ Beam + ตรวจช่องทางแชท + กวาด CAPI ของเพจอยู่แล้ว · งานนี้ยิง Graph API
// หลายสิบครั้งต่อรอบ เบียดเข้าไปแล้วมีแต่จะทำให้ทั้งสองงานทำไม่จบ
//
// **ตอบ 200 ทันทีแล้วทำงานใน after()** — cron-job.org รอได้แค่ 30 วิ ทำในสายที่ cron รอ
// = โดนนับว่าล้มทั้งที่งานสำเร็จ แล้ว job ถูกปิดเองเมื่อล้มติดกัน (เคยเกิด ก.ค. 2026)
// ผลจริงดูจาก heartbeat `app_flags.ads_jobs_last_run` และ `integration_logs` ไม่ใช่ response
import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sweepUnsentAdConversions } from '@/lib/ads/sweep';
import { probeStaleAdAccounts } from '@/lib/ads/accounts';
import { runDueAudienceSyncs } from '@/lib/audiences/sync';

export const maxDuration = 300;

const HEARTBEAT_KEY = 'ads_jobs_last_run';

async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const header = request.headers.get('x-cron-secret') || '';
  if (!cronSecret || (bearer !== cronSecret && header !== cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  after(async () => {
    const sweep = await sweepUnsentAdConversions({ deadlineAt: Date.now() + 30_000 }).catch((e) => {
      console.error('[AdsJobs] sweep failed:', e instanceof Error ? e.message : e);
      return null;
    });
    // ตรวจบัญชีล้มไม่กระทบการกวาด (คนละเรื่อง คนละสาย)
    const probe = await probeStaleAdAccounts({ maxAgeHours: 6, limit: 10 }).catch((e) => {
      console.error('[AdsJobs] probe failed:', e instanceof Error ? e.message : e);
      return null;
    });

    // อัปกลุ่มเป้าหมาย — งานหนักสุดของรอบ (ยิง Graph ทีละ 5,000 แถว) จึงอยู่ท้ายสุด
    // และคุมด้วยงบเวลาของตัวเอง · ใบที่ไม่ทันรอบนี้ค้าง next_sync_at ไว้ให้รอบหน้าเก็บต่อ
    const audiences = await runDueAudienceSyncs({ timeBudgetMs: 220_000 }).catch((e) => {
      console.error('[AdsJobs] audience sync failed:', e instanceof Error ? e.message : e);
      return null;
    });

    // heartbeat — ค่านี้ค้าง = cron ตาย (ตัวเฝ้าอ่านไปขึ้นเรื่อง ads_jobs_stale)
    await supabaseAdmin
      .from('app_flags')
      .upsert(
        { key: HEARTBEAT_KEY, value: { at: new Date().toISOString(), sweep, probe, audiences }, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
      .then(null, (e) => console.error('[AdsJobs] heartbeat failed:', e instanceof Error ? e.message : e));

    console.log('[AdsJobs] done', JSON.stringify({ sweep, probe, audiences }));
  });

  return NextResponse.json({ ok: true, started: true });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

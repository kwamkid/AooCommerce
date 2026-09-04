import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkSuperAdmin } from '@/lib/supabase-admin';
import { clearQuotaFlag, QUOTA_PLATFORMS, type QuotaPlatform } from '@/lib/marketplace/quota';
import { collectWatchdogIssues } from '@/lib/marketplace/watchdog';

// Superadmin API Monitor — สุขภาพ integration ทุก platform ใน call เดียว
// GET  ?days=14  → aggregate จาก RPC get_api_monitor_stats
// POST { action: 'reset_breaker', platform? } → ปลด circuit breaker ของ platform นั้นด้วยมือ (default shopee)

export async function GET(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const daysRaw = parseInt(request.nextUrl.searchParams.get('days') || '14', 10);
    const days = Math.min(Math.max(isNaN(daysRaw) ? 14 : daysRaw, 1), 30);

    // ?issues_only=1 = กระดิ่งบน header ของ shell superadmin ถามทุก 5 นาทีว่า "ตอนนี้มีอะไรพัง"
    // ไม่ต้องลาก aggregate 14 วันมาด้วย (RPC หนัก) — ชุด issues เดียวกับหน้าเต็มเป๊ะ
    if (request.nextUrl.searchParams.get('issues_only') === '1') {
      const [issues, { data: heartbeat }] = await Promise.all([
        collectWatchdogIssues(),
        supabaseAdmin.from('app_flags').select('value').eq('key', 'watchdog_last_run').maybeSingle(),
      ]);
      return NextResponse.json({
        issues,
        watchdog_last_run: (heartbeat?.value as { at?: string } | null)?.at || null,
      });
    }

    // สถิติดิบ + รายการปัญหาที่ "ตัวเฝ้า" มองเห็นอยู่ตอนนี้ (ชุดเดียวกับที่ใช้เด้งเตือน
    // — หน้าจอกับแจ้งเตือนจึงไม่มีทางเห็นไม่ตรงกัน) + heartbeat ว่าตัวเฝ้ายังทำงานอยู่ไหม
    const [{ data, error }, issues, { data: heartbeat }] = await Promise.all([
      supabaseAdmin.rpc('get_api_monitor_stats', { p_days: days }),
      collectWatchdogIssues(),
      supabaseAdmin.from('app_flags').select('value').eq('key', 'watchdog_last_run').maybeSingle(),
    ]);
    if (error) throw error;

    return NextResponse.json({
      ...(data as Record<string, unknown>),
      issues,
      watchdog_last_run: (heartbeat?.value as { at?: string } | null)?.at || null,
    });
  } catch (error) {
    console.error('API monitor GET error:', error);
    return NextResponse.json({ error: 'Failed to load monitor stats' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    if (body.action !== 'reset_breaker') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    const platform = (body.platform || 'shopee') as QuotaPlatform;
    if (!QUOTA_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: 'Unknown platform' }, { status: 400 });
    }

    await clearQuotaFlag(platform);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API monitor POST error:', error);
    return NextResponse.json({ error: 'Failed to reset breaker' }, { status: 500 });
  }
}

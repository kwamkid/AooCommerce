import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkSuperAdmin } from '@/lib/supabase-admin';
import { clearQuotaFlag, QUOTA_PLATFORMS, type QuotaPlatform } from '@/lib/marketplace/quota';

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

    const { data, error } = await supabaseAdmin.rpc('get_api_monitor_stats', { p_days: days });
    if (error) throw error;

    return NextResponse.json(data);
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

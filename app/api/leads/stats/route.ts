// Path: app/api/leads/stats/route.ts
//
// สรุปผลการติดตาม — "กรวยขายตอนนี้เป็นยังไง" สำหรับหัวหน้าทีม
//
//   GET /api/leads/stats?days=30
//     → { byStage[], won, lost, closeRate, avgDaysToWin, resolvedCases }
//
// ตัวเลข **นับจาก `lead_events`** ไม่ใช่สถานะปัจจุบัน — คนที่ซื้อแล้วเดือนก่อนและตอนนี้
// กลับมาอยู่ขั้น "สนใจ" รอบใหม่ ต้องยังนับเป็นการปิดการขายของเดือนก่อนอยู่

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { can } from '@/lib/permissions';
import { getCompanyStages } from '@/lib/leads/service';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.view')) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูแชท' }, { status: 403 });

    const days = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('days') || '30', 10) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    const stages = await getCompanyStages(companyId);

    const [leadsRes, eventsRes] = await Promise.all([
      supabaseAdmin
        .from('leads')
        .select('stage, created_at, stage_changed_at')
        .eq('company_id', companyId)
        .limit(5000),
      supabaseAdmin
        .from('lead_events')
        .select('lead_id, to_stage, source, created_at')
        .eq('company_id', companyId)
        .eq('type', 'stage_change')
        .gte('created_at', since)
        .limit(5000),
    ]);

    const leads = (leadsRes.data || []) as { stage: string; created_at: string; stage_changed_at: string }[];
    const events = (eventsRes.data || []) as { lead_id: string; to_stage: string | null; source: string; created_at: string }[];

    // จำนวนคนที่ "ค้างอยู่" ในแต่ละขั้นตอนนี้ (สถานะปัจจุบัน)
    const byStage = stages.map(st => ({
      key: st.key,
      name: st.name,
      color: st.color,
      is_open: st.is_open,
      count: leads.filter(l => l.stage === st.key).length,
    }));

    const won = events.filter(e => e.to_stage === 'won').length;
    const lost = events.filter(e => e.to_stage === 'lost').length;
    const resolvedCases = events.filter(e => e.to_stage === 'resolved').length;
    const autoTagged = events.filter(e => e.source === 'system').length;
    const closeRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;

    // ทักแรก → ซื้อ: ใช้คนที่ตอนนี้เป็น "ซื้อแล้ว" และเพิ่งเปลี่ยนในช่วงที่ดู
    const wonLeads = leads.filter(l => l.stage === 'won' && l.stage_changed_at >= since);
    const avgDaysToWin = wonLeads.length > 0
      ? Math.round(
          wonLeads.reduce((sum, l) =>
            sum + (new Date(l.stage_changed_at).getTime() - new Date(l.created_at).getTime()) / 86_400_000, 0,
          ) / wonLeads.length,
        )
      : null;

    return NextResponse.json({
      days,
      byStage,
      openTotal: byStage.filter(s => s.is_open).reduce((n, s) => n + s.count, 0),
      won,
      lost,
      closeRate,
      avgDaysToWin,
      resolvedCases,
      autoTagged,
    });
  } catch (error) {
    console.error('Leads stats GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

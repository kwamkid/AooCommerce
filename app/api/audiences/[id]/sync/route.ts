// Path: app/api/audiences/[id]/sync/route.ts
//
// ปุ่ม "ซิงก์เดี๋ยวนี้" — สั่งอัปรายชื่อของกลุ่มนี้ขึ้นทุกบัญชีโฆษณาที่ผูกไว้
//
// **จองใบก่อนเสมอ** (`claimAudienceSync`) กันคนสองคนกดพร้อมกันแล้วอัปรายชื่อชุดเดียวกัน
// ขึ้น Meta ซ้อนกัน · ใบที่มีคนจองอยู่แล้วถือว่า "กำลังทำอยู่" ไม่ใช่ความผิดพลาด
import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { claimAudienceSync, runAudienceSync } from '@/lib/audiences/sync';

export const maxDuration = 300;

const MANUAL_BUDGET_MS = 240_000;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'marketing.audiences')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;
    const { data: audience } = await supabaseAdmin
      .from('audiences')
      .select('id')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .maybeSingle();
    if (!audience) return NextResponse.json({ error: 'ไม่พบกลุ่มเป้าหมายนี้' }, { status: 404 });

    const { data: syncs } = await supabaseAdmin
      .from('audience_syncs')
      .select('id')
      .eq('audience_id', id)
      .eq('company_id', auth.companyId);

    const rows = (syncs || []) as { id: string }[];
    if (rows.length === 0) {
      return NextResponse.json({ error: 'กลุ่มนี้ยังไม่ได้ผูกกับบัญชีโฆษณาไหนเลย' }, { status: 400 });
    }

    const started: string[] = [];
    for (const s of rows) {
      if (!await claimAudienceSync(s.id)) continue;
      started.push(s.id);
      after(() => runAudienceSync(s.id, { deadlineAt: Date.now() + MANUAL_BUDGET_MS, trigger: 'manual' }));
    }

    if (started.length === 0) {
      return NextResponse.json({ error: 'กำลังซิงก์อยู่แล้ว — รอรอบนี้จบก่อน', code: 'already_syncing' }, { status: 409 });
    }

    return NextResponse.json({ started: started.length, ids: started }, { status: 202 });
  } catch (e) {
    console.error('POST audience sync-now error:', e);
    return NextResponse.json({ error: 'สั่งซิงก์ไม่สำเร็จ' }, { status: 500 });
  }
}

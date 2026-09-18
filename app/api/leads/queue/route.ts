// Path: app/api/leads/queue/route.ts
//
// คิวติดตาม — "วันนี้ต้องทักใคร" ข้ามทุกช่องทางในคำตอบเดียว
//
//   GET /api/leads/queue?scope=due|all&assigned=me|unassigned&days=30
//     → { groups: { overdue[], today[], upcoming[] }, counts, stages }
//
// ทำไมคิวอยู่ที่นี่ไม่ใช่ /api/chat/contacts: คิวเรียงตาม "วันนัด" ไม่ใช่เวลาข้อความล่าสุด
// และต้องดึงทุกห้องที่มีนัดของบริษัท (ไม่ใช่แค่ 30 แถวแรกของรายชื่อแชท)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { can } from '@/lib/permissions';
import { CONTACT_TABLE_BY_PLATFORM, type ChatContactPlatform } from '@/lib/chat/contact-tables';
import { getCompanyStages, type LeadRow } from '@/lib/leads/service';

export interface QueueItem {
  lead_id: string;
  contact_id: string | null;
  platform: string | null;
  display_name: string;
  picture_url: string | null;
  customer_id: string | null;
  stage: string;
  follow_up_at: string;
  follow_up_note: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  quote_sent_at: string | null;
  reminded_count: number;
}

/** ชื่อ+รูปของห้องแชท — ดึงทีละแพลตฟอร์ม (ตารางคนละใบ) แล้วรวมเป็น map เดียว */
async function loadContactInfo(companyId: string, links: { contact_id: string; platform: string }[]) {
  const byPlatform = new Map<string, string[]>();
  for (const l of links) {
    const arr = byPlatform.get(l.platform) || [];
    arr.push(l.contact_id);
    byPlatform.set(l.platform, arr);
  }

  const info = new Map<string, { display_name: string; picture_url: string | null }>();
  await Promise.all([...byPlatform.entries()].map(async ([platform, ids]) => {
    const table = CONTACT_TABLE_BY_PLATFORM[platform as ChatContactPlatform];
    if (!table) return;
    const { data } = await supabaseAdmin
      .from(table)
      .select('id, display_name, picture_url, nickname')
      .eq('company_id', companyId)
      .in('id', ids);
    for (const row of data || []) {
      const r = row as { id: string; display_name: string | null; picture_url: string | null; nickname: string | null };
      info.set(`${platform}:${r.id}`, {
        display_name: r.nickname || r.display_name || 'ไม่ทราบชื่อ',
        picture_url: r.picture_url,
      });
    }
  }));
  return info;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId, userId } = auth;
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.view')) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูแชท' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const assigned = searchParams.get('assigned') || 'all';   // all | me | unassigned
    const days = Math.min(parseInt(searchParams.get('days') || '30', 10) || 30, 365);

    const horizon = new Date();
    horizon.setDate(horizon.getDate() + days);

    let query = supabaseAdmin
      .from('leads')
      .select('id, company_id, customer_id, stage, stage_source, stage_changed_at, follow_up_at, follow_up_note, assigned_to, last_inbound_at, last_outbound_at, closed_reason, quote_order_id, quote_sent_at, reminded_count')
      .eq('company_id', companyId)
      .not('follow_up_at', 'is', null)
      .lte('follow_up_at', horizon.toISOString())
      .order('follow_up_at')
      .limit(500);

    if (assigned === 'me' && userId) query = query.eq('assigned_to', userId);
    if (assigned === 'unassigned') query = query.is('assigned_to', null);

    const { data: leadRows } = await query;
    const leads = (leadRows || []) as unknown as LeadRow[];

    const stages = await getCompanyStages(companyId);
    if (leads.length === 0) {
      return NextResponse.json({ groups: { overdue: [], today: [], upcoming: [] }, counts: { overdue: 0, today: 0, upcoming: 0 }, stages });
    }

    // ห้องแชทของแต่ละคน — คนหนึ่งมีได้หลายห้อง เอาห้องแรกเป็นทางเข้า
    const { data: linkRows } = await supabaseAdmin
      .from('lead_contacts')
      .select('lead_id, contact_id, platform')
      .eq('company_id', companyId)
      .in('lead_id', leads.map(l => l.id));

    const links = (linkRows || []) as { lead_id: string; contact_id: string; platform: string }[];
    const firstLink = new Map<string, { contact_id: string; platform: string }>();
    for (const l of links) if (!firstLink.has(l.lead_id)) firstLink.set(l.lead_id, l);

    const [contactInfo, memberNames] = await Promise.all([
      loadContactInfo(companyId, links),
      loadMemberNames(leads.map(l => l.assigned_to).filter(Boolean) as string[]),
    ]);

    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);

    const groups: Record<'overdue' | 'today' | 'upcoming', QueueItem[]> = { overdue: [], today: [], upcoming: [] };

    for (const lead of leads) {
      const link = firstLink.get(lead.id);
      const info = link ? contactInfo.get(`${link.platform}:${link.contact_id}`) : undefined;
      const due = new Date(lead.follow_up_at as string);

      const item: QueueItem = {
        lead_id: lead.id,
        contact_id: link?.contact_id || null,
        platform: link?.platform || null,
        display_name: info?.display_name || 'ไม่ทราบชื่อ',
        picture_url: info?.picture_url || null,
        customer_id: lead.customer_id,
        stage: lead.stage,
        follow_up_at: lead.follow_up_at as string,
        follow_up_note: lead.follow_up_note,
        assigned_to: lead.assigned_to,
        assigned_name: lead.assigned_to ? memberNames.get(lead.assigned_to) || null : null,
        quote_sent_at: lead.quote_sent_at,
        reminded_count: lead.reminded_count,
      };

      if (due < startOfToday) groups.overdue.push(item);
      else if (due <= endOfToday) groups.today.push(item);
      else groups.upcoming.push(item);
    }

    return NextResponse.json({
      groups,
      counts: { overdue: groups.overdue.length, today: groups.today.length, upcoming: groups.upcoming.length },
      stages,
    });
  } catch (error) {
    console.error('Leads queue GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function loadMemberNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const { data } = await supabaseAdmin.from('user_profiles').select('id, name, email').in('id', unique);
  for (const p of data || []) map.set(p.id as string, (p.name as string) || (p.email as string) || 'ไม่ทราบชื่อ');
  return map;
}

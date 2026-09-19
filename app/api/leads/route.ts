// Path: app/api/leads/route.ts
//
// ผู้สนใจ (lead) ของห้องแชทหนึ่งห้อง — สถานะในกรวยขาย + นัดทักอีกครั้ง
//
//   GET  /api/leads?contact_id=&platform=   → { lead, stages, members }
//   PATCH /api/leads                        → แก้สถานะ/นัด/ผู้รับผิดชอบ (สร้าง lead ให้ถ้ายังไม่มี)
//
// สิทธิ์: ดู = `chat.view` · แก้ = `chat.reply` (คนที่ตอบเพจได้อยู่แล้ว — ไม่มี capability ใหม่)
// ⚠️ ใช้ service role ⇒ ต้องเช็คว่าห้องแชทเป็นของบริษัทนี้จริงก่อนเสมอ

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { can } from '@/lib/permissions';
import { contactTableFor } from '@/lib/chat/contact-tables';
import { getCompanyStages, getLeadForContact, resolveLeadForContact, updateLead } from '@/lib/leads/service';

/** ห้องแชทนี้เป็นของบริษัทนี้ไหม + ผูกกับลูกค้าคนไหนอยู่ (null = ยังไม่ผูก) */
async function loadContact(contactId: string, platform: string, companyId: string) {
  const table = contactTableFor(platform);
  if (!table || !contactId) return null;
  const { data } = await supabaseAdmin
    .from(table)
    .select('id, customer_id')
    .eq('id', contactId)
    .eq('company_id', companyId)
    .maybeSingle();
  return (data as { id: string; customer_id: string | null }) || null;
}

/** คนที่ตั้งเป็นผู้รับผิดชอบได้ = สมาชิกที่ตอบแชทได้ (ไม่ใช่ทุกคนในบริษัท) */
async function chatMembers(companyId: string) {
  const { data: members } = await supabaseAdmin
    .from('company_members')
    .select('user_id, roles, permissions')
    .eq('company_id', companyId)
    .eq('is_active', true);

  const allowed = (members || []).filter(m => can({ roles: m.roles, permissions: m.permissions }, 'chat.reply'));
  if (allowed.length === 0) return [];

  const { data: profiles } = await supabaseAdmin
    .from('user_profiles')
    .select('id, name, email')
    .in('id', allowed.map(m => m.user_id));

  return (profiles || []).map(p => ({ id: p.id, name: p.name || p.email || 'ไม่ทราบชื่อ' }));
}

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.view')) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูแชท' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const contactId = searchParams.get('contact_id') || '';
    const platform = searchParams.get('platform') || '';

    const [stages, members] = await Promise.all([getCompanyStages(companyId), chatMembers(companyId)]);

    if (!contactId || !platform) {
      return NextResponse.json({ lead: null, stages, members });
    }
    const contact = await loadContact(contactId, platform, companyId);
    if (!contact) return NextResponse.json({ error: 'ไม่พบผู้ติดต่อนี้' }, { status: 404 });

    // ยังไม่เคยติดตาม = ยังไม่มีแถว — ไม่สร้างให้ตอนแค่เปิดดู (ไม่งั้นทุกห้องที่เปิดจะงอกแถว)
    const lead = await getLeadForContact(companyId, contactId, platform);
    return NextResponse.json({ lead, stages, members });
  } catch (error) {
    console.error('Leads GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId, userId } = auth;
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.reply')) return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้การติดตาม' }, { status: 403 });

    const body = await request.json();
    const { contact_id: contactId, platform, stage, follow_up_at, follow_up_note, assigned_to } = body || {};

    if (!contactId || !platform) {
      return NextResponse.json({ error: 'ต้องระบุ contact_id และ platform' }, { status: 400 });
    }
    // สองอย่างนี้ไม่ขึ้นต่อกัน — ยิงพร้อมกัน (ทุก round trip ที่ต่อคิว = เวลาที่ผู้ใช้เห็นปุ่มค้าง)
    const [contact, stages] = await Promise.all([
      loadContact(contactId, platform, companyId),
      getCompanyStages(companyId),
    ]);
    if (!contact) return NextResponse.json({ error: 'ไม่พบผู้ติดต่อนี้' }, { status: 404 });

    if (stage !== undefined && !stages.some(s => s.key === stage)) {
      return NextResponse.json({ error: 'ไม่รู้จักสถานะนี้' }, { status: 400 });
    }
    if (follow_up_at !== undefined && follow_up_at !== null && Number.isNaN(new Date(follow_up_at).getTime())) {
      return NextResponse.json({ error: 'วันที่นัดไม่ถูกต้อง' }, { status: 400 });
    }

    const lead = await resolveLeadForContact({
      companyId, contactId, platform, customerId: contact.customer_id,
    });
    const updated = await updateLead({
      companyId,
      lead,
      input: {
        ...(stage !== undefined ? { stage } : {}),
        ...(follow_up_at !== undefined ? { followUpAt: follow_up_at } : {}),
        ...(follow_up_note !== undefined ? { followUpNote: follow_up_note } : {}),
        ...(assigned_to !== undefined ? { assignedTo: assigned_to } : {}),
      },
      actorId: userId,
      source: 'manual',
      contactId,
      platform,
    });

    return NextResponse.json({ success: true, lead: updated, stages });
  } catch (error) {
    console.error('Leads PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

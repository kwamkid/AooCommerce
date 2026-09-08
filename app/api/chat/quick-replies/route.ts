// Path: app/api/chat/quick-replies/route.ts
//
// ข้อความสำเร็จรูปของแชท (saved replies) — คลังกลาง **ต่อบริษัท ใช้ร่วมกันทั้งร้าน**
// เจ้าของเลือกไว้ชัดว่าไม่แยกเป็นของส่วนตัว: แอดมินทุกคนต้องตอบลูกค้าเหมือนกัน
// และคนใหม่เข้ามาต้องใช้ได้เลยโดยไม่ต้องพิมพ์เอง (8 ก.ย. 2026)
//
// สิทธิ์ใช้ `chat.reply` ทั้งอ่านและแก้ — คนที่ตอบลูกค้าได้คือคนที่ต้องดูแลคลังนี้
// (ถ้าต้องขออนุญาตแอดมินก่อนบันทึกข้อความที่เพิ่งพิมพ์ ปุ่ม "บันทึกข้อความนี้" ก็ไร้ความหมาย)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

const SELECT = 'id, title, content, image_url, sort_order, is_active, created_by, created_at, updated_at';

const MAX_TITLE = 60;
const MAX_CONTENT = 2000;

interface Body {
  id?: string;
  title?: string;
  content?: string;
  image_url?: string | null;
  is_active?: boolean;
  sort_order?: number;
  /** สลับลำดับหลายใบในคำขอเดียว — หน้าจัดการกดลูกศรขึ้น/ลงแล้วส่งคู่ที่สลับกันมา */
  reorder?: { id: string; sort_order: number }[];
}

/** คืน error ภาษาไทยเมื่อไม่ผ่าน — ใช้ร่วมทั้ง POST และ PUT ให้กติกาตรงกันเป๊ะ */
function validateBody(title: string | undefined, content: string | undefined, imageUrl: string | null | undefined): string | null {
  if (title !== undefined && title.length > MAX_TITLE) return `ชื่อยาวเกิน ${MAX_TITLE} ตัวอักษร`;
  if (content !== undefined && content.length > MAX_CONTENT) return `ข้อความยาวเกิน ${MAX_CONTENT} ตัวอักษร`;
  if (imageUrl != null && imageUrl !== '' && !/^https:\/\//.test(imageUrl)) return 'ลิงก์รูปต้องเป็น https';
  return null;
}

// GET ?active=true — รายการข้อความสำเร็จรูปของบริษัทนี้
export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(auth, 'chat.view')) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูแชท' }, { status: 403 });

  const activeOnly = new URL(request.url).searchParams.get('active') === 'true';

  let query = supabaseAdmin
    .from('chat_quick_replies')
    .select(SELECT)
    .eq('company_id', auth.companyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ replies: data || [] });
}

// POST — สร้างใบใหม่ (ต่อท้ายลำดับเสมอ)
export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(auth, 'chat.reply')) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการข้อความสำเร็จรูป' }, { status: 403 });

  const body = await request.json().catch(() => null) as Body | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const title = (body.title || '').trim();
  const content = (body.content || '').trim();
  const imageUrl = (body.image_url || '').trim() || null;

  if (!title) return NextResponse.json({ error: 'กรุณาตั้งชื่อข้อความสำเร็จรูป' }, { status: 400 });
  if (!content && !imageUrl) return NextResponse.json({ error: 'ต้องมีข้อความหรือรูปอย่างน้อยอย่างใดอย่างหนึ่ง' }, { status: 400 });
  const invalid = validateBody(title, content, imageUrl);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { data: last } = await supabaseAdmin
    .from('chat_quick_replies')
    .select('sort_order')
    .eq('company_id', auth.companyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await supabaseAdmin
    .from('chat_quick_replies')
    .insert({
      company_id: auth.companyId,
      title,
      content,
      image_url: imageUrl,
      sort_order: (last?.sort_order ?? -1) + 1,
      created_by: auth.userId || null,
    })
    .select(SELECT)
    .single();

  if (error || !created) return NextResponse.json({ error: error?.message || 'บันทึกไม่สำเร็จ' }, { status: 500 });
  return NextResponse.json({ reply: created });
}

// PUT — แก้ใบเดียว (id ใน body) หรือสลับลำดับหลายใบ (reorder)
export async function PUT(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(auth, 'chat.reply')) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการข้อความสำเร็จรูป' }, { status: 403 });

  const body = await request.json().catch(() => null) as Body | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  // ── สลับลำดับ ──
  if (Array.isArray(body.reorder)) {
    for (const row of body.reorder.slice(0, 200)) {
      if (!row?.id) continue;
      // .eq('company_id') ทุกใบ — id เดาได้ ห้ามให้บริษัทอื่นสั่งเรียงของเรา
      await supabaseAdmin
        .from('chat_quick_replies')
        .update({ sort_order: Math.round(Number(row.sort_order) || 0) })
        .eq('id', row.id)
        .eq('company_id', auth.companyId);
    }
    return NextResponse.json({ success: true });
  }

  if (!body.id) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: 'กรุณาตั้งชื่อข้อความสำเร็จรูป' }, { status: 400 });
    update.title = title;
  }
  if (body.content !== undefined) update.content = body.content.trim();
  if (body.image_url !== undefined) update.image_url = (body.image_url || '').trim() || null;
  if (body.is_active !== undefined) update.is_active = body.is_active !== false;
  if (body.sort_order !== undefined) update.sort_order = Math.round(Number(body.sort_order) || 0);

  const invalid = validateBody(
    update.title as string | undefined,
    update.content as string | undefined,
    update.image_url as string | null | undefined,
  );
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  if (Object.keys(update).length === 0) return NextResponse.json({ success: true });

  // ต้องรู้ค่าสุดท้ายก่อนบันทึก — แก้เฉพาะข้อความให้ว่างทั้งที่ไม่มีรูป = ใบเปล่า
  // (DB มี CHECK กันอยู่แล้ว แต่ error ของ Postgres อ่านไม่รู้เรื่องสำหรับผู้ใช้)
  const { data: current } = await supabaseAdmin
    .from('chat_quick_replies')
    .select('content, image_url')
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'ไม่พบข้อความสำเร็จรูปนี้' }, { status: 404 });

  const finalContent = (update.content as string | undefined) ?? current.content;
  const finalImage = update.image_url !== undefined ? (update.image_url as string | null) : current.image_url;
  if (!finalContent && !finalImage) {
    return NextResponse.json({ error: 'ต้องมีข้อความหรือรูปอย่างน้อยอย่างใดอย่างหนึ่ง' }, { status: 400 });
  }

  const { data: saved, error } = await supabaseAdmin
    .from('chat_quick_replies')
    .update(update)
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reply: saved });
}

// DELETE ?id= — ลบถาวรได้ ไม่มีตารางไหนอ้างถึงใบนี้ (ข้อความที่ส่งไปแล้วเก็บเนื้อของตัวเอง)
export async function DELETE(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(auth, 'chat.reply')) return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการข้อความสำเร็จรูป' }, { status: 403 });

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('chat_quick_replies')
    .delete()
    .eq('id', id)
    .eq('company_id', auth.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

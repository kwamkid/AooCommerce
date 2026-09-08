// Path: app/api/chat/saved-replies/route.ts
//
// ข้อความสำเร็จรูปของแชท (saved replies) — คลังกลาง **ต่อบริษัท ใช้ร่วมกันทั้งร้าน**
// เจ้าของเลือกไว้ชัดว่าไม่แยกเป็นของส่วนตัว: แอดมินทุกคนต้องตอบลูกค้าเหมือนกัน
// และคนใหม่เข้ามาต้องใช้ได้เลยโดยไม่ต้องพิมพ์เอง (8 ก.ย. 2026)
//
// สิทธิ์ใช้ `chat.reply` ทั้งอ่านและแก้ — คนที่ตอบลูกค้าได้คือคนที่ต้องดูแลคลังนี้
// (ถ้าต้องขออนุญาตแอดมินก่อนบันทึกข้อความที่เพิ่งพิมพ์ ปุ่ม "บันทึกข้อความนี้" ก็ไร้ความหมาย)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import {
  MAX_SAVED_REPLY_IMAGES, MAX_SAVED_REPLY_TITLE,
  sanitizeSavedReplyTitle, hasDisallowedTitleChars, SAVED_REPLY_TITLE_HINT,
} from '@/lib/chat/saved-replies';

const SELECT = 'id, title, content, image_urls, sort_order, is_active, use_count, last_used_at, created_by, created_at, updated_at';

const MAX_CONTENT = 2000;
/** unique index บน (company_id, ชื่อที่ normalize) — ดู migration saved_replies_multi_image_link_unique_title */
const DUPLICATE_TITLE_CODE = '23505';

interface Body {
  id?: string;
  title?: string;
  content?: string;
  image_urls?: unknown;
  is_active?: boolean;
  sort_order?: number;
  /** สลับลำดับหลายใบในคำขอเดียว — หน้าจัดการกดลูกศรขึ้น/ลงแล้วส่งคู่ที่สลับกันมา */
  reorder?: { id: string; sort_order: number }[];
}

/**
 * ชื่อเรียกที่บันทึกได้ — ตัดอักขระพิเศษออกเหมือนที่หน้าจอทำระหว่างพิมพ์
 * ถ้าส่งมาแล้วเหลือแต่อักขระต้องห้ามล้วน ๆ (เช่น "###") ต้องบอกเหตุผล ไม่ใช่เงียบ ๆ เซฟชื่อว่าง
 */
function cleanTitle(raw: string): { title: string; error?: string } {
  const title = sanitizeSavedReplyTitle(raw).trim().replace(/\s+/g, ' ');
  if (!title) {
    return { title, error: hasDisallowedTitleChars(raw) ? `ชื่อเรียกใช้อักขระพิเศษไม่ได้ — ${SAVED_REPLY_TITLE_HINT}` : 'กรุณาตั้งชื่อข้อความสำเร็จรูป' };
  }
  return { title };
}

/** รูปแนบ: ต้องเป็นอาร์เรย์ของ https และไม่เกินเพดาน — ค่าที่ไม่ใช่ลิงก์ถูกตัดทิ้งเงียบ ๆ ไม่ได้ */
function cleanImageUrls(raw: unknown): { urls: string[]; error?: string } {
  if (raw === undefined) return { urls: [] };
  if (!Array.isArray(raw)) return { urls: [], error: 'รูปแนบต้องเป็นรายการลิงก์' };
  const urls = raw.map(v => String(v || '').trim()).filter(Boolean);
  if (urls.some(u => !/^https:\/\//.test(u))) return { urls: [], error: 'ลิงก์รูปต้องเป็น https' };
  if (urls.length > MAX_SAVED_REPLY_IMAGES) return { urls: [], error: `แนบรูปได้ไม่เกิน ${MAX_SAVED_REPLY_IMAGES} ใบ` };
  return { urls };
}

/** คืน error ภาษาไทยเมื่อไม่ผ่าน — ใช้ร่วมทั้ง POST และ PUT ให้กติกาตรงกันเป๊ะ */
function validateBody(title: string | undefined, content: string | undefined): string | null {
  if (title !== undefined && title.length > MAX_SAVED_REPLY_TITLE) return `ชื่อยาวเกิน ${MAX_SAVED_REPLY_TITLE} ตัวอักษร`;
  if (content !== undefined && content.length > MAX_CONTENT) return `ข้อความยาวเกิน ${MAX_CONTENT} ตัวอักษร`;
  return null;
}

// GET ?active=true — รายการข้อความสำเร็จรูปของบริษัทนี้
export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!can(auth, 'chat.view')) return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูแชท' }, { status: 403 });

  const activeOnly = new URL(request.url).searchParams.get('active') === 'true';

  let query = supabaseAdmin
    .from('chat_saved_replies')
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

  const { title, error: titleError } = cleanTitle(body.title || '');
  if (titleError) return NextResponse.json({ error: titleError }, { status: 400 });

  const content = (body.content || '').trim();
  const { urls: imageUrls, error: imageError } = cleanImageUrls(body.image_urls);
  if (imageError) return NextResponse.json({ error: imageError }, { status: 400 });

  if (!content && imageUrls.length === 0) {
    return NextResponse.json({ error: 'ต้องมีข้อความหรือรูปอย่างน้อยอย่างใดอย่างหนึ่ง' }, { status: 400 });
  }
  const invalid = validateBody(title, content);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { data: last } = await supabaseAdmin
    .from('chat_saved_replies')
    .select('sort_order')
    .eq('company_id', auth.companyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: created, error } = await supabaseAdmin
    .from('chat_saved_replies')
    .insert({
      company_id: auth.companyId,
      title,
      content,
      image_urls: imageUrls,
      sort_order: (last?.sort_order ?? -1) + 1,
      created_by: auth.userId || null,
    })
    .select(SELECT)
    .single();

  // ชนกับ unique index = ชื่อซ้ำ — ต้องบอกให้ตรงเหตุ ไม่ใช่โยน error ดิบของ Postgres ให้ผู้ใช้อ่าน
  if (error?.code === DUPLICATE_TITLE_CODE) {
    return NextResponse.json({ error: `มีข้อความสำเร็จรูปชื่อ "${title}" อยู่แล้ว`, code: 'duplicate_title' }, { status: 409 });
  }
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
        .from('chat_saved_replies')
        .update({ sort_order: Math.round(Number(row.sort_order) || 0) })
        .eq('id', row.id)
        .eq('company_id', auth.companyId);
    }
    return NextResponse.json({ success: true });
  }

  if (!body.id) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const { title, error: titleError } = cleanTitle(body.title);
    if (titleError) return NextResponse.json({ error: titleError }, { status: 400 });
    update.title = title;
  }
  if (body.content !== undefined) update.content = body.content.trim();
  if (body.image_urls !== undefined) {
    const { urls, error: imageError } = cleanImageUrls(body.image_urls);
    if (imageError) return NextResponse.json({ error: imageError }, { status: 400 });
    update.image_urls = urls;
  }
  if (body.is_active !== undefined) update.is_active = body.is_active !== false;
  if (body.sort_order !== undefined) update.sort_order = Math.round(Number(body.sort_order) || 0);

  const invalid = validateBody(
    update.title as string | undefined,
    update.content as string | undefined,
  );
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  if (Object.keys(update).length === 0) return NextResponse.json({ success: true });

  // ต้องรู้ค่าสุดท้ายก่อนบันทึก — แก้เฉพาะข้อความให้ว่างทั้งที่ไม่มีรูป = ใบเปล่า
  // (DB มี CHECK กันอยู่แล้ว แต่ error ของ Postgres อ่านไม่รู้เรื่องสำหรับผู้ใช้)
  const { data: current } = await supabaseAdmin
    .from('chat_saved_replies')
    .select('content, image_urls')
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'ไม่พบข้อความสำเร็จรูปนี้' }, { status: 404 });

  const finalContent = (update.content as string | undefined) ?? current.content;
  const finalImages = (update.image_urls as string[] | undefined) ?? (current.image_urls as string[] | null) ?? [];
  if (!finalContent && finalImages.length === 0) {
    return NextResponse.json({ error: 'ต้องมีข้อความหรือรูปอย่างน้อยอย่างใดอย่างหนึ่ง' }, { status: 400 });
  }

  const { data: saved, error } = await supabaseAdmin
    .from('chat_saved_replies')
    .update(update)
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .select(SELECT)
    .single();

  if (error?.code === DUPLICATE_TITLE_CODE) {
    return NextResponse.json({ error: `มีข้อความสำเร็จรูปชื่อ "${update.title}" อยู่แล้ว`, code: 'duplicate_title' }, { status: 409 });
  }
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
    .from('chat_saved_replies')
    .delete()
    .eq('id', id)
    .eq('company_id', auth.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

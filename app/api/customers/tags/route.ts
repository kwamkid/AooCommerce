import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

// GET — list all tags for company
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    // นับทั้ง 2 ฝั่งที่ผูกแท็กเดียวกัน — ลูกค้า (customer_tag_links) และผู้ติดต่อในแชท
    // (contact_tag_links) — คนกดลบต้องเห็นว่าแท็กติดอยู่กับอะไรบ้างก่อนตัดสินใจ
    const { data, error } = await supabaseAdmin
      .from('customer_tags')
      .select('*, customer_tag_links(count), contact_tag_links(count)')
      .eq('company_id', companyId)
      .order('name');

    if (error) throw error;
    const tags = (data || []).map(t => ({
      id: t.id,
      name: t.name,
      color: t.color,
      triggers_qualified_lead: !!t.triggers_qualified_lead,
      count: t.customer_tag_links?.[0]?.count ?? 0,
      contact_count: t.contact_tag_links?.[0]?.count ?? 0,
    }));
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Customer tags GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * ย้ายธง "แท็กสัญญาณ QualifiedLead" มาที่แท็กใบนี้ — **ปลดของเดิมก่อนเสมอ**
 *
 * DB มี partial unique index (บริษัทละ 1 ใบ) ⇒ ติ๊กใบใหม่โดยไม่ปลดใบเก่า = 23505
 * ผู้ใช้จะเห็นแค่ "บันทึกไม่สำเร็จ" ทั้งที่เจตนาคือ "ย้ายมาอันนี้" ซึ่งชัดเจนอยู่แล้ว
 */
async function clearOtherQualifiedLeadTags(companyId: string, keepId?: string): Promise<void> {
  let q = supabaseAdmin
    .from('customer_tags')
    .update({ triggers_qualified_lead: false })
    .eq('company_id', companyId)
    .eq('triggers_qualified_lead', true);
  if (keepId) q = q.neq('id', keepId);
  await q;
}

// POST — create new tag
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { name, color, triggers_qualified_lead } = await request.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }

    const qualifiedLead = triggers_qualified_lead === true;
    if (qualifiedLead) await clearOtherQualifiedLeadTags(companyId);

    const { data, error } = await supabaseAdmin
      .from('customer_tags')
      .insert({
        company_id: companyId,
        name: name.trim(),
        color: color || '#6B7280',
        triggers_qualified_lead: qualifiedLead,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'แท็กชื่อนี้มีอยู่แล้ว' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ tag: data });
  } catch (error) {
    console.error('Customer tags POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — update tag
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    // สร้างแท็ก (POST) เปิดให้ทุกคน เพราะ quick-add จากฟอร์มลูกค้า/แชทต้องใช้ได้
    // แต่แก้ชื่อ/สี กระทบทุกคนที่เห็นแท็กนั้น จึงจำกัดที่ผู้ดูแล
    if (!can(auth, 'masterdata.tags')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขแท็ก' }, { status: 403 });
    }

    const { id, name, color, triggers_qualified_lead } = await request.json();
    if (!id) return NextResponse.json({ error: 'Tag id is required' }, { status: 400 });

    const updates: Record<string, string | boolean> = {};
    if (name?.trim()) updates.name = name.trim();
    if (color) updates.color = color;
    if (typeof triggers_qualified_lead === 'boolean') {
      updates.triggers_qualified_lead = triggers_qualified_lead;
      if (triggers_qualified_lead) await clearOtherQualifiedLeadTags(companyId, id);
    }

    const { data, error } = await supabaseAdmin
      .from('customer_tags')
      .update(updates)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'แท็กชื่อนี้มีอยู่แล้ว' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ tag: data });
  } catch (error) {
    console.error('Customer tags PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — delete tag (cascade removes links)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    // ลบแท็ก = FK cascade ถอดแท็กออกจากทั้งลูกค้าและผู้ติดต่อในแชทพร้อมกัน ย้อนไม่ได้
    if (!can(auth, 'masterdata.tags')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ลบแท็ก' }, { status: 403 });
    }

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Tag id is required' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('customer_tags')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Customer tags DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

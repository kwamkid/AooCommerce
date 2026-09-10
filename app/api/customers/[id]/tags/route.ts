import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// Confirm the customer belongs to the caller's company. Returns true only when
// the id resolves to a row in this company — blocks cross-tenant tag reads/writes
// (service role bypasses RLS, so this check is the isolation boundary).
async function customerInCompany(customerId: string, companyId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('company_id', companyId)
    .single();
  return !!data;
}

// GET — list tags for a specific customer
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id: customerId } = await params;
    if (!(await customerInCompany(customerId, companyId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from('customer_tag_links')
      .select('tag:customer_tags(*)')
      .eq('customer_id', customerId);

    if (error) throw error;
    const tags = (data || []).map((d: any) => d.tag).filter(Boolean);
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Customer tags GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH — ติด/ปลดแท็กเป็นรายตัว { add?: string[], remove?: string[] }
//
// WHY: การกดแท็กหนึ่งครั้งต้องแตะเฉพาะแท็กตัวนั้น — ของเดิมทุกหน้าใช้ PUT (replace-all)
// โดยส่ง "ชุดที่จอถืออยู่" ซึ่งเป็น snapshot เก่า พอมีคนอื่นติดแท็กระหว่างนั้น
// การกดครั้งถัดไปจะลบแท็กของเขาทิ้งเงียบ ๆ (ดู lib/tag-links.ts)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id: customerId } = await params;
    if (!(await customerInCompany(customerId, companyId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const add = body?.add;
    const remove = body?.remove;
    if (add !== undefined && !Array.isArray(add)) {
      return NextResponse.json({ error: 'add must be an array' }, { status: 400 });
    }
    if (remove !== undefined && !Array.isArray(remove)) {
      return NextResponse.json({ error: 'remove must be an array' }, { status: 400 });
    }

    const addIds: string[] = Array.isArray(add) ? add.filter((v: unknown) => typeof v === 'string') : [];
    const removeIds: string[] = Array.isArray(remove) ? remove.filter((v: unknown) => typeof v === 'string') : [];

    // ติดแท็กที่ตั้งเป็นสัญญาณ = คนยืนยันว่าลูกค้ารายนี้มีคุณภาพ ต้องบอก Meta
    let taggedQualifiedLead = false;

    if (addIds.length > 0) {
      // รับเฉพาะแท็กของบริษัทนี้ — id แปลกปลอมถูกตัดทิ้งเงียบ ๆ (ไม่ใช่ error)
      const { data: ownTags, error: ownErr } = await supabaseAdmin
        .from('customer_tags')
        .select('id, triggers_qualified_lead')
        .eq('company_id', companyId)
        .in('id', addIds);
      if (ownErr) throw ownErr;

      const validAddIds = (ownTags || []).map(t => t.id);
      taggedQualifiedLead = (ownTags || []).some(t => t.triggers_qualified_lead);
      if (validAddIds.length > 0) {
        // ⚠️ onConflict ต้องตรงกับ primary key เป๊ะ ๆ (customer_id, tag_id)
        // ไม่ตรง = ล้มด้วย 42P10 ทุกแถวทั้งที่ flow ดูสำเร็จ (aoo-techstack/BUGS.md)
        const { error: upErr } = await supabaseAdmin
          .from('customer_tag_links')
          .upsert(
            validAddIds.map(tag_id => ({ customer_id: customerId, tag_id })),
            { onConflict: 'customer_id,tag_id', ignoreDuplicates: true }
          );
        if (upErr) throw upErr;
      }
    }

    if (removeIds.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from('customer_tag_links')
        .delete()
        .eq('customer_id', customerId)
        .in('tag_id', removeIds);
      if (delErr) throw delErr;
    }

    // Return updated tags
    const { data, error } = await supabaseAdmin
      .from('customer_tag_links')
      .select('tag:customer_tags(*)')
      .eq('customer_id', customerId);
    if (error) throw error;

    const tags = (data || []).map((d: any) => d.tag).filter(Boolean);

    // ลูกค้าคนเดียวผูกได้หลายห้อง Messenger (ทักมาหลายเพจ) — ยิงให้ทุกห้องที่ผูกไว้
    // เพดาน 3 ห้องพอ: มากกว่านั้นแปลว่าข้อมูลผูกกันมั่ว ไม่ใช่เคสที่ต้องรองรับ
    // ⚠️ ต้องอยู่ใน after() — ปล่อยลอยแล้ว Vercel freeze ทิ้งทันทีที่ response ออก
    if (taggedQualifiedLead) {
      after(async () => {
        try {
          const { data: contacts } = await supabaseAdmin
            .from('fb_contacts')
            .select('id')
            .eq('company_id', companyId)
            .eq('customer_id', customerId)
            .eq('source', 'facebook')
            .limit(3);
          if (!contacts?.length) return;
          const { evaluateQualifiedLead } = await import('@/lib/ads/qualified-lead');
          for (const contact of contacts as { id: string }[]) {
            await evaluateQualifiedLead({ companyId, contactId: contact.id, trigger: 'tag' });
          }
        } catch (err) {
          console.error('[customer tags] QualifiedLead failed:', err);
        }
      });
    }

    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Customer tags PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — set tags for customer (replace all)
//
// ⛔ ใช้ได้เฉพาะเมื่อผู้เรียก "ถือชุดล่าสุดของเซิร์ฟเวอร์จริง" — ตอนนี้เหลือที่เดียวคือ
// หน้าสร้างลูกค้าใหม่ (/customers/new) ที่ลูกค้าเพิ่งเกิด ยังไม่มีแท็กให้หาย
// ที่อื่นทั้งหมดต้องใช้ PATCH (diff) ไม่งั้นจะลบแท็กที่คนอื่นเพิ่งติดทิ้ง
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id: customerId } = await params;
    if (!(await customerInCompany(customerId, companyId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { tag_ids } = await request.json();
    if (!Array.isArray(tag_ids)) {
      return NextResponse.json({ error: 'tag_ids must be an array' }, { status: 400 });
    }

    // Only accept tag_ids that belong to this company — prevents attaching
    // another tenant's tag (or arbitrary ids) to the customer.
    let validTagIds: string[] = [];
    if (tag_ids.length > 0) {
      const { data: ownTags } = await supabaseAdmin
        .from('customer_tags')
        .select('id')
        .eq('company_id', companyId)
        .in('id', tag_ids);
      validTagIds = (ownTags || []).map(t => t.id);
    }

    // Delete existing links
    await supabaseAdmin
      .from('customer_tag_links')
      .delete()
      .eq('customer_id', customerId);

    // Insert new links
    if (validTagIds.length > 0) {
      const links = validTagIds.map((tag_id: string) => ({
        customer_id: customerId,
        tag_id,
      }));
      const { error } = await supabaseAdmin
        .from('customer_tag_links')
        .insert(links);
      if (error) throw error;
    }

    // Return updated tags
    const { data } = await supabaseAdmin
      .from('customer_tag_links')
      .select('tag:customer_tags(*)')
      .eq('customer_id', customerId);

    const tags = (data || []).map((d: any) => d.tag).filter(Boolean);
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Customer tags PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

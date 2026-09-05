import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// Confirm the chat contact belongs to the caller's company. line → line_contacts,
// facebook → fb_contacts (both carry company_id). Blocks cross-tenant tag edits
// since the service-role client bypasses RLS.
async function contactInCompany(contactId: string, platform: string, companyId: string): Promise<boolean> {
  const table = platform === 'facebook' ? 'fb_contacts' : platform === 'shopee' ? 'shopee_contacts' : platform === 'lazada' ? 'lazada_contacts' : platform === 'tiktok' ? 'tiktok_contacts' : 'line_contacts';
  const { data } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('id', contactId)
    .eq('company_id', companyId)
    .single();
  return !!data;
}

// GET — list tags for a specific contact
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id: contactId } = await params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || 'line';
    if (!(await contactInCompany(contactId, platform, companyId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch tag links first, then resolve tags separately
    // (PostgREST may not auto-detect FK on contact_tag_links)
    const { data: links, error } = await supabaseAdmin
      .from('contact_tag_links')
      .select('tag_id')
      .eq('contact_id', contactId)
      .eq('platform', platform);

    if (error) throw error;

    const tagIds = (links || []).map((l: any) => l.tag_id);
    let tags: any[] = [];
    if (tagIds.length > 0) {
      const { data: tagData } = await supabaseAdmin
        .from('customer_tags')
        .select('id, name, color')
        .eq('company_id', companyId)
        .in('id', tagIds);
      tags = tagData || [];
    }
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Contact tags GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH — ติด/ปลดแท็กเป็นรายตัว { platform, add?: string[], remove?: string[] }
//
// WHY: การกดแท็กหนึ่งครั้งต้องแตะเฉพาะแท็กตัวนั้น — ของเดิมใช้ PUT (replace-all)
// โดยส่ง "ชุดที่จอถืออยู่" ซึ่งเป็น snapshot เก่าตอนกดเปิดผู้ติดต่อ
// พอมีคนอื่นติดแท็กระหว่างนั้น การกดครั้งถัดไปจะลบของเขาทิ้งเงียบ ๆ (ดู lib/tag-links.ts)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id: contactId } = await params;
    const body = await request.json();
    const { platform, add, remove } = body || {};

    if (!platform || !['line', 'facebook', 'shopee', 'lazada', 'tiktok'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    if (add !== undefined && !Array.isArray(add)) {
      return NextResponse.json({ error: 'add must be an array' }, { status: 400 });
    }
    if (remove !== undefined && !Array.isArray(remove)) {
      return NextResponse.json({ error: 'remove must be an array' }, { status: 400 });
    }
    if (!(await contactInCompany(contactId, platform, companyId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const addIds: string[] = Array.isArray(add) ? add.filter((v: unknown) => typeof v === 'string') : [];
    const removeIds: string[] = Array.isArray(remove) ? remove.filter((v: unknown) => typeof v === 'string') : [];

    if (addIds.length > 0) {
      // รับเฉพาะแท็กของบริษัทนี้ — id แปลกปลอมถูกตัดทิ้งเงียบ ๆ (ไม่ใช่ error)
      const { data: ownTags, error: ownErr } = await supabaseAdmin
        .from('customer_tags')
        .select('id')
        .eq('company_id', companyId)
        .in('id', addIds);
      if (ownErr) throw ownErr;

      const validAddIds = (ownTags || []).map(t => t.id);
      if (validAddIds.length > 0) {
        // ⚠️ onConflict ต้องตรงกับ primary key เป๊ะ ๆ (contact_id, platform, tag_id)
        // ไม่ตรง = ล้มด้วย 42P10 ทุกแถวทั้งที่ flow ดูสำเร็จ (aoo-techstack/BUGS.md)
        const { error: upErr } = await supabaseAdmin
          .from('contact_tag_links')
          .upsert(
            validAddIds.map(tag_id => ({ contact_id: contactId, platform, tag_id })),
            { onConflict: 'contact_id,platform,tag_id', ignoreDuplicates: true }
          );
        if (upErr) throw upErr;
      }
    }

    if (removeIds.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from('contact_tag_links')
        .delete()
        .eq('contact_id', contactId)
        .eq('platform', platform)
        .in('tag_id', removeIds);
      if (delErr) throw delErr;
    }

    // Return updated tags (fetch separately, PostgREST FK join may not work)
    const { data: updatedLinks, error: linkErr } = await supabaseAdmin
      .from('contact_tag_links')
      .select('tag_id')
      .eq('contact_id', contactId)
      .eq('platform', platform);
    if (linkErr) throw linkErr;

    const updatedTagIds = (updatedLinks || []).map((l: any) => l.tag_id);
    let tags: any[] = [];
    if (updatedTagIds.length > 0) {
      const { data: tagData, error: tagErr } = await supabaseAdmin
        .from('customer_tags')
        .select('id, name, color')
        .eq('company_id', companyId)
        .in('id', updatedTagIds);
      if (tagErr) throw tagErr;
      tags = tagData || [];
    }
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Contact tags PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — set tags for contact (replace all)
//
// ⛔ ใช้ได้เฉพาะเมื่อผู้เรียก "ถือชุดล่าสุดของเซิร์ฟเวอร์จริง" เท่านั้น
// ที่อื่นทั้งหมดต้องใช้ PATCH (diff) ไม่งั้นจะลบแท็กที่คนอื่นเพิ่งติดทิ้ง
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { id: contactId } = await params;
    const { tag_ids, platform } = await request.json();

    if (!Array.isArray(tag_ids)) {
      return NextResponse.json({ error: 'tag_ids must be an array' }, { status: 400 });
    }
    if (!platform || !['line', 'facebook', 'shopee', 'lazada', 'tiktok'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    if (!(await contactInCompany(contactId, platform, companyId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Only accept tag_ids that belong to this company.
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
    const { error: delError } = await supabaseAdmin
      .from('contact_tag_links')
      .delete()
      .eq('contact_id', contactId)
      .eq('platform', platform);

    if (delError) {
      console.error('Contact tags DELETE error:', delError);
      throw delError;
    }

    // Insert new links
    if (validTagIds.length > 0) {
      const links = validTagIds.map((tag_id: string) => ({
        contact_id: contactId,
        platform,
        tag_id,
      }));
      const { error } = await supabaseAdmin
        .from('contact_tag_links')
        .insert(links);
      if (error) throw error;
    }

    // Return updated tags (fetch separately, PostgREST FK join may not work)
    const { data: updatedLinks } = await supabaseAdmin
      .from('contact_tag_links')
      .select('tag_id')
      .eq('contact_id', contactId)
      .eq('platform', platform);

    const updatedTagIds = (updatedLinks || []).map((l: any) => l.tag_id);
    let tags: any[] = [];
    if (updatedTagIds.length > 0) {
      const { data: tagData } = await supabaseAdmin
        .from('customer_tags')
        .select('id, name, color')
        .eq('company_id', companyId)
        .in('id', updatedTagIds);
      tags = tagData || [];
    }
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Contact tags PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

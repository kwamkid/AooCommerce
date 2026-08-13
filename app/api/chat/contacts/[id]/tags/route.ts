import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// Confirm the chat contact belongs to the caller's company. line → line_contacts,
// facebook → fb_contacts (both carry company_id). Blocks cross-tenant tag edits
// since the service-role client bypasses RLS.
async function contactInCompany(contactId: string, platform: string, companyId: string): Promise<boolean> {
  const table = platform === 'facebook' ? 'fb_contacts' : platform === 'shopee' ? 'shopee_contacts' : 'line_contacts';
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

// PUT — set tags for contact (replace all)
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
    if (!platform || !['line', 'facebook', 'shopee'].includes(platform)) {
      return NextResponse.json({ error: 'platform must be line, facebook or shopee' }, { status: 400 });
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

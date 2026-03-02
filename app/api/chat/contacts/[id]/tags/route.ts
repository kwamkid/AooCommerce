import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — list tags for a specific contact
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuth } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: contactId } = await params;
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform') || 'line';

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
    const { isAuth } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: contactId } = await params;
    const { tag_ids, platform } = await request.json();

    if (!Array.isArray(tag_ids)) {
      return NextResponse.json({ error: 'tag_ids must be an array' }, { status: 400 });
    }
    if (!platform || !['line', 'facebook'].includes(platform)) {
      return NextResponse.json({ error: 'platform must be line or facebook' }, { status: 400 });
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
    if (tag_ids.length > 0) {
      const links = tag_ids.map((tag_id: string) => ({
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
        .in('id', updatedTagIds);
      tags = tagData || [];
    }
    return NextResponse.json({ tags });
  } catch (error) {
    console.error('Contact tags PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

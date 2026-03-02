import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — list tags for a specific customer
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuth } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: customerId } = await params;

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

// PUT — set tags for customer (replace all)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { isAuth } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id: customerId } = await params;
    const { tag_ids } = await request.json();

    if (!Array.isArray(tag_ids)) {
      return NextResponse.json({ error: 'tag_ids must be an array' }, { status: 400 });
    }

    // Delete existing links
    await supabaseAdmin
      .from('customer_tag_links')
      .delete()
      .eq('customer_id', customerId);

    // Insert new links
    if (tag_ids.length > 0) {
      const links = tag_ids.map((tag_id: string) => ({
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

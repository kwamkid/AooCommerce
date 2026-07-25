import { NextRequest, NextResponse } from 'next/server';
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

// PUT — set tags for customer (replace all)
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

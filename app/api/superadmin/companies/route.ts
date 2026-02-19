import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkSuperAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // Fetch companies
    let query = supabaseAdmin
      .from('companies')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,slug.ilike.%${search}%`);
    }

    const { data: companies, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    // Get member counts for these companies
    const companyIds = (companies || []).map(c => c.id);
    const memberCounts: Record<string, number> = {};

    if (companyIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: members } = await supabaseAdmin
        .from('company_members')
        .select('company_id')
        .in('company_id', companyIds)
        .eq('is_active', true);

      (members || []).forEach((m: { company_id: string }) => {
        memberCounts[m.company_id] = (memberCounts[m.company_id] || 0) + 1;
      });
    }

    // Get owner info (role = 'owner' in company_members)
    const ownerMap: Record<string, { name: string; email: string }> = {};
    if (companyIds.length > 0) {
      const { data: owners } = await supabaseAdmin
        .from('company_members')
        .select('company_id, user:user_profiles(name, email)')
        .in('company_id', companyIds)
        .contains('roles', ['owner']);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (owners || []).forEach((o: any) => {
        if (o.user) {
          ownerMap[o.company_id] = { name: o.user.name || '', email: o.user.email || '' };
        }
      });
    }

    // Get subscription/package info per company
    const packageMap: Record<string, { package_id: string; package_name: string; package_slug: string }> = {};
    if (companyIds.length > 0) {
      const { data: subs } = await supabaseAdmin
        .from('user_subscriptions')
        .select('company_id, package:packages(id, name, slug)')
        .in('company_id', companyIds)
        .eq('status', 'active');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (subs || []).forEach((s: any) => {
        if (s.company_id && s.package) {
          packageMap[s.company_id] = {
            package_id: s.package.id,
            package_name: s.package.name,
            package_slug: s.package.slug,
          };
        }
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (companies || []).map((c: any) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      logo_url: c.logo_url,
      is_active: c.is_active,
      created_at: c.created_at,
      member_count: memberCounts[c.id] || 0,
      owner_name: ownerMap[c.id]?.name || '',
      owner_email: ownerMap[c.id]?.email || '',
      package_id: packageMap[c.id]?.package_id || null,
      package_name: packageMap[c.id]?.package_name || '-',
      package_slug: packageMap[c.id]?.package_slug || '',
    }));

    return NextResponse.json({ companies: result, total: count || 0, page, limit });
  } catch (error) {
    console.error('GET superadmin/companies error:', error);
    return NextResponse.json({ error: 'Failed to fetch companies' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { id, is_active, package_id } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Toggle active/inactive
    if (is_active !== undefined) {
      const { error } = await supabaseAdmin
        .from('companies')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    }

    // Change package
    if (package_id) {
      const { data: pkg } = await supabaseAdmin
        .from('packages')
        .select('id, name')
        .eq('id', package_id)
        .single();

      if (!pkg) {
        return NextResponse.json({ error: 'Package not found' }, { status: 404 });
      }

      // Expire current active subscription
      await supabaseAdmin
        .from('user_subscriptions')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('company_id', id)
        .eq('status', 'active');

      // Create new subscription
      const { error } = await supabaseAdmin
        .from('user_subscriptions')
        .insert({
          company_id: id,
          user_id: auth.userId,
          package_id: package_id,
          status: 'active',
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;

      return NextResponse.json({ success: true, message: `เปลี่ยน package เป็น ${pkg.name} สำเร็จ` });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT superadmin/companies error:', error);
    return NextResponse.json({ error: 'Failed to update company' }, { status: 500 });
  }
}

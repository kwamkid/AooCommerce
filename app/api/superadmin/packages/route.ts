import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkSuperAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { data: packages, error } = await supabaseAdmin
      .from('packages')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) throw error;

    // Count active subscribers per package
    const { data: subscriptions } = await supabaseAdmin
      .from('user_subscriptions')
      .select('package_id')
      .eq('status', 'active');

    const subCounts: Record<string, number> = {};
    (subscriptions || []).forEach((s: { package_id: string }) => {
      subCounts[s.package_id] = (subCounts[s.package_id] || 0) + 1;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (packages || []).map((p: any) => ({
      ...p,
      subscriber_count: subCounts[p.id] || 0,
    }));

    return NextResponse.json({ packages: result });
  } catch (error) {
    console.error('GET superadmin/packages error:', error);
    return NextResponse.json({ error: 'Failed to fetch packages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { name, slug, max_companies, max_members_per_company, price_monthly, price_yearly, features, sort_order } = body;

    if (!name?.trim() || !slug?.trim()) {
      return NextResponse.json({ error: 'name and slug are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('packages')
      .insert({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        max_companies: max_companies || null,
        max_members_per_company: max_members_per_company || null,
        price_monthly: price_monthly || 0,
        price_yearly: price_yearly || 0,
        features: features || {},
        is_active: true,
        sort_order: sort_order || 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'slug ซ้ำ กรุณาใช้ชื่ออื่น' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, package: data });
  } catch (error) {
    console.error('POST superadmin/packages error:', error);
    return NextResponse.json({ error: 'Failed to create package' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (updates.name !== undefined) updateData.name = updates.name.trim();
    if (updates.slug !== undefined) updateData.slug = updates.slug.trim().toLowerCase();
    if (updates.max_companies !== undefined) updateData.max_companies = updates.max_companies || null;
    if (updates.max_members_per_company !== undefined) updateData.max_members_per_company = updates.max_members_per_company || null;
    if (updates.price_monthly !== undefined) updateData.price_monthly = updates.price_monthly;
    if (updates.price_yearly !== undefined) updateData.price_yearly = updates.price_yearly;
    if (updates.features !== undefined) updateData.features = updates.features;
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
    if (updates.sort_order !== undefined) updateData.sort_order = updates.sort_order;

    const { error } = await supabaseAdmin
      .from('packages')
      .update(updateData)
      .eq('id', id);

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'slug ซ้ำ กรุณาใช้ชื่ออื่น' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT superadmin/packages error:', error);
    return NextResponse.json({ error: 'Failed to update package' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Soft delete — set is_active = false
    const { error } = await supabaseAdmin
      .from('packages')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE superadmin/packages error:', error);
    return NextResponse.json({ error: 'Failed to delete package' }, { status: 500 });
  }
}

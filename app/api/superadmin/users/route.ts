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

    let query = supabaseAdmin
      .from('user_profiles')
      .select('id, name, email, phone, is_active, is_super_admin, created_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: users, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    // Get company counts per user
    const userIds = (users || []).map(u => u.id);
    const companyCounts: Record<string, number> = {};

    if (userIds.length > 0) {
      const { data: memberships } = await supabaseAdmin
        .from('company_members')
        .select('user_id')
        .in('user_id', userIds)
        .eq('is_active', true);

      (memberships || []).forEach((m: { user_id: string }) => {
        companyCounts[m.user_id] = (companyCounts[m.user_id] || 0) + 1;
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = (users || []).map((u: any) => ({
      id: u.id,
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || '',
      is_active: u.is_active,
      is_super_admin: u.is_super_admin || false,
      created_at: u.created_at,
      company_count: companyCounts[u.id] || 0,
    }));

    return NextResponse.json({
      users: result,
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('GET superadmin/users error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

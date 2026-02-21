// Path: app/api/auth/me/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET - ดึง profile ของ user ปัจจุบัน + companies
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized. Login required.' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Get user profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error('Profile query failed for user:', user.id, 'error:', profileError?.message, 'profile:', profile);
      return NextResponse.json({
        profile: {
          id: user.id,
          email: user.email || '',
          name: user.email?.split('@')[0] || 'User',
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        companies: [],
        subscription: null,
      });
    }

    // Get company memberships
    const { data: memberships, error: memberError } = await supabaseAdmin
      .from('company_members')
      .select(`
        company_id,
        roles,
        company:companies (
          id, name, slug, logo_url, is_active
        )
      `)
      .eq('user_id', user.id)
      .eq('is_active', true);

    // Get subscription — ดึงจาก company แรกที่ user อยู่
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstCompanyId = (memberships || [])[0]?.company_id;
    let subscription = null;
    if (firstCompanyId) {
      const { data: sub } = await supabaseAdmin
        .from('user_subscriptions')
        .select(`
          id, status, started_at, expires_at,
          package:packages (id, name, slug, max_companies, max_members_per_company)
        `)
        .eq('company_id', firstCompanyId)
        .eq('status', 'active')
        .single();
      subscription = sub;
    }

    return NextResponse.json({
      profile,
      companies: memberships || [],
      subscription: subscription || null,
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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

    // Fetch profile + memberships + subscription in parallel
    // Profile and memberships are independent; subscription chains off memberships
    const [profileResult, membershipAndSub] = await Promise.all([
      // Query 1: user profile
      supabaseAdmin
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single(),
      // Query 2: memberships → then subscription (chained)
      supabaseAdmin
        .from('company_members')
        .select(`
          company_id,
          roles,
          can_view_cost,
          company:companies (
            id, name, slug, logo_url, is_active, business_type, vat_registered, onboarding_completed_at, business_channels
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .then(async ({ data: memberships }) => {
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
          return { memberships: memberships || [], subscription };
        }),
    ]);

    const { data: profile, error: profileError } = profileResult;

    if (profileError || !profile) {
      console.error('Profile query failed for user:', user.id, 'error:', profileError?.message);
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

    return NextResponse.json({
      profile,
      companies: membershipAndSub.memberships,
      subscription: membershipAndSub.subscription || null,
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

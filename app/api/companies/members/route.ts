import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET - List company members
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get company members
    const { data: memberRows, error } = await supabaseAdmin
      .from('company_members')
      .select('id, user_id, role, is_active, joined_at, created_at')
      .eq('company_id', auth.companyId)
      .order('joined_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get user profiles for all members
    const userIds = (memberRows || []).map(m => m.user_id);
    let userMap: Record<string, { id: string; email: string; name: string; phone: string | null; avatar: string | null }> = {};

    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, email, name, phone, avatar')
        .in('id', userIds);

      if (profiles) {
        for (const p of profiles) {
          userMap[p.id] = p;
        }
      }
    }

    // Join members with user profiles
    const members = (memberRows || []).map(m => ({
      id: m.id,
      role: m.role,
      is_active: m.is_active,
      joined_at: m.joined_at,
      created_at: m.created_at,
      user: userMap[m.user_id] || { id: m.user_id, email: '', name: 'Unknown', phone: null, avatar: null },
    }));

    // Also get pending invitations
    const { data: invitations } = await supabaseAdmin
      .from('company_invitations')
      .select('*')
      .eq('company_id', auth.companyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    return NextResponse.json({ members: members || [], invitations: invitations || [] });
  } catch (error) {
    console.error('Get members error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Invite a member
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission (owner or admin)
    if (!auth.companyRole || !['owner', 'admin'].includes(auth.companyRole)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เชิญสมาชิก' }, { status: 403 });
    }

    const { email, role } = await request.json();

    if (!email || !role) {
      return NextResponse.json({ error: 'กรุณาระบุอีเมลและตำแหน่ง' }, { status: 400 });
    }

    // Check package member limit
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('created_by')
      .eq('id', auth.companyId)
      .single();

    if (company) {
      const { data: subscription } = await supabaseAdmin
        .from('user_subscriptions')
        .select('package:packages(*)')
        .eq('user_id', company.created_by)
        .eq('status', 'active')
        .single();

      const pkg = subscription?.package as unknown as { max_members_per_company: number | null } | null;
      const maxMembers = pkg?.max_members_per_company;

      if (maxMembers !== null && maxMembers !== undefined) {
        const { count } = await supabaseAdmin
          .from('company_members')
          .select('*', { count: 'exact', head: true })
          .eq('company_id', auth.companyId)
          .eq('is_active', true);

        if (count !== null && count >= maxMembers) {
          return NextResponse.json(
            { error: `แพ็กเกจนี้มีสมาชิกได้สูงสุด ${maxMembers} คน กรุณาอัพเกรดแพ็กเกจ` },
            { status: 403 }
          );
        }
      }
    }

    // Check if user is already a member
    const { data: existingUser } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      const { data: existingMember } = await supabaseAdmin
        .from('company_members')
        .select('id')
        .eq('company_id', auth.companyId)
        .eq('user_id', existingUser.id)
        .single();

      if (existingMember) {
        return NextResponse.json({ error: 'ผู้ใช้นี้เป็นสมาชิกอยู่แล้ว' }, { status: 400 });
      }
    }

    // Check if invitation already exists
    const { data: existingInvite } = await supabaseAdmin
      .from('company_invitations')
      .select('id')
      .eq('company_id', auth.companyId)
      .eq('email', email)
      .eq('status', 'pending')
      .single();

    if (existingInvite) {
      return NextResponse.json({ error: 'มีคำเชิญที่ยังรอการตอบรับอยู่แล้ว' }, { status: 400 });
    }

    // Create invitation
    const { data: invitation, error } = await supabaseAdmin
      .from('company_invitations')
      .insert({
        company_id: auth.companyId,
        email,
        role,
        invited_by: auth.userId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, invitation });
  } catch (error) {
    console.error('Invite member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update member role
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.companyRole || !['owner', 'admin'].includes(auth.companyRole)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขตำแหน่ง' }, { status: 403 });
    }

    const { memberId, role } = await request.json();

    if (!memberId || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Cannot change owner role unless you are the owner
    const { data: targetMember } = await supabaseAdmin
      .from('company_members')
      .select('role')
      .eq('id', memberId)
      .eq('company_id', auth.companyId)
      .single();

    if (targetMember?.role === 'owner' && auth.companyRole !== 'owner') {
      return NextResponse.json({ error: 'ไม่สามารถแก้ไขตำแหน่งเจ้าของได้' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('company_members')
      .update({ role })
      .eq('id', memberId)
      .eq('company_id', auth.companyId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, member: data });
  } catch (error) {
    console.error('Update member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Remove member
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!auth.companyRole || !['owner', 'admin'].includes(auth.companyRole)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ลบสมาชิก' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('id');
    const type = searchParams.get('type'); // 'member' or 'invitation'

    if (!memberId) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    if (type === 'invitation') {
      await supabaseAdmin
        .from('company_invitations')
        .update({ status: 'cancelled' })
        .eq('id', memberId)
        .eq('company_id', auth.companyId);
    } else {
      // Cannot remove owner
      const { data: targetMember } = await supabaseAdmin
        .from('company_members')
        .select('role')
        .eq('id', memberId)
        .eq('company_id', auth.companyId)
        .single();

      if (targetMember?.role === 'owner') {
        return NextResponse.json({ error: 'ไม่สามารถลบเจ้าของบริษัทได้' }, { status: 403 });
      }

      await supabaseAdmin
        .from('company_members')
        .update({ is_active: false })
        .eq('id', memberId)
        .eq('company_id', auth.companyId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete member error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

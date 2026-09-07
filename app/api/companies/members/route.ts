import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import {
  assertMemberMutationAllowed, resolveCanViewCost, mainRoleOf, isAdminTierRole,
  permissionsFromLegacyRoles, validateRole, validatePermissions,
  type Permissions, type RoleLevel,
} from '@/lib/permissions';

/**
 * รับได้ทั้งรูปแบบใหม่ (`role` + `permissions`) และรูปแบบเก่า (`roles: string[]`)
 * แล้วคืนสิ่งที่จะเขียนลง DB เสมอ: role หลักค่าเดียว + สิทธิ์รายกลุ่มงาน
 * (ชั้นผู้บริหารได้ทุกกลุ่มอยู่แล้ว → permissions = null ไม่ให้มีสองแหล่งความจริง)
 */
function normalizeRoleInput(body: { role?: unknown; roles?: unknown; permissions?: unknown }):
  { role: RoleLevel; permissions: Permissions | null } | { error: string } {
  const legacyRoles = Array.isArray(body.roles) ? (body.roles as string[]) : null;
  const role = typeof body.role === 'string' ? body.role : mainRoleOf(legacyRoles);
  const roleError = validateRole(role);
  if (roleError) return { error: roleError };

  if (isAdminTierRole(role as RoleLevel)) return { role: role as RoleLevel, permissions: null };

  // staff: ใช้ permissions ที่ส่งมา ถ้าไม่ส่งค่อยแปลจาก roles รุ่นเก่าเป็นแม่แบบ
  const raw = body.permissions !== undefined ? body.permissions
    : (legacyRoles ? permissionsFromLegacyRoles(legacyRoles) : {});
  const permError = validatePermissions(raw);
  if (permError) return { error: permError };
  return { role: role as RoleLevel, permissions: (raw as Permissions) || {} };
}

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
      .select('id, user_id, roles, permissions, is_active, can_view_cost, pc_all_counters, joined_at, created_at')
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
      // role = ตำแหน่งหลักค่าเดียว (แปลงให้แม้แถวนั้นยังเก็บค่าเก่าหลายตัว)
      // roles = ค่าดิบ คงไว้ให้ตัวเรียกเดิมที่ยังอ่านอยู่
      role: mainRoleOf(m.roles),
      roles: m.roles,
      permissions: (m.permissions as Permissions | null) ?? (mainRoleOf(m.roles) === 'staff' ? permissionsFromLegacyRoles(m.roles) : null),
      is_active: m.is_active,
      can_view_cost: m.can_view_cost === true,
      pc_all_counters: m.pc_all_counters === true,
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

    const invitationRows = (invitations || []).map(inv => ({
      ...inv,
      role: mainRoleOf(inv.roles),
      permissions: (inv.permissions as Permissions | null) ?? (mainRoleOf(inv.roles) === 'staff' ? permissionsFromLegacyRoles(inv.roles) : null),
    }));

    return NextResponse.json({ members: members || [], invitations: invitationRows });
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

    // Check permission (owner, admin, or manager)
    if (!can(auth, 'members.invite')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เชิญสมาชิก' }, { status: 403 });
    }

    const body = await request.json();
    const { email, warehouse_ids, terminal_ids, can_view_cost } = body;

    const normalized = normalizeRoleInput(body);
    if ('error' in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    const { role, permissions } = normalized;
    const roles = [role];

    // Manager cannot invite owner/admin roles
    if (!can(auth, 'members.grant_admin') && (role === 'owner' || role === 'admin')) {
      return NextResponse.json({ error: 'ผู้จัดการไม่สามารถเชิญตำแหน่งผู้ดูแลระบบหรือเจ้าของได้' }, { status: 403 });
    }

    // Check package member limit
    {
      const { data: subscription } = await supabaseAdmin
        .from('user_subscriptions')
        .select('package:packages(*)')
        .eq('company_id', auth.companyId)
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

    // Only check existing member/invite if email is provided
    if (email) {
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
    }

    // Create invitation
    const { data: invitation, error } = await supabaseAdmin
      .from('company_invitations')
      .insert({
        company_id: auth.companyId,
        ...(email ? { email } : {}),
        roles,
        permissions,
        invited_by: auth.userId,
        can_view_cost: resolveCanViewCost(roles, can_view_cost),
        ...(Array.isArray(warehouse_ids) ? { warehouse_ids } : {}),
        ...(Array.isArray(terminal_ids) ? { terminal_ids } : {}),
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

// PUT - Update member roles
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!can(auth, 'members.invite')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขตำแหน่ง' }, { status: 403 });
    }

    const body = await request.json();
    const { memberId, can_view_cost } = body;

    if (!memberId) {
      return NextResponse.json({ error: 'Missing member ID' }, { status: 400 });
    }
    const normalized = normalizeRoleInput(body);
    if ('error' in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    const { role, permissions } = normalized;
    const roles = [role];

    // Cannot change owner roles unless you are the owner
    const { data: targetMember } = await supabaseAdmin
      .from('company_members')
      .select('roles')
      .eq('id', memberId)
      .eq('company_id', auth.companyId)
      .single();

    // Shared escalation guard — ห้าม inline เอง (lib/permissions.ts)
    const guardError = assertMemberMutationAllowed(auth.companyRoles, targetMember?.roles, roles);
    if (guardError) {
      return NextResponse.json({ error: guardError.error }, { status: guardError.status });
    }

    const { data, error } = await supabaseAdmin
      .from('company_members')
      .update({
        roles,
        permissions,
        can_view_cost: resolveCanViewCost(roles, can_view_cost),
      })
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

    if (!can(auth, 'members.invite')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ลบสมาชิก' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('id');
    const type = searchParams.get('type'); // 'member' or 'invitation'

    if (!memberId) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    if (type === 'invitation') {
      // Manager cannot cancel invitations to owner/admin roles
      if (!can(auth, 'members.grant_admin')) {
        const { data: inv } = await supabaseAdmin
          .from('company_invitations')
          .select('roles')
          .eq('id', memberId)
          .eq('company_id', auth.companyId)
          .single();
        const invRole = mainRoleOf(inv?.roles);
        if (invRole === 'owner' || invRole === 'admin') {
          return NextResponse.json({ error: 'ผู้จัดการไม่สามารถยกเลิกคำเชิญของผู้ดูแลระบบได้' }, { status: 403 });
        }
      }
      await supabaseAdmin
        .from('company_invitations')
        .update({ status: 'cancelled' })
        .eq('id', memberId)
        .eq('company_id', auth.companyId);
    } else {
      // Cannot remove owner
      const { data: targetMember } = await supabaseAdmin
        .from('company_members')
        .select('roles')
        .eq('id', memberId)
        .eq('company_id', auth.companyId)
        .single();

      if (mainRoleOf(targetMember?.roles) === 'owner') {
        return NextResponse.json({ error: 'ไม่สามารถลบเจ้าของบริษัทได้' }, { status: 403 });
      }

      // Manager cannot remove admin members
      if (!can(auth, 'members.grant_admin') && mainRoleOf(targetMember?.roles) === 'admin') {
        return NextResponse.json({ error: 'ผู้จัดการไม่สามารถลบผู้ดูแลระบบได้' }, { status: 403 });
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

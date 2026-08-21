// Path: app/api/users/route.ts
import { supabaseAdmin, checkAuthWithCompany, can, validateRoles } from '@/lib/supabase-admin';
import { assertMemberMutationAllowed, resolveCanViewCost } from '@/lib/permissions';
import { NextRequest, NextResponse } from 'next/server';

// Type definitions
interface UserData {
  email: string;
  password: string;
  name: string;
  roles: string[];
  phone?: string;
  is_active?: boolean;
  warehouse_ids?: string[];
  terminal_ids?: string[];
}

// POST - สร้าง user ใหม่ (Admin only)
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }
    if (!companyId) {
      return NextResponse.json(
        { error: 'No company context' },
        { status: 403 }
      );
    }
    if (!can(companyRoles, 'members.invite')) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const userData: UserData = await request.json();

    // Validate required fields
    if (!userData.email || !userData.password || !userData.name) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const rolesError = validateRoles(userData.roles);
    if (rolesError) {
      return NextResponse.json({ error: rolesError }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password length
    if (userData.password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const { data: existingUser } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', userData.email)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Create auth user with metadata
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true, // Auto confirm email
      user_metadata: {
        name: userData.name,
        roles: userData.roles,
        phone: userData.phone
      }
    });

    if (authError) {
      console.error('Auth creation error:', authError);
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Profile should be created by trigger, but ensure it exists
    // Role is stored in company_members, not user_profiles
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: authData.user.id,
        email: userData.email,
        name: userData.name,
        phone: userData.phone || null,
        is_active: userData.is_active !== undefined ? userData.is_active : true
      })
      .select()
      .single();

    if (profileError) {
      console.error('Profile error:', profileError);
      // Try to clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: 'Failed to create user profile: ' + profileError.message },
        { status: 500 }
      );
    }

    // Add the new user as a company member
    const { error: memberError } = await supabaseAdmin
      .from('company_members')
      .insert({
        company_id: companyId,
        user_id: authData.user.id,
        roles: userData.roles,
        is_active: true,
        joined_at: new Date().toISOString(),
        warehouse_ids: Array.isArray(userData.warehouse_ids) ? userData.warehouse_ids : null,
        terminal_ids: Array.isArray(userData.terminal_ids) ? userData.terminal_ids : null,
      });

    if (memberError) {
      console.error('Company member creation error:', memberError);
      // Don't fail the whole request - user and profile are created
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email: userData.email,
        name: userData.name,
        roles: userData.roles
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - ดึงรายการ users (Admin only, scoped to company members)
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }
    if (!companyId) {
      return NextResponse.json(
        { error: 'No company context' },
        { status: 403 }
      );
    }
    if (!can(companyRoles, 'members.invite')) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    // Get company members first, then join with user_profiles.
    // รวมสมาชิกที่ถูกระงับด้วย — ถ้า filter เฉพาะ active สมาชิกที่โดนระงับจะหาย
    // จากลิสต์ถาวรและไม่มีปุ่มเปิดใช้งานคืน (เคยเกิดจริง)
    const { data: members, error: membersError } = await supabaseAdmin
      .from('company_members')
      .select('user_id, roles, is_active, joined_at')
      .eq('company_id', companyId);

    if (membersError) {
      return NextResponse.json(
        { error: membersError.message },
        { status: 500 }
      );
    }

    if (!members || members.length === 0) {
      return NextResponse.json({ users: [] });
    }

    const memberUserIds = members.map(m => m.user_id);
    const memberMap: Record<string, { roles: string[]; is_active: boolean }> = {};
    for (const m of members) {
      memberMap[m.user_id] = { roles: m.roles, is_active: m.is_active !== false };
    }

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .in('id', memberUserIds)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Merge roles + is_active from company_members into user profiles —
    // สถานะระงับเป็นของ membership (ต่อบริษัท) ไม่ใช่ user_profiles (global)
    const usersWithRoles = (data || []).map(u => ({
      ...u,
      roles: memberMap[u.id]?.roles || ['sales'],
      is_active: memberMap[u.id]?.is_active ?? true,
    }));

    return NextResponse.json({ users: usersWithRoles });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - อัพเดท user (Admin only)
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }
    if (!companyId) {
      return NextResponse.json(
        { error: 'No company context' },
        { status: 403 }
      );
    }
    if (!can(companyRoles, 'members.invite')) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const { id, name, roles, phone, is_active, can_view_cost } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Verify the user is a member of this company
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('id, roles')
      .eq('company_id', companyId)
      .eq('user_id', id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'User is not a member of this company' },
        { status: 404 }
      );
    }

    if (roles) {
      const rolesErr = validateRoles(roles);
      if (rolesErr) {
        return NextResponse.json({ error: rolesErr }, { status: 400 });
      }
    }

    // name เขียนลง user_profiles ซึ่งเป็น global ทุกบริษัท — ห้ามปล่อยค่าว่างผ่าน
    if (name !== undefined && !String(name ?? '').trim()) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อ-นามสกุล' }, { status: 400 });
    }

    // Shared escalation guard — ห้าม inline เอง (lib/permissions.ts)
    const guardError = assertMemberMutationAllowed(companyRoles, membership.roles, roles);
    if (guardError) {
      return NextResponse.json({ error: guardError.error }, { status: guardError.status });
    }

    // Update membership ก่อน profile — ฝั่ง membership ชน constraint ได้ง่ายกว่า
    // (เช่น role ใหม่ที่ CHECK ยังไม่รู้จัก) จะได้ไม่ทิ้ง partial write ไว้ใน profile
    const memberUpdate: Record<string, unknown> = {};
    if (typeof is_active === 'boolean') {
      memberUpdate.is_active = is_active;
    }
    if (roles && Array.isArray(roles) && roles.length > 0) {
      memberUpdate.roles = roles;
      if (typeof can_view_cost === 'boolean' || resolveCanViewCost(roles, false)) {
        memberUpdate.can_view_cost = resolveCanViewCost(roles, can_view_cost);
      }
    }

    if (Object.keys(memberUpdate).length > 0) {
      const { error: memberError } = await supabaseAdmin
        .from('company_members')
        .update(memberUpdate)
        .eq('company_id', companyId)
        .eq('user_id', id);

      if (memberError) {
        return NextResponse.json({ error: memberError.message }, { status: 500 });
      }

      if (memberUpdate.roles) {
        await supabaseAdmin.auth.admin.updateUserById(id, {
          user_metadata: { roles }
        });
      }
    }

    // Update user_profiles (name, phone only — membership fields live in company_members)
    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .update({
        name,
        phone,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: data
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - ลบ/ระงับ user (Admin only)
export async function DELETE(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }
    if (!companyId) {
      return NextResponse.json(
        { error: 'No company context' },
        { status: 403 }
      );
    }
    if (!can(companyRoles, 'members.invite')) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    const hardDelete = searchParams.get('hard') === 'true';

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // Verify the user is a member of this company
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('id, roles')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'User is not a member of this company' },
        { status: 404 }
      );
    }

    // ห้ามลบ/ระงับเจ้าของ และ manager ห้ามแตะ admin (guard เดียวกับ PUT)
    if (membership.roles?.includes('owner')) {
      return NextResponse.json({ error: 'ไม่สามารถลบเจ้าของบริษัทได้' }, { status: 403 });
    }
    const guardError = assertMemberMutationAllowed(companyRoles, membership.roles);
    if (guardError) {
      return NextResponse.json({ error: guardError.error }, { status: guardError.status });
    }

    if (hardDelete) {
      // Hard delete - ลบจริง
      // Remove from company_members first
      await supabaseAdmin
        .from('company_members')
        .delete()
        .eq('company_id', companyId)
        .eq('user_id', userId);

      await supabaseAdmin.auth.admin.deleteUser(userId);
    } else {
      // Soft delete = ระงับ membership ของบริษัทนี้เท่านั้น — ห้ามแตะ
      // user_profiles.is_active ซึ่งเป็น global (จะดับ user ข้ามทุกบริษัท
      // แล้วไม่มี path ไหนเปิดคืน)
      const { error } = await supabaseAdmin
        .from('company_members')
        .update({ is_active: false })
        .eq('company_id', companyId)
        .eq('user_id', userId);

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

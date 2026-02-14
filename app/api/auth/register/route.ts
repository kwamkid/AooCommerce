import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'กรุณากรอกข้อมูลให้ครบ' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
    }

    // Check if email already exists
    const { data: existingUser } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return NextResponse.json({ error: 'อีเมลนี้ถูกใช้งานแล้ว' }, { status: 400 });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (authError || !authData.user) {
      return NextResponse.json({ error: authError?.message || 'ไม่สามารถสร้างบัญชีได้' }, { status: 400 });
    }

    // Create user profile
    await supabaseAdmin.from('user_profiles').upsert({
      id: authData.user.id,
      email,
      name,
      role: 'operation',
      is_active: true,
    });

    // Assign Free package
    const { data: freePackage } = await supabaseAdmin
      .from('packages')
      .select('id')
      .eq('slug', 'free')
      .single();

    if (freePackage) {
      await supabaseAdmin.from('user_subscriptions').insert({
        user_id: authData.user.id,
        package_id: freePackage.id,
        status: 'active',
      });
    }

    // Check if there's a pending invitation
    const inviteToken = request.headers.get('x-invite-token');
    if (inviteToken) {
      const { data: invitation } = await supabaseAdmin
        .from('company_invitations')
        .select('*')
        .eq('token', inviteToken)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (invitation) {
        // Accept invitation
        await supabaseAdmin.from('company_members').insert({
          company_id: invitation.company_id,
          user_id: authData.user.id,
          role: invitation.role,
          invited_by: invitation.invited_by,
        });

        await supabaseAdmin
          .from('company_invitations')
          .update({ status: 'accepted' })
          .eq('id', invitation.id);
      }
    }

    return NextResponse.json({ success: true, userId: authData.user.id });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { applyInvitation } from '@/lib/invitations';

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
      role: 'sales',
      is_active: true,
    });

    // Subscription จะสร้างตอนสร้าง company แทน (ผูกกับ company_id)

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
        // Logic รับคำเชิญอยู่ใน lib/invitations.ts ที่เดียว
        const result = await applyInvitation(supabaseAdmin, invitation, {
          id: authData.user.id,
          email,
        });
        if (result.status === 'error') {
          // บัญชี + โปรไฟล์ถูกสร้างไปแล้ว — ห้าม fail ทั้ง signup ไม่งั้นผู้ใช้ติดกับ:
          // สมัครซ้ำโดน "อีเมลถูกใช้แล้ว" แต่ก็ยังไม่มี session ไปกดรับคำเชิญใหม่
          // → ปล่อยให้ signup สำเร็จ (client sign-in ต่อ) แล้วแนบ warning ให้เปิดลิงก์ซ้ำ
          console.error('Register: accept-invite failed after account creation');
          return NextResponse.json({
            success: true,
            userId: authData.user.id,
            warning: 'สมัครสำเร็จแต่ยังเข้าร่วมบริษัทไม่สำเร็จ — เข้าสู่ระบบแล้วเปิดลิงก์เชิญอีกครั้ง',
          });
        }
      }
    }

    return NextResponse.json({ success: true, userId: authData.user.id });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

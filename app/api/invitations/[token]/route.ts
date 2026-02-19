import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

// GET - Get invitation details (public)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const { data: invitation, error } = await supabaseAdmin
      .from('company_invitations')
      .select(`
        id, email, roles, status, expires_at, created_at,
        company:companies (id, name, slug, logo_url)
      `)
      .eq('token', token)
      .single();

    if (error || !invitation) {
      return NextResponse.json({ error: 'ไม่พบคำเชิญนี้' }, { status: 404 });
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: 'คำเชิญนี้ถูกใช้งานแล้ว', invitation }, { status: 400 });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ error: 'คำเชิญนี้หมดอายุแล้ว', invitation }, { status: 400 });
    }

    return NextResponse.json({ invitation });
  } catch (error) {
    console.error('Get invitation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Accept invitation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Get auth token
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
    }

    const authToken = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(authToken);
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get invitation
    const { data: invitation, error } = await supabaseAdmin
      .from('company_invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'pending')
      .single();

    if (error || !invitation) {
      return NextResponse.json({ error: 'ไม่พบคำเชิญนี้ หรือถูกใช้งานแล้ว' }, { status: 404 });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      await supabaseAdmin
        .from('company_invitations')
        .update({ status: 'expired' })
        .eq('id', invitation.id);
      return NextResponse.json({ error: 'คำเชิญนี้หมดอายุแล้ว' }, { status: 400 });
    }

    // Check if already a member
    const { data: existingMember } = await supabaseAdmin
      .from('company_members')
      .select('id')
      .eq('company_id', invitation.company_id)
      .eq('user_id', user.id)
      .single();

    if (existingMember) {
      await supabaseAdmin
        .from('company_invitations')
        .update({ status: 'accepted' })
        .eq('id', invitation.id);
      return NextResponse.json({ success: true, message: 'คุณเป็นสมาชิกอยู่แล้ว' });
    }

    // Add as member
    await supabaseAdmin.from('company_members').insert({
      company_id: invitation.company_id,
      user_id: user.id,
      roles: invitation.roles,
      invited_by: invitation.invited_by,
      ...(invitation.warehouse_ids && invitation.warehouse_ids.length > 0
        ? { warehouse_ids: invitation.warehouse_ids }
        : {}),
      ...(invitation.terminal_ids && invitation.terminal_ids.length > 0
        ? { terminal_ids: invitation.terminal_ids }
        : {}),
    });

    // Mark invitation as accepted
    await supabaseAdmin
      .from('company_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id);

    return NextResponse.json({ success: true, companyId: invitation.company_id });
  } catch (error) {
    console.error('Accept invitation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

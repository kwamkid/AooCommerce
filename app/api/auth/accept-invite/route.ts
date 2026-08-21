// Path: app/api/auth/accept-invite/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { applyInvitation } from '@/lib/invitations';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { inviteToken } = await request.json();
    if (!inviteToken) {
      return NextResponse.json({ error: 'Missing invite token' }, { status: 400 });
    }

    // Check invitation
    const { data: invitation } = await supabaseAdmin
      .from('company_invitations')
      .select('*')
      .eq('token', inviteToken)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!invitation) {
      return NextResponse.json({ error: 'Invalid or expired invitation' }, { status: 400 });
    }

    // Logic รับคำเชิญทั้งหมดอยู่ใน lib/invitations.ts ที่เดียว — ห้าม inline ซ้ำ
    const result = await applyInvitation(supabaseAdmin, invitation, user);
    if (result.status === 'error') {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    if (result.status === 'email_mismatch') {
      return NextResponse.json({ error: 'คำเชิญนี้ไม่ได้ออกให้บัญชีนี้' }, { status: 403 });
    }
    if (result.status === 'already_member' || result.status === 'owner_untouched') {
      // no-op — สิทธิ์ไม่ถูกแตะ และ token ยัง pending ให้คนที่ถูกเชิญตัวจริงใช้
      return NextResponse.json({ success: true, message: 'คุณเป็นสมาชิกอยู่แล้ว' });
    }

    // Auto-create profile if needed
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!existingProfile) {
      const oauthName = user.user_metadata?.full_name
        || user.user_metadata?.name
        || user.email?.split('@')[0]
        || 'User';

      await supabaseAdmin.from('user_profiles').upsert({
        id: user.id,
        email: user.email || '',
        name: oauthName,
        role: 'sales',
        is_active: true,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Accept invite error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

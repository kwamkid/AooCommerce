// Path: app/api/auth/accept-invite/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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

    // Check if already a member
    const { data: existingMember } = await supabaseAdmin
      .from('company_members')
      .select('id')
      .eq('company_id', invitation.company_id)
      .eq('user_id', user.id)
      .single();

    if (!existingMember) {
      await supabaseAdmin.from('company_members').insert({
        company_id: invitation.company_id,
        user_id: user.id,
        roles: invitation.roles,
        invited_by: invitation.invited_by,
        terminal_ids: invitation.terminal_ids ?? null,
        warehouse_ids: invitation.warehouse_ids ?? null,
      });
    }

    await supabaseAdmin
      .from('company_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id);

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

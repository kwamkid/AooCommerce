// Path: app/api/auth/line/route.ts
// LINE Login OAuth - exchange code for token, create/login user
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

const LINE_CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID!;
const LINE_CHANNEL_SECRET = process.env.LINE_LOGIN_CHANNEL_SECRET!;

interface LINETokenResponse {
  access_token: string;
  token_type: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  id_token?: string;
}

interface LINEProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { code, redirectUri } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
    }

    // 1. Exchange code for access token
    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: LINE_CHANNEL_ID,
        client_secret: LINE_CHANNEL_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('LINE token exchange error:', errorData);
      return NextResponse.json({ error: 'ไม่สามารถเชื่อมต่อกับ LINE ได้' }, { status: 400 });
    }

    const tokenData: LINETokenResponse = await tokenResponse.json();

    // 2. Get LINE user profile
    const profileResponse = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!profileResponse.ok) {
      console.error('LINE profile error:', await profileResponse.text());
      return NextResponse.json({ error: 'ไม่สามารถดึงข้อมูลจาก LINE ได้' }, { status: 400 });
    }

    const lineProfile: LINEProfile = await profileResponse.json();

    // 3. Find or create user in Supabase
    // Use LINE userId as unique identifier with a generated email
    const lineEmail = `line_${lineProfile.userId}@line.local`;

    // Check if user already exists (by line user id stored in metadata)
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.user_metadata?.line_user_id === lineProfile.userId
        || u.email === lineEmail
    );

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      // Update metadata
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: {
          line_user_id: lineProfile.userId,
          full_name: lineProfile.displayName,
          avatar_url: lineProfile.pictureUrl,
          provider: 'line',
        },
      });
    } else {
      // Create new user
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: lineEmail,
        email_confirm: true,
        user_metadata: {
          line_user_id: lineProfile.userId,
          full_name: lineProfile.displayName,
          avatar_url: lineProfile.pictureUrl,
          provider: 'line',
        },
      });

      if (createError || !newUser.user) {
        console.error('Create user error:', createError);
        return NextResponse.json({ error: 'ไม่สามารถสร้างบัญชีได้' }, { status: 500 });
      }

      userId = newUser.user.id;

      // Create user_profiles
      await supabaseAdmin.from('user_profiles').upsert({
        id: userId,
        email: lineEmail,
        name: lineProfile.displayName || 'User',
        role: 'sales',
        is_active: true,
      });
    }

    // 4. Generate a session for the user using magic link approach
    // Use admin to generate a session link
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: lineEmail,
    });

    if (linkError || !linkData) {
      console.error('Generate link error:', linkError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างเซสชันได้' }, { status: 500 });
    }

    // Extract the token from the link properties
    const hashed_token = linkData.properties?.hashed_token;

    if (!hashed_token) {
      console.error('No hashed token in link data');
      return NextResponse.json({ error: 'ไม่สามารถสร้างเซสชันได้' }, { status: 500 });
    }

    // Verify OTP to get a session
    const { data: sessionData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
      token_hash: hashed_token,
      type: 'magiclink',
    });

    if (verifyError || !sessionData.session) {
      console.error('Verify OTP error:', verifyError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างเซสชันได้' }, { status: 500 });
    }

    // 5. Handle invite token
    const inviteToken = request.cookies.get('invite_token')?.value;
    if (inviteToken) {
      const { data: invitation } = await supabaseAdmin
        .from('company_invitations')
        .select('*')
        .eq('token', inviteToken)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (invitation) {
        const { data: existingMember } = await supabaseAdmin
          .from('company_members')
          .select('id')
          .eq('company_id', invitation.company_id)
          .eq('user_id', userId)
          .single();

        if (!existingMember) {
          await supabaseAdmin.from('company_members').insert({
            company_id: invitation.company_id,
            user_id: userId,
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
      }
    }

    return NextResponse.json({
      session: {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      },
      user: {
        id: userId,
        email: lineEmail,
        name: lineProfile.displayName,
      },
    });
  } catch (error) {
    console.error('LINE auth error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย LINE' }, { status: 500 });
  }
}

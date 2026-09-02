// Path: app/api/auth/line/route.ts
// LINE Login OAuth - exchange code for token, create/login user
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveLineLoginCredentials } from '@/lib/line-login';
import { applyInvitation } from '@/lib/invitations';

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
    const { code, redirectUri, shop, inviteToken: inviteFromBody } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
    }

    // ร้านที่ตั้ง LINE Login เองต้องแลก token ด้วย channel ของตัวเอง — code ที่ได้มา
    // ถูกออกให้ channel นั้น ใช้ channel อื่นแลกยังไงก็ไม่ผ่าน
    const cred = await resolveLineLoginCredentials(typeof shop === 'string' ? shop : null);
    if (!cred) {
      return NextResponse.json({ error: 'LINE Login ยังไม่ได้ตั้งค่า' }, { status: 400 });
    }

    // 1. Exchange code for access token
    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: cred.channel_id,
        client_secret: cred.channel_secret,
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
    // ทางหลักคือค่าที่ส่งมากับ body (มาจาก `state` ของ OAuth) — cookie เป็นทางสำรอง
    // เพราะเบราว์เซอร์ในแอป LINE อาจเด้งขา OAuth ไปเบราว์เซอร์คนละตัวจน cookie หาย
    const inviteToken = (typeof inviteFromBody === 'string' && inviteFromBody)
      || request.cookies.get('invite_token')?.value;
    let joinedCompanyId: string | null = null;
    if (inviteToken) {
      const { data: invitation } = await supabaseAdmin
        .from('company_invitations')
        .select('*')
        .eq('token', inviteToken)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (invitation) {
        // Logic รับคำเชิญอยู่ใน lib/invitations.ts ที่เดียว — login สำเร็จแล้ว
        // ผลรับคำเชิญเป็น best-effort เหมือนเดิม (ผู้ใช้เข้าระบบต่อได้เสมอ)
        const applied = await applyInvitation(supabaseAdmin, invitation, { id: userId, email: lineEmail });
        if (applied.status === 'joined' || applied.status === 'updated' || applied.status === 'already_member') {
          joinedCompanyId = invitation.company_id;
        } else {
          console.error('LINE login: apply invitation failed', applied);
        }
      } else {
        console.error('LINE login: invite token not usable (expired/used/not found)');
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
      joined_company_id: joinedCompanyId,
    });
  } catch (error) {
    console.error('LINE auth error:', error);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย LINE' }, { status: 500 });
  }
}

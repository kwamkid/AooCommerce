import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { signOAuthState } from '@/lib/oauth-state';
import { getLoginKitAuthUrl, generatePkcePair, isLoginKitConfigured } from '@/lib/tiktok/login-kit';

// เริ่มเชื่อมบัญชี TikTok เพื่อดึงรูปโปรไฟล์มาเป็นโลโก้ร้าน — GET ?account_id=
//
// **คนละ OAuth กับการเชื่อมร้าน** (ดูเหตุผลใน lib/tiktok/login-kit.ts):
// ร้านเชื่อมผ่าน Partner Center · รูปโปรไฟล์มาจาก developers.tiktok.com
//
// ต่างจากขาร้านตรงที่ Login Kit **บังคับส่ง redirect_uri** และต้องตรงกับที่ลงทะเบียน
// ไว้เป๊ะ ๆ เราจึงประกอบจาก host ของ request เอง (แทนที่จะไปตั้งค่าที่ portal อย่างเดียว)

export async function GET(request: NextRequest) {
  const { isAuth, companyId, companyRoles, userId } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !userId || !can(companyRoles, 'marketplace.connect')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isLoginKitConfigured()) {
    return NextResponse.json(
      { error: 'ยังไม่ได้ตั้งค่า TikTok Login Kit (TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET)' },
      { status: 400 }
    );
  }

  const accountId = new URL(request.url).searchParams.get('account_id');
  if (!accountId) {
    return NextResponse.json({ error: 'ต้องระบุร้าน' }, { status: 400 });
  }

  // ร้านต้องเป็นของบริษัทนี้จริง — กันคนยิง account_id ของบริษัทอื่นมาแปะรูป
  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('id, platform')
    .eq('id', accountId)
    .eq('company_id', companyId)
    .single();
  if (!account || account.platform !== 'tiktok') {
    return NextResponse.json({ error: 'ไม่พบร้าน TikTok นี้' }, { status: 404 });
  }

  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${host}/api/tiktok/profile/callback`;

  const { verifier, challenge } = generatePkcePair();
  const state = signOAuthState({
    companyId,
    userId,
    platform: 'tiktok',
    app: 'profile',
    accountId,
  });

  const response = NextResponse.json({
    url: getLoginKitAuthUrl({ state, redirectUri, codeChallenge: challenge }),
  });

  // verifier ต้องถึงมือ callback แต่ห้ามอยู่ในลิงก์ (ไม่งั้น PKCE ไม่มีความหมาย)
  // อายุสั้นเท่า state เพื่อไม่ให้ค้างอยู่ในเบราว์เซอร์นานเกินจำเป็น
  response.cookies.set('tiktok_profile_verifier', verifier, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });
  return response;
}

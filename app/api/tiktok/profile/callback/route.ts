import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { authorizeMarketplaceCallback } from '@/lib/oauth-state';
import { exchangeLoginKitCode, getLoginKitUserInfo } from '@/lib/tiktok/login-kit';
import { isReachableImage } from '@/lib/lazada/api';

// กลับจาก TikTok Login Kit — เอา avatar ของบัญชีมาเป็นโลโก้ร้าน
//
// เก็บแค่ชื่อกับลิงก์รูป **แล้วทิ้ง access token ทันที** (ดูเหตุผลใน
// lib/tiktok/login-kit.ts) — นโยบายความเป็นส่วนตัวที่ยื่นให้ TikTok เขียนไว้แบบนี้
// ถ้าวันหนึ่งจะเก็บ token ต้องกลับไปแก้ /legal/privacy ให้ตรงก่อนเสมอ

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;
  // ชื่อบัญชีต้องเด้งกลับไปให้ผู้ใช้เห็นทันที — เบราว์เซอร์ที่ล็อกอิน TikTok ค้างไว้
  // หลายบัญชีจะยกรูปของบัญชีที่ค้างอยู่มาให้ โดยที่ผู้ใช้ไม่รู้ว่าเป็นคนละร้าน
  const back = (result: string, profileName?: string | null) => {
    const q = new URLSearchParams({ tab: 'marketplace', tiktok_profile: result });
    if (profileName) q.set('profile_name', profileName);
    return NextResponse.redirect(`${baseUrl}/settings/sales-channels?${q.toString()}`);
  };

  const rawState = searchParams.get('state') || null;
  const authz = await authorizeMarketplaceCallback(request, rawState);
  if (!authz.ok) {
    console.error('[TikTok Profile] authorize failed:', authz.reason);
    return back(`error_auth_${authz.reason}`);
  }

  const accountId = authz.payload.accountId;
  const code = searchParams.get('code');
  // ผู้ใช้กดยกเลิกบนหน้า TikTok — ไม่ใช่ error ของเรา
  if (!code) return back('cancelled');
  if (!accountId) return back('error_no_account');

  const verifier = request.cookies.get('tiktok_profile_verifier')?.value;
  if (!verifier) return back('error_expired');

  try {
    const { accessToken } = await exchangeLoginKitCode({
      code,
      redirectUri: `${baseUrl}/api/tiktok/profile/callback`,
      codeVerifier: verifier,
    });

    const { displayName, avatarUrl } = await getLoginKitUserInfo(accessToken);
    if (!avatarUrl) return back('error_no_avatar');

    // บัญชีที่ไม่เคยตั้งรูปจะได้ URL ที่เปิดไม่ได้ — อย่าเอาไปทับของเดิม
    // (บทเรียนเดียวกับ Lazada ที่คืนไฟล์ถูก archive · ดู fix-bug.md)
    if (!(await isReachableImage(avatarUrl))) return back('error_bad_avatar');

    const { data: account } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('id, metadata')
      .eq('id', accountId)
      .eq('company_id', authz.companyId)
      .single();
    if (!account) return back('error_no_account');

    await supabaseAdmin
      .from('marketplace_accounts')
      .update({
        // merge เสมอ — เขียนทับทั้งก้อนจะล้าง shop_cipher/open_id ที่ขาร้านเก็บไว้
        metadata: {
          ...((account.metadata || {}) as Record<string, unknown>),
          shop_logo: avatarUrl,
          tiktok_profile_name: displayName,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId);

    const res = back('connected', displayName);
    res.cookies.delete('tiktok_profile_verifier');
    return res;
  } catch (err) {
    console.error('[TikTok Profile] failed:', err);
    return back('error_failed');
  }
}

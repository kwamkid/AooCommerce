import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { probeCapiReadiness } from '@/lib/meta/conversions';
import { debugToken } from '@/lib/meta/ads';
import { hasMarketingMessagesScope } from '@/lib/ads/meta-ui';
import { NextRequest, NextResponse } from 'next/server';

// POST - Test chat account connection
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'masterdata.chat_channels')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await params;

    // Get account
    const { data: account } = await supabaseAdmin
      .from('chat_accounts')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const creds = account.credentials as Record<string, unknown>;

    if (account.platform === 'line') {
      return await testLineConnection(creds, id, companyId);
    } else if (account.platform === 'facebook') {
      return await testFbConnection(creds, id, companyId);
    }

    return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
  } catch (error) {
    console.error('Test chat account error:', error);
    return NextResponse.json({ error: 'Test failed' }, { status: 500 });
  }
}

async function testLineConnection(creds: Record<string, unknown>, accountId: string, companyId: string) {
  const token = creds.channel_access_token as string;
  if (!token) {
    return NextResponse.json({ error: 'Channel Access Token is required' }, { status: 400 });
  }

  const response = await fetch('https://api.line.me/v2/bot/info', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return NextResponse.json({
      success: false,
      error: errorData.message || `LINE API error (${response.status})`,
    });
  }

  const botInfo = await response.json();

  // Save bot info to credentials
  await supabaseAdmin
    .from('chat_accounts')
    .update({
      credentials: {
        ...creds,
        bot_name: botInfo.displayName,
        bot_picture_url: botInfo.pictureUrl,
        basic_id: botInfo.basicId,
        premium_id: botInfo.premiumId || '',
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .eq('company_id', companyId);

  return NextResponse.json({
    success: true,
    info: {
      name: botInfo.displayName,
      picture_url: botInfo.pictureUrl,
      basic_id: botInfo.basicId,
      premium_id: botInfo.premiumId || null,
    },
  });
}

async function testFbConnection(creds: Record<string, unknown>, accountId: string, companyId: string) {
  const token = creds.page_access_token as string;
  if (!token) {
    return NextResponse.json({ error: 'Page Access Token is required' }, { status: 400 });
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name,username,picture&access_token=${token}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return NextResponse.json({
      success: false,
      error: errorData.error?.message || `Facebook API error (${response.status})`,
    });
  }

  const pageInfo = await response.json();
  const pictureUrl = pageInfo.picture?.data?.url || null;
  const pageUsername: string | null = pageInfo.username || null;

  // Also fetch IG profile picture if ig_account_id exists
  const igAccountId = creds.ig_account_id as string | undefined;
  let igPictureUrl: string | null = null;
  let igUsername: string | null = null;
  if (igAccountId && token) {
    try {
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${igAccountId}?fields=id,username,profile_picture_url&access_token=${token}`
      );
      if (igRes.ok) {
        const igData = await igRes.json();
        igPictureUrl = igData.profile_picture_url || null;
        igUsername = igData.username || null;
      }
    } catch { /* non-critical */ }
  }

  // สิทธิ์ข้อความการตลาด (Marketing Messages) ของ token ใบนี้ → ป้ายบนการ์ดเพจ
  // ตอบไม่ได้ (debuggable=false: ไม่มี app secret / Graph ปฏิเสธ) = ไม่จด คงค่าเดิมไว้
  const dbg = await debugToken(token);

  // Save page info to credentials (including pictures)
  await supabaseAdmin
    .from('chat_accounts')
    .update({
      credentials: {
        ...creds,
        page_name: pageInfo.name,
        page_id: pageInfo.id,
        ...(pageUsername ? { page_username: pageUsername } : {}),
        ...(pictureUrl ? { page_picture_url: pictureUrl } : {}),
        ...(igPictureUrl ? { ig_profile_picture_url: igPictureUrl } : {}),
        ...(igUsername ? { ig_username: igUsername } : {}),
        ...(dbg.debuggable ? {
          meta_marketing_messages: hasMarketingMessagesScope(dbg.scopes),
          meta_marketing_checked_at: new Date().toISOString(),
        } : {}),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .eq('company_id', companyId);

  // ตรวจสิทธิ์ Conversions API ของ token ใบนี้ด้วย — token ที่ออกก่อนมี scope `page_events`
  // จะผ่านการทดสอบเชื่อมต่อปกติทุกอย่างแต่ยิง Purchase event ไม่ได้เลย
  // ⚠️ ต้องทำ **หลัง** UPDATE ข้างบน เพราะ probe อ่านแถวใหม่แล้ว merge ทับ
  let capi: { ready: boolean; error: string | null } = { ready: false, error: 'ตรวจ CAPI ไม่สำเร็จ' };
  try {
    const probe = await probeCapiReadiness(accountId, companyId);
    capi = { ready: probe.ready, error: probe.error };
  } catch {
    // ตรวจ CAPI ล้มต้องไม่ทำให้ "ทดสอบเชื่อมต่อ" ล้มตาม
    capi = { ready: false, error: 'ตรวจ CAPI ไม่สำเร็จ' };
  }

  return NextResponse.json({
    success: true,
    info: {
      name: pageInfo.name,
      page_id: pageInfo.id,
      picture_url: pictureUrl,
      ig_picture_url: igPictureUrl,
      capi,
    },
  });
}

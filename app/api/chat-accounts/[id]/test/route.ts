import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// POST - Test chat account connection
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRole)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

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
    },
  });
}

async function testFbConnection(creds: Record<string, unknown>, accountId: string, companyId: string) {
  const token = creds.page_access_token as string;
  if (!token) {
    return NextResponse.json({ error: 'Page Access Token is required' }, { status: 400 });
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${token}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    return NextResponse.json({
      success: false,
      error: errorData.error?.message || `Facebook API error (${response.status})`,
    });
  }

  const pageInfo = await response.json();

  // Save page info to credentials
  await supabaseAdmin
    .from('chat_accounts')
    .update({
      credentials: {
        ...creds,
        page_name: pageInfo.name,
        page_id: pageInfo.id,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .eq('company_id', companyId);

  return NextResponse.json({
    success: true,
    info: {
      name: pageInfo.name,
      page_id: pageInfo.id,
    },
  });
}

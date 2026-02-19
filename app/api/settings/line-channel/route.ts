import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// GET - Read LINE channel config
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRoles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { data } = await supabaseAdmin
      .from('crm_settings')
      .select('setting_value')
      .eq('company_id', companyId)
      .eq('setting_key', 'line_channel_config')
      .single();

    if (!data?.setting_value) {
      return NextResponse.json({
        is_active: false,
        channel_secret: '',
        channel_access_token: '',
        has_credentials: false,
        webhook_url: `${getBaseUrl(request)}/api/line/webhook?company=${companyId}`,
      });
    }

    const config = data.setting_value as Record<string, unknown>;
    const channelSecret = (config.channel_secret as string) || '';
    const channelAccessToken = (config.channel_access_token as string) || '';

    return NextResponse.json({
      is_active: config.is_active !== false,
      channel_secret: maskSecret(channelSecret),
      channel_access_token: maskSecret(channelAccessToken),
      has_credentials: !!(channelSecret && channelAccessToken),
      webhook_url: `${getBaseUrl(request)}/api/line/webhook?company=${companyId}`,
    });
  } catch (error) {
    console.error('GET line-channel error:', error);
    return NextResponse.json({ error: 'Failed to fetch LINE config' }, { status: 500 });
  }
}

// PUT - Save LINE channel config
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRoles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { is_active, channel_secret, channel_access_token } = body;

    // If masked values sent, merge with existing
    let finalSecret = channel_secret;
    let finalToken = channel_access_token;

    if (isMasked(channel_secret) || isMasked(channel_access_token)) {
      const { data: existing } = await supabaseAdmin
        .from('crm_settings')
        .select('setting_value')
        .eq('company_id', companyId)
        .eq('setting_key', 'line_channel_config')
        .single();

      if (existing?.setting_value) {
        const existingConfig = existing.setting_value as Record<string, unknown>;
        if (isMasked(channel_secret)) finalSecret = existingConfig.channel_secret;
        if (isMasked(channel_access_token)) finalToken = existingConfig.channel_access_token;
      }
    }

    const settingValue = {
      is_active: is_active !== false,
      channel_secret: finalSecret || '',
      channel_access_token: finalToken || '',
    };

    const { error } = await supabaseAdmin
      .from('crm_settings')
      .upsert({
        company_id: companyId,
        setting_key: 'line_channel_config',
        setting_value: settingValue,
        description: 'LINE Messaging API credentials',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'company_id,setting_key',
      });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT line-channel error:', error);
    return NextResponse.json({ error: 'Failed to save LINE config' }, { status: 500 });
  }
}

// POST - Test connection or other actions
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRoles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { action, channel_access_token } = body;

    if (action === 'test') {
      let token = channel_access_token;

      // If masked, get from DB
      if (!token || isMasked(token)) {
        const { data } = await supabaseAdmin
          .from('crm_settings')
          .select('setting_value')
          .eq('company_id', companyId)
          .eq('setting_key', 'line_channel_config')
          .single();

        if (data?.setting_value) {
          token = (data.setting_value as Record<string, unknown>).channel_access_token;
        }
      }

      if (!token) {
        return NextResponse.json({ error: 'Channel Access Token is required' }, { status: 400 });
      }

      // Test by calling LINE Bot Info API
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
      return NextResponse.json({
        success: true,
        bot: {
          displayName: botInfo.displayName,
          pictureUrl: botInfo.pictureUrl,
          basicId: botInfo.basicId,
        },
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('POST line-channel error:', error);
    return NextResponse.json({ error: 'Failed to test LINE connection' }, { status: 500 });
  }
}

// Helper: mask secret (show last 4 chars)
function maskSecret(secret: string): string {
  if (!secret || secret.length <= 4) return secret;
  return '•'.repeat(secret.length - 4) + secret.slice(-4);
}

// Helper: check if value is masked
function isMasked(value: string): boolean {
  return value?.includes('•');
}

// Helper: get base URL from request
function getBaseUrl(request: NextRequest): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

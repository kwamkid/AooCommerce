import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// GET - Read FB channel config
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
      .eq('setting_key', 'fb_channel_config')
      .single();

    if (!data?.setting_value) {
      return NextResponse.json({
        is_active: false,
        app_id: '',
        app_secret: '',
        page_access_token: '',
        verify_token: '',
        has_credentials: false,
        webhook_url: `${getBaseUrl(request)}/api/fb/webhook?company=${companyId}`,
      });
    }

    const config = data.setting_value as Record<string, unknown>;
    const appSecret = (config.app_secret as string) || '';
    const pageAccessToken = (config.page_access_token as string) || '';

    return NextResponse.json({
      is_active: config.is_active !== false,
      app_id: (config.app_id as string) || '',
      app_secret: maskSecret(appSecret),
      page_access_token: maskSecret(pageAccessToken),
      verify_token: (config.verify_token as string) || '',
      has_credentials: !!(appSecret && pageAccessToken),
      webhook_url: `${getBaseUrl(request)}/api/fb/webhook?company=${companyId}`,
      page_name: (config.page_name as string) || '',
      page_id: (config.page_id as string) || '',
    });
  } catch (error) {
    console.error('GET fb-channel error:', error);
    return NextResponse.json({ error: 'Failed to fetch FB config' }, { status: 500 });
  }
}

// PUT - Save FB channel config
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRoles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { is_active, app_id, app_secret, page_access_token } = body;

    // If masked values sent, merge with existing
    let finalAppSecret = app_secret;
    let finalToken = page_access_token;

    if (isMasked(app_secret) || isMasked(page_access_token)) {
      const { data: existing } = await supabaseAdmin
        .from('crm_settings')
        .select('setting_value')
        .eq('company_id', companyId)
        .eq('setting_key', 'fb_channel_config')
        .single();

      if (existing?.setting_value) {
        const existingConfig = existing.setting_value as Record<string, unknown>;
        if (isMasked(app_secret)) finalAppSecret = existingConfig.app_secret;
        if (isMasked(page_access_token)) finalToken = existingConfig.page_access_token;
      }
    }

    // Get existing config for verify_token preservation
    const { data: existingData } = await supabaseAdmin
      .from('crm_settings')
      .select('setting_value')
      .eq('company_id', companyId)
      .eq('setting_key', 'fb_channel_config')
      .single();

    const existingConfig = (existingData?.setting_value as Record<string, unknown>) || {};
    // Generate verify_token if not yet set
    const verifyToken = (existingConfig.verify_token as string) || crypto.randomBytes(16).toString('hex');

    const settingValue = {
      is_active: is_active !== false,
      app_id: app_id || '',
      app_secret: finalAppSecret || '',
      page_access_token: finalToken || '',
      verify_token: verifyToken,
      page_name: existingConfig.page_name || '',
      page_id: existingConfig.page_id || '',
    };

    const { error } = await supabaseAdmin
      .from('crm_settings')
      .upsert({
        company_id: companyId,
        setting_key: 'fb_channel_config',
        setting_value: settingValue,
        description: 'Facebook Messenger API credentials',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'company_id,setting_key',
      });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT fb-channel error:', error);
    return NextResponse.json({ error: 'Failed to save FB config' }, { status: 500 });
  }
}

// POST - Test connection
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRoles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { action, page_access_token } = body;

    if (action === 'test') {
      let token = page_access_token;

      // If masked, get from DB
      if (!token || isMasked(token)) {
        const { data } = await supabaseAdmin
          .from('crm_settings')
          .select('setting_value')
          .eq('company_id', companyId)
          .eq('setting_key', 'fb_channel_config')
          .single();

        if (data?.setting_value) {
          token = (data.setting_value as Record<string, unknown>).page_access_token;
        }
      }

      if (!token) {
        return NextResponse.json({ error: 'Page Access Token is required' }, { status: 400 });
      }

      // Test by calling Graph API /me
      const response = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${token}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: errorData.error?.message || `Facebook API error (${response.status})`,
        });
      }

      const pageInfo = await response.json();

      // Save page info to config
      const { data: existingData } = await supabaseAdmin
        .from('crm_settings')
        .select('setting_value')
        .eq('company_id', companyId)
        .eq('setting_key', 'fb_channel_config')
        .single();

      if (existingData?.setting_value) {
        const config = existingData.setting_value as Record<string, unknown>;
        await supabaseAdmin
          .from('crm_settings')
          .update({
            setting_value: {
              ...config,
              page_name: pageInfo.name,
              page_id: pageInfo.id,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('company_id', companyId)
          .eq('setting_key', 'fb_channel_config');
      }

      return NextResponse.json({
        success: true,
        page: {
          name: pageInfo.name,
          id: pageInfo.id,
        },
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('POST fb-channel error:', error);
    return NextResponse.json({ error: 'Failed to test FB connection' }, { status: 500 });
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

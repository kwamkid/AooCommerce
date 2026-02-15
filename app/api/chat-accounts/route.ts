import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// GET - List chat accounts
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');

    let query = supabaseAdmin
      .from('chat_accounts')
      .select('*')
      .eq('company_id', companyId)
      .order('platform', { ascending: true })
      .order('created_at', { ascending: true });

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Mask credentials for response
    const accounts = (data || []).map(account => ({
      ...account,
      credentials: maskCredentials(account.credentials as Record<string, unknown>, account.platform),
      webhook_url: getWebhookUrl(request, account.id, account.platform),
    }));

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('GET chat-accounts error:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

// POST - Create new chat account
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRole)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { platform, account_name, credentials } = body;

    if (!platform || !['line', 'facebook'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    if (!account_name?.trim()) {
      return NextResponse.json({ error: 'Account name is required' }, { status: 400 });
    }

    // For FB: auto-generate verify_token if not provided
    const finalCredentials = { ...credentials };
    if (platform === 'facebook' && !finalCredentials.verify_token) {
      finalCredentials.verify_token = crypto.randomBytes(16).toString('hex');
    }

    const { data, error } = await supabaseAdmin
      .from('chat_accounts')
      .insert({
        company_id: companyId,
        platform,
        account_name: account_name.trim(),
        credentials: finalCredentials,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'ชื่อ account ซ้ำ กรุณาใช้ชื่ออื่น' }, { status: 400 });
      }
      throw error;
    }

    // Auto-fetch LINE bot profile (non-blocking)
    if (platform === 'line' && finalCredentials.channel_access_token) {
      try {
        const botInfoRes = await fetch('https://api.line.me/v2/bot/info', {
          headers: { 'Authorization': `Bearer ${finalCredentials.channel_access_token}` },
        });
        if (botInfoRes.ok) {
          const botInfo = await botInfoRes.json();
          const updatedCreds = {
            ...finalCredentials,
            bot_name: botInfo.displayName || '',
            bot_picture_url: botInfo.pictureUrl || '',
            basic_id: botInfo.basicId || '',
          };
          await supabaseAdmin
            .from('chat_accounts')
            .update({ credentials: updatedCreds, updated_at: new Date().toISOString() })
            .eq('id', data.id);
          data.credentials = updatedCreds;
        }
      } catch (e) {
        console.warn('Auto-fetch LINE bot profile failed:', e);
      }
    }

    return NextResponse.json({
      success: true,
      account: {
        ...data,
        credentials: maskCredentials(data.credentials as Record<string, unknown>, platform),
        webhook_url: getWebhookUrl(request, data.id, platform),
      },
    });
  } catch (error) {
    console.error('POST chat-accounts error:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}

// PUT - Update chat account
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRole)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { id, account_name, credentials, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // Get existing account
    const { data: existing } = await supabaseAdmin
      .from('chat_accounts')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (account_name !== undefined) {
      updateData.account_name = account_name.trim();
    }

    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

    if (credentials) {
      // Merge masked values with existing credentials
      const existingCreds = existing.credentials as Record<string, unknown>;
      const mergedCreds = { ...existingCreds };

      for (const [key, value] of Object.entries(credentials)) {
        if (typeof value === 'string' && value.includes('•')) {
          // Masked value — keep existing
          continue;
        }
        mergedCreds[key] = value;
      }

      updateData.credentials = mergedCreds;
    }

    const { error } = await supabaseAdmin
      .from('chat_accounts')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT chat-accounts error:', error);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

// DELETE - Delete chat account
export async function DELETE(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRole)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('chat_accounts')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE chat-accounts error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}

// Helper: mask secrets
function maskCredentials(creds: Record<string, unknown>, platform: string): Record<string, unknown> {
  const masked = { ...creds };
  const secretKeys = platform === 'line'
    ? ['channel_secret', 'channel_access_token']
    : ['app_secret', 'page_access_token'];

  for (const key of secretKeys) {
    const value = masked[key];
    if (typeof value === 'string' && value.length > 4) {
      masked[key] = '•'.repeat(value.length - 4) + value.slice(-4);
    }
  }
  return masked;
}

// Helper: get webhook URL
function getWebhookUrl(request: NextRequest, accountId: string, platform: string): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const apiPath = platform === 'line' ? 'line' : 'fb';
  return `${protocol}://${host}/api/${apiPath}/webhook?account=${accountId}`;
}

import { supabaseAdmin } from '@/lib/supabase-admin';

export interface LineCredentials {
  channel_secret: string;
  channel_access_token: string;
  is_active: boolean;
}

/**
 * Get LINE credentials for a company.
 * Reads from crm_settings table (setting_key = 'line_channel_config').
 * Falls back to env vars if no DB config found.
 */
export async function getLineCredentials(companyId: string): Promise<LineCredentials | null> {
  try {
    const { data } = await supabaseAdmin
      .from('crm_settings')
      .select('setting_value')
      .eq('company_id', companyId)
      .eq('setting_key', 'line_channel_config')
      .single();

    if (data?.setting_value) {
      const config = data.setting_value as Record<string, unknown>;
      const channelSecret = config.channel_secret as string;
      const channelAccessToken = config.channel_access_token as string;
      const isActive = config.is_active as boolean;

      if (channelSecret && channelAccessToken) {
        return {
          channel_secret: channelSecret,
          channel_access_token: channelAccessToken,
          is_active: isActive !== false,
        };
      }
    }
  } catch {
    // Fall through to env vars
  }

  // Fallback to env vars
  const envSecret = process.env.LINE_CHANNEL_SECRET;
  const envToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (envSecret && envToken) {
    return {
      channel_secret: envSecret,
      channel_access_token: envToken,
      is_active: true,
    };
  }

  return null;
}

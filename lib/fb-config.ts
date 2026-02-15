import { supabaseAdmin } from '@/lib/supabase-admin';

export interface FbCredentials {
  app_id: string;
  app_secret: string;
  page_access_token: string;
  page_id: string;
  verify_token: string;
  is_active: boolean;
}

/**
 * Get Facebook Messenger credentials for a company.
 * Reads from crm_settings table (setting_key = 'fb_channel_config').
 */
export async function getFbCredentials(companyId: string): Promise<FbCredentials | null> {
  try {
    const { data } = await supabaseAdmin
      .from('crm_settings')
      .select('setting_value')
      .eq('company_id', companyId)
      .eq('setting_key', 'fb_channel_config')
      .single();

    if (data?.setting_value) {
      const config = data.setting_value as Record<string, unknown>;
      const appSecret = config.app_secret as string;
      const pageAccessToken = config.page_access_token as string;

      if (appSecret && pageAccessToken) {
        return {
          app_id: (config.app_id as string) || '',
          app_secret: appSecret,
          page_access_token: pageAccessToken,
          page_id: (config.page_id as string) || '',
          verify_token: (config.verify_token as string) || '',
          is_active: config.is_active !== false,
        };
      }
    }
  } catch {
    // No config found
  }

  return null;
}

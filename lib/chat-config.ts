import { supabaseAdmin } from '@/lib/supabase-admin';

export type ChatPlatform = 'line' | 'facebook';

export interface ChatAccount {
  id: string;
  company_id: string;
  platform: ChatPlatform;
  account_name: string;
  credentials: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LineCredentialsData {
  channel_secret: string;
  channel_access_token: string;
  bot_name?: string;
  bot_picture_url?: string;
  basic_id?: string;
}

export interface FbCredentialsData {
  app_id: string;
  app_secret: string;
  page_access_token: string;
  verify_token: string;
  page_id: string;
  page_name?: string;
}

/**
 * Get a chat account by its ID.
 */
export async function getChatAccount(accountId: string): Promise<ChatAccount | null> {
  const { data } = await supabaseAdmin
    .from('chat_accounts')
    .select('*')
    .eq('id', accountId)
    .single();

  return data as ChatAccount | null;
}

/**
 * Get all chat accounts for a company, optionally filtered by platform.
 */
export async function getChatAccountsByCompany(
  companyId: string,
  platform?: ChatPlatform
): Promise<ChatAccount[]> {
  let query = supabaseAdmin
    .from('chat_accounts')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (platform) {
    query = query.eq('platform', platform);
  }

  const { data } = await query;
  return (data as ChatAccount[]) || [];
}

/**
 * Get the first active account for a company + platform.
 * Used as fallback for backward-compatible webhook routing.
 */
export async function getDefaultChatAccount(
  companyId: string,
  platform: ChatPlatform
): Promise<ChatAccount | null> {
  const { data } = await supabaseAdmin
    .from('chat_accounts')
    .select('*')
    .eq('company_id', companyId)
    .eq('platform', platform)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  return data as ChatAccount | null;
}

/**
 * Get LINE credentials from a chat account.
 */
export function getLineCredsFromAccount(account: ChatAccount): LineCredentialsData | null {
  if (account.platform !== 'line') return null;
  const creds = account.credentials;
  const channelSecret = (creds.channel_secret as string) || '';
  const channelAccessToken = (creds.channel_access_token as string) || '';
  if (!channelSecret || !channelAccessToken) return null;
  return {
    channel_secret: channelSecret,
    channel_access_token: channelAccessToken,
    bot_name: creds.bot_name as string | undefined,
    bot_picture_url: creds.bot_picture_url as string | undefined,
    basic_id: creds.basic_id as string | undefined,
  };
}

/**
 * Get FB credentials from a chat account.
 */
export function getFbCredsFromAccount(account: ChatAccount): FbCredentialsData | null {
  if (account.platform !== 'facebook') return null;
  const creds = account.credentials;
  const appSecret = (creds.app_secret as string) || '';
  const pageAccessToken = (creds.page_access_token as string) || '';
  if (!pageAccessToken) return null;
  return {
    app_id: (creds.app_id as string) || '',
    app_secret: appSecret,
    page_access_token: pageAccessToken,
    verify_token: (creds.verify_token as string) || '',
    page_id: (creds.page_id as string) || '',
    page_name: creds.page_name as string | undefined,
  };
}

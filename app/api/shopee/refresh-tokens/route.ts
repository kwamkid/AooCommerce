import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { refreshAccessToken } from '@/lib/shopee-api';

export async function POST(request: NextRequest) {
  // Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const bufferMs = 30 * 60 * 1000; // 30 minutes before expiry
  const cutoff = new Date(now.getTime() + bufferMs);

  // Find accounts with access tokens expiring soon
  const { data: accounts } = await supabaseAdmin
    .from('shopee_accounts')
    .select('*')
    .eq('is_active', true)
    .not('refresh_token', 'is', null)
    .lt('access_token_expires_at', cutoff.toISOString());

  let refreshed = 0;
  const errors: string[] = [];

  for (const account of accounts || []) {
    try {
      const tokens = await refreshAccessToken(account.refresh_token, account.shop_id);

      const accessExpiry = new Date(now.getTime() + tokens.expire_in * 1000);
      const refreshExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await supabaseAdmin
        .from('shopee_accounts')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          access_token_expires_at: accessExpiry.toISOString(),
          refresh_token_expires_at: refreshExpiry.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', account.id);

      refreshed++;
    } catch (e) {
      errors.push(`Shop ${account.shop_id}: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
  }

  return NextResponse.json({ refreshed, total: (accounts || []).length, errors });
}

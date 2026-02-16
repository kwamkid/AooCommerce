import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee-api';
import { syncOrdersByTimeRange } from '@/lib/shopee-sync';

export async function POST(request: NextRequest) {
  // Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get all active accounts
  const { data: accounts } = await supabaseAdmin
    .from('shopee_accounts')
    .select('*')
    .eq('is_active', true)
    .not('refresh_token', 'is', null);

  const results: { shop_id: number; created: number; updated: number; errors: string[] }[] = [];

  const now = Math.floor(Date.now() / 1000);

  for (const account of (accounts || []) as ShopeeAccountRow[]) {
    try {
      // Sync from last_sync_at or last 15 minutes
      const lastSync = account.last_sync_at
        ? Math.floor(new Date(account.last_sync_at).getTime() / 1000)
        : now - 15 * 60;

      // Create sync log
      const { data: log } = await supabaseAdmin
        .from('shopee_sync_log')
        .insert({
          shopee_account_id: account.id,
          company_id: account.company_id,
          sync_type: 'poll',
        })
        .select()
        .single();

      const result = await syncOrdersByTimeRange(account, lastSync, now);

      // Update sync log
      if (log) {
        await supabaseAdmin
          .from('shopee_sync_log')
          .update({
            orders_fetched: result.created + result.updated,
            orders_created: result.created,
            orders_updated: result.updated,
            errors: result.errors.length > 0 ? result.errors : null,
            completed_at: new Date().toISOString(),
          })
          .eq('id', log.id);
      }

      results.push({
        shop_id: account.shop_id,
        created: result.created,
        updated: result.updated,
        errors: result.errors,
      });
    } catch (e) {
      results.push({
        shop_id: account.shop_id,
        created: 0,
        updated: 0,
        errors: [e instanceof Error ? e.message : 'Unknown error'],
      });
    }
  }

  return NextResponse.json({ total_shops: (accounts || []).length, results });
}

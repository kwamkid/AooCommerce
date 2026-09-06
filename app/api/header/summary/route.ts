import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';
import { getBlockedPlatforms } from '@/lib/marketplace/quota';
import { collectWatchdogIssuesCached } from '@/lib/marketplace/watchdog';
import { getStockConfig } from '@/lib/stock-utils';

/**
 * Consolidated header/sidebar badge endpoint.
 *
 * Replaces 5 separate calls (warehouses, inventory low-stock, chat/unread,
 * orders/ready-count, marketplace/health) with a single round trip. All DB
 * queries fan out in parallel inside the same serverless invocation, so
 * total latency is bounded by the slowest single query — not the sum.
 *
 * Shape mirrors the original endpoints so callers can drop in without
 * reshaping data downstream.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const companyId = auth.companyId;

    const stockConfig = await getStockConfig(companyId);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const lowStockPromise = stockConfig.stockEnabled
      ? supabaseAdmin
          .from('inventory')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .filter('quantity', 'lte', 5)
      : Promise.resolve({ count: 0 });

    const [
      lineUnreadResult,
      fbUnreadResult,
      shopeeUnreadResult,
      lazadaUnreadResult,
      tiktokUnreadResult,
      ordersReadyResult,
      marketplaceAccountsResult,
      marketplaceErrorsResult,
      lowStockResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('line_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0),
      supabaseAdmin
        .from('fb_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0),
      supabaseAdmin
        .from('shopee_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0),
      supabaseAdmin
        .from('lazada_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0),
      supabaseAdmin
        .from('tiktok_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0),
      supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('order_status', 'ready_to_ship'),
      supabaseAdmin
        .from('marketplace_accounts')
        .select('id, platform, shop_name, is_active, refresh_token_expires_at, refresh_token')
        .eq('company_id', companyId),
      supabaseAdmin
        .from('integration_logs')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'error')
        .in('action', ['account_auto_deactivated', 'sync_orders_poll', 'webhook_sync_error'])
        .gte('created_at', since),
      lowStockPromise,
    ]);

    let chatUnread = 0;
    (lineUnreadResult.data || []).forEach(c => { chatUnread += c.unread_count || 0; });
    (fbUnreadResult.data || []).forEach(c => { chatUnread += c.unread_count || 0; });
    (shopeeUnreadResult.data || []).forEach(c => { chatUnread += c.unread_count || 0; });
    (lazadaUnreadResult.data || []).forEach(c => { chatUnread += c.unread_count || 0; });
    (tiktokUnreadResult.data || []).forEach(c => { chatUnread += c.unread_count || 0; });

    // รายการปัญหามาจากตัวเฝ้าตัวเดียวกับที่ใช้เด้ง push และหน้า superadmin
    // (lib/marketplace/watchdog.ts) — กระดิ่ง · การ์ดใน dashboard · แจ้งเตือน
    // จึงพูดเรื่องเดียวกันเสมอ พร้อมวิธีแก้ + ทางไปแก้
    // cache 5 นาทีต่อบริษัท — หน้าโหลดทุกครั้งไม่ต้องคำนวณใหม่ (ผลจริงเปลี่ยนตาม cron 15 นาที)
    const issues = await collectWatchdogIssuesCached({ companyId });
    const expiredCount = issues.filter(i => i.code.startsWith('token_expired:')).length;
    const inactiveCount = issues.filter(i => i.code.startsWith('shop_disconnected:')).length;

    // Circuit breaker ต่อ platform (quota/rate limit หมด) — แจ้งเฉพาะ platform ที่บริษัทนี้มีร้าน active
    const activePlatforms = new Set(
      (marketplaceAccountsResult.data || []).filter(a => a.is_active).map(a => a.platform || 'shopee')
    );
    const quotaPaused = activePlatforms.size > 0
      ? (await getBlockedPlatforms()).filter(b => activePlatforms.has(b.platform))
      : [];

    return NextResponse.json({
      stockConfig,
      lowStockCount: lowStockResult.count || 0,
      chatUnread,
      ordersReadyCount: ordersReadyResult.count || 0,
      marketplaceHealth: {
        expired_count: expiredCount,
        inactive_count: inactiveCount,
        error_count: marketplaceErrorsResult.count || 0,
        total_issues: issues.length,
        issues,
        quota_paused: quotaPaused,
      },
    });
  } catch (error) {
    console.error('[Header Summary] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
  }
}

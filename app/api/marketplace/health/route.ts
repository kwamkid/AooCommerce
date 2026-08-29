import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Returns health summary for marketplace integrations:
 * - expired_count: shops with expired refresh token (need re-auth)
 * - inactive_count: shops with is_active=false (recently auto-deactivated or manually disconnected)
 * - error_count: integration_logs errors in the last 24h (excludes known non-auth business errors)
 * - duplicate_count: สินค้าที่ผูกกับหลายประกาศในร้านเดียวกัน (เสี่ยงขายเกินสต็อก)
 * - issues: list of { account_id, shop_name, platform, type, message }
 *
 * Used by Header to show a notification badge when marketplace shops need attention.
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const now = new Date();
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { data: accounts } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('id, platform, shop_name, is_active, refresh_token_expires_at, refresh_token')
      .eq('company_id', companyId);

    type Issue = { account_id: string; shop_name: string | null; platform: string; type: 'expired' | 'disconnected' | 'duplicate_listing'; message: string };
    const issues: Issue[] = [];
    let expiredCount = 0;
    let inactiveCount = 0;

    for (const a of accounts || []) {
      const hasRefresh = !!a.refresh_token;
      const refreshExpired = a.refresh_token_expires_at && new Date(a.refresh_token_expires_at).getTime() < now.getTime();

      if (!a.is_active && hasRefresh) {
        // Auto-deactivated or disconnected but still has token — usually means token expired and was auto-deactivated
        inactiveCount++;
        issues.push({
          account_id: a.id,
          shop_name: a.shop_name,
          platform: a.platform || 'shopee',
          type: 'disconnected',
          message: 'ร้านถูกปิดการเชื่อมต่อ กรุณาเชื่อมต่อใหม่',
        });
      } else if (a.is_active && refreshExpired) {
        expiredCount++;
        issues.push({
          account_id: a.id,
          shop_name: a.shop_name,
          platform: a.platform || 'shopee',
          type: 'expired',
          message: 'Token หมดอายุ กรุณาเชื่อมต่อใหม่',
        });
      }
    }

    // สินค้าตัวเดียวผูกกับหลายประกาศในร้านเดียวกัน = ของกองเดียวถูกโชว์หลายที่
    //
    // ระบบเรามี 1 variation = 1 ยอดสต็อก แบ่งให้หลายประกาศไม่ได้ → push เลขเดียวกันขึ้นทุกใบ
    // ลูกค้าจึงกดซื้อรวมกันได้เกินของที่มีจริง (ของ 8 ชิ้น ลง 2 ประกาศ = ขายได้ 16)
    // และยอดที่ดึงกลับมาจะสลับไปมาตามว่าอ่านประกาศไหนทีหลัง
    //
    // เกิดจากลงประกาศซ้ำเองบน marketplace แล้ว import เข้ามาทั้งคู่ — เจอจริง 2 คู่ที่ร้าน Hape
    // (2026-08-29) กว่าจะรู้ก็ตอนไล่สต็อกที่หลุดกัน ต้องให้ระบบเห็นเองตั้งแต่แรก
    let duplicateCount = 0;
    const accountById = new Map((accounts || []).map(a => [a.id, a]));
    if (accountById.size > 0) {
      // อ่านเป็นหน้า ๆ — PostgREST คืนสูงสุด 1000 แถวต่อ query ร้านใหญ่มี link เกินนั้น
      // ถ้าอ่านรอบเดียวจะ "ตรวจไม่เจอ" ของที่อยู่แถวหลัง ซึ่งแย่กว่าไม่ตรวจเลย
      // (เพราะหน้าจอจะบอกว่าไม่มีปัญหา ทั้งที่ยังไม่ได้ดูครบ)
      const dupLinks: { account_id: string; variation_id: string; external_item_id: string; products: unknown }[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data: page } = await supabaseAdmin
          .from('marketplace_product_links')
          .select('account_id, variation_id, external_item_id, products(name)')
          .eq('company_id', companyId)
          .eq('sync_enabled', true)
          .not('variation_id', 'is', null)
          .range(from, from + PAGE - 1);
        if (!page || page.length === 0) break;
        dupLinks.push(...(page as typeof dupLinks));
        if (page.length < PAGE) break;
      }

      // นับ "ประกาศที่ต่างกัน" ต่อ (ร้าน, สินค้า) — model หลายตัวของประกาศเดียวไม่ใช่ปัญหา
      const itemsPerPair = new Map<string, { items: Set<string>; accountId: string; name: string }>();
      for (const l of dupLinks) {
        const key = `${l.account_id}:${l.variation_id}`;
        const name = ((l.products as unknown as { name?: string } | null)?.name) || 'สินค้า';
        const entry = itemsPerPair.get(key) || { items: new Set<string>(), accountId: l.account_id as string, name };
        entry.items.add(l.external_item_id as string);
        itemsPerPair.set(key, entry);
      }

      const perAccount = new Map<string, string[]>();
      for (const { items, accountId, name } of itemsPerPair.values()) {
        if (items.size < 2) continue;
        duplicateCount++;
        const list = perAccount.get(accountId) || [];
        if (list.length < 3) list.push(name);
        perAccount.set(accountId, list);
      }

      for (const [accountId, names] of perAccount) {
        const a = accountById.get(accountId);
        if (!a) continue;
        issues.push({
          account_id: accountId,
          shop_name: a.shop_name,
          platform: a.platform || 'shopee',
          type: 'duplicate_listing',
          message: `สินค้าตัวเดียวลงหลายประกาศ (${names.join(', ')}${names.length >= 3 ? ' และอื่น ๆ' : ''}) — เสี่ยงขายเกินสต็อก`,
        });
      }
    }

    // Count recent auth/token errors from integration logs (last 24h)
    const { count: errorCount } = await supabaseAdmin
      .from('integration_logs')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('status', 'error')
      .in('action', ['account_auto_deactivated', 'sync_orders_poll', 'webhook_sync_error'])
      .gte('created_at', since);

    return NextResponse.json({
      expired_count: expiredCount,
      inactive_count: inactiveCount,
      error_count: errorCount || 0,
      duplicate_count: duplicateCount,
      total_issues: issues.length,
      issues,
    });
  } catch (error) {
    console.error('Marketplace health GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch health' }, { status: 500 });
  }
}

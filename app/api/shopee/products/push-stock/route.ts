import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow } from '@/lib/shopee/api';
import { pushStockToShopee } from '@/lib/shopee/product-sync';
import { logIntegration } from '@/lib/integration-logger';

// ย้ายคลังแล้วส่งยอดทั้งร้าน — ร้านใหญ่ ~300 สินค้า ใช้เวลานาน
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !can(companyRoles, 'marketplace.push')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { product_id, marketplace_account_id, cursor } = await request.json();
    if (!marketplace_account_id) {
      return NextResponse.json({ error: 'Missing marketplace_account_id' }, { status: 400 });
    }
    // ไม่ส่ง product_id = ส่งยอดของทั้งร้าน (ใช้ตอนย้ายคลังที่ผูกไว้ ยอดทั้งร้านต้องเปลี่ยนตาม)

    const { data: account, error: accError } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('id', marketplace_account_id)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (accError || !account) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }
    // route นี้เซ็นคำขอด้วย partner key ของ Shopee — ส่ง account ของ TikTok/Lazada เข้ามา
    // จะกลายเป็นยิง Shopee ด้วย token ของ platform อื่น (fail ทุกครั้ง + log ผิด platform)
    if (account.platform && account.platform !== 'shopee') {
      return NextResponse.json(
        { error: `ร้านนี้เป็น ${account.platform} — ยังไม่รองรับการส่งสต็อกขึ้น ${account.platform}` },
        { status: 400 }
      );
    }

    const startMs = Date.now();
    let result: { success: boolean; updated_models: number; errors: string[] };

    if (product_id) {
      result = await pushStockToShopee(account as ShopeeAccountRow, product_id);
    } else {
      // ทั้งร้าน — ยิงทีละสินค้า คุม concurrency ไว้ 3 กันชน rate limit ของ Shopee
      const { data: links } = await supabaseAdmin
        .from('marketplace_product_links')
        .select('product_id')
        .eq('account_id', account.id)
        .eq('sync_enabled', true);
      const allIds = [...new Set((links || []).map(l => l.product_id as string))].filter(Boolean);
      // เริ่มต่อจากตัวที่ค้างไว้ได้ — ร้านใหญ่ยิงไม่จบใน 1 request แน่
      const startIndex = Math.max(0, Number(cursor) || 0);
      const productIds = allIds.slice(startIndex);

      // หยุดก่อน maxDuration แล้วคืน cursor กลับไป ไม่ใช่ปล่อยให้ platform ตัดกลางคัน
      // แล้วไม่มีใครรู้ว่าทำถึงไหน (pattern เดียวกับ bulk-ship — ดู CLAUDE.md Scale & Queue)
      const TIME_BUDGET_MS = 240_000;
      const { parallelLimit } = await import('@/lib/parallel');
      let done = 0;
      let stoppedAt: number | null = null;
      const collected: { success: boolean; updated_models: number; errors: string[] }[] = [];

      const CHUNK = 15;
      for (let i = 0; i < productIds.length; i += CHUNK) {
        if (Date.now() - startMs > TIME_BUDGET_MS) {
          stoppedAt = startIndex + done;
          break;
        }
        const chunk = productIds.slice(i, i + CHUNK);
        const rs = await parallelLimit(chunk, (pid) =>
          pushStockToShopee(account as ShopeeAccountRow, pid), 3);
        collected.push(...rs);
        done += chunk.length;
      }

      result = {
        success: stoppedAt === null && collected.every(r => r.success),
        updated_models: collected.reduce((n, r) => n + r.updated_models, 0),
        errors: collected.flatMap(r => r.errors).slice(0, 20),
      };
      if (stoppedAt !== null) {
        return NextResponse.json({
          ...result,
          partial: true,
          next_cursor: stoppedAt,
          total: allIds.length,
          done: stoppedAt,
          message: `ส่งไปแล้ว ${stoppedAt}/${allIds.length} สินค้า — เรียกซ้ำพร้อม cursor เพื่อทำต่อ`,
        });
      }
    }
    const durationMs = Date.now() - startMs;

    logIntegration({
      company_id: companyId,
      integration: 'shopee',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'push_stock',
      method: 'POST',
      api_path: '/api/v2/product/update_stock',
      request_body: { product_id: product_id || 'ทั้งร้าน' },
      response_body: result,
      status: result.success ? 'success' : 'error',
      error_message: result.errors.length > 0 ? result.errors.join('; ') : undefined,
      duration_ms: durationMs,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Push stock error:', error);
    return NextResponse.json({ error: 'Push stock failed' }, { status: 500 });
  }
}

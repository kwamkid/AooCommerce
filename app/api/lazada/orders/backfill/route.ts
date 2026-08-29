import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import { syncOrdersByTimeRange } from '@/lib/lazada/sync';
import type { LazadaAccountRow } from '@/lib/lazada/api';
import { IMPORT_HISTORY_ONLY, IMPORT_LIVE } from '@/lib/marketplace/order-import';

// ดูดออเดอร์ Lazada ย้อนหลัง
//
// ⚠️ **ต่างจาก /api/lazada/sync ตรงที่เลือกได้ว่าจะให้มีผลข้างเคียงมั้ย**
//
//   mode: 'history' (ค่าเริ่มต้น) — เติมประวัติล้วน **ไม่แตะสต็อก ไม่ออกเอกสาร ไม่แจ้งเตือน**
//     ใช้ตอนดึงออเดอร์เก่าที่ของออกไปแล้วและออกเอกสารนอกระบบไปแล้ว
//     การตัดสต็อกซ้ำจะทำให้ยอดติดลบ · เลขที่เอกสารออกแล้วยกเลิกได้แต่เลขไม่คืน
//
//   mode: 'live' — ทำครบเหมือนออเดอร์ใหม่ (จองสต็อก ออกเอกสาร)
//     ใช้เมื่อออเดอร์เหล่านี้ยังไม่เคยถูกจัดการที่ไหนเลย
//
// 📌 ถ้ายังไม่เปิดใช้จริง วิธีที่ปลอดภัยสุดคือ: backfill แบบ history → แล้วดึงสต็อกจาก
//    แพลตฟอร์มทับทีหลัง · ตัวเลขจะถูกเองเพราะแพลตฟอร์มหักของที่ขายไปแล้วมาให้เรียบร้อย
//
// POST { account_id?, days?, mode? }

export const maxDuration = 300;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`
    || request.headers.get('x-cron-secret') === secret;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const days: number = Math.min(Math.max(Number(body.days) || 90, 1), 180);
  const mode: string = body.mode === 'live' ? 'live' : 'history';

  let companyFilter: string | null = null;
  if (!authorizeCron(request)) {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!can(auth.companyRoles, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    companyFilter = auth.companyId ?? null;
  }

  const quota = await isQuotaBlocked('lazada', 'order');
  if (quota.blocked) {
    return NextResponse.json({ skipped: true, reason: 'quota_blocked', until: quota.until });
  }

  let q = supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('platform', 'lazada')
    .eq('is_active', true);
  if (companyFilter) q = q.eq('company_id', companyFilter);
  if (body.account_id) q = q.eq('id', body.account_id);
  const { data: accounts } = await q;

  if (!accounts?.length) {
    return NextResponse.json({ error: 'ไม่พบร้าน Lazada ที่เชื่อมต่ออยู่' }, { status: 404 });
  }

  const opts = mode === 'live' ? IMPORT_LIVE : IMPORT_HISTORY_ONLY;
  const now = Date.now();
  const results: Record<string, unknown>[] = [];

  for (const account of accounts) {
    try {
      const r = await syncOrdersByTimeRange(
        account as unknown as LazadaAccountRow,
        now - days * 86_400_000,
        now,
        undefined,
        opts
      );
      results.push({
        shop: account.shop_name,
        created: r.orders_created,
        updated: r.orders_updated,
        skipped: r.orders_skipped,
        products_created: r.products_created,
        errors: r.errors.slice(0, 5),
      });
    } catch (err) {
      results.push({ shop: account.shop_name, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({
    mode,
    days,
    // บอกให้ชัดว่ารอบนี้แตะอะไรบ้าง — คนอ่านผลลัพธ์จะได้ไม่ต้องเดา
    side_effects: mode === 'live'
      ? 'จองสต็อก + ออกเอกสาร + แจ้งเตือน'
      : 'ไม่แตะสต็อก ไม่ออกเอกสาร ไม่แจ้งเตือน (เติมประวัติอย่างเดียว)',
    accounts: accounts.length,
    results,
  });
}

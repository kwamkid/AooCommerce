import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { normalizeShopeeEscrow } from '@/lib/shopee/settlement';
import { computeOrderCogs, saveSettlement } from '@/lib/marketplace/settlement';

// Backfill ยอด settlement จากข้อมูลที่ดูดเก็บไว้แล้วใน orders.external_data
// **ไม่ยิง API ของ marketplace เลยสักครั้ง** — แปลงจากของที่มีอยู่ล้วน
// จึงไม่กระทบโควตา/success rate และรันซ้ำได้ปลอดภัย (upsert ตาม order_id)
//
// เรียกได้ 2 ทาง: ผู้ใช้ที่มีสิทธิ์ marketplace.sync · หรือ CRON_SECRET (ใช้ตอนรันเป็นชุดใหญ่)
// POST { platform?: 'shopee', limit?: number, redo?: boolean }

export const maxDuration = 300;

const BATCH = 200;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = request.headers.get('authorization');
  const header = request.headers.get('x-cron-secret');
  return bearer === `Bearer ${secret}` || header === secret;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const platform: string = body.platform || 'shopee';
  const limit: number = Math.min(Math.max(Number(body.limit) || BATCH, 1), 500);
  const redo: boolean = body.redo === true;
  // ตัวเลื่อนหน้า — ต้องมี ไม่งั้นรอบถัดไปจะดึงชุดเดิมที่ทำไปแล้วซ้ำไม่รู้จบ
  const offset: number = Math.max(Number(body.offset) || 0, 0);

  let companyFilter: string | null = null;

  if (!authorizeCron(request)) {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!can(auth.companyRoles, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    companyFilter = auth.companyId ?? null;   // ผู้ใช้ทำได้เฉพาะบริษัทตัวเอง
  }

  if (platform !== 'shopee') {
    return NextResponse.json(
      { error: `ยังไม่รองรับ platform '${platform}' — ตอนนี้มีเฉพาะ shopee` },
      { status: 400 }
    );
  }

  // ออเดอร์ที่มี escrow เก็บไว้แล้วแต่ยังไม่มี settlement
  let query = supabaseAdmin
    .from('orders')
    .select('id, company_id, external_order_sn, marketplace_account_id, external_data')
    .eq('source', 'shopee')
    .not('external_data->>escrow_detail', 'is', null)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (companyFilter) query = query.eq('company_id', companyFilter);

  const { data: orders, error } = await query;
  if (error) {
    console.error('[Settlement Backfill] query failed:', error.message);
    return NextResponse.json({ error: 'โหลดออเดอร์ไม่สำเร็จ', detail: error.message }, { status: 500 });
  }
  if (!orders?.length) {
    return NextResponse.json({ processed: 0, skipped: 0, failed: 0, remaining: 0, next_offset: null, done: true });
  }

  // ตัวที่ทำไปแล้วออก (เว้นแต่สั่ง redo) — ทำให้เรียกซ้ำเป็นรอบ ๆ จนหมดได้
  let targets = orders;
  if (!redo) {
    const { data: existing } = await supabaseAdmin
      .from('marketplace_settlements')
      .select('order_id')
      .in('order_id', orders.map(o => o.id));
    const done = new Set((existing || []).map(r => r.order_id));
    targets = orders.filter(o => !done.has(o.id));
  }

  const skipped = orders.length - targets.length;
  const nextOffset = offset + orders.length;
  const reachedEnd = orders.length < limit;
  if (!targets.length) {
    return NextResponse.json({
      processed: 0, skipped, failed: 0,
      next_offset: reachedEnd ? null : nextOffset,
      done: reachedEnd,
    });
  }

  // คิดต้นทุนทีเดียวทั้งชุด — ไม่ยิง query ต่อออเดอร์
  const cogsMap = await computeOrderCogs(targets.map(o => o.id));

  let processed = 0;
  let failed = 0;
  const failures: { order_id: string; reason: string }[] = [];

  for (const order of targets) {
    try {
      const escrow = (order.external_data as Record<string, unknown> | null)?.escrow_detail;
      if (!escrow || typeof escrow !== 'object') {
        failed++;
        failures.push({ order_id: order.id, reason: 'escrow_detail ว่างหรือไม่ใช่ object' });
        continue;
      }
      const normalized = normalizeShopeeEscrow(escrow as Record<string, unknown>, {
        orderSn: order.external_order_sn,
      });
      const saved = await saveSettlement({
        companyId: order.company_id,
        orderId: order.id,
        platform: 'shopee',
        marketplaceAccountId: order.marketplace_account_id,
        normalized,
        cogs: cogsMap.get(order.id) ?? { value: null, basis: null },
      });
      if (saved) processed++;
      else { failed++; failures.push({ order_id: order.id, reason: 'บันทึกไม่สำเร็จ' }); }
    } catch (err) {
      failed++;
      failures.push({ order_id: order.id, reason: err instanceof Error ? err.message : 'unknown' });
    }
  }

  // เหลืออีกเท่าไหร่ — ให้ผู้เรียกรู้ว่าต้องยิงต่อมั้ย
  let remainingQuery = supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'shopee')
    .not('external_data->>escrow_detail', 'is', null);
  if (companyFilter) remainingQuery = remainingQuery.eq('company_id', companyFilter);
  const { count: totalWithEscrow } = await remainingQuery;

  const { count: totalDone } = await supabaseAdmin
    .from('marketplace_settlements')
    .select('id', { count: 'exact', head: true })
    .eq('platform', 'shopee');

  const remaining = Math.max((totalWithEscrow || 0) - (totalDone || 0), 0);

  return NextResponse.json({
    processed,
    skipped,
    failed,
    remaining,
    next_offset: reachedEnd ? null : nextOffset,
    done: reachedEnd,
    failures: failures.slice(0, 10),
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import { computeOrderCogs, saveSettlement } from '@/lib/marketplace/settlement';
import { ensureValidToken as ensureLazadaToken, getFinanceTransactions, type LazadaAccountRow } from '@/lib/lazada/api';
import { normalizeLazadaTransactions, type LazadaTransactionRow } from '@/lib/lazada/settlement';
import { ensureValidToken as ensureTikTokToken, getOrderStatement, type TikTokAccountRow } from '@/lib/tiktok/api';
import { normalizeTikTokStatement, unmappedTikTokFields } from '@/lib/tiktok/settlement';
import { fetchAndSaveEscrowDetail } from '@/lib/shopee/sync';
import type { ShopeeAccountRow } from '@/lib/shopee/api';

// ดึงยอด settlement จาก API ของแพลตฟอร์ม (ต่างจาก /backfill ที่แปลงจากข้อมูลที่เก็บไว้แล้ว)
//
// Shopee  = ตามเก็บ escrow ของออเดอร์ที่จบแล้วแต่ยังไม่มียอด (พลาดตอน sync รอบแรก)
//            — ต่างจาก /backfill ที่แปลงจาก escrow ที่เก็บไว้แล้วโดยไม่ยิง API
// Lazada  = ดึง ledger ตามช่วงวันที่ แล้วประกอบเป็นออเดอร์เอง
// TikTok  = ดึงทีละออเดอร์
//
// POST { platform: 'shopee'|'lazada'|'tiktok'|'all', days?: number }
// GET  (cron รายวัน) = เท่ากับ POST { platform:'all', days:30 }

export const maxDuration = 300;

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`
    || request.headers.get('x-cron-secret') === secret;
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const platform: string = body.platform;
  const days: number = Math.min(Math.max(Number(body.days) || 90, 1), 180); // Lazada จำกัดช่วงละ 180 วัน

  let companyFilter: string | null = null;
  if (!authorizeCron(request)) {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!can(auth.companyRoles, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    companyFilter = auth.companyId ?? null;
  }

  // 'all' = ไล่ทั้ง 3 เจ้าใน call เดียว — cron รายวันจะได้ตั้ง job เดียวพอ
  const SETTLEMENT_PLATFORMS = ['shopee', 'lazada', 'tiktok'] as const;
  type SettlementPlatform = typeof SETTLEMENT_PLATFORMS[number];
  const targets: SettlementPlatform[] = platform === 'all'
    ? [...SETTLEMENT_PLATFORMS]
    : (SETTLEMENT_PLATFORMS as readonly string[]).includes(platform)
      ? [platform as SettlementPlatform]
      : [];

  if (targets.length === 0) {
    return NextResponse.json(
      { error: "platform ต้องเป็น 'shopee', 'lazada', 'tiktok' หรือ 'all'" },
      { status: 400 }
    );
  }

  const since = new Date(Date.now() - days * 86_400_000);
  // หยุดเองก่อนโดนตัด แล้วบอกว่าค้างตรงไหน (pattern เดียวกับงานยาวตัวอื่นในระบบ)
  const deadline = Date.now() + 240_000;
  const byPlatform: Record<string, unknown> = {};

  for (const target of targets) {
    // เช็ค breaker ของ scope finance ก่อนยิงเสมอ — โควตาการเงินเต็มอยู่ ยิงไปก็ fail ทุกตัว
    const quota = await isQuotaBlocked(target, 'finance');
    if (quota.blocked) {
      byPlatform[target] = { skipped: true, reason: 'quota_blocked', until: quota.until };
      continue;
    }
    if (Date.now() > deadline) {
      byPlatform[target] = { skipped: true, reason: 'หมดงบเวลา — ยิงรอบใหม่ต่อได้' };
      continue;
    }

    let accountQuery = supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('platform', target)
      .eq('is_active', true);
    if (companyFilter) accountQuery = accountQuery.eq('company_id', companyFilter);
    const { data: accounts } = await accountQuery;

    if (!accounts?.length) {
      byPlatform[target] = { accounts: 0, note: 'ไม่มีร้านที่เชื่อมต่ออยู่' };
      continue;
    }

    const results: Record<string, unknown>[] = [];
    for (const account of accounts) {
      if (Date.now() > deadline) {
        results.push({ shop: account.shop_name, skipped: true, reason: 'หมดงบเวลา — ยิงรอบใหม่ต่อได้' });
        continue;
      }
      try {
        const r = target === 'shopee'
          ? await syncShopeeAccount(account as unknown as ShopeeAccountRow, since, deadline)
          : target === 'lazada'
            ? await syncLazadaAccount(account as unknown as LazadaAccountRow, since)
            : await syncTikTokAccount(account as unknown as TikTokAccountRow, since);
        results.push({ shop: account.shop_name, ...r });
      } catch (err) {
        results.push({ shop: account.shop_name, error: err instanceof Error ? err.message : 'unknown' });
      }
    }
    byPlatform[target] = { accounts: accounts.length, results };
  }

  return NextResponse.json({ platforms: targets, days, ...byPlatform });
}

// cron ยิงเป็น GET ได้ (cron-job.org ตั้ง GET ง่ายกว่า) — เท่ากับ POST { platform:'all' }
export async function GET(request: NextRequest) {
  return POST(new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ platform: 'all', days: 30 }),
  }));
}

// ─── Shopee ─────────────────────────────────────────────────────────────────

/**
 * ตามเก็บออเดอร์ที่ "จบแล้วแต่ไม่มี escrow" — เกิดจากรอบ sync แรกยิง escrow
 * แบบปล่อยลอยแล้วโดน Vercel freeze ทิ้ง (แก้ที่ต้นเหตุแล้ว แต่ของเก่ายังค้าง)
 *
 * ไม่มีทางนี้ = เงินของออเดอร์เหล่านั้นหายถาวร เพราะ /backfill แปลงได้เฉพาะ
 * ออเดอร์ที่มี escrow เก็บไว้แล้ว
 */
async function syncShopeeAccount(account: ShopeeAccountRow, since: Date, deadline: number) {
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, external_order_sn')
    .eq('marketplace_account_id', account.id)
    .eq('source', 'shopee')
    .eq('order_status', 'completed')
    .is('external_data->>escrow_detail', null)
    .not('external_order_sn', 'is', null)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(200);

  if (!orders?.length) return { missing: 0, fetched: 0, remaining: 0 };

  let fetched = 0;
  let i = 0;
  for (const order of orders) {
    if (Date.now() > deadline) break;
    i++;
    try {
      await fetchAndSaveEscrowDetail(account, order.external_order_sn!, order.id);
      fetched++;
    } catch (err) {
      console.error('[Settlement Sync] shopee escrow failed', order.external_order_sn, err);
    }
  }

  return { missing: orders.length, fetched, remaining: Math.max(0, orders.length - i) };
}

// ─── Lazada ─────────────────────────────────────────────────────────────────

async function syncLazadaAccount(account: LazadaAccountRow, since: Date) {
  const creds = await ensureLazadaToken(account, 'main');

  // ดึง ledger ทั้งช่วงแบบแบ่งหน้า — ค่าธรรมเนียมหนึ่งออเดอร์อาจกระจายข้ามหน้าได้
  // จึงต้องเก็บให้ครบก่อนค่อยประกอบ ไม่ประกอบทีละหน้า
  const rows: LazadaTransactionRow[] = [];
  const LIMIT = 500;
  for (let offset = 0; offset < 10_000; offset += LIMIT) {
    const { rows: page, error } = await getFinanceTransactions(creds, {
      startDate: fmtDate(since),
      endDate: fmtDate(new Date()),
      limit: LIMIT,
      offset,
    });
    if (error) return { error };
    rows.push(...(page as LazadaTransactionRow[]));
    if (page.length < LIMIT) break;
  }
  if (!rows.length) return { transactions: 0, matched: 0, charges: 0 };

  const { orders, accountCharges } = normalizeLazadaTransactions(rows);

  // จับคู่เลขออเดอร์ของ Lazada กับออเดอร์ในระบบเรา
  const orderNos = orders.map(o => o.orderNo);
  const ourOrders = new Map<string, { id: string; company_id: string }>();
  for (let i = 0; i < orderNos.length; i += 200) {
    const { data } = await supabaseAdmin
      .from('orders')
      .select('id, company_id, external_order_sn')
      .eq('company_id', account.company_id)
      .in('external_order_sn', orderNos.slice(i, i + 200));
    for (const o of data || []) {
      if (o.external_order_sn) ourOrders.set(o.external_order_sn, { id: o.id, company_id: o.company_id });
    }
  }

  const matchedIds = orders.map(o => ourOrders.get(o.orderNo)?.id).filter(Boolean) as string[];
  const cogsMap = await computeOrderCogs(matchedIds);

  let matched = 0;
  for (const group of orders) {
    const ours = ourOrders.get(group.orderNo);
    if (!ours) continue;   // ออเดอร์ยังไม่เคยเข้าระบบ — settlement รอจนกว่าจะ backfill ออเดอร์
    const saved = await saveSettlement({
      companyId: ours.company_id,
      orderId: ours.id,
      platform: 'lazada',
      marketplaceAccountId: account.id,
      normalized: group.normalized,
      cogs: cogsMap.get(ours.id) ?? { value: null, basis: null },
    });
    if (saved) matched++;
  }

  // ค่าใช้จ่ายที่ไม่ผูกออเดอร์ (Sponsored Affiliates, ค่าโปรแกรมสมาชิก)
  let charges = 0;
  if (accountCharges.length) {
    const chargeRows = accountCharges.map(c => ({
      company_id: account.company_id,
      marketplace_account_id: account.id,
      platform: 'lazada',
      charge_type: c.chargeType,
      description: c.description,
      amount: c.amount,
      currency: 'THB',
      occurred_at: c.occurredAt,
      source: 'lazada',
      external_ref: c.externalRef,
      raw: c.raw,
      updated_at: new Date().toISOString(),
    })).filter(r => r.external_ref);
    if (chargeRows.length) {
      const { error } = await supabaseAdmin
        .from('marketplace_account_charges')
        .upsert(chargeRows, { onConflict: 'marketplace_account_id,external_ref' });
      if (!error) charges = chargeRows.length;
    }
  }

  return {
    transactions: rows.length,
    orders_in_ledger: orders.length,
    matched,
    unmatched: orders.length - matched,
    charges,
  };
}

// ─── TikTok ─────────────────────────────────────────────────────────────────

async function syncTikTokAccount(account: TikTokAccountRow, since: Date) {
  const { data: ourOrders } = await supabaseAdmin
    .from('orders')
    .select('id, company_id, external_order_sn')
    .eq('company_id', account.company_id)
    .eq('marketplace_account_id', account.id)
    .not('external_order_sn', 'is', null)
    .gte('created_at', since.toISOString())
    .limit(200);

  if (!ourOrders?.length) return { orders: 0, processed: 0 };

  const creds = await ensureTikTokToken(account);
  const cogsMap = await computeOrderCogs(ourOrders.map(o => o.id));

  let processed = 0;
  let failed = 0;
  const unmapped = new Set<string>();
  const errors = new Set<string>();
  let pending = 0;  // ยังไม่ถึงรอบโอน — ไม่ใช่ความล้มเหลว รอบหน้าค่อยมาเก็บ

  for (const order of ourOrders) {
    const { statement, error } = await getOrderStatement(creds, order.external_order_sn!);
    if (error || !statement) {
      failed++;
      errors.add(error || 'statement ว่าง (ออเดอร์อาจยังไม่ถึงรอบจ่ายเงิน)');
      continue;
    }

    // การแมปของ TikTok ยังไม่เคยเจอข้อมูลจริง — เก็บชื่อฟิลด์ที่ยังไม่รู้จักไว้รายงาน
    unmappedTikTokFields(statement).forEach(f => unmapped.add(f));

    const normalized = normalizeTikTokStatement(statement, { orderId: order.external_order_sn });

    // ⚠️ ออเดอร์ที่ยังไม่ถึงรอบโอน TikTok ตอบ code 0 พร้อมค่า 0 ล้วน (ไม่ใช่ error)
    //    ถ้าเก็บลงเป็นแถว ฿0 รายงานกำไรจะอ่านว่า "ขายแล้วไม่ได้เงินเลย" ทั้งที่ความจริง
    //    คือ "ยังไม่ถึงรอบจ่าย" — ไม่มีแถวเลยซื่อสัตย์กว่าแถวที่บอกศูนย์
    if (normalized.lines.length === 0 && !normalized.netPayout) {
      pending++;
      continue;
    }

    const saved = await saveSettlement({
      companyId: order.company_id,
      orderId: order.id,
      platform: 'tiktok',
      marketplaceAccountId: account.id,
      normalized,
      cogs: cogsMap.get(order.id) ?? { value: null, basis: null },
    });
    if (saved) processed++; else failed++;
  }

  return {
    orders: ourOrders.length,
    processed,
    pending,
    failed,
    // ถ้ามีค่าในนี้ = มีค่าธรรมเนียมที่ยังไม่ได้แมป ต้องเพิ่มใน lib/tiktok/settlement.ts
    unmapped_fields: [...unmapped],
    errors: [...errors].slice(0, 5),
  };
}

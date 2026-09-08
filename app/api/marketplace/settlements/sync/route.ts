import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { logIntegrationNow } from '@/lib/integration-logger';
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
//
// **สาย cron ตอบ 200 ทันทีแล้วทำงานใน after()** — cron-job.org รอได้แค่ 30 วิ แต่งานนี้ใช้ได้ถึง
// 240 วิ ถ้าทำในสายที่ cron รอ job จะถูกนับว่าล้มทุกรอบแล้วโดนปิดเอง · ผลของแต่ละร้านลง
// integration_logs (action `settlement_sync`) ให้ดูย้อนหลังได้ · สายผู้ใช้ (กดจากหน้า) ยังรอผลเหมือนเดิม

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
    if (!can(auth, 'marketplace.sync')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    companyFilter = auth.companyId ?? null;
  }

  // 'all' = ไล่ทั้ง 3 เจ้าใน call เดียว — cron รายวันจะได้ตั้ง job เดียวพอ
  const SETTLEMENT_PLATFORMS: readonly SettlementPlatform[] = ['shopee', 'lazada', 'tiktok'];
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

  const isCron = authorizeCron(request);
  if (isCron) {
    after(async () => {
      const summary = await runSettlementSync(targets, days, companyFilter);
      console.log('[Settlement Sync] cron done', JSON.stringify(summary));
    });
    return NextResponse.json({ started: true, platforms: targets, days });
  }

  const byPlatform = await runSettlementSync(targets, days, companyFilter);
  return NextResponse.json({ platforms: targets, days, ...byPlatform });
}

type SettlementPlatform = 'shopee' | 'lazada' | 'tiktok';

/** ไล่ทุกร้านของทุกเจ้าที่ขอ — หยุดเองก่อนโดนตัด แล้วบอกว่าค้างตรงไหน (pattern เดียวกับงานยาวตัวอื่นในระบบ) */
async function runSettlementSync(
  targets: SettlementPlatform[],
  days: number,
  companyFilter: string | null,
): Promise<Record<string, unknown>> {
  const since = new Date(Date.now() - days * 86_400_000);
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
      const startedAt = Date.now();
      let r: Record<string, unknown>;
      try {
        r = target === 'shopee'
          ? await syncShopeeAccount(account as unknown as ShopeeAccountRow, since, deadline)
          : target === 'lazada'
            ? await syncLazadaAccount(account as unknown as LazadaAccountRow, since)
            : await syncTikTokAccount(account as unknown as TikTokAccountRow, since, deadline);
      } catch (err) {
        r = { error: err instanceof Error ? err.message : 'unknown' };
      }
      results.push({ shop: account.shop_name, ...r });

      // ผลรายร้านต้องมีที่ให้ดูย้อนหลัง — สาย cron ไม่มีใครเห็น response แล้ว (ทำใน after())
      // **await** เพราะอยู่ในงานเบื้องหลัง ปล่อยลอยแล้วโดน freeze ทิ้งพร้อมกัน
      const failed = !!r.error || (Array.isArray(r.errors) && r.errors.length > 0);
      await logIntegrationNow({
        company_id: account.company_id,
        integration: target,
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'outgoing',
        action: 'settlement_sync',
        response_body: r,
        status: failed ? 'error' : 'success',
        error_message: failed ? String(r.error || (r.errors as string[]).join('; ')) : undefined,
        reference_label: `ยอดโอน ${days} วัน`,
        duration_ms: Date.now() - startedAt,
      });
    }
    byPlatform[target] = { accounts: accounts.length, results };
  }

  return byPlatform;
}

// cron ยิงเป็น GET ได้ (cron-job.org ตั้ง GET ง่ายกว่า) — ไม่ใส่อะไร = POST { platform:'all', days:30 }
// แยก job ต่อเจ้าได้ด้วย `?platform=shopee|lazada|tiktok` — แต่ละ job ได้งบเวลา 300 วิของตัวเอง ไม่ต้อง
// รอคิวกัน (job เดียวเรียง Shopee → Lazada → TikTok ถ้าเจ้าแรกกินเวลาหมด เจ้าท้ายโดนข้ามทั้งรอบ)
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  return POST(new NextRequest(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ platform: q.get('platform') || 'all', days: Number(q.get('days')) || 30 }),
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
  // ร้านที่ยังไม่มีออเดอร์ในระบบเลย = ยังไงก็จับคู่ไม่ได้สักรายการ
  //
  // ต่างจาก Shopee/TikTok ที่ไล่จาก "ออเดอร์ของเรา" อยู่แล้ว — Lazada ต้องดึง ledger
  // ทั้งก้อนมาก่อนค่อยจับคู่ ร้านที่เพิ่งเชื่อม (ออเดอร์เริ่มนับจากวันเชื่อม ไม่ดูด
  // ประวัติย้อนหลัง) จึงถูกดึงร้อยกว่ารายการทุกวันเพื่อจับคู่ได้ 0 ตลอดไป
  // เช็คก่อน 1 query ถูกกว่าจ่ายโควตา API ทุกรอบ
  const { count: ordersInSystem } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('marketplace_account_id', account.id);
  if (!ordersInSystem) {
    return { skipped: true, reason: 'ยังไม่มีออเดอร์ของร้านนี้ในระบบ — ไม่มีอะไรให้จับคู่' };
  }

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

// เจอ 429 รอแล้วลองซ้ำก่อน — TikTok เองแนะนำ backoff+retry ไม่ใช่หยุดยาว (ดู fix-bug.md 2026-09-08)
const TIKTOK_RATE_LIMIT_RETRY_MS = [5_000, 10_000];

async function getOrderStatementWithRetry(
  creds: Parameters<typeof getOrderStatement>[0],
  orderId: string
): ReturnType<typeof getOrderStatement> {
  for (let attempt = 0; ; attempt++) {
    const result = await getOrderStatement(creds, orderId);
    if (!result.rateLimited || attempt >= TIKTOK_RATE_LIMIT_RETRY_MS.length) return result;
    await new Promise(r => setTimeout(r, TIKTOK_RATE_LIMIT_RETRY_MS[attempt]));
  }
}

async function syncTikTokAccount(account: TikTokAccountRow, since: Date, deadline: number) {
  const { data: candidates } = await supabaseAdmin
    .from('orders')
    .select('id, company_id, external_order_sn')
    .eq('company_id', account.company_id)
    .eq('marketplace_account_id', account.id)
    .not('external_order_sn', 'is', null)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(500);

  if (!candidates?.length) return { orders: 0, processed: 0 };

  // backfill = เอาเฉพาะใบที่ยังไม่มี settlement — ของเดิมยิงทุกใบใน 30 วันซ้ำทุกเช้า
  // (ร้าน 200 ใบ/เดือน = 200 call/วัน เพื่อได้ของใหม่ไม่กี่ใบ) · ใบที่ยังไม่ถึงรอบโอนไม่มีแถว
  // จึงถูกลองใหม่ทุกวันจนกว่าจะได้ ซึ่งคือพฤติกรรมที่ต้องการ
  const settled = new Set<string>();
  for (let i = 0; i < candidates.length; i += 200) {
    const { data } = await supabaseAdmin
      .from('marketplace_settlements')
      .select('order_id')
      .in('order_id', candidates.slice(i, i + 200).map(o => o.id));
    for (const row of data || []) settled.add(row.order_id as string);
  }
  const ourOrders = candidates.filter(o => !settled.has(o.id));
  if (!ourOrders.length) return { orders: candidates.length, already: settled.size, processed: 0 };

  const creds = await ensureTikTokToken(account);
  const cogsMap = await computeOrderCogs(ourOrders.map(o => o.id));

  let processed = 0;
  let failed = 0;
  let attempted = 0;
  let stopped: string | null = null;
  const unmapped = new Set<string>();
  const errors = new Set<string>();
  let pending = 0;  // ยังไม่ถึงรอบโอน — ไม่ใช่ความล้มเหลว รอบหน้าค่อยมาเก็บ

  for (const order of ourOrders) {
    if (Date.now() > deadline) { stopped = 'หมดงบเวลา — ยิงรอบใหม่ต่อได้'; break; }
    const { statement, error, rateLimited } = await getOrderStatementWithRetry(creds, order.external_order_sn!);
    if (rateLimited) {
      // รอแล้วลองซ้ำแล้วยังโดนหน่วง — ยิงใบต่อไปก็ล้มทั้งแถว หยุดรอบนี้ให้ cron พรุ่งนี้เก็บตก
      errors.add(error || 'rate limited');
      stopped = 'rate_limited';
      break;
    }
    attempted++;
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
    orders: candidates.length,
    already: settled.size,
    processed,
    pending,
    failed,
    remaining: ourOrders.length - attempted,
    ...(stopped ? { stopped } : {}),
    // ถ้ามีค่าในนี้ = มีค่าธรรมเนียมที่ยังไม่ได้แมป ต้องเพิ่มใน lib/tiktok/settlement.ts
    unmapped_fields: [...unmapped],
    errors: [...errors].slice(0, 5),
  };
}

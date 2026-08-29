import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import { computeOrderCogs, saveSettlement } from '@/lib/marketplace/settlement';
import { ensureValidToken as ensureLazadaToken, getFinanceTransactions, type LazadaAccountRow } from '@/lib/lazada/api';
import { normalizeLazadaTransactions, type LazadaTransactionRow } from '@/lib/lazada/settlement';
import { ensureValidToken as ensureTikTokToken, getOrderStatement, type TikTokAccountRow } from '@/lib/tiktok/api';
import { normalizeTikTokStatement, unmappedTikTokFields } from '@/lib/tiktok/settlement';

// ดึงยอด settlement จาก API ของแพลตฟอร์ม (ต่างจาก /backfill ที่แปลงจากข้อมูลที่เก็บไว้แล้ว)
//
// Shopee ไม่ต้องใช้ route นี้ — escrow ถูกดูดมาตอน sync ออเดอร์อยู่แล้ว ใช้ /backfill แทน
// Lazada  = ดึง ledger ตามช่วงวันที่ แล้วประกอบเป็นออเดอร์เอง
// TikTok  = ดึงทีละออเดอร์
//
// POST { platform: 'lazada'|'tiktok', days?: number }

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

  if (platform !== 'lazada' && platform !== 'tiktok') {
    return NextResponse.json(
      { error: "platform ต้องเป็น 'lazada' หรือ 'tiktok' — Shopee ใช้ /api/marketplace/settlements/backfill" },
      { status: 400 }
    );
  }

  // เช็ค breaker ของ scope finance ก่อนยิงเสมอ — ถ้าโควตาการเงินเต็มอยู่ ยิงไปก็ fail ทุกตัว
  const quota = await isQuotaBlocked(platform, 'finance');
  if (quota.blocked) {
    return NextResponse.json({ skipped: true, reason: 'quota_blocked', until: quota.until });
  }

  let accountQuery = supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('platform', platform)
    .eq('is_active', true);
  if (companyFilter) accountQuery = accountQuery.eq('company_id', companyFilter);
  const { data: accounts } = await accountQuery;

  if (!accounts?.length) {
    return NextResponse.json({ processed: 0, accounts: 0, note: 'ไม่มีร้านที่เชื่อมต่ออยู่' });
  }

  const since = new Date(Date.now() - days * 86_400_000);
  const results: Record<string, unknown>[] = [];

  for (const account of accounts) {
    try {
      const r = platform === 'lazada'
        ? await syncLazadaAccount(account as unknown as LazadaAccountRow, since)
        : await syncTikTokAccount(account as unknown as TikTokAccountRow, since);
      results.push({ shop: account.shop_name, ...r });
    } catch (err) {
      results.push({ shop: account.shop_name, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return NextResponse.json({ platform, days, accounts: accounts.length, results });
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
    failed,
    // ถ้ามีค่าในนี้ = มีค่าธรรมเนียมที่ยังไม่ได้แมป ต้องเพิ่มใน lib/tiktok/settlement.ts
    unmapped_fields: [...unmapped],
    errors: [...errors].slice(0, 5),
  };
}

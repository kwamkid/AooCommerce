// บันทึกยอด settlement ลง DB — ใช้ร่วมทุก platform (server-only)
//
// ตัว platform แต่ละเจ้าทำหน้าที่แค่แปลงข้อมูลของตัวเองเป็น NormalizedSettlement
// (lib/shopee/settlement.ts, lib/tiktok/settlement.ts, …) แล้วส่งมาที่นี่ที่เดียว
// → เพิ่ม marketplace ใหม่ไม่ต้องเขียน logic เขียน DB ซ้ำ

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRowsByIds } from '@/lib/supabase-paging';
import { FEE_BUCKETS, type NormalizedSettlement } from './fee-types';

export interface SaveSettlementParams {
  companyId: string;
  orderId: string;
  platform: string;
  marketplaceAccountId?: string | null;
  normalized: NormalizedSettlement;
  /** ส่งมาเองได้ถ้าคำนวณไว้แล้ว (ตอน backfill เป็นชุด) — ไม่ส่ง = ไปดึงจาก order_items ให้ */
  cogs?: { value: number | null; basis: CogsBasis };
}

/**
 * ที่มาของต้นทุน — ต้องบอกให้ชัดเสมอว่าตัวเลขกำไรเชื่อได้แค่ไหน
 * snapshot = unit_cost ตอนขายครบทุกชิ้น (แม่นที่สุด)
 * mixed    = บางชิ้นไม่มี unit_cost เลยใช้ WAC ปัจจุบันแทน
 * wac      = ไม่มี unit_cost เลย ใช้ WAC ปัจจุบันล้วน (ต้นทุนอาจเปลี่ยนไปแล้วตั้งแต่วันขาย)
 * null     = ไม่รู้ต้นทุน → gross_profit เป็น null ไม่ใช่ 0
 */
export type CogsBasis = 'snapshot' | 'mixed' | 'wac' | null;

/**
 * คิดต้นทุนของออเดอร์จาก unit_cost ที่สแนปช็อตไว้ตอนขาย
 * ชิ้นที่ไม่มี unit_cost จะ fallback ไป WAC ปัจจุบันของ variation นั้น และทำเครื่องหมายไว้
 *
 * ⚠️ ห้ามใช้ฟิลด์ cost_of_goods_sold ของ Shopee แทน — Shopee ใช้คำนั้นหมายถึงราคาที่
 *    ลูกค้าจ่าย ไม่ใช่ต้นทุนผู้ขาย (ยืนยันจากข้อมูลจริง: เท่ากับ order_original_price ทุกแถว)
 */
export async function computeOrderCogs(
  orderIds: string[]
): Promise<Map<string, { value: number | null; basis: CogsBasis }>> {
  const out = new Map<string, { value: number | null; basis: CogsBasis }>();
  if (!orderIds.length) return out;

  // ⚠️ ผลของฟังก์ชันนี้ถูกเขียนลง `marketplace_settlements` ถาวร — ขาดไปแถวเดียว
  //    กำไรขั้นต้นของออเดอร์นั้นก็ผิดค้างอยู่ใน DB · ผู้เรียก backfill ส่งมาได้ทีละ 500 ใบ
  //    ซึ่งมีรายการสินค้ารวมกันเกิน 1,000 แถวสบาย ๆ
  const { rows: items } = await fetchAllRowsByIds<{
    order_id: string; variation_id: string | null; quantity: number; unit_cost: number | null;
  }>(orderIds, (idChunk, from, to) => supabaseAdmin
    .from('order_items')
    .select('order_id, variation_id, quantity, unit_cost')
    .in('order_id', idChunk)
    .order('id')
    .range(from, to));

  if (!items?.length) {
    orderIds.forEach(id => out.set(id, { value: null, basis: null }));
    return out;
  }

  // ดึง WAC ปัจจุบันมาเผื่อเฉพาะ variation ที่ไม่มี unit_cost
  const needWac = [...new Set(
    items.filter(i => i.unit_cost == null || Number(i.unit_cost) <= 0)
      .map(i => i.variation_id).filter(Boolean)
  )] as string[];

  const wac = new Map<string, number>();
  if (needWac.length) {
    for (let i = 0; i < needWac.length; i += 500) {
      const { data } = await supabaseAdmin
        .from('product_variations')
        .select('id, cost_price')
        .in('id', needWac.slice(i, i + 500));
      for (const v of data || []) {
        if (v.cost_price != null && Number(v.cost_price) > 0) wac.set(v.id, Number(v.cost_price));
      }
    }
  }

  const acc = new Map<string, { total: number; snapshot: number; fallback: number; unknown: number }>();
  for (const it of items) {
    const a = acc.get(it.order_id) || { total: 0, snapshot: 0, fallback: 0, unknown: 0 };
    const qty = Number(it.quantity) || 0;
    const snap = it.unit_cost != null ? Number(it.unit_cost) : 0;
    if (snap > 0) {
      a.total += snap * qty; a.snapshot++;
    } else {
      const fallback = it.variation_id ? wac.get(it.variation_id) : undefined;
      if (fallback) { a.total += fallback * qty; a.fallback++; }
      else a.unknown++;
    }
    acc.set(it.order_id, a);
  }

  for (const id of orderIds) {
    const a = acc.get(id);
    if (!a || a.snapshot + a.fallback === 0) { out.set(id, { value: null, basis: null }); continue; }
    // ยังมีชิ้นที่ไม่รู้ต้นทุนเลย = ตัวเลขไม่ครบออเดอร์ → ไม่รายงานกำไร ดีกว่ารายงานเกินจริง
    if (a.unknown > 0) { out.set(id, { value: null, basis: null }); continue; }
    const basis: CogsBasis = a.fallback === 0 ? 'snapshot' : (a.snapshot === 0 ? 'wac' : 'mixed');
    out.set(id, { value: Math.round(a.total * 100) / 100, basis });
  }
  return out;
}

/** เขียน settlement + บรรทัดค่าธรรมเนียมของออเดอร์เดียว (idempotent — เรียกซ้ำได้) */
export async function saveSettlement(params: SaveSettlementParams): Promise<{ id: string } | null> {
  const { companyId, orderId, platform, marketplaceAccountId, normalized } = params;

  const cogs = params.cogs ?? (await computeOrderCogs([orderId])).get(orderId) ?? { value: null, basis: null };

  const row: Record<string, unknown> = {
    company_id: companyId,
    order_id: orderId,
    platform,
    marketplace_account_id: marketplaceAccountId ?? null,
    external_order_id: normalized.externalOrderId ?? null,
    currency: normalized.currency || 'THB',
    statement_period: normalized.statementPeriod ?? null,
    settled_at: normalized.settledAt ?? null,
    paid_status: normalized.paidStatus ?? null,
    net_payout: normalized.netPayout,
    buyer_paid: normalized.buyerPaid ?? null,
    cogs: cogs.value,
    cogs_basis: cogs.basis,
    raw: normalized.raw,
    updated_at: new Date().toISOString(),
  };
  for (const b of FEE_BUCKETS) row[b] = normalized.buckets[b];

  const { data: settlement, error } = await supabaseAdmin
    .from('marketplace_settlements')
    .upsert(row, { onConflict: 'order_id' })
    .select('id')
    .single();

  if (error || !settlement) {
    console.error('[Settlement] upsert failed', orderId, error?.message);
    return null;
  }

  if (normalized.lines.length) {
    const lineRows = normalized.lines.map(l => ({
      company_id: companyId,
      settlement_id: settlement.id,
      external_item_id: l.externalItemId ?? null,
      platform_fee_code: l.platformFeeCode,
      platform_fee_name: l.platformFeeName,
      bucket: l.bucket,
      amount: l.amount,
      vat: l.vat ?? 0,
      wht: l.wht ?? 0,
      occurred_at: l.occurredAt ?? null,
      line_key: l.lineKey,
    }));
    const { error: lineErr } = await supabaseAdmin
      .from('marketplace_settlement_lines')
      .upsert(lineRows, { onConflict: 'settlement_id,line_key' });
    if (lineErr) console.error('[Settlement] lines upsert failed', orderId, lineErr.message);
  }

  return { id: settlement.id };
}

// ─── ดึงยอดของออเดอร์ใบเดียว (ผู้ใช้กดจากหน้าออเดอร์) ───────────────────────

export type SyncOrderSettlementStatus = 'saved' | 'pending' | 'unsupported' | 'error';

export interface SyncOrderSettlementResult {
  status: SyncOrderSettlementStatus;
  message?: string;
  /** platform ของร้านที่ออเดอร์นี้ผูกอยู่ — ผู้เรียกใช้ทำ log / เช็คโควตา */
  platform?: string | null;
  accountId?: string | null;
}

/**
 * ถามแพลตฟอร์มว่าออเดอร์ใบนี้ได้เงินเท่าไหร่ แล้วบันทึกผ่าน `saveSettlement()`
 *
 * ชั้นกลางตัวนี้ **ไม่รู้จักชื่อ platform เลย** — งานเฉพาะเจ้าอยู่ใน adapter
 * (`lib/<platform>/settlement-adapter.ts`) ตามทะเบียน `SETTLEMENT_ADAPTERS`
 *
 * ผู้เรียกต้องเช็ค `isQuotaBlocked(platform, 'finance')` เองก่อน (route ทำให้แล้ว)
 * — ตัวนี้ไม่เช็คให้เพราะยังไม่รู้ platform จนกว่าจะโหลดร้านเสร็จ
 */
export async function syncOrderSettlement(
  orderId: string,
  companyId: string,
): Promise<SyncOrderSettlementResult> {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, company_id, external_order_sn, created_at, marketplace_account_id')
    .eq('id', orderId)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!order) return { status: 'error', message: 'ไม่พบออเดอร์นี้' };
  if (!order.marketplace_account_id) {
    return { status: 'unsupported', message: 'ออเดอร์นี้ไม่ได้มาจากร้านบนแพลตฟอร์ม' };
  }

  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', order.marketplace_account_id)
    .eq('company_id', companyId)
    .maybeSingle();

  if (!account) return { status: 'error', message: 'ไม่พบร้านที่ผูกกับออเดอร์นี้' };

  const platform = (account.platform as string | null) ?? null;

  // โหลดทะเบียน adapter แบบ dynamic — ไม่งั้นทุกไฟล์ที่ import `saveSettlement`
  // (เช่น lib/shopee/sync.ts ที่ webhook ใช้) จะลาก API client ของอีก 2 เจ้าเข้าไปด้วย
  const { getSettlementAdapter } = await import('./settlement-adapter');
  const adapter = getSettlementAdapter(platform);
  if (!adapter) {
    return { status: 'unsupported', message: 'แพลตฟอร์มนี้ยังดึงยอดเงินรายออเดอร์ไม่ได้', platform, accountId: account.id };
  }

  if (!order.external_order_sn) {
    return { status: 'error', message: 'ออเดอร์นี้ไม่มีเลขออเดอร์ของแพลตฟอร์ม', platform, accountId: account.id };
  }

  let fetched;
  try {
    fetched = await adapter.fetchOrderSettlement(account, {
      id: order.id,
      company_id: order.company_id,
      external_order_sn: order.external_order_sn,
      created_at: order.created_at,
    });
  } catch (err) {
    return {
      status: 'error',
      message: err instanceof Error ? err.message : 'ดึงยอดเงินไม่สำเร็จ',
      platform,
      accountId: account.id,
    };
  }

  // ยังไม่ถึงรอบโอน — **ห้ามบันทึกเป็นแถว ฿0** (รายงานจะอ่านว่าขายแล้วไม่ได้เงิน)
  if (!fetched || fetched === 'pending') {
    return { status: 'pending', platform, accountId: account.id };
  }

  const cogs = (await computeOrderCogs([order.id])).get(order.id) ?? { value: null, basis: null };
  const saved = await saveSettlement({
    companyId,
    orderId: order.id,
    platform: platform || '',
    marketplaceAccountId: account.id,
    normalized: fetched,
    cogs,
  });

  if (!saved) return { status: 'error', message: 'บันทึกยอดเงินไม่สำเร็จ', platform, accountId: account.id };
  return { status: 'saved', platform, accountId: account.id };
}

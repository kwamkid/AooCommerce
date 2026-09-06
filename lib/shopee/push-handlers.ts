// Path: lib/shopee/push-handlers.ts
//
// Push ของ Shopee ที่ "ไม่ใช่ออเดอร์และไม่ใช่แชท" — เรื่องระดับร้านกับระดับสินค้า
//   code 1  shop_authorization_push          ร้าน authorize app เรา
//   code 2  shop_authorization_canceled_push ร้านถอน authorization
//   code 8  reserved_stock_change_push       ยอดจองของ Shopee เปลี่ยน (flash sale ฯลฯ)
//   code 16 violation_item_push              สินค้าถูกแจ้งละเมิดกฎประกาศขาย
//   code 22 item_price_update_push           ราคาบนประกาศเปลี่ยน
//   code 28 shop_penalty_update_push         คะแนนโทษของร้านเปลี่ยน
//
// ใช้ร่วมกัน 2 ทาง (เหมือน syncSingleOrder / processShopeeWebchatPush):
//   • /api/shopee/webhook        — push จริงที่เข้ามา
//   • /api/shopee/webhook/retry  — ใบที่ทำไม่สำเร็จ (worker กลาง)
//
// สัญญาของฟังก์ชันนี้ (worker กลางออกแบบไว้แบบนี้):
//   • **throw** = ล้มเหลวจริง → ให้ retry (เช่น update DB ไม่ผ่าน — code 2 ที่ปิดร้าน
//     ไม่สำเร็จห้ามหายเงียบ ไม่งั้นระบบเชื่อว่าร้านยังเชื่อมอยู่ทั้งที่ไม่แล้ว)
//   • **return** = จบแล้ว ไม่ต้องทำซ้ำ (รวมถึงเคส "ร้านนี้ไม่ได้เชื่อมกับเรา" / "ยังไม่ได้
//     ผูกสินค้าตัวนี้" ซึ่งเป็น skipped ไม่ใช่ failed — ใส่เป็น failed แล้ว retry worker
//     จะวนหยิบไปจนกลายเป็น dead_letter โดยไม่มีทางสำเร็จ)
//
// ⚠️ **ห้ามให้ push พวกนี้ไปแตะ product_variations หรือ inventory** — ราคาของ Shopee
// อยู่บน marketplace_product_links เท่านั้น (ราคาในระบบเราเป็นของร้าน ไม่ใช่ของ Shopee)
// และสต็อกจริงเปลี่ยนได้จากออเดอร์/รับเข้าเท่านั้น · reserved_stock เป็นบัญชีฝั่ง Shopee
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logIntegrationNow } from '@/lib/integration-logger';
import { sendPushToCompany } from '@/lib/push/send';
import type { ShopeeAccountRow } from '@/lib/shopee/api';

/** ปลายทางเมื่อกดแจ้งเตือน — ห้ามใส่ `#hash` เพราะ withCompanyParam() ต่อ `&company=`
 *  ท้าย string ค่านั้นจะไปตกอยู่ใน fragment แล้วแอปสลับบริษัทให้ไม่ได้ */
const MARKETPLACE_SETTINGS_URL = '/settings/sales-channels?tab=marketplace';

/** เรื่องเก่ากว่านี้ไม่ยิงแจ้งเตือน (ยังประมวลผล+log ตามปกติ) — กัน retry/backfill ปลุกเครื่องทั้งบริษัท */
const PUSH_MAX_AGE_MS = 30 * 60 * 1000;

export interface ShopeePushPayload {
  /** Shopee ส่งมาเป็นตัวเลข "หรือสตริง" แล้วแต่ push (code 28 เป็นสตริงทั้งใบ) — coerce ก่อนใช้เสมอ */
  shop_id?: number | string;
  code?: number | string;
  /** วินาที epoch (string ก็มี) */
  timestamp?: number | string;
  msg_id?: string;
  data?: Record<string, unknown>;
}

export interface ShopeeShopEventResult {
  /** ลงคอลัมน์ processing_status ของ marketplace_webhook_log ตรง ๆ */
  status: 'processed' | 'skipped';
  detail?: string;
}

/** push code ที่ไฟล์นี้รับผิดชอบ */
export const SHOPEE_SHOP_EVENT_CODES = [1, 2, 8, 16, 22, 28] as const;

export function isShopEventPushCode(code: number): boolean {
  return (SHOPEE_SHOP_EVENT_CODES as readonly number[]).includes(code);
}

const ACTIONS: Record<number, string> = {
  1: 'webhook_shop_authorization',
  2: 'webhook_shop_deauthorized',
  8: 'webhook_reserved_stock',
  16: 'webhook_item_violation',
  22: 'webhook_item_price_update',
  28: 'webhook_shop_penalty',
};

// ─── ตัวช่วยอ่านค่าจาก payload แบบไม่เชื่อชนิดข้อมูล ────────────────────

/**
 * แปลงเป็นตัวเลข — รับทั้ง number และ string ("28" ต้องได้ 28)
 * คืน null เมื่อแปลงไม่ได้ เพื่อให้ผู้เรียกแยก "ไม่มีค่า" ออกจาก "ค่าเป็น 0" ได้
 */
export function toShopeeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** อ่าน sub-object ของ payload.data แบบปลอดภัย (Shopee อาจไม่ส่งมาเลย) */
function subObject(data: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const v = data[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** อ่าน array ของ object แบบปลอดภัย */
function subArray(data: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = data[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x));
}

/** หยิบค่าตัวเลขตัวแรกที่เจอจากรายชื่อ key (ทน string) */
function firstNumber(source: Record<string, unknown> | null, keys: string[]): number | null {
  if (!source) return null;
  for (const k of keys) {
    const n = toShopeeNumber(source[k]);
    if (n !== null) return n;
  }
  return null;
}

/** อ่านข้อความแบบไม่ throw — ค่าที่ไม่ใช่ string/number คืน null */
function text(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

/** push นี้สดพอจะแจ้งเตือนไหม — ไม่มี timestamp ให้ถือว่าสด (Shopee ส่งมาเสมอในทางปฏิบัติ) */
function isFreshEnoughForPush(payload: ShopeePushPayload): boolean {
  const ts = toShopeeNumber(payload.timestamp);
  if (ts === null) return true;
  // Shopee ส่งเป็นวินาที — เผื่อกรณีส่งมาเป็นมิลลิวินาทีไว้ด้วย (ค่าเกิน ~ปี 2001 ในหน่วย ms)
  const ms = ts > 1e12 ? ts : ts * 1000;
  return Date.now() - ms <= PUSH_MAX_AGE_MS;
}

function shopLabel(account: ShopeeAccountRow): string {
  return account.shop_name || `Shopee ${account.shop_id}`;
}

/** merge metadata เดิมเสมอ — เขียนทับทั้งก้อนจะล้างของที่ผู้ใช้ตั้งเอง (เช่น shop_logo, shopee_app) */
function mergedMetadata(
  account: ShopeeAccountRow,
  patch: Record<string, unknown>,
  removeKeys: string[] = [],
): Record<string, unknown> {
  const meta = { ...(account.metadata || {}) } as Record<string, unknown>;
  for (const k of removeKeys) delete meta[k];
  return { ...meta, ...patch };
}

// ─── หา link ของสินค้า ───────────────────────────────────────────────

interface ShopeeLinkRow {
  id: string;
  product_id: string | null;
  variation_id: string | null;
  external_model_id: string | null;
  platform_data: Record<string, unknown> | null;
}

/**
 * หา marketplace_product_links ของ (บริษัท, item, model)
 *
 * สินค้าแบบไม่มีตัวเลือกเก็บ `external_model_id = '0'` (720 แถวในระบบจริง ไม่มี null/ว่างเลย)
 * แต่ Shopee ส่ง model_id มาเป็นเลขจริงบ้าง/0 บ้าง จึงเทียบแบบยืดหยุ่น:
 * ตรงเป๊ะก่อน → ถ้าไม่เจอและ item นั้นมี link เดียว ก็คือตัวนั้นแหละ (สินค้าไม่มีตัวเลือก)
 */
async function findShopeeLink(
  companyId: string,
  itemId: string,
  modelId: string | null,
): Promise<ShopeeLinkRow | null> {
  const { data } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('id, product_id, variation_id, external_model_id, platform_data')
    .eq('company_id', companyId)
    .eq('platform', 'shopee')
    .eq('external_item_id', itemId);

  const rows = (data || []) as ShopeeLinkRow[];
  if (rows.length === 0) return null;

  const wanted = modelId ?? '0';
  const exact = rows.find(r => String(r.external_model_id ?? '0') === wanted);
  if (exact) return exact;

  // ไม่ตรง model แต่ประกาศนี้มีตัวเดียว = สินค้าไม่มีตัวเลือก → ตัวนั้นคือคำตอบ
  // (มีหลายตัวแล้วเดาไม่ได้ ต้องยอมข้าม ดีกว่าเขียนราคาผิดตัว)
  return rows.length === 1 ? rows[0] : null;
}

/** merge เข้า platform_data ของ link (อ่านมาแล้วจาก findShopeeLink — ห้ามเขียนทับทั้งก้อน) */
async function patchLinkPlatformData(
  link: ShopeeLinkRow,
  patch: Record<string, unknown>,
  extraColumns: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('marketplace_product_links')
    .update({
      ...extraColumns,
      platform_data: { ...(link.platform_data || {}), ...patch },
      updated_at: new Date().toISOString(),
    })
    .eq('id', link.id);
  if (error) throw new Error(`Failed to update link ${link.id}: ${error.message}`);
}

// ─── ตัวกระจายงาน ────────────────────────────────────────────────────

/**
 * ประมวลผล push ที่ไม่ใช่ออเดอร์/แชท (1 / 2 / 8 / 16 / 22 / 28)
 *
 * @param account ร้านในระบบเรา — **อาจเป็นร้านที่ปิดอยู่** (code 1 ต้องปลุกร้านที่ปิดไปแล้ว)
 *                null = ร้านนี้ไม่เคยเชื่อมกับเรา → skipped ไม่ใช่ failed
 */
export async function handleShopeeShopEvent(
  pushCode: number,
  payload: ShopeePushPayload,
  account: ShopeeAccountRow | null,
  opts: { startedAt?: number } = {},
): Promise<ShopeeShopEventResult> {
  if (!account) {
    // ร้านที่ไม่ได้อยู่ในระบบเรา (เช่น authorize ไว้กับ app แต่ยังไม่ผ่าน OAuth ของเรา)
    // — ไม่มี company_id ให้ลง integration_logs ด้วยซ้ำ · ต้องเป็น skipped เท่านั้น
    // ไม่งั้น retry worker จะวนหยิบใบนี้จนกลายเป็น dead_letter โดยเปล่าประโยชน์
    const shopId = toShopeeNumber(payload.shop_id);
    return {
      status: 'skipped',
      detail: `shop ${shopId ?? payload.shop_id} not connected in this system — event on Shopee side only`,
    };
  }

  switch (pushCode) {
    case 1:
      return handleShopAuthorized(payload, account, opts);
    case 2:
      return handleShopDeauthorized(payload, account, opts);
    case 8:
      return handleReservedStockChange(payload, account, opts);
    case 16:
      return handleItemViolation(payload, account, opts);
    case 22:
      return handleItemPriceUpdate(payload, account, opts);
    case 28:
      return handleShopPenalty(payload, account, opts);
    default:
      return { status: 'skipped', detail: `Unhandled push code: ${pushCode}` };
  }
}

/** log ขาเข้าแบบ await — push พวกนี้มีน้อยมาก แต่หายไม่ได้ (เป็นหลักฐานเดียวว่ารู้เรื่องแล้ว) */
async function logShopEvent(
  account: ShopeeAccountRow,
  pushCode: number,
  payload: ShopeePushPayload,
  reference: { type: string; id?: string; label: string },
  startedAt?: number,
): Promise<void> {
  await logIntegrationNow({
    company_id: account.company_id,
    integration: 'shopee',
    account_id: account.id,
    account_name: account.shop_name,
    direction: 'incoming',
    action: ACTIONS[pushCode] || `webhook_push_${pushCode}`,
    method: 'POST',
    api_path: '/api/shopee/webhook',
    // เก็บ data ทั้งก้อนเสมอ — โครงของ push พวกนี้ยังไม่นิ่ง ต้องมีของจริงไว้เทียบ
    request_body: payload.data ?? payload,
    status: 'success',
    reference_type: reference.type,
    reference_id: reference.id,
    reference_label: reference.label,
    duration_ms: startedAt ? Date.now() - startedAt : undefined,
  });
}

// ─── code 1 — ร้าน authorize app ─────────────────────────────────────

/**
 * ⚠️ **ยังไม่เคยเห็น payload จริงของ code 1** — จงใจไม่อ่านฟิลด์ใน data เลย
 * ใช้แค่ `shop_id` ระดับบนสุด (มีทุก push) แล้วอ้างอิงร้านจาก account ที่ผู้เรียกหามาให้
 */
async function handleShopAuthorized(
  payload: ShopeePushPayload,
  account: ShopeeAccountRow,
  opts: { startedAt?: number },
): Promise<ShopeeShopEventResult> {
  const nowIso = new Date().toISOString();
  let detail: string;

  if (!account.is_active) {
    // ร้านเคยถูกปิด (token ตาย / กดยกเลิกไปก่อนหน้า) แล้ว authorize กลับมา → ปลุกทันที
    // ไม่ต้องรอให้เจ้าของร้านมากดเชื่อมใหม่ ระบบจึงเลิกขึ้นเตือน "หลุดการเชื่อมต่อ" เอง
    //
    // ลบ deauthorized_* ทิ้งด้วย — metadata อ่านเป็น "สถานะปัจจุบัน" ไม่ใช่สมุดบันทึก
    // ปล่อยค้างไว้จะอ่านได้ว่าร้านยังหลุดอยู่ทั้งที่กลับมาแล้ว
    const { error } = await supabaseAdmin
      .from('marketplace_accounts')
      .update({
        is_active: true,
        updated_at: nowIso,
        metadata: mergedMetadata(account, { reauthorized_at: nowIso }, ['deauthorized_at', 'deauthorized_via']),
      })
      .eq('id', account.id);
    if (error) throw new Error(`Failed to reactivate shop ${account.shop_id}: ${error.message}`);
    detail = `Shop ${account.shop_id} re-authorized → reactivated`;
  } else {
    // authorize ซ้ำระหว่างที่ร้านยังเปิดอยู่ (re-authorize ตามปกติ) — OAuth callback
    // เขียน token ให้แล้ว ที่นี่ไม่ต้องแตะอะไร แค่บันทึกว่ารู้เรื่อง
    detail = `Shop ${account.shop_id} authorized (already active — no change)`;
  }

  await logShopEvent(account, 1, payload, { type: 'marketplace_account', id: account.id, label: detail }, opts.startedAt);

  // ไม่ยิงแจ้งเตือน — การ authorize เป็นสิ่งที่ผู้ใช้เพิ่งทำเอง ไม่มีอะไรต้องบอกให้ไปทำต่อ
  return { status: 'processed', detail };
}

// ─── code 2 — ร้านถอน authorization ──────────────────────────────────

/** ⚠️ **ยังไม่เคยเห็น payload จริง** — ใช้แค่ `shop_id` ระดับบนสุดซึ่งมีเสมอ */
async function handleShopDeauthorized(
  payload: ShopeePushPayload,
  account: ShopeeAccountRow,
  opts: { startedAt?: number },
): Promise<ShopeeShopEventResult> {
  const nowIso = new Date().toISOString();

  // ปิดร้านทันที — ไม่ปิดแล้ว cron จะยิง API ด้วย token ที่ใช้ไม่ได้ทุก 15 นาที
  // (success rate ตก) และหน้าจอจะยังบอกว่าร้านเชื่อมอยู่
  const { error } = await supabaseAdmin
    .from('marketplace_accounts')
    .update({
      is_active: false,
      updated_at: nowIso,
      metadata: mergedMetadata(account, { deauthorized_at: nowIso, deauthorized_via: 'push' }),
    })
    .eq('id', account.id);
  // throw → worker retry ให้ · ปล่อยผ่านไม่ได้เด็ดขาด ระบบจะเชื่อว่าร้านยังเชื่อมอยู่
  if (error) throw new Error(`Failed to deactivate shop ${account.shop_id}: ${error.message}`);

  const detail = `Shop ${account.shop_id} deauthorized → is_active=false`;
  await logShopEvent(account, 2, payload, { type: 'marketplace_account', id: account.id, label: detail }, opts.startedAt);

  // watchdog จะขึ้น "Shopee หลุดการเชื่อมต่อ" ให้เองจากร้านที่ is_active=false + มี refresh_token
  // (lib/marketplace/watchdog.ts) — push ตัวนี้คือการบอก "เดี๋ยวนี้" ไม่ต้องรอรอบ watchdog
  if (isFreshEnoughForPush(payload)) {
    await sendPushToCompany(account.company_id, {
      title: `ร้าน ${shopLabel(account)} ยกเลิกการเชื่อมต่อ Shopee`,
      body: 'ออเดอร์และแชทใหม่จะไม่เข้าระบบ — กดเชื่อมต่อใหม่ที่ ตั้งค่า → ช่องทางการขาย',
      url: MARKETPLACE_SETTINGS_URL,
      tag: `shopee-deauth-${account.shop_id}`,
    });
  }

  return { status: 'processed', detail };
}

// ─── code 28 — คะแนนโทษของร้านเปลี่ยน ────────────────────────────────

/**
 * ตัวอย่างจริงจาก test push ของ Shopee — **ตัวเลขมาเป็นสตริงทุกตัว รวมถึง code/shop_id**:
 *   { "code":"28", "shop_id":"484829995", "timestamp":"1739352263",
 *     "data": { "action_type":"2", "update_time":"1739352219524",
 *               "points_removed_data": { "removed_points":"1", "violation_type":"37" } } }
 *
 * action_type 2 = ลบคะแนน (points_removed_data / removed_points) ← ยืนยันแล้ว
 * action_type 1 = เพิ่มคะแนน — **ยังไม่เคยเห็นของจริง** คาดว่าเป็น points_added_data / added_points
 */
async function handleShopPenalty(
  payload: ShopeePushPayload,
  account: ShopeeAccountRow,
  opts: { startedAt?: number },
): Promise<ShopeeShopEventResult> {
  const data = payload.data || {};
  const actionType = toShopeeNumber(data.action_type);
  const addedData = subObject(data, 'points_added_data');
  const removedData = subObject(data, 'points_removed_data');

  // เชื่อ action_type ก่อน แต่ถ้าไม่มี/ไม่รู้จัก ให้เดาจาก sub-object ที่ส่งมาจริง
  // (สองทางนี้ขัดกันได้ถ้า Shopee เปลี่ยนโครง — ยึดของที่มีข้อมูลจริงเป็นหลัก)
  const isAdded = actionType === 2 ? false : actionType === 1 ? !removedData || !!addedData : !!addedData;
  const detailObj = (isAdded ? addedData : removedData) || addedData || removedData;

  const points = firstNumber(detailObj, ['added_points', 'removed_points', 'points']);
  const violationType = firstNumber(detailObj, ['violation_type']) ?? firstNumber(data, ['violation_type']);

  const pointsText = points === null ? 'คะแนนโทษมีการเปลี่ยนแปลง' : `${isAdded ? '+' : '-'}${points} คะแนน`;
  // ไม่มีพจนานุกรมรหัสความผิด — แสดงรหัสดิบ ดีกว่าเดาความหมายให้ผู้ใช้เข้าใจผิด
  const body = `${pointsText}${violationType === null ? '' : ` (violation_type ${violationType})`}`;

  await logShopEvent(
    account, 28, payload,
    { type: 'marketplace_account', id: account.id, label: `Penalty ${body}` },
    opts.startedAt,
  );

  if (isFreshEnoughForPush(payload)) {
    await sendPushToCompany(account.company_id, {
      title: `คะแนนโทษ Shopee ของ ${shopLabel(account)} เปลี่ยน`,
      body,
      url: MARKETPLACE_SETTINGS_URL,
      // แต่ละครั้งเป็นคนละเรื่อง — tag ต้องต่างกัน ไม่งั้นใบใหม่ลบใบเก่าที่ยังไม่ได้อ่านทิ้ง
      tag: `shopee-penalty-${account.shop_id}-${toShopeeNumber(data.update_time) ?? toShopeeNumber(payload.timestamp) ?? Date.now()}`,
    });
  }

  return { status: 'processed', detail: `Penalty ${body}` };
}

// ─── code 16 — สินค้าถูกแจ้งละเมิด ───────────────────────────────────

/**
 * payload จริง:
 *   data: { deboost, item_id, item_name, item_status: "BANNED",
 *           item_status_details: [{ suggestion, update_time, violation_type, violation_reason }] }
 *
 * ข้อความแจ้งเตือนใช้ detail ใบแรก + `(+N)` เมื่อมีมากกว่าหนึ่งข้อ — ไม่ยัดทุกข้อลง
 * notification (อ่านไม่ไหว) ของครบอยู่ใน integration log แล้ว
 */
async function handleItemViolation(
  payload: ShopeePushPayload,
  account: ShopeeAccountRow,
  opts: { startedAt?: number },
): Promise<ShopeeShopEventResult> {
  const data = payload.data || {};
  const itemIdNum = toShopeeNumber(data.item_id);
  const itemId = itemIdNum !== null ? String(itemIdNum) : null;
  const itemName = text(data.item_name);
  const itemStatus = text(data.item_status);

  const details = subArray(data, 'item_status_details');
  const firstReason = details.length > 0
    ? (text(details[0].violation_reason) || text(details[0].violation_type))
    : null;
  const more = details.length > 1 ? ` (+${details.length - 1})` : '';

  // หาสินค้าในระบบเรา เพื่อให้กดแจ้งเตือนแล้วไปถึงตัวที่มีปัญหาเลย
  // (หาไม่เจอ = ยังไม่ได้ผูกสินค้าตัวนั้น → พาไปหน้าช่องทางการขายแทน ไม่ใช่ error)
  let productId: string | null = null;
  if (itemId) {
    const { data: link } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('product_id')
      .eq('company_id', account.company_id)
      .eq('platform', 'shopee')
      .eq('external_item_id', itemId)
      .not('product_id', 'is', null)
      .limit(1)
      .maybeSingle();
    productId = (link?.product_id as string) || null;
  }

  // `{item_name}: {item_status} — {violation_reason}` โดยข้ามท่อนที่ Shopee ไม่ได้ส่งมา
  const head = [itemName || (itemId ? `สินค้า Shopee #${itemId}` : 'สินค้า'), itemStatus]
    .filter(Boolean).join(': ');
  const body = `${[head, firstReason].filter(Boolean).join(' — ')}${more}`;

  await logShopEvent(
    account, 16, payload,
    { type: 'product', id: productId || itemId || undefined, label: `Item violation: ${body}` },
    opts.startedAt,
  );

  if (isFreshEnoughForPush(payload)) {
    await sendPushToCompany(account.company_id, {
      title: `สินค้าใน ${shopLabel(account)} ถูกแจ้งละเมิด`,
      body,
      url: productId ? `/products/${productId}` : MARKETPLACE_SETTINGS_URL,
      tag: `shopee-item-violation-${itemId || toShopeeNumber(payload.timestamp) || Date.now()}`,
    });
  }

  return { status: 'processed', detail: `Item violation: ${body}` };
}

// ─── code 22 — ราคาบนประกาศเปลี่ยน ───────────────────────────────────

/**
 * payload จริง:
 *   data: { item_id, model_id, old_value, new_value, update_time, update_field: "original_price" }
 *
 * `platform_price` คือค่าที่เราส่งขึ้น Shopee เป็น `original_price` (ดู lib/shopee/product-sync.ts
 * ที่ประกอบ priceList จาก link.platform_price) — จึงเป็นคอลัมน์เดียวที่ตรงกับ update_field นี้
 *
 * ⚠️ **ห้ามแตะ product_variations.default_price / discount_price** — ราคาในระบบเราเป็นราคาของร้าน
 * ที่ใช้ออกบิล ไม่ใช่ราคาบนประกาศ Shopee · เขียนทับแล้วราคาขายทุกช่องทางจะเพี้ยนตาม Shopee
 */
async function handleItemPriceUpdate(
  payload: ShopeePushPayload,
  account: ShopeeAccountRow,
  opts: { startedAt?: number },
): Promise<ShopeeShopEventResult> {
  const data = payload.data || {};
  const itemIdNum = toShopeeNumber(data.item_id);
  if (itemIdNum === null) return { status: 'skipped', detail: 'No item_id in payload' };

  const itemId = String(itemIdNum);
  const modelIdNum = toShopeeNumber(data.model_id);
  const modelId = modelIdNum !== null ? String(modelIdNum) : null;
  const updateField = text(data.update_field) || 'original_price';
  const newValue = toShopeeNumber(data.new_value);
  const oldValue = toShopeeNumber(data.old_value);
  const updateTime = toShopeeNumber(data.update_time);

  const link = await findShopeeLink(account.company_id, itemId, modelId);
  if (!link) {
    // ประกาศที่เรายังไม่ได้ผูกกับสินค้าในระบบ — ไม่มีอะไรให้อัปเดต และไม่ใช่ความผิดพลาด
    return { status: 'skipped', detail: `item not linked (item ${itemId}, model ${modelId ?? '-'})` };
  }

  const patch: Record<string, unknown> = { price_updated_at: updateTime ?? null };
  const extraColumns: Record<string, unknown> = {};

  if (updateField === 'original_price' && newValue !== null) {
    // ตรงกับคอลัมน์ที่มีอยู่ → เขียนลงคอลัมน์จริงเพื่อให้หน้าจอ/ตอน export เห็นค่าล่าสุด
    extraColumns.platform_price = newValue;
  } else if (newValue !== null) {
    // ฟิลด์อื่นที่ยังไม่มีคอลัมน์รองรับ (เช่น current_price) — เก็บไว้ใน platform_data
    // ห้ามเดายัดลงคอลัมน์ที่มีความหมายอื่น
    patch[updateField] = newValue;
  }

  await patchLinkPlatformData(link, patch, extraColumns);

  const detail = `item ${itemId}/${modelId ?? '-'} ${updateField}: ${oldValue ?? '-'} → ${newValue ?? '-'}`;
  await logShopEvent(
    account, 22, payload,
    { type: 'product', id: link.product_id || itemId, label: `Price update ${detail}` },
    opts.startedAt,
  );

  // ไม่ยิงแจ้งเตือน — ราคาบนประกาศเปลี่ยนเป็นเรื่องที่ร้าน (หรือแคมเปญ) ทำเอง วันละหลายครั้งได้
  return { status: 'processed', detail };
}

// ─── code 8 — ยอดจอง (reserved stock) ของ Shopee เปลี่ยน ─────────────

/**
 * payload จริง:
 *   data: { action: "place_order", item_id, variation_id, ordersn, promotion_id, promotion_type,
 *           update_time, changed_values: [{ name: "reserved_stock", old: 900, new: 899 }] }
 *   `variation_id` ของ Shopee = model id ของประกาศ (ไม่ใช่ product_variations.id ของเรา)
 *
 * ⚠️ **ห้ามแตะสต็อกจริง** — reserved_stock คือบัญชีฝั่ง Shopee (ของที่กันไว้ให้แคมเปญ/ตะกร้า)
 * สต็อกของเราขยับจากออเดอร์กับการรับเข้าเท่านั้น · เอา reserved มาลบสต็อกจะตัดซ้ำกับ
 * ออเดอร์ที่ push code 3 ทำไปแล้ว
 */
async function handleReservedStockChange(
  payload: ShopeePushPayload,
  account: ShopeeAccountRow,
  opts: { startedAt?: number },
): Promise<ShopeeShopEventResult> {
  const data = payload.data || {};
  const itemIdNum = toShopeeNumber(data.item_id);
  if (itemIdNum === null) return { status: 'skipped', detail: 'No item_id in payload' };

  const itemId = String(itemIdNum);
  const modelIdNum = toShopeeNumber(data.variation_id);
  const modelId = modelIdNum !== null ? String(modelIdNum) : null;
  const updateTime = toShopeeNumber(data.update_time);

  const changed = subArray(data, 'changed_values');
  const reservedEntry = changed.find(c => text(c.name) === 'reserved_stock');
  const reservedNew = toShopeeNumber(reservedEntry?.new);
  const reservedOld = toShopeeNumber(reservedEntry?.old);

  const link = await findShopeeLink(account.company_id, itemId, modelId);
  if (!link) {
    return { status: 'skipped', detail: `item not linked (item ${itemId}, model ${modelId ?? '-'})` };
  }

  await patchLinkPlatformData(link, {
    reserved_stock: reservedNew,
    reserved_stock_updated_at: updateTime ?? null,
    last_reserved_change: {
      action: text(data.action),
      ordersn: text(data.ordersn),
      promotion_type: text(data.promotion_type),
    },
  });

  const detail = `item ${itemId}/${modelId ?? '-'} reserved_stock: ${reservedOld ?? '-'} → ${reservedNew ?? '-'} (${text(data.action) || 'unknown action'})`;
  await logShopEvent(
    account, 8, payload,
    { type: 'product', id: link.product_id || itemId, label: `Reserved stock ${detail}` },
    opts.startedAt,
  );

  // ไม่ยิงแจ้งเตือน — เกิดทุกครั้งที่มีคนกดสั่ง/ยกเลิกในแคมเปญ จะกลายเป็นสแปมทันที
  return { status: 'processed', detail };
}

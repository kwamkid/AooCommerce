// สต็อกของ "ออเดอร์หนึ่งใบ" — ตัวกลางที่ทุกทางเข้าต้องใช้ (server-only)
//
// ═══════════════════════════════════════════════════════════════════════════
//  ทำไมต้องมี
// ═══════════════════════════════════════════════════════════════════════════
// ตรรกะ "สถานะเปลี่ยน → สต็อกต้องเกิดอะไร" เคยถูกก๊อปไว้ ~10 ชุด (`/api/orders` 4 ที่ ·
// Shopee/Lazada/TikTok เจ้าละชุด · ฝากขาย/ห้าง) แล้ว drift กันคนละทิศจนเกิดของจริง
// (ตรวจ 16 ก.ย. 2569): บิลเปิดเองส่งแล้วไม่เคยตัด 15/15 ใบ · Shopee 1,402 ใบ ·
// Lazada/TikTok ยกเลิกก่อนส่งแล้ว "คืนของ" แทน "ปลดจอง" จนคงคลังงอก
//
// ═══════════════════════════════════════════════════════════════════════════
//  กติกาเหล็ก: ตัดสินจาก "หลักฐานใน inventory_transactions" ไม่ใช่เดาจากคู่สถานะ
// ═══════════════════════════════════════════════════════════════════════════
// การเดาจาก `order_status` พังมาแล้วทุกแบบ — สถานะถูกเส้นอื่นเลื่อนไปก่อน (webhook มา
// ไม่เรียง · tracking push · พนักงานกดเอง · repair path) แล้วเงื่อนไขกลายเป็นเท็จถาวร
// Shopee เปลี่ยนมาใช้หลักฐานเมื่อ 28 ส.ค. 2569 แล้วเคส "ตัดซ้ำ" เป็นศูนย์ตั้งแต่นั้น
//
// ⚠️ ตรวจที่ระดับ "ใบ" ไม่ใช่ระดับรายการ — เพราะสินค้าชุด (composite) ลง
//    `inventory_transactions` ด้วย variation ของ **ชิ้นส่วน** ไม่ใช่ของชุด การจับคู่ราย
//    variation จึงหาไม่เจอแล้วตัดซ้ำ (บั๊กที่เจอใน Shopee) · ทั้งใบเดินไปพร้อมกันอยู่แล้ว
//
// ⛔ ห้ามเขียนตรรกะจอง/ตัด/คืนของออเดอร์ที่อื่นอีก — เพิ่ม marketplace หรือเอกสารชนิดใหม่
//    ให้เรียก 3 ฟังก์ชันนี้ ไม่ต้องรู้ว่าข้างในเป็น reserve/out/return

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  reserveStock,
  unreserveStock,
  returnStock,
  deductAndUnreserve,
} from '@/lib/stock-service';
import { getStockConfig } from '@/lib/stock-utils';
import { syncStockNow } from '@/lib/marketplace/stock-push';

/** รายการสินค้าของใบที่จะแตะสต็อก */
export interface OrderStockItem {
  variation_id: string;
  quantity: number;
}

export interface OrderStockContext {
  companyId: string;
  orderId: string;
  /** คลังของใบนี้ — null = ใบนี้ไม่ผูกคลัง ทุกฟังก์ชันจะไม่ทำอะไรและบอกเหตุผล */
  warehouseId: string | null;
  /** ข้อความอ้างอิงที่จะไปอยู่ใน notes เช่นเลขบิลหรือเลขออเดอร์ของร้าน */
  reference: string;
  /** ร้าน marketplace ต้นทาง — ข้ามตอนกระจายยอด (ร้านนั้นตัดของตัวเองไปแล้ว) */
  excludeAccountId?: string;
  createdBy?: string | null;
  /**
   * `await` (ค่าเริ่มต้น) = กระจายยอดขึ้นร้าน marketplace ให้เลยแล้วรอ — ใช้ในงานเบื้องหลัง
   *   (webhook/cron ที่อยู่ใน `after()` อยู่แล้ว)
   * `none` = ไม่กระจายให้ ผู้เรียกต้องทำเองใน `after()` — ใช้ในสายที่ผู้ใช้กดแล้วรอผล
   *   (จะได้ไม่หน่วง response ด้วยการยิง API ของร้าน)
   */
  push?: 'await' | 'none';
}

export type OrderStockSkip =
  | 'no_warehouse'      // ใบนี้ไม่ผูกคลัง
  | 'stock_disabled'    // แพ็กเกจไม่มีระบบคลัง
  | 'no_items'          // ไม่มีรายการที่ผูกสินค้าในระบบ
  | 'already_done'      // ทำไปแล้ว (มีหลักฐานใน inventory_transactions)
  | 'never_reserved'    // จะตัดแต่ใบนี้ไม่เคยถูกจอง (เช่นใบเก่าที่ข้ามสต็อกตอนสร้าง)
  | 'nothing_to_release'; // จะคืนแต่ไม่เคยแตะสต็อกเลย

export interface OrderStockResult {
  applied: boolean;
  skipped?: OrderStockSkip;
  /** variation ที่ถูกแตะจริง (ของชุด = id ของชุด ไม่ใช่ชิ้นส่วน) */
  touched: string[];
  errors: string[];
  /** ของไม่พอจนจองไม่ได้ (เกิดเฉพาะตอนบริษัทปิด "ยอมให้ขายเกิน") */
  insufficient: string[];
}

const EMPTY = (skipped: OrderStockSkip): OrderStockResult =>
  ({ applied: false, skipped, touched: [], errors: [], insufficient: [] });

/** สิ่งที่เคยเกิดกับสต็อกของใบนี้ — อ่านจากสมุดจริง ไม่ใช่จากสถานะ */
interface OrderStockHistory {
  reserved: boolean;
  deducted: boolean;
  released: boolean;
}

async function readHistory(orderId: string): Promise<OrderStockHistory> {
  const { data, error } = await supabaseAdmin
    .from('inventory_transactions')
    .select('type')
    .eq('reference_type', 'order')
    .eq('reference_id', orderId);
  if (error) throw new Error(`อ่านประวัติสต็อกของออเดอร์ไม่สำเร็จ: ${error.message}`);
  const types = new Set((data || []).map(r => r.type as string));
  return {
    reserved: types.has('reserve'),
    deducted: types.has('out'),
    released: types.has('unreserve') || types.has('return'),
  };
}

async function readItems(orderId: string): Promise<OrderStockItem[]> {
  const { data, error } = await supabaseAdmin
    .from('order_items')
    .select('variation_id, quantity')
    .eq('order_id', orderId);
  if (error) throw new Error(`อ่านรายการสินค้าของออเดอร์ไม่สำเร็จ: ${error.message}`);
  return (data || [])
    .filter(r => r.variation_id)
    .map(r => ({ variation_id: r.variation_id as string, quantity: Number(r.quantity) || 0 }))
    .filter(r => r.quantity > 0);
}

/** ยอดขายได้ของทุกร้านที่ผูก variation เหล่านี้ต้องขยับตาม ไม่งั้นขายซ้ำของชิ้นเดียวกัน */
async function pushIfNeeded(ctx: OrderStockContext, touched: string[]) {
  if (ctx.push === 'none' || touched.length === 0 || !ctx.warehouseId) return;
  await syncStockNow(touched, [ctx.warehouseId], { excludeAccountId: ctx.excludeAccountId });
}

/** ด่านที่ทุกฟังก์ชันต้องผ่านก่อนแตะสต็อก */
async function gate(ctx: OrderStockContext, items?: OrderStockItem[]) {
  if (!ctx.warehouseId) return { skip: EMPTY('no_warehouse') };
  const config = await getStockConfig(ctx.companyId);
  if (!config.stockEnabled) return { skip: EMPTY('stock_disabled') };
  const list = items ?? await readItems(ctx.orderId);
  if (list.length === 0) return { skip: EMPTY('no_items') };
  return { items: list, allowOversell: config.allowOversell };
}

/**
 * จองสต็อกให้ออเดอร์ — เรียกกี่ครั้งก็จองรอบเดียว
 *
 * ผู้เรียกต้องตัดสินเองก่อนว่า "ของยังอยู่ในคลังไหม" (marketplace ใช้
 * `holdsStockInWarehouse()` จาก `lib/marketplace/order-stock.ts`) — ฟังก์ชันนี้ไม่รู้จักสถานะ
 */
export async function reserveOrderStockOnce(
  ctx: OrderStockContext,
  items?: OrderStockItem[],
): Promise<OrderStockResult> {
  const g = await gate(ctx, items);
  if (g.skip) return g.skip;

  const history = await readHistory(ctx.orderId);
  if (history.reserved || history.deducted) return EMPTY('already_done');

  const result: OrderStockResult = { applied: false, touched: [], errors: [], insufficient: [] };
  for (const item of g.items!) {
    try {
      await reserveStock({
        supabase: supabaseAdmin,
        companyId: ctx.companyId,
        warehouseId: ctx.warehouseId!,
        variationId: item.variation_id,
        qty: item.quantity,
        referenceType: 'order',
        referenceId: ctx.orderId,
        notes: `จองสำหรับ ${ctx.reference}`,
        createdBy: ctx.createdBy ?? null,
        // ปิด "ยอมให้ขายเกิน" ไว้ = ให้ DB ปฏิเสธตั้งแต่ตอนล็อกแถว
        checkAvailable: !g.allowOversell,
      });
      result.touched.push(item.variation_id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'จองสต็อกไม่สำเร็จ';
      if (message.includes('Insufficient') || message.includes('ไม่พอ')) {
        result.insufficient.push(item.variation_id);
      }
      result.errors.push(`${item.variation_id}: ${message}`);
    }
  }
  result.applied = result.touched.length > 0;
  await pushIfNeeded(ctx, result.touched);
  return result;
}

/**
 * ตัดสต็อกตอนของออกจากคลังจริง (จัดส่ง) — เรียกกี่ครั้งก็ตัดรอบเดียว
 *
 * **ต้องเคยจองมาก่อนถึงจะตัด** — ใบที่ข้ามการจองตอนสร้าง (ออเดอร์เก่าที่ดึงย้อนหลังมา
 * ทั้งที่ส่งไปแล้ว) ของไม่ได้อยู่ในคลังตั้งแต่ตอนพนักงานนับ จึงห้ามหักซ้ำ
 */
export async function deductOrderStockOnce(
  ctx: OrderStockContext,
  items?: OrderStockItem[],
): Promise<OrderStockResult> {
  const g = await gate(ctx, items);
  if (g.skip) return g.skip;

  const history = await readHistory(ctx.orderId);
  if (history.deducted) return EMPTY('already_done');
  if (!history.reserved) return EMPTY('never_reserved');

  const result: OrderStockResult = { applied: false, touched: [], errors: [], insufficient: [] };
  for (const item of g.items!) {
    try {
      await deductAndUnreserve({
        supabase: supabaseAdmin,
        companyId: ctx.companyId,
        warehouseId: ctx.warehouseId!,
        variationId: item.variation_id,
        qty: item.quantity,
        referenceType: 'order',
        referenceId: ctx.orderId,
        notes: `ตัดสต็อกตอนจัดส่ง ${ctx.reference}`,
        createdBy: ctx.createdBy ?? null,
      });
      result.touched.push(item.variation_id);
    } catch (e) {
      result.errors.push(`${item.variation_id}: ${e instanceof Error ? e.message : 'ตัดสต็อกไม่สำเร็จ'}`);
    }
  }
  result.applied = result.touched.length > 0;
  await pushIfNeeded(ctx, result.touched);
  return result;
}

/**
 * ยกเลิก / คืนสินค้า — เลือกวิธีคืนจากสิ่งที่เคยเกิดจริง ไม่ใช่จากสถานะเดิมของใบ
 *   เคยตัดไปแล้ว  → `returnStock`   (ของกลับเข้าคลัง)
 *   จองอยู่ยังไม่ตัด → `unreserveStock` (แค่ปลดจอง ของไม่เคยออกจากคลัง)
 *   ไม่เคยแตะเลย  → ไม่ทำอะไร        (ใบที่ข้ามสต็อกตอนสร้าง)
 */
export async function releaseOrderStockOnce(
  ctx: OrderStockContext,
  items?: OrderStockItem[],
): Promise<OrderStockResult> {
  const g = await gate(ctx, items);
  if (g.skip) return g.skip;

  const history = await readHistory(ctx.orderId);
  if (!history.reserved && !history.deducted) return EMPTY('nothing_to_release');
  if (history.released && !history.deducted) return EMPTY('already_done');

  const wasShipped = history.deducted;
  const op = wasShipped ? returnStock : unreserveStock;
  const label = wasShipped ? 'คืนของเข้าคลัง' : 'ปลดยอดจอง';

  const result: OrderStockResult = { applied: false, touched: [], errors: [], insufficient: [] };
  for (const item of g.items!) {
    try {
      await op({
        supabase: supabaseAdmin,
        companyId: ctx.companyId,
        warehouseId: ctx.warehouseId!,
        variationId: item.variation_id,
        qty: item.quantity,
        referenceType: 'order',
        referenceId: ctx.orderId,
        notes: `${label} — ยกเลิก ${ctx.reference}`,
        createdBy: ctx.createdBy ?? null,
      });
      result.touched.push(item.variation_id);
    } catch (e) {
      result.errors.push(`${item.variation_id}: ${e instanceof Error ? e.message : `${label}ไม่สำเร็จ`}`);
    }
  }
  result.applied = result.touched.length > 0;
  await pushIfNeeded(ctx, result.touched);
  return result;
}

/** กระจายยอดขึ้นร้าน — สำหรับผู้เรียกที่ส่ง `push: 'none'` แล้วไปทำเองใน `after()` */
export async function pushOrderStock(ctx: OrderStockContext, touched: string[]): Promise<void> {
  if (touched.length === 0 || !ctx.warehouseId) return;
  await syncStockNow(touched, [ctx.warehouseId], { excludeAccountId: ctx.excludeAccountId });
}

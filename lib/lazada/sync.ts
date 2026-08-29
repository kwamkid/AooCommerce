// Path: lib/lazada/sync.ts
// Lazada order sync (manual + cron polling + webhook-triggered single order)
// โครงเดียวกับ lib/tiktok/sync.ts — ต่างที่:
// - Lazada สถานะเป็น "ราย item" (order.statuses = aggregate) → คำนวณสถานะรวมเอง
// - รายการสินค้า 1 แถว = 1 ชิ้น (เหมือน TikTok)
// - ไม่มี 15-day cap แบบ Shopee แต่ห้าม stamp last_sync_at ถ้า collect ล้ม (บทเรียน fix-bug.md 2026-08-21)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { newCustomerCode } from '@/lib/customer-code';
import { ensureVariationImage, upsertProductImage } from '@/lib/marketplace/product-helpers';
import { sendNewOrderPushById } from '@/lib/push/send';
import {
  LazadaAccountRow,
  LazadaCredentials,
  LazadaOrder,
  LazadaOrderItem,
  ensureValidToken,
  getLazadaOrder,
  getLazadaOrderItems,
  getLazadaOrders,
  getLazadaOrdersItems,
} from '@/lib/lazada/api';
import { parallelLimit } from '@/lib/parallel';
import { fetchCostMap } from '@/lib/cost-utils';
import { reserveStock as reserveStockService, deductAndUnreserve, returnStock as returnStockService } from '@/lib/stock-service';
import { getStockConfig } from '@/lib/stock-utils';

export interface SyncProgressEvent {
  phase: 'collecting' | 'processing' | 'done';
  current: number;
  total: number | null;
  label: string;
}
export type SyncProgressCallback = (event: SyncProgressEvent) => void;

export interface SyncResult {
  orders_created: number;
  orders_updated: number;
  orders_skipped: number;
  products_created: number;
  customers_created: number;
  errors: string[];
}

// --- Status mapping -----------------------------------------------------------

/** ลำดับ lifecycle ของสถานะ Lazada (สูง = ไปไกลกว่า) */
const LAZADA_STATUS_ORDER: Record<string, number> = {
  unpaid: 0,
  pending: 1,
  packed: 2,
  ready_to_ship_pending: 3,
  ready_to_ship: 4,
  shipped: 5,
  delivered: 6,
  confirmed: 7,
  returned: 9,
  shipped_back: 9,
  shipped_back_success: 9,
  failed: 10,
  canceled: 10,
  cancelled: 10,
};

const LAZADA_CANCEL_STATUSES = new Set(['canceled', 'cancelled', 'failed']);
const LAZADA_RETURN_STATUSES = new Set(['returned', 'shipped_back', 'shipped_back_success']);
const LAZADA_SHIPPED_PLUS = new Set(['shipped', 'delivered', 'confirmed']);

/**
 * สถานะรวมของออเดอร์จากสถานะราย item:
 * - ทุกชิ้นถูกยกเลิก/คืน → canceled/returned
 * - ที่เหลือ: ใช้สถานะ "ช้าสุด" ของชิ้นที่ยังไม่ถูกยกเลิก
 *   (ออเดอร์ยังไม่นับว่าส่งจนกว่าทุกชิ้นจะส่ง — แนวเดียวกับ partial ของ TikTok)
 */
export function effectiveLazadaStatus(itemStatuses: string[]): string {
  const norm = itemStatuses.map(s => (s || '').toLowerCase()).filter(Boolean);
  if (norm.length === 0) return 'pending';
  const active = norm.filter(s => !LAZADA_CANCEL_STATUSES.has(s) && !LAZADA_RETURN_STATUSES.has(s));
  if (active.length === 0) {
    return norm.find(s => LAZADA_RETURN_STATUSES.has(s)) || 'canceled';
  }
  return active.reduce((min, s) =>
    (LAZADA_STATUS_ORDER[s] ?? 0) < (LAZADA_STATUS_ORDER[min] ?? 0) ? s : min
  , active[0]);
}

/**
 * Map Lazada status → internal order_status + payment_status.
 *   unpaid → new / pending
 *   pending → ready_to_ship / paid (จ่ายแล้ว รอร้านแพ็ค)
 *   packed, ready_to_ship_pending, ready_to_ship → processing / paid
 *   shipped, delivered → shipping / paid
 *   confirmed → completed / paid
 *   canceled, failed, returned, shipped_back* → cancelled / cancelled
 */
export function mapLazadaStatus(lazadaStatus: string): { order_status: string; payment_status: string } {
  switch ((lazadaStatus || '').toLowerCase()) {
    case 'unpaid':
      return { order_status: 'new', payment_status: 'pending' };
    case 'pending':
      return { order_status: 'ready_to_ship', payment_status: 'paid' };
    case 'packed':
    case 'ready_to_ship_pending':
    case 'ready_to_ship':
      return { order_status: 'processing', payment_status: 'paid' };
    case 'shipped':
    case 'delivered':
      return { order_status: 'shipping', payment_status: 'paid' };
    case 'confirmed':
      return { order_status: 'completed', payment_status: 'paid' };
    case 'canceled':
    case 'cancelled':
    case 'failed':
    case 'returned':
    case 'shipped_back':
    case 'shipped_back_success':
      return { order_status: 'cancelled', payment_status: 'cancelled' };
    default:
      return { order_status: 'new', payment_status: 'pending' };
  }
}

function isStatusProgression(currentStatus: string, newStatus: string): boolean {
  const cur = LAZADA_STATUS_ORDER[(currentStatus || '').toLowerCase()] ?? -1;
  const next = LAZADA_STATUS_ORDER[(newStatus || '').toLowerCase()] ?? -1;
  return next > cur;
}

function parseLazadaDate(s: string | undefined): Date {
  if (!s) return new Date();
  const d = new Date(s); // "2026-08-22 10:15:33 +0700" — V8 parses this form
  return isNaN(d.getTime()) ? new Date() : d;
}

// --- Entry points --------------------------------------------------------------

/**
 * Sync ออเดอร์เดียวตาม order_id (จาก webhook push)
 */
export async function syncSingleLazadaOrder(
  account: LazadaAccountRow,
  orderId: string | number
): Promise<SyncResult> {
  const creds = await ensureValidToken(account);
  const result: SyncResult = { orders_created: 0, orders_updated: 0, orders_skipped: 0, products_created: 0, customers_created: 0, errors: [] };

  const { order, error: orderErr } = await getLazadaOrder(creds, orderId);
  if (orderErr || !order) {
    result.errors.push(`Order ${orderId}: ${orderErr || 'not found'}`);
    return result;
  }
  const { items, error: itemsErr } = await getLazadaOrderItems(creds, orderId);
  if (itemsErr) {
    result.errors.push(`Order ${orderId} items: ${itemsErr}`);
    return result;
  }

  try {
    const upsert = await upsertOrder(account, order, items);
    if (upsert.action === 'created') result.orders_created++;
    else if (upsert.action === 'updated') result.orders_updated++;
    else result.orders_skipped++;
    result.products_created += upsert.productsCreated;
    result.customers_created += upsert.customersCreated;
  } catch (e) {
    result.errors.push(`Order ${orderId}: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
  return result;
}

/**
 * Poll ออเดอร์ตามช่วงเวลา update (cron + manual sync)
 */
export async function syncOrdersByTimeRange(
  account: LazadaAccountRow,
  timeFromMs: number,
  timeToMs: number,
  onProgress?: SyncProgressCallback
): Promise<SyncResult> {
  console.log(`[Lazada Sync] syncOrdersByTimeRange: seller=${account.shop_id}, from=${new Date(timeFromMs).toISOString()}, to=${new Date(timeToMs).toISOString()}`);
  const creds = await ensureValidToken(account);
  const result: SyncResult = { orders_created: 0, orders_updated: 0, orders_skipped: 0, products_created: 0, customers_created: 0, errors: [] };

  // 1) Collect order headers (paginated)
  const orders: LazadaOrder[] = [];
  let offset = 0;
  let collectFailed = false;
  for (;;) {
    const { orders: page, count, error } = await getLazadaOrders(creds, {
      updateAfterMs: timeFromMs,
      updateBeforeMs: timeToMs,
      offset,
      limit: 100,
    });
    if (error) {
      result.errors.push(`Order list error: ${error}`);
      collectFailed = true;
      break;
    }
    orders.push(...page);
    onProgress?.({ phase: 'collecting', current: orders.length, total: null, label: `กำลังดึงรายการออเดอร์... (${orders.length} รายการ)` });
    offset += page.length;
    if (page.length === 0 || orders.length >= count) break;
    if (offset > 5000) { // sanity cap
      result.errors.push('Order list exceeded 5000 rows in one window — aborting collection');
      collectFailed = true;
      break;
    }
  }

  console.log(`[Lazada Sync] Collected ${orders.length} orders`);

  // 2) Batch-fetch items (≤50 ids/call) แล้ว upsert
  if (orders.length > 0) {
    let processed = 0;
    for (let i = 0; i < orders.length; i += 50) {
      const batch = orders.slice(i, i + 50);
      const { byOrder, error } = await getLazadaOrdersItems(creds, batch.map(o => o.order_id));
      if (error) {
        result.errors.push(`Batch items error: ${error}`);
        processed += batch.length;
        continue;
      }
      await parallelLimit(batch, async (order) => {
        try {
          const items = byOrder[String(order.order_id)] || [];
          const upsert = await upsertOrder(account, order, items);
          if (upsert.action === 'created') result.orders_created++;
          else if (upsert.action === 'updated') result.orders_updated++;
          else result.orders_skipped++;
          result.products_created += upsert.productsCreated;
          result.customers_created += upsert.customersCreated;
        } catch (e) {
          result.errors.push(`Order ${order.order_id}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
        processed++;
        onProgress?.({ phase: 'processing', current: processed, total: orders.length, label: `กำลังประมวลผลออเดอร์ ${processed}/${orders.length}` });
      }, 3);
    }
  }

  // stamp last_sync_at เฉพาะเมื่อไล่รายการครบ — collect ล้มแล้ว stamp = ข้ามช่วงถาวร
  if (!collectFailed) {
    await supabaseAdmin
      .from('marketplace_accounts')
      .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', account.id);
  }

  console.log(`[Lazada Sync] Done: created=${result.orders_created}, updated=${result.orders_updated}, errors=${result.errors.length}`);
  return result;
}

// --- Upsert --------------------------------------------------------------------

interface UpsertResult {
  action: 'created' | 'updated' | 'skipped';
  productsCreated: number;
  customersCreated: number;
}

async function upsertOrder(
  account: LazadaAccountRow,
  order: LazadaOrder,
  items: LazadaOrderItem[]
): Promise<UpsertResult> {
  const companyId = account.company_id;
  const effStatus = effectiveLazadaStatus(
    items.length > 0 ? items.map(it => it.status) : (order.statuses || [])
  );
  const { order_status, payment_status } = mapLazadaStatus(effStatus);

  const { data: existing } = await supabaseAdmin
    .from('orders')
    .select('id, order_status, external_status, external_data, customer_id, created_at, fulfillment_status, warehouse_id')
    .eq('company_id', companyId)
    .eq('source', 'lazada')
    .eq('external_order_sn', String(order.order_id))
    .single();

  if (existing) {
    return updateExistingOrder(account, existing, order, items, effStatus, order_status, payment_status);
  }
  try {
    return await createNewOrder(account, order, items, effStatus, order_status, payment_status);
  } catch (e) {
    // webhook + cron แข่งกัน insert ออเดอร์เดียวกัน — ตัวแพ้ชน unique = มีอยู่แล้ว
    // ไม่ใช่ความล้มเหลว → เดินเส้น update แทน (pattern เดียวกับ Shopee/TikTok)
    const msg = e instanceof Error ? e.message : '';
    if (msg.includes('idx_orders_external_unique') || msg.includes('duplicate key')) {
      const { data: raced } = await supabaseAdmin
        .from('orders')
        .select('id, order_status, external_status, external_data, customer_id, created_at, fulfillment_status, warehouse_id')
        .eq('company_id', companyId)
        .eq('source', 'lazada')
        .eq('external_order_sn', String(order.order_id))
        .single();
      if (raced) {
        console.log(`[Lazada Sync] Order ${order.order_id} lost a concurrent-create race — switching to the update path`);
        return updateExistingOrder(account, raced, order, items, effStatus, order_status, payment_status);
      }
    }
    throw e;
  }
}

async function updateExistingOrder(
  account: LazadaAccountRow,
  existing: { id: string; order_status: string; external_status: string | null; external_data: unknown; customer_id: string | null; fulfillment_status: string | null; warehouse_id: string | null },
  order: LazadaOrder,
  items: LazadaOrderItem[],
  effStatus: string,
  order_status: string,
  payment_status: string
): Promise<UpsertResult> {
  const companyId = account.company_id;
  let statusUpdated = false;

  const statusChanged = (existing.external_status || '').toLowerCase() !== effStatus;
  const isForward = isStatusProgression(existing.external_status || '', effStatus);

  if (statusChanged && isForward) {
    const tracking = items.find(it => it.tracking_code)?.tracking_code || null;
    const carrier = items.find(it => it.shipment_provider)?.shipment_provider || null;

    const fulfillmentUpdate: Record<string, unknown> = {};
    if (LAZADA_SHIPPED_PLUS.has(effStatus)) {
      fulfillmentUpdate.fulfillment_status = 'shipped';
      fulfillmentUpdate.shipped_at = new Date().toISOString();
    } else if (LAZADA_CANCEL_STATUSES.has(effStatus) || LAZADA_RETURN_STATUSES.has(effStatus)) {
      fulfillmentUpdate.fulfillment_status = 'pending';
      fulfillmentUpdate.hold_reason = null;
    }

    await supabaseAdmin
      .from('orders')
      .update({
        order_status,
        payment_status,
        external_status: effStatus,
        external_data: { order, items } as unknown as Record<string, unknown>,
        shipping_fee: Number(order.shipping_fee || 0),
        shipping_carrier: carrier,
        tracking_number: tracking,
        updated_at: new Date().toISOString(),
        ...fulfillmentUpdate,
      })
      .eq('id', existing.id);
    statusUpdated = true;

    // Auto-issue documents เมื่อคอนเฟิร์ม/แพ็คแล้ว (processing ขึ้นไป)
    if (['packed', 'ready_to_ship_pending', 'ready_to_ship', 'shipped', 'delivered', 'confirmed'].includes(effStatus)) {
      const { autoIssueDocument } = await import('@/lib/invoice-service');
      autoIssueDocument(existing.id, companyId).catch(() => {});
    }

    // ตัดสต็อกเมื่อส่งแล้ว
    if (LAZADA_SHIPPED_PLUS.has(effStatus) && existing.warehouse_id) {
      const wasPreShip = ['new', 'ready_to_ship', 'processing'].includes(existing.order_status);
      if (wasPreShip) {
        try {
          const stockConfig = await getStockConfig(companyId);
          if (stockConfig.stockEnabled) {
            const { data: orderItems } = await supabaseAdmin
              .from('order_items')
              .select('id, variation_id, quantity')
              .eq('order_id', existing.id);
            for (const oi of (orderItems || [])) {
              if (!oi.variation_id) continue;
              try {
                await deductAndUnreserve({
                  supabase: supabaseAdmin,
                  companyId,
                  warehouseId: existing.warehouse_id,
                  variationId: oi.variation_id,
                  qty: Number(oi.quantity),
                  referenceType: 'order',
                  referenceId: existing.id,
                  notes: `Lazada shipped: ${order.order_id}`,
                });
              } catch (stockErr) {
                console.error(`[Lazada Sync] Stock deduct error for ${order.order_id}:`, stockErr);
              }
            }
          }
        } catch (stockErr) {
          console.error(`[Lazada Sync] Stock deduction failed for ${order.order_id}:`, stockErr);
        }
      }
    }

    // คืนสต็อกเมื่อยกเลิก/ตีกลับ
    if ((LAZADA_CANCEL_STATUSES.has(effStatus) || LAZADA_RETURN_STATUSES.has(effStatus)) && existing.warehouse_id) {
      await returnStockForCancelledOrder(companyId, existing.id, existing.warehouse_id, existing.order_status, String(order.order_id));
    }
  }

  // Repair mapping drift (สถานะเดิมแต่ internal ไม่ตรง)
  if (!statusUpdated) {
    const expected = mapLazadaStatus(effStatus);
    if (existing.order_status !== expected.order_status) {
      const repairUpdate: Record<string, unknown> = {
        order_status: expected.order_status,
        payment_status: expected.payment_status,
        updated_at: new Date().toISOString(),
      };
      if (LAZADA_SHIPPED_PLUS.has(effStatus)) {
        repairUpdate.fulfillment_status = 'shipped';
        repairUpdate.shipped_at = new Date().toISOString();
      }
      await supabaseAdmin.from('orders').update(repairUpdate).eq('id', existing.id);
      statusUpdated = true;
    }
  }

  return { action: statusUpdated ? 'updated' : 'skipped', productsCreated: 0, customersCreated: 0 };
}

async function createNewOrder(
  account: LazadaAccountRow,
  order: LazadaOrder,
  items: LazadaOrderItem[],
  effStatus: string,
  order_status: string,
  payment_status: string
): Promise<UpsertResult> {
  const companyId = account.company_id;

  const { customerId, isNewCustomer, shippingAddressId } = await findOrCreateCustomer(companyId, order);

  // Lazada: 1 item แถวละ 1 ชิ้น (เหมือน TikTok)
  let subtotal = 0;
  let paidTotal = 0;
  const newlyCreatedProductIds: string[] = [];
  const newlyCreatedVariationIds: string[] = [];
  const resolvedItems: {
    variation_id: string | null;
    product_id: string | null;
    product_code: string;
    product_name: string;
    qty: number;
    price: number;
    total: number;
    /** order_item_id ของ Lazada ทุกชิ้นในแถวนี้ — ใช้ตอนแพ็ค/จัดส่ง (Pack รับเป็นรายชิ้น) */
    lineItemIds: string[];
  }[] = [];

  // Lazada ส่ง order item แถวละ 1 ชิ้น — รวมชิ้นที่เป็น SKU/ตัวเลือกเดียวกันเป็นแถวเดียว (qty รวม)
  // ไม่งั้นหน้า order แสดงชื่อสินค้าซ้ำกันหลายบรรทัด (เจอจริง 2 ใบแรก 2026-08-28)
  // เก็บ order_item_id ของทุกชิ้นไว้ด้วย — Pack ของ Lazada รับเป็นรายชิ้น
  // และย้อนกลับไปหาทีหลังไม่ได้แม่น (variation เดียวผูกได้หลาย listing)
  const groupedItems: {
    item: (typeof items)[number]; qty: number; paidSum: number; lineItemIds: string[];
  }[] = [];
  {
    const byKey = new Map<string, (typeof groupedItems)[number]>();
    for (const item of items) {
      const key = `${item.sku_id ?? ''}|${item.sku ?? ''}|${item.variation ?? ''}`;
      const paid = Number(item.paid_price ?? item.item_price ?? 0);
      const lineId = item.order_item_id != null ? String(item.order_item_id) : null;
      const g = byKey.get(key);
      if (g) {
        g.qty += 1;
        g.paidSum += paid;
        if (lineId) g.lineItemIds.push(lineId);
      } else {
        const entry = { item, qty: 1, paidSum: paid, lineItemIds: lineId ? [lineId] : [] };
        byKey.set(key, entry);
        groupedItems.push(entry);
      }
    }
  }

  for (const { item, qty, paidSum, lineItemIds } of groupedItems) {
    // ราคาตั้ง (item_price) เก็บลง order_items + ส่วนลดแยกที่ order-level แบบเดียวกับ Shopee —
    // ห้ามเก็บ paid_price (สุทธิ) ลง item พร้อมกับ discount_amount: ระบบคำนวณ total จาก
    // Σitems − discount จะกลายเป็นหักส่วนลดซ้ำสองรอบ (เจอจริง 2026-08-28 — บิลเหลือ -0.28)
    const listPrice = Number(item.item_price ?? item.paid_price ?? 0);
    subtotal += listPrice * qty;
    paidTotal += paidSum;

    const itemName = item.variation && item.variation.trim() && item.variation !== '...'
      ? `${item.name} - ${item.variation}`
      : item.name;

    const matched = await findOrCreateVariationBySku(companyId, item.sku || '', itemName, listPrice, {
      externalItemId: String(item.product_id ?? item.shop_sku ?? item.order_item_id),
      externalModelId: String(item.sku_id ?? '0'),
      image: item.product_main_image || '',
      accountId: account.id,
      accountName: account.shop_name ?? undefined,
    });

    if (matched.isNewProduct) newlyCreatedProductIds.push(matched.product_id);
    if (matched.isNewVariation) newlyCreatedVariationIds.push(matched.variation_id);

    try {
      await supabaseAdmin.from('marketplace_product_links').upsert({
        company_id: companyId,
        account_id: account.id,
        account_name: account.shop_name || '',
        platform: 'lazada',
        product_id: matched.product_id,
        variation_id: matched.variation_id || null,
        external_item_id: String(item.product_id ?? item.shop_sku ?? item.order_item_id),
        external_model_id: String(item.sku_id ?? '0'),
        external_sku: item.sku || null,
        platform_product_name: item.name,
        platform_primary_image: item.product_main_image || null,
        platform_price: listPrice || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'account_id,external_item_id,external_model_id',
      });
    } catch (linkErr) {
      console.error(`[Lazada Sync] Failed to upsert marketplace link for item ${item.order_item_id}:`, linkErr);
    }

    resolvedItems.push({
      variation_id: matched.variation_id,
      product_id: matched.product_id,
      product_code: matched.product_code,
      product_name: itemName,
      qty,
      price: listPrice,
      total: listPrice * qty,
      lineItemIds,
    });
  }

  const shippingFee = Number(order.shipping_fee || 0);
  const totalAmount = paidTotal + shippingFee;
  const createdAt = parseLazadaDate(order.created_at);

  const orderNotes = order.remarks
    ? `Lazada: ${order.order_id}\nข้อความจากผู้ซื้อ: ${order.remarks}`
    : `Lazada: ${order.order_id}`;

  const { data: defaultWarehouse } = await supabaseAdmin
    .from('warehouses')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_default', true)
    .eq('is_active', true)
    .limit(1)
    .single();
  const warehouseId = defaultWarehouse?.id || null;

  const tracking = items.find(it => it.tracking_code)?.tracking_code || null;
  const carrier = items.find(it => it.shipment_provider)?.shipment_provider || null;

  const { data: newOrder, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      company_id: companyId,
      order_number: String(order.order_number || order.order_id),
      customer_id: customerId,
      order_date: createdAt.toISOString().split('T')[0],
      subtotal: paidTotal,
      vat_amount: 0,
      discount_amount: Math.max(0, subtotal - paidTotal),
      shipping_fee: shippingFee,
      total_amount: totalAmount,
      payment_method: 'lazada',
      payment_status,
      order_status,
      source: 'lazada',
      external_order_sn: String(order.order_id),
      marketplace_account_id: account.id,
      external_status: effStatus,
      external_data: { order, items } as unknown as Record<string, unknown>,
      warehouse_id: warehouseId,
      notes: orderNotes,
      shipping_carrier: carrier,
      tracking_number: tracking,
      flow_type: 'r_retail',
      created_at: createdAt.toISOString(),
    })
    .select()
    .single();

  if (orderError) {
    // Rollback ทรัพยากรที่เพิ่งสร้าง (pattern เดียวกับ TikTok sync)
    if (newlyCreatedVariationIds.length > 0) {
      await supabaseAdmin.from('product_variations').delete().in('id', newlyCreatedVariationIds);
    }
    for (const pid of [...new Set(newlyCreatedProductIds)]) {
      const { count } = await supabaseAdmin
        .from('product_variations')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', pid);
      if (count === 0) {
        await supabaseAdmin.from('products').delete().eq('id', pid);
      }
    }
    if (isNewCustomer) {
      const { count: orderCount } = await supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customerId);
      if (orderCount === 0) {
        await supabaseAdmin.from('shipping_addresses').delete().eq('customer_id', customerId);
        await supabaseAdmin.from('customers').delete().eq('id', customerId);
      }
    }
    throw new Error(`Failed to create order: ${orderError.message}`);
  }

  const costMap = await fetchCostMap(
    supabaseAdmin,
    resolvedItems.map(i => i.variation_id).filter((v): v is string => !!v),
  );

  const orderItemsToInsert = resolvedItems.map(item => ({
    company_id: companyId,
    order_id: newOrder.id,
    variation_id: item.variation_id,
    product_id: item.product_id,
    product_code: item.product_code,
    product_name: item.product_name,
    quantity: item.qty,
    unit_price: item.price,
    unit_cost: item.variation_id ? (costMap[item.variation_id] || null) : null,
    discount_percent: 0,
    discount_amount: 0,
    discount_type: 'percent',
    subtotal: item.total,
    total: item.total,
      external_line_item_ids: item.lineItemIds?.length ? item.lineItemIds : null,
  }));
  await supabaseAdmin.from('order_items').insert(orderItemsToInsert);

  // Reserve stock
  if (warehouseId && !LAZADA_CANCEL_STATUSES.has(effStatus)) {
    try {
      const stockConfig = await getStockConfig(companyId);
      if (stockConfig.stockEnabled) {
        for (const item of resolvedItems) {
          if (item.variation_id) {
            await reserveStockService({
              supabase: supabaseAdmin,
              companyId,
              warehouseId,
              variationId: item.variation_id,
              qty: item.qty,
              referenceType: 'order',
              referenceId: newOrder.id,
              notes: `Lazada order: ${order.order_id}`,
            });
          }
        }
        // สั่งเข้ามาในสถานะส่งแล้ว → ตัดจริงทันที
        if (LAZADA_SHIPPED_PLUS.has(effStatus)) {
          for (const item of resolvedItems) {
            if (!item.variation_id) continue;
            try {
              await deductAndUnreserve({
                supabase: supabaseAdmin,
                companyId,
                warehouseId,
                variationId: item.variation_id,
                qty: item.qty,
                referenceType: 'order',
                referenceId: newOrder.id,
                notes: `Lazada shipped: ${order.order_id}`,
              });
            } catch (stockErr) {
              console.error(`[Lazada Sync] Stock deduct error for ${order.order_id}:`, stockErr);
            }
          }
        }
      }
    } catch (stockErr) {
      console.error(`[Lazada Sync] Stock reservation error for ${order.order_id}:`, stockErr);
    }
  }

  // Shipments
  if (shippingAddressId) {
    const { data: orderItemRows } = await supabaseAdmin
      .from('order_items')
      .select('id, quantity')
      .eq('order_id', newOrder.id);
    if (orderItemRows) {
      const shipmentsToInsert = orderItemRows.map((oi, idx) => ({
        company_id: companyId,
        order_item_id: oi.id,
        shipping_address_id: shippingAddressId,
        quantity: oi.quantity,
        shipping_fee: idx === 0 ? shippingFee : 0,
        delivery_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      await supabaseAdmin.from('order_shipments').insert(shipmentsToInsert);
    }
  }

  // Auto-issue documents ถ้าเข้ามาเลย processing แล้ว
  if (['packed', 'ready_to_ship_pending', 'ready_to_ship', 'shipped', 'delivered', 'confirmed'].includes(effStatus)) {
    const { autoIssueDocument } = await import('@/lib/invoice-service');
    autoIssueDocument(newOrder.id, companyId).catch(() => {});
  }

  // Push แจ้งเตือนออเดอร์ใหม่ (ออเดอร์เก่าจาก initial sync ถูกกรองด้วยเวลาใน helper)
  await sendNewOrderPushById(companyId, newOrder.id, new Date(order.created_at).getTime());

  return {
    action: 'created',
    productsCreated: newlyCreatedProductIds.length,
    customersCreated: isNewCustomer ? 1 : 0,
  };
}

// --- Customers -------------------------------------------------------------------

async function findOrCreateCustomer(
  companyId: string,
  order: LazadaOrder
): Promise<{ customerId: string; isNewCustomer: boolean; shippingAddressId: string | null }> {
  const addr = order.address_shipping;
  const buyerName = [addr?.first_name, addr?.last_name].filter(Boolean).join(' ')
    || [order.customer_first_name, order.customer_last_name].filter(Boolean).join(' ')
    || `Lazada ${order.order_id}`;
  const buyerPhone = (addr?.phone || '').replace(/[^\d+]/g, '');
  // Lazada mask เบอร์เป็น 66****1234 — เบอร์ที่มี * ห้ามใช้ match/บันทึก
  const usablePhone = buyerPhone && !(addr?.phone || '').includes('*') ? buyerPhone : '';

  let customerId = '';
  let isNewCustomer = false;

  if (usablePhone) {
    const { data: byPhone } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('company_id', companyId)
      .eq('phone', usablePhone)
      .limit(1)
      .maybeSingle();
    if (byPhone) customerId = byPhone.id;
  }

  if (!customerId) {
    const { data: newCustomer, error } = await supabaseAdmin
      .from('customers')
      .insert({
        company_id: companyId,
        customer_code: newCustomerCode('LZ'),
        name: buyerName,
        phone: usablePhone || null,
        customer_type: 'retail',
        notes: `Lazada order: ${order.order_id}`,
      })
      .select('id')
      .single();

    if (error || !newCustomer) {
      throw new Error(`Failed to create customer: ${error?.message}`);
    }
    customerId = newCustomer.id;
    isNewCustomer = true;
  }

  let shippingAddressId: string | null = null;
  if (addr) {
    const fullAddress = [addr.address1, addr.address2, addr.address3, addr.address4, addr.address5, addr.city]
      .filter(Boolean).join(' ');

    const { data: existingAddr } = await supabaseAdmin
      .from('shipping_addresses')
      .select('id')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle();

    if (existingAddr) {
      shippingAddressId = existingAddr.id;
      await supabaseAdmin
        .from('shipping_addresses')
        .update({
          recipient_name: buyerName,
          phone: usablePhone || null,
          address: fullAddress,
          postal_code: addr.post_code || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAddr.id);
    } else {
      const { data: newAddr } = await supabaseAdmin
        .from('shipping_addresses')
        .insert({
          company_id: companyId,
          customer_id: customerId,
          recipient_name: buyerName,
          phone: usablePhone || null,
          address: fullAddress,
          postal_code: addr.post_code || null,
          is_default: true,
        })
        .select('id')
        .single();
      shippingAddressId = newAddr?.id || null;
    }
  }

  return { customerId, isNewCustomer, shippingAddressId };
}

// --- Product matching ---------------------------------------------------------------
// Priority เดียวกับ Shopee/TikTok: links → SKU → product code → สร้างใหม่

interface MatchedVariation {
  variation_id: string;
  product_id: string;
  product_code: string;
  isNewProduct: boolean;
  isNewVariation: boolean;
}

interface LazadaItemInfo {
  externalItemId: string;
  externalModelId: string;
  image: string;
  accountId: string;
  accountName?: string;
}

async function findOrCreateVariationBySku(
  companyId: string,
  sku: string,
  itemName: string,
  price: number,
  info: LazadaItemInfo
): Promise<MatchedVariation> {
  const matched = await resolveLazadaVariation(companyId, sku, itemName, price, info);

  // สินค้าที่ match กับของเดิมในคลัง (link/SKU/code) ก็ต้องได้รูปจาก Lazada ด้วย —
  // ตอนสร้างใหม่เท่านั้นไม่พอ เพราะ Lazada ยังไม่มี product import ของตัวเอง
  // (helper ข้ามให้เองถ้าสินค้ามีรูปอยู่แล้ว)
  if (!matched.isNewVariation && info.image) {
    await ensureVariationImage(companyId, matched.product_id, matched.variation_id, info.image, 'lazada');
  }

  return matched;
}

async function resolveLazadaVariation(
  companyId: string,
  sku: string,
  itemName: string,
  price: number,
  info: LazadaItemInfo
): Promise<MatchedVariation> {
  // 1. marketplace_product_links
  const { data: link } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id, variation_id')
    .eq('account_id', info.accountId)
    .eq('external_item_id', info.externalItemId)
    .eq('external_model_id', info.externalModelId)
    .limit(1)
    .maybeSingle();

  if (link?.variation_id) {
    const { data: variation } = await supabaseAdmin
      .from('product_variations')
      .select('id, product_id, sku')
      .eq('id', link.variation_id)
      .single();
    if (variation) {
      return {
        variation_id: variation.id,
        product_id: variation.product_id,
        product_code: variation.sku || '',
        isNewProduct: false,
        isNewVariation: false,
      };
    }
  }

  // 2. SKU match
  if (sku) {
    const { data: bySkuVar } = await supabaseAdmin
      .from('product_variations')
      .select('id, product_id, sku')
      .eq('company_id', companyId)
      .eq('sku', sku)
      .limit(1)
      .maybeSingle();
    if (bySkuVar) {
      return {
        variation_id: bySkuVar.id,
        product_id: bySkuVar.product_id,
        product_code: bySkuVar.sku || '',
        isNewProduct: false,
        isNewVariation: false,
      };
    }
  }

  // 3. Product code match
  if (sku) {
    const { data: byCodeProduct } = await supabaseAdmin
      .from('products')
      .select('id, code, product_variations!inner(id, sku)')
      .eq('company_id', companyId)
      .eq('code', sku)
      .limit(1)
      .maybeSingle();
    const pv = (byCodeProduct?.product_variations as { id: string; sku: string | null }[] | undefined)?.[0];
    if (byCodeProduct && pv) {
      return {
        variation_id: pv.id,
        product_id: byCodeProduct.id,
        product_code: byCodeProduct.code || '',
        isNewProduct: false,
        isNewVariation: false,
      };
    }
  }

  // 4. สร้างใหม่ (simple product 1 variation — schema จริงใช้ code/name/default_price)
  const productName = itemName.split(' - ')[0] || itemName;
  const productCode = sku || `LZ-${info.externalItemId}`;
  const variationLabel = itemName.includes(' - ')
    ? itemName.split(' - ').slice(1).join(' - ')
    : productName;

  const { data: newProduct, error: productErr } = await supabaseAdmin
    .from('products')
    .insert({
      company_id: companyId,
      code: productCode,
      name: productName,
      variation_label: variationLabel,
      image: info.image || null,
      source: 'lazada',
      is_active: true,
    })
    .select('id, code')
    .single();

  if (productErr || !newProduct) {
    // ออเดอร์อื่นในรอบเดียวกันอาจเพิ่งสร้างสินค้าตัวเดียวกัน (insert แข่งกัน) — code ชน unique
    // ให้กลับไปใช้ตัวที่ชนะแทนการล้มทั้งออเดอร์ (เจอจริง 2 ใบแรกของ Lazada 2026-08-28)
    if (productErr?.code === '23505') {
      const { data: raced } = await supabaseAdmin
        .from('products')
        .select('id, code, product_variations(id, sku)')
        .eq('company_id', companyId)
        .eq('code', productCode)
        .limit(1)
        .maybeSingle();
      const racedVar = (raced?.product_variations as { id: string; sku: string | null }[] | undefined)?.[0];
      if (raced && racedVar) {
        return {
          variation_id: racedVar.id,
          product_id: raced.id,
          product_code: raced.code || '',
          isNewProduct: false,
          isNewVariation: false,
        };
      }
    }
    throw new Error(`Failed to create product: ${productErr?.message}`);
  }

  const { data: newVariation, error: varErr } = await supabaseAdmin
    .from('product_variations')
    .insert({
      company_id: companyId,
      product_id: newProduct.id,
      sku: sku || productCode,
      variation_label: variationLabel,
      default_price: price,
      is_active: true,
    })
    .select('id, sku')
    .single();

  if (varErr || !newVariation) {
    await supabaseAdmin.from('products').delete().eq('id', newProduct.id);
    throw new Error(`Failed to create variation: ${varErr?.message}`);
  }

  // ใช้ helper กลางเสมอ — insert ตรงเคยพลาด storage_path (NOT NULL) แล้วรูปหายเงียบ (2026-08-28)
  if (info.image) {
    await upsertProductImage(companyId, newProduct.id, newVariation.id, info.image, 0, 'lazada');
  }

  console.log(`[Lazada Sync] Created product: ${productName} (${productCode})`);

  return {
    variation_id: newVariation.id,
    product_id: newProduct.id,
    product_code: newProduct.code || '',
    isNewProduct: true,
    isNewVariation: true,
  };
}

// --- Stock return on cancel --------------------------------------------------------

async function returnStockForCancelledOrder(
  companyId: string,
  orderId: string,
  warehouseId: string,
  previousOrderStatus: string,
  lazadaOrderId: string
) {
  if (!['ready_to_ship', 'processing', 'shipping'].includes(previousOrderStatus)) return;

  try {
    const stockConfig = await getStockConfig(companyId);
    if (!stockConfig.stockEnabled) return;

    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select('id, variation_id, quantity')
      .eq('order_id', orderId);

    for (const oi of (orderItems || [])) {
      if (!oi.variation_id) continue;
      try {
        await returnStockService({
          supabase: supabaseAdmin,
          companyId,
          warehouseId,
          variationId: oi.variation_id,
          qty: Number(oi.quantity),
          referenceType: 'order',
          referenceId: orderId,
          notes: `Lazada cancelled: ${lazadaOrderId}`,
        });
      } catch (err) {
        console.error(`[Lazada Sync] Stock return error for ${lazadaOrderId} item ${oi.variation_id}:`, err);
      }
    }
    console.log(`[Lazada Sync] Stock returned for cancelled order ${lazadaOrderId}`);
  } catch (err) {
    console.error(`[Lazada Sync] Stock return failed for ${lazadaOrderId}:`, err);
  }
}

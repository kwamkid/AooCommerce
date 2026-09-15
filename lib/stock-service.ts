/**
 * Centralized Stock Service
 *
 * ทุก stock operation (เพิ่ม, ลด, จอง, ปล่อยจอง, โอน, คืน, ปรับ, ชดเชยส่วนต่าง, transit)
 * ต้องเรียกผ่าน service นี้เท่านั้น — ห้าม inline ใน route
 *
 * รับ SupabaseClient จาก caller เพื่อรองรับทั้ง authenticated routes
 * และ public routes (เช่น replenishment receive)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getCompositeParts } from '@/lib/composite';

// ===== Types =====

export interface StockOpParams {
  supabase: SupabaseClient;
  companyId: string;
  warehouseId: string;
  variationId: string;
  qty: number;
  referenceType: string;  // 'order' | 'replenishment' | 'transfer' | 'credit_note' | 'pos_order' | 'manual' | 'receive' | 'issue' | 'consignment_report'
  referenceId: string;
  notes: string;
  createdBy?: string | null;
  unitCost?: number | null;
}

export interface StockOpResult {
  balanceAfter: number;
  inventoryId: string;
}

export class InsufficientStockError extends Error {
  constructor(
    public variationId: string,
    public requested: number,
    public available: number,
    public currentQty: number,
    public reservedQty: number,
  ) {
    super(
      `สินค้ามี ${available} ชิ้นพร้อมใช้ (คงเหลือ ${currentQty}, จอง ${reservedQty}) แต่ขอ ${requested} ชิ้น`
    );
    this.name = 'InsufficientStockError';
  }
}

// ===== Internal Helpers =====

async function getOrCreateInventory(
  supabase: SupabaseClient,
  companyId: string,
  warehouseId: string,
  variationId: string,
): Promise<{ id: string; quantity: number; reserved_quantity: number; in_transit_quantity: number }> {
  const { data: existing } = await supabase
    .from('inventory')
    .select('id, quantity, reserved_quantity, in_transit_quantity')
    .eq('company_id', companyId)
    .eq('warehouse_id', warehouseId)
    .eq('variation_id', variationId)
    .single();

  if (existing) return existing;

  // Create new row with zero quantities
  const { data: created, error } = await supabase
    .from('inventory')
    .insert({
      company_id: companyId,
      warehouse_id: warehouseId,
      variation_id: variationId,
      quantity: 0,
      reserved_quantity: 0,
      in_transit_quantity: 0,
    })
    .select('id, quantity, reserved_quantity, in_transit_quantity')
    .single();

  if (error || !created) throw new Error(`Failed to create inventory row: ${error?.message}`);
  return created;
}

interface InventoryLevels { quantity: number; reserved_quantity: number; in_transit_quantity: number }

/**
 * เปลี่ยนยอดแบบ atomic — DB บวก/ลบเองในคำสั่งเดียว (RPC `apply_inventory_delta` · row lock ของ UPDATE)
 *
 * ของเดิมอ่านยอด → คิดใน JS → เขียนทับ: Lazada ส่ง "shipped" 2 ออเดอร์ห่างกัน 6 ms ต่างอ่าน 18 แล้ว
 * ต่างเขียน 17 = ของออก 2 ชิ้นแต่คงคลังลด 1 (พบ 7 คู่ / 6 ตัวเลือก มิ.ย.–ส.ค. 2026) — ดู fix-bug.md 2026-09-13
 *
 * `requireAvailable` = ให้ DB เช็ค quantity − reserved ≥ ค่านี้ ณ ตอน lock ด้วย (กัน oversell ตอนชนกัน)
 * ไม่พอ → คืน null ให้ผู้เรียกโยน InsufficientStockError จากยอดที่อ่านใหม่
 */
async function applyDelta(
  supabase: SupabaseClient,
  inventoryId: string,
  delta: { qty?: number; reserved?: number; transit?: number; setQuantity?: number; requireAvailable?: number },
): Promise<InventoryLevels | null> {
  const { data, error } = await supabase.rpc('apply_inventory_delta', {
    p_inventory_id: inventoryId,
    p_qty: delta.qty ?? 0,
    p_reserved: delta.reserved ?? 0,
    p_transit: delta.transit ?? 0,
    p_set_quantity: delta.setQuantity ?? null,
    p_require_available: delta.requireAvailable ?? null,
  });
  if (error) throw new Error(`Failed to update inventory: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    quantity: Number(row.quantity) || 0,
    reserved_quantity: Number(row.reserved_quantity) || 0,
    in_transit_quantity: Number(row.in_transit_quantity) || 0,
  };
}

/** ยอดล่าสุดตอนที่ DB ปฏิเสธเพราะของไม่พอ — เอาไปใส่ InsufficientStockError ให้ข้อความตรงความจริง */
async function throwInsufficient(supabase: SupabaseClient, inventoryId: string, variationId: string, requested: number): Promise<never> {
  const { data } = await supabase.from('inventory').select('quantity, reserved_quantity').eq('id', inventoryId).single();
  const quantity = Number(data?.quantity) || 0;
  const reserved = Number(data?.reserved_quantity) || 0;
  throw new InsufficientStockError(variationId, requested, quantity - reserved, quantity, reserved);
}

async function logTransaction(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    warehouseId: string;
    variationId: string;
    type: string;
    quantity: number;
    balanceAfter: number;
    referenceType: string;
    referenceId: string;
    notes: string;
    createdBy?: string | null;
    unitCost?: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('inventory_transactions')
    .insert({
      company_id: params.companyId,
      warehouse_id: params.warehouseId,
      variation_id: params.variationId,
      type: params.type,
      quantity: params.quantity,
      balance_after: params.balanceAfter,
      reference_type: params.referenceType,
      reference_id: params.referenceId,
      notes: params.notes,
      created_by: params.createdBy || null,
      ...(params.unitCost != null ? { unit_cost: params.unitCost } : {}),
    });
  if (error) throw new Error(`Failed to log transaction: ${error.message}`);
}

// ===== Composite products (สินค้าชุด) =====
// A combo variation holds no stock of its own — sold-stock ops (reserve / unreserve / deduct /
// deductAndUnreserve / return) fan out to its components (qty × pieces per set).
// Internal ops (receive / adjust / transfer / transit) never see combos: the DB guard
// `trg_guard_composite_inventory` rejects creating an inventory row for one.

async function forEachComponent<P extends StockOpParams>(
  params: P,
  op: (p: P) => Promise<StockOpResult>,
  opts: { checkAvailable?: boolean } = {},
): Promise<StockOpResult | null> {
  const parts = await getCompositeParts(params.supabase, params.variationId, params.companyId);
  if (!parts) return null;

  const legs = parts.map(part => ({
    ...params,
    variationId: part.variationId,
    qty: params.qty * part.quantity,
    notes: `${params.notes} · ชิ้นส่วนสินค้าชุด`,
  }));

  // Check every component before touching any, so a short one never leaves a half-deducted set
  if (opts.checkAvailable) {
    for (const leg of legs) {
      const inv = await getOrCreateInventory(leg.supabase, leg.companyId, leg.warehouseId, leg.variationId);
      const available = inv.quantity - inv.reserved_quantity;
      if (leg.qty > available) {
        throw new InsufficientStockError(leg.variationId, leg.qty, available, inv.quantity, inv.reserved_quantity);
      }
    }
  }

  let balanceAfter = Infinity;
  let inventoryId = '';
  for (let i = 0; i < legs.length; i++) {
    const result = await op(legs[i]);
    // Sets still possible from this component after the op
    balanceAfter = Math.min(balanceAfter, Math.floor(result.balanceAfter / parts[i].quantity));
    if (!inventoryId) inventoryId = result.inventoryId;
  }
  return { balanceAfter, inventoryId };
}

// ===== Public Functions =====

/**
 * 1. addStock — รับเข้า (type: 'in')
 * quantity ↑
 */
export async function addStock(params: StockOpParams): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const levels = await applyDelta(params.supabase, inv.id, { qty: params.qty });
  const newQty = levels?.quantity ?? inv.quantity + params.qty;

  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'in',
    quantity: params.qty,
    balanceAfter: newQty,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
    unitCost: params.unitCost,
  });

  return { balanceAfter: newQty, inventoryId: inv.id };
}

/**
 * 2. deductStock — เบิกออก (type: 'out')
 * quantity ↓
 * checkAvailable=true → throws InsufficientStockError
 */
export async function deductStock(
  params: StockOpParams & { checkAvailable?: boolean },
): Promise<StockOpResult> {
  return (await forEachComponent(params, deductOne, { checkAvailable: params.checkAvailable })) ?? deductOne(params);
}

async function deductOne(
  params: StockOpParams & { checkAvailable?: boolean },
): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  // เช็คพอไหมที่ DB ตอน lock (ไม่ใช่จากยอดที่อ่านมาก่อนหน้า ซึ่งอาจเก่าแล้วถ้ามีคำขออื่นแทรก)
  const levels = await applyDelta(params.supabase, inv.id, {
    qty: -params.qty,
    requireAvailable: params.checkAvailable ? params.qty : undefined,
  });
  if (!levels) await throwInsufficient(params.supabase, inv.id, params.variationId, params.qty);
  const newQty = levels!.quantity;
  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'out',
    quantity: params.qty,
    balanceAfter: newQty,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: newQty, inventoryId: inv.id };
}

/**
 * 3. reserveStock — จอง (type: 'reserve')
 * reserved_quantity ↑
 * balance_after = quantity (existing convention)
 */
export async function reserveStock(params: StockOpParams): Promise<StockOpResult> {
  return (await forEachComponent(params, reserveOne)) ?? reserveOne(params);
}

async function reserveOne(params: StockOpParams): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const levels = await applyDelta(params.supabase, inv.id, { reserved: params.qty });
  const quantityNow = levels?.quantity ?? inv.quantity;

  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'reserve',
    quantity: params.qty,
    balanceAfter: quantityNow, // convention: balance_after = quantity, not reserved_quantity
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: quantityNow, inventoryId: inv.id };
}

/**
 * 4. unreserveStock — ปล่อยจอง (type: 'unreserve')
 * reserved_quantity ↓
 * balance_after = quantity (existing convention)
 */
export async function unreserveStock(params: StockOpParams): Promise<StockOpResult> {
  return (await forEachComponent(params, unreserveOne)) ?? unreserveOne(params);
}

async function unreserveOne(params: StockOpParams): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const levels = await applyDelta(params.supabase, inv.id, { reserved: -params.qty }); // DB กันไม่ให้ต่ำกว่า 0
  const quantityNow = levels?.quantity ?? inv.quantity;

  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'unreserve',
    quantity: params.qty,
    balanceAfter: quantityNow,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: quantityNow, inventoryId: inv.id };
}

/**
 * 5. returnStock — คืน (type: 'return')
 * quantity ↑
 */
export async function returnStock(params: StockOpParams): Promise<StockOpResult> {
  return (await forEachComponent(params, returnOne)) ?? returnOne(params);
}

async function returnOne(params: StockOpParams): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const levels = await applyDelta(params.supabase, inv.id, { qty: params.qty });
  const newQty = levels?.quantity ?? inv.quantity + params.qty;

  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'return',
    quantity: params.qty,
    balanceAfter: newQty,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: newQty, inventoryId: inv.id };
}

/**
 * 6. transferOut — โอนออก (type: 'transfer_out')
 * quantity ↓ (source warehouse)
 * checkAvailable=true → throws InsufficientStockError
 */
export async function transferOut(
  params: StockOpParams & { checkAvailable?: boolean },
): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const levels = await applyDelta(params.supabase, inv.id, {
    qty: -params.qty,
    requireAvailable: params.checkAvailable ? params.qty : undefined,
  });
  if (!levels) await throwInsufficient(params.supabase, inv.id, params.variationId, params.qty);
  const newQty = levels!.quantity;
  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'transfer_out',
    quantity: params.qty,
    balanceAfter: newQty,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: newQty, inventoryId: inv.id };
}

/**
 * 7. transferIn — โอนเข้า (type: 'transfer_in')
 * quantity ↑ (destination warehouse, upsert)
 */
export async function transferIn(params: StockOpParams): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const levels = await applyDelta(params.supabase, inv.id, { qty: params.qty });
  const newQty = levels?.quantity ?? inv.quantity + params.qty;

  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'transfer_in',
    quantity: params.qty,
    balanceAfter: newQty,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: newQty, inventoryId: inv.id };
}

/**
 * 8. adjustStock — ปรับปรุง (type: 'adjust')
 * quantity = absolute value (set, not delta)
 */
export async function adjustStock(
  params: Omit<StockOpParams, 'qty'> & { newQuantity: number },
): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const diff = params.newQuantity - inv.quantity;

  if (diff === 0) return { balanceAfter: inv.quantity, inventoryId: inv.id };

  await applyDelta(params.supabase, inv.id, { setQuantity: params.newQuantity });
  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'adjust',
    quantity: Math.abs(diff),
    balanceAfter: params.newQuantity,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: params.newQuantity, inventoryId: inv.id };
}

/**
 * 8b. offsetStock — ชดเชยด้วย "ส่วนต่าง" (type: 'adjust')
 *
 * `params.qty` = delta (+/−) ไม่ใช่ยอดปลายทาง — ต่างจาก `adjustStock` ตรงนี้
 * ใช้ตอน **ย้อนรอบซิงค์สต็อก**: รอบนั้นทำให้ยอดขยับไป d ก็คืนด้วย −d
 * ต้องคิดแบบส่วนต่างเท่านั้น เพราะระหว่างที่รอย้อนอาจมีคนขายของไปแล้ว —
 * ถ้าไปตั้งยอดปลายทางตรง ๆ (`adjustStock`) จะกลืนยอดที่ขายไประหว่างนั้นทิ้ง
 *
 * `floorAtZero=true` — คืนแล้วติดลบ (ขายเกินไปแล้ว) ให้หยุดที่ 0 แล้วคืน `clamped`
 * = จำนวนที่คืนไม่ได้ ให้ผู้เรียกเอาไปรายงานว่า "ขายเกินไป n ชิ้น"
 *
 * ⛔ เดินผ่าน `applyDelta` (RPC) เหมือน op อื่นเสมอ — DB มี trigger ปฏิเสธการเขียน
 *    `inventory` ตรง ๆ และ read-modify-write ทำยอดหายตอนคำขอชนกัน (fix-bug.md 2026-09-13)
 * ⛔ สินค้าชุดไม่มีสต็อกของตัวเอง — เหมือน `adjustStock` คือ DB guard
 *    (`trg_guard_composite_inventory`) ปฏิเสธตอนสร้างแถว inventory ให้ชุดย่อย
 */
export async function offsetStock(
  params: StockOpParams & { floorAtZero?: boolean },
): Promise<StockOpResult & { clamped?: number }> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const delta = params.qty;
  if (delta === 0) return { balanceAfter: inv.quantity, inventoryId: inv.id };

  const levels = await applyDelta(params.supabase, inv.id, { qty: delta });
  let newQty = levels?.quantity ?? inv.quantity + delta;
  // ยอดก่อนหน้าที่แท้จริง — อ่านย้อนจากค่าที่ DB คืน ไม่ใช่ค่าที่อ่านมาก่อนหน้า (อาจเก่าแล้ว)
  const before = newQty - delta;
  let clamped: number | undefined;

  if (params.floorAtZero && newQty < 0) {
    // ดันกลับด้วย "ส่วนต่างบวก" ไม่ใช่ setQuantity(0) — ถ้ามีคนเขียนแทรกระหว่างสองคำสั่ง
    // การบวกกลับจะไม่กลืนของที่เขาเพิ่งใส่เข้ามา (RPC ไม่ได้กัน quantity ติดลบให้)
    clamped = Math.abs(newQty);
    const fixed = await applyDelta(params.supabase, inv.id, { qty: clamped });
    newQty = fixed?.quantity ?? 0;
  }

  // log แถวเดียวด้วย delta จริงที่เกิดขึ้น (กรณี clamp = น้อยกว่าที่ขอ)
  const actualDelta = newQty - before;
  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'adjust',
    quantity: Math.abs(actualDelta),
    balanceAfter: newQty,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: clamped ? `${params.notes} · คืนได้ไม่ครบ ขาดอีก ${clamped} ชิ้น (ขายไปแล้ว)` : params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: newQty, inventoryId: inv.id, ...(clamped ? { clamped } : {}) };
}

/**
 * 9. deductAndUnreserve — จัดส่ง / โอนออก (quantity ↓ + reserved ↓)
 * Default type: 'out', transfers use 'transfer_out'
 */
export async function deductAndUnreserve(
  params: StockOpParams & { transactionType?: 'out' | 'transfer_out' },
): Promise<StockOpResult> {
  return (await forEachComponent(params, deductAndUnreserveOne)) ?? deductAndUnreserveOne(params);
}

async function deductAndUnreserveOne(
  params: StockOpParams & { transactionType?: 'out' | 'transfer_out' },
): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const txType = params.transactionType || 'out';
  const levels = await applyDelta(params.supabase, inv.id, { qty: -params.qty, reserved: -params.qty });
  const newQty = levels?.quantity ?? inv.quantity - params.qty;

  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: txType,
    quantity: params.qty,
    balanceAfter: newQty,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: newQty, inventoryId: inv.id };
}

/**
 * 10. shipToTransit — จัดส่งใบเติมสินค้า
 * quantity ↓, reserved_quantity ↓, in_transit_quantity ↑
 */
export async function shipToTransit(params: StockOpParams): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const levels = await applyDelta(params.supabase, inv.id, { qty: -params.qty, reserved: -params.qty, transit: params.qty });
  const newQty = levels?.quantity ?? inv.quantity - params.qty;

  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'out',
    quantity: params.qty,
    balanceAfter: newQty,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: newQty, inventoryId: inv.id };
}

/**
 * 11. receiveFromTransit — รับของจาก transit
 * source: in_transit_quantity ↓
 * dest: quantity ↑ (upsert)
 */
export async function receiveFromTransit(params: {
  supabase: SupabaseClient;
  companyId: string;
  sourceWarehouseId: string;
  destWarehouseId: string;
  variationId: string;
  qty: number;
  referenceType: string;
  referenceId: string;
  notes: string;
  createdBy?: string | null;
}): Promise<{ sourceResult: StockOpResult; destResult: StockOpResult }> {
  // Clear in_transit on source
  const srcInv = await getOrCreateInventory(params.supabase, params.companyId, params.sourceWarehouseId, params.variationId);
  await applyDelta(params.supabase, srcInv.id, { transit: -params.qty });

  // Add stock to destination
  const destInv = await getOrCreateInventory(params.supabase, params.companyId, params.destWarehouseId, params.variationId);
  const destLevels = await applyDelta(params.supabase, destInv.id, { qty: params.qty });
  const newDestQty = destLevels?.quantity ?? destInv.quantity + params.qty;

  // Log transaction on destination warehouse
  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.destWarehouseId,
    variationId: params.variationId,
    type: 'in',
    quantity: params.qty,
    balanceAfter: newDestQty,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return {
    sourceResult: { balanceAfter: srcInv.quantity, inventoryId: srcInv.id },
    destResult: { balanceAfter: newDestQty, inventoryId: destInv.id },
  };
}

/**
 * 12. cancelFromShipped — ยกเลิกจากสถานะจัดส่งแล้ว
 * quantity ↑, in_transit_quantity ↓
 */
export async function cancelFromShipped(params: StockOpParams): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const levels = await applyDelta(params.supabase, inv.id, { qty: params.qty, transit: -params.qty });
  const newQty = levels?.quantity ?? inv.quantity + params.qty;

  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'return',
    quantity: params.qty,
    balanceAfter: newQty,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: newQty, inventoryId: inv.id };
}

/**
 * 13. updateWeightedAverageCost — คำนวณต้นทุนเฉลี่ยถ่วงน้ำหนัก (WAC)
 *
 * สูตร: new_wac = (existing_qty × old_wac + received_qty × new_unit_cost) / total_qty
 *
 * เรียกเฉพาะจาก inventory receives เท่านั้น
 * ห้ามเรียกจาก: ย้ายคลัง, ส่งตัวแทน, ส่งห้าง, return
 *
 * ต้องเรียกหลัง addStock() เพราะ total qty ต้องรวมของที่เพิ่งรับเข้าแล้ว
 */
export async function updateWeightedAverageCost(
  supabase: SupabaseClient,
  companyId: string,
  variationId: string,
  receivedQty: number,
  newUnitCost: number,
): Promise<number> {
  // Atomic WAC update via Postgres RPC (SELECT FOR UPDATE prevents race conditions)
  const { data, error } = await supabase.rpc('update_weighted_average_cost', {
    p_variation_id: variationId,
    p_company_id: companyId,
    p_received_qty: receivedQty,
    p_new_unit_cost: newUnitCost,
  });

  if (error) {
    console.error('[WAC] RPC error:', error.message);
    return newUnitCost; // fallback to new cost
  }

  return data ?? newUnitCost;
}

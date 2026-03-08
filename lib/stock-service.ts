/**
 * Centralized Stock Service
 *
 * ทุก stock operation (เพิ่ม, ลด, จอง, ปล่อยจอง, โอน, คืน, ปรับ, transit)
 * ต้องเรียกผ่าน service นี้เท่านั้น — ห้าม inline ใน route
 *
 * รับ SupabaseClient จาก caller เพื่อรองรับทั้ง authenticated routes
 * และ public routes (เช่น replenishment receive)
 */

import { SupabaseClient } from '@supabase/supabase-js';

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

async function updateInventory(
  supabase: SupabaseClient,
  inventoryId: string,
  fields: Record<string, number | string>,
): Promise<void> {
  const { error } = await supabase
    .from('inventory')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', inventoryId);
  if (error) throw new Error(`Failed to update inventory: ${error.message}`);
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

// ===== Public Functions =====

/**
 * 1. addStock — รับเข้า (type: 'in')
 * quantity ↑
 */
export async function addStock(params: StockOpParams): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const newQty = inv.quantity + params.qty;

  await updateInventory(params.supabase, inv.id, { quantity: newQty });
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
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const available = inv.quantity - inv.reserved_quantity;

  if (params.checkAvailable && params.qty > available) {
    throw new InsufficientStockError(
      params.variationId, params.qty, available, inv.quantity, inv.reserved_quantity,
    );
  }

  const newQty = inv.quantity - params.qty;
  await updateInventory(params.supabase, inv.id, { quantity: newQty });
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
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const newReserved = inv.reserved_quantity + params.qty;

  await updateInventory(params.supabase, inv.id, { reserved_quantity: newReserved });
  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'reserve',
    quantity: params.qty,
    balanceAfter: inv.quantity, // convention: balance_after = quantity, not reserved_quantity
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: inv.quantity, inventoryId: inv.id };
}

/**
 * 4. unreserveStock — ปล่อยจอง (type: 'unreserve')
 * reserved_quantity ↓
 * balance_after = quantity (existing convention)
 */
export async function unreserveStock(params: StockOpParams): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const newReserved = Math.max(0, inv.reserved_quantity - params.qty);

  await updateInventory(params.supabase, inv.id, { reserved_quantity: newReserved });
  await logTransaction(params.supabase, {
    companyId: params.companyId,
    warehouseId: params.warehouseId,
    variationId: params.variationId,
    type: 'unreserve',
    quantity: params.qty,
    balanceAfter: inv.quantity,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    notes: params.notes,
    createdBy: params.createdBy,
  });

  return { balanceAfter: inv.quantity, inventoryId: inv.id };
}

/**
 * 5. returnStock — คืน (type: 'return')
 * quantity ↑
 */
export async function returnStock(params: StockOpParams): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const newQty = inv.quantity + params.qty;

  await updateInventory(params.supabase, inv.id, { quantity: newQty });
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
  const available = inv.quantity - inv.reserved_quantity;

  if (params.checkAvailable && params.qty > available) {
    throw new InsufficientStockError(
      params.variationId, params.qty, available, inv.quantity, inv.reserved_quantity,
    );
  }

  const newQty = inv.quantity - params.qty;
  await updateInventory(params.supabase, inv.id, { quantity: newQty });
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
  const newQty = inv.quantity + params.qty;

  await updateInventory(params.supabase, inv.id, { quantity: newQty });
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

  await updateInventory(params.supabase, inv.id, { quantity: params.newQuantity });
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
 * 9. deductAndUnreserve — จัดส่ง / โอนออก (quantity ↓ + reserved ↓)
 * Default type: 'out', transfers use 'transfer_out'
 */
export async function deductAndUnreserve(
  params: StockOpParams & { transactionType?: 'out' | 'transfer_out' },
): Promise<StockOpResult> {
  const inv = await getOrCreateInventory(params.supabase, params.companyId, params.warehouseId, params.variationId);
  const newQty = inv.quantity - params.qty;
  const newReserved = Math.max(0, inv.reserved_quantity - params.qty);
  const txType = params.transactionType || 'out';

  await updateInventory(params.supabase, inv.id, { quantity: newQty, reserved_quantity: newReserved });
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
  const newQty = inv.quantity - params.qty;
  const newReserved = Math.max(0, inv.reserved_quantity - params.qty);
  const newTransit = (inv.in_transit_quantity || 0) + params.qty;

  await updateInventory(params.supabase, inv.id, {
    quantity: newQty,
    reserved_quantity: newReserved,
    in_transit_quantity: newTransit,
  });
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
  const newTransit = Math.max(0, (srcInv.in_transit_quantity || 0) - params.qty);
  await updateInventory(params.supabase, srcInv.id, { in_transit_quantity: newTransit });

  // Add stock to destination
  const destInv = await getOrCreateInventory(params.supabase, params.companyId, params.destWarehouseId, params.variationId);
  const newDestQty = destInv.quantity + params.qty;
  await updateInventory(params.supabase, destInv.id, { quantity: newDestQty });

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
  const newQty = inv.quantity + params.qty;
  const newTransit = Math.max(0, (inv.in_transit_quantity || 0) - params.qty);

  await updateInventory(params.supabase, inv.id, {
    quantity: newQty,
    in_transit_quantity: newTransit,
  });
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

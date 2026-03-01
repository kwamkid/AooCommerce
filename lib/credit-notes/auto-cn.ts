/**
 * Shared Credit Note creation logic.
 * Used by both the API POST handler and Shopee webhook auto-CN.
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

interface CreateCnParams {
  companyId: string;
  orderId: string;
  type: 'void' | 'refund' | 'exchange';
  reason?: string;
  items?: { order_item_id: string; quantity: number }[];
  createdBy?: string | null;
}

interface CreateCnResult {
  cn_id: string;
  cn_number: string;
}

/**
 * Create a Credit Note for an order.
 * Handles: item calculation, CN number generation, stock return/unreserve,
 * and order cancellation (for void type only).
 *
 * Returns null if order not found, already cancelled, or no valid items.
 * Throws on unexpected errors.
 */
export async function createCreditNote(params: CreateCnParams): Promise<CreateCnResult | null> {
  const { companyId, orderId, type, reason, items, createdBy } = params;

  // Get order
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, order_status, payment_status, warehouse_id, source, subtotal, discount_amount, vat_amount, total_amount')
    .eq('id', orderId)
    .eq('company_id', companyId)
    .single();

  if (orderError || !order) return null;
  if (order.order_status === 'cancelled' && type !== 'void') return null;

  // Get order items
  const { data: orderItems } = await supabaseAdmin
    .from('order_items')
    .select('id, variation_id, product_name, product_code, variation_label, quantity, unit_price, discount_percent')
    .eq('order_id', orderId)
    .eq('company_id', companyId);

  if (!orderItems || orderItems.length === 0) return null;

  // Build CN items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cnItems: any[] = [];
  let cnSubtotal = 0;
  let cnDiscount = 0;

  if (type === 'void') {
    // Void = all items, full quantity
    cnItems = orderItems.map(oi => {
      const lineTotal = Number(oi.unit_price || 0) * Number(oi.quantity || 0);
      const lineDiscount = oi.discount_percent
        ? lineTotal * Number(oi.discount_percent) / 100
        : 0;
      cnSubtotal += lineTotal;
      cnDiscount += lineDiscount;
      return {
        order_item_id: oi.id,
        variation_id: oi.variation_id,
        product_name: oi.product_name || '',
        product_code: oi.product_code || '',
        variation_label: oi.variation_label || '',
        quantity: oi.quantity,
        unit_price: oi.unit_price || 0,
        discount_amount: lineDiscount,
        total: lineTotal - lineDiscount,
      };
    });
  } else {
    // Refund/Exchange = specific items with specified quantities
    const selectedItems = items || orderItems.map(oi => ({ order_item_id: oi.id, quantity: Number(oi.quantity) }));
    for (const refundItem of selectedItems) {
      const oi = orderItems.find(o => o.id === refundItem.order_item_id);
      if (!oi) continue;

      const qty = Math.min(refundItem.quantity, Number(oi.quantity));
      if (qty <= 0) continue;

      const lineTotal = Number(oi.unit_price || 0) * qty;
      const lineDiscount = oi.discount_percent
        ? lineTotal * Number(oi.discount_percent) / 100
        : 0;
      cnSubtotal += lineTotal;
      cnDiscount += lineDiscount;

      cnItems.push({
        order_item_id: oi.id,
        variation_id: oi.variation_id,
        product_name: oi.product_name || '',
        product_code: oi.product_code || '',
        variation_label: oi.variation_label || '',
        quantity: qty,
        unit_price: oi.unit_price || 0,
        discount_amount: lineDiscount,
        total: lineTotal - lineDiscount,
      });
    }

    if (cnItems.length === 0) return null;
  }

  // Calculate VAT
  const cnTotalBeforeVat = cnSubtotal - cnDiscount;
  let cnVat = 0;
  if (type === 'void') {
    cnVat = Number(order.vat_amount || 0);
  } else if (Number(order.vat_amount || 0) > 0 && Number(order.subtotal || 0) > 0) {
    const vatRate = Number(order.vat_amount) / (Number(order.subtotal) - Number(order.discount_amount || 0));
    cnVat = Math.round(cnTotalBeforeVat * vatRate * 100) / 100;
  }
  const cnTotal = cnTotalBeforeVat + cnVat;

  // Generate CN number
  const { data: cnNumber, error: cnNumError } = await supabaseAdmin
    .rpc('generate_cn_number', { p_company_id: companyId });

  if (cnNumError || !cnNumber) {
    throw new Error('Failed to generate CN number');
  }

  const defaultReason = type === 'void' ? 'ยกเลิกบิล' : type === 'exchange' ? 'เปลี่ยนสินค้า' : 'คืนสินค้า';

  // Insert credit note
  const { data: cn, error: cnError } = await supabaseAdmin
    .from('credit_notes')
    .insert({
      company_id: companyId,
      cn_number: cnNumber,
      order_id: orderId,
      type,
      status: 'issued',
      reason: reason || defaultReason,
      subtotal: cnSubtotal,
      discount_amount: cnDiscount,
      vat_amount: cnVat,
      total_amount: cnTotal,
      created_by: createdBy || null,
    })
    .select('id, cn_number')
    .single();

  if (cnError || !cn) {
    throw new Error(cnError?.message || 'Failed to create credit note');
  }

  // Insert CN items
  await supabaseAdmin
    .from('credit_note_items')
    .insert(cnItems.map(item => ({ credit_note_id: cn.id, ...item })));

  // Stock return/unreserve
  const stockConfig = await getStockConfig(companyId);
  if (stockConfig.stockEnabled && order.warehouse_id) {
    const wasShipped = ['shipping', 'completed'].includes(order.order_status);
    const wasReserved = ['new', 'ready_to_ship', 'processing'].includes(order.order_status);

    if (wasShipped || wasReserved) {
      for (const item of cnItems) {
        if (!item.variation_id) continue;
        try {
          const { data: inv } = await supabaseAdmin
            .from('inventory')
            .select('id, quantity, reserved_quantity')
            .eq('warehouse_id', order.warehouse_id)
            .eq('variation_id', item.variation_id)
            .eq('company_id', companyId)
            .single();

          if (!inv) continue;

          if (wasShipped) {
            const newQty = Number(inv.quantity || 0) + item.quantity;
            await supabaseAdmin
              .from('inventory')
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq('id', inv.id);
            await supabaseAdmin
              .from('inventory_transactions')
              .insert({
                company_id: companyId,
                warehouse_id: order.warehouse_id,
                variation_id: item.variation_id,
                type: 'return',
                quantity: item.quantity,
                balance_after: newQty,
                reference_type: 'credit_note',
                reference_id: cn.id,
                notes: `CN ${cnNumber} — ${reason || type}`,
                created_by: createdBy || null,
                created_at: new Date().toISOString(),
              });
          } else {
            const newReserved = Math.max(0, Number(inv.reserved_quantity || 0) - item.quantity);
            await supabaseAdmin
              .from('inventory')
              .update({ reserved_quantity: newReserved, updated_at: new Date().toISOString() })
              .eq('id', inv.id);
            await supabaseAdmin
              .from('inventory_transactions')
              .insert({
                company_id: companyId,
                warehouse_id: order.warehouse_id,
                variation_id: item.variation_id,
                type: 'unreserve',
                quantity: item.quantity,
                balance_after: Number(inv.quantity || 0),
                reference_type: 'credit_note',
                reference_id: cn.id,
                notes: `CN ${cnNumber} — ${reason || type}`,
                created_by: createdBy || null,
                created_at: new Date().toISOString(),
              });
          }
        } catch (stockErr) {
          console.error('[CN] Stock error:', stockErr);
        }
      }
    }
  }

  // If void → cancel the order
  if (type === 'void') {
    await supabaseAdmin
      .from('orders')
      .update({
        order_status: 'cancelled',
        payment_status: 'cancelled',
        cancellation_reason: `CN ${cnNumber}: ${reason || 'ยกเลิกบิล'}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)
      .eq('company_id', companyId);
  }

  return { cn_id: cn.id, cn_number: cn.cn_number };
}

/**
 * Check if a CN already exists for an order (dedup for auto-CN).
 */
export async function hasCreditNote(companyId: string, orderId: string, type?: string): Promise<boolean> {
  let query = supabaseAdmin
    .from('credit_notes')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('order_id', orderId)
    .eq('status', 'issued');

  if (type) {
    query = query.eq('type', type);
  }

  const { count } = await query;
  return (count || 0) > 0;
}

// Path: app/api/pos/orders/void/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// POST — Void a POS order
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { order_id, reason } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    // Get order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, order_status, source, pos_session_id, warehouse_id, receipt_number')
      .eq('id', order_id)
      .eq('company_id', auth.companyId)
      .eq('source', 'pos')
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'POS order not found' }, { status: 404 });
    }

    if (order.order_status === 'cancelled') {
      return NextResponse.json({ error: 'Order already voided' }, { status: 400 });
    }

    // Get order items for stock return
    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select('variation_id, quantity')
      .eq('order_id', order_id)
      .eq('company_id', auth.companyId);

    // Return stock
    const stockConfig = await getStockConfig(auth.companyId);
    if (stockConfig.stockEnabled && order.warehouse_id) {
      for (const item of (orderItems || [])) {
        if (!item.variation_id) continue;
        try {
          const { data: inv } = await supabaseAdmin
            .from('inventory')
            .select('id, quantity')
            .eq('warehouse_id', order.warehouse_id)
            .eq('variation_id', item.variation_id)
            .eq('company_id', auth.companyId)
            .single();

          if (inv) {
            const newQty = Number(inv.quantity || 0) + item.quantity;
            await supabaseAdmin
              .from('inventory')
              .update({
                quantity: newQty,
                updated_at: new Date().toISOString(),
              })
              .eq('id', inv.id);

            await supabaseAdmin
              .from('inventory_transactions')
              .insert({
                company_id: auth.companyId,
                warehouse_id: order.warehouse_id,
                variation_id: item.variation_id,
                type: 'return',
                quantity: item.quantity,
                balance_after: newQty,
                reference_type: 'pos_order',
                reference_id: order_id,
                notes: `POS Void ${order.receipt_number || ''} — ${reason || ''}`,
                created_by: auth.userId,
                created_at: new Date().toISOString(),
              });
          }
        } catch (stockErr) {
          console.error('[POS Void] Stock return error:', stockErr);
        }
      }
    }

    // Update order status
    await supabaseAdmin
      .from('orders')
      .update({
        order_status: 'cancelled',
        payment_status: 'cancelled',
        cancellation_reason: reason || 'POS Void',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order_id)
      .eq('company_id', auth.companyId);

    // Increment session void count
    if (order.pos_session_id) {
      const { data: session } = await supabaseAdmin
        .from('pos_sessions')
        .select('total_voids, total_sales, total_orders')
        .eq('id', order.pos_session_id)
        .single();

      if (session) {
        // Get the voided order's total to subtract from session
        const { data: voidedOrder } = await supabaseAdmin
          .from('orders')
          .select('total_amount')
          .eq('id', order_id)
          .single();

        await supabaseAdmin
          .from('pos_sessions')
          .update({
            total_voids: (session.total_voids || 0) + 1,
            total_sales: Number(session.total_sales || 0) - Number(voidedOrder?.total_amount || 0),
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.pos_session_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

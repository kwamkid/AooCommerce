// Path: app/api/pos/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

interface PosItemInput {
  variation_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  variation_label?: string;
  quantity: number;
  unit_price: number;
  discount_type?: 'percent' | 'amount';
  discount_value?: number;
}

interface PosTender {
  payment_channel_id: string;
  payment_method: string;
  amount: number;
  change_amount?: number;
  reference?: string;
}

// GET — List POS orders by session or date
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const date = searchParams.get('date');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, receipt_number, customer_id, total_amount,
        payment_method, payment_status, order_status, source,
        pos_session_id, created_by, created_at,
        customer:customers(id, name, customer_code),
        items:order_items(id, product_name, variation_label, quantity, unit_price, total)
      `, { count: 'exact' })
      .eq('company_id', auth.companyId)
      .eq('source', 'pos')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (sessionId) {
      query = query.eq('pos_session_id', sessionId);
    }

    if (date) {
      query = query.gte('created_at', `${date}T00:00:00`)
                    .lt('created_at', `${date}T23:59:59.999`);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      orders: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Create a POS order
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      pos_session_id,
      customer_id,
      items,
      payments,
      discount_amount: orderDiscountAmount = 0,
      notes,
    } = body as {
      pos_session_id: string;
      customer_id?: string;
      items: PosItemInput[];
      payments: PosTender[];
      discount_amount?: number;
      notes?: string;
    };

    // Validate
    if (!pos_session_id) {
      return NextResponse.json({ error: 'pos_session_id is required' }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'items is required' }, { status: 400 });
    }
    if (!payments || payments.length === 0) {
      return NextResponse.json({ error: 'payments is required' }, { status: 400 });
    }

    // Validate session is open and belongs to this user/company
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('pos_sessions')
      .select('id, warehouse_id, cashier_user_id, company_id')
      .eq('id', pos_session_id)
      .eq('company_id', auth.companyId)
      .eq('status', 'open')
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'POS session not found or closed' }, { status: 400 });
    }

    const warehouseId = session.warehouse_id || null; // null = no stock deduction

    // Calculate item totals
    let itemsSubtotal = 0;
    const itemsWithTotals = items.map(item => {
      const lineSubtotal = item.quantity * item.unit_price;
      let discountPercent = 0;
      let discountAmountItem = 0;

      if (item.discount_type === 'amount' && item.discount_value) {
        discountAmountItem = item.discount_value;
        discountPercent = lineSubtotal > 0 ? (discountAmountItem / lineSubtotal) * 100 : 0;
      } else {
        discountPercent = item.discount_value || 0;
        discountAmountItem = lineSubtotal * (discountPercent / 100);
      }

      const lineTotal = lineSubtotal - discountAmountItem;
      itemsSubtotal += lineTotal;

      return {
        ...item,
        discount_percent: discountPercent,
        discount_amount: discountAmountItem,
        discount_type: item.discount_type || 'percent',
        subtotal: lineSubtotal,
        total: lineTotal,
      };
    });

    // VAT calculation (prices are VAT-inclusive, reverse-calculate)
    const totalWithVAT = itemsSubtotal - orderDiscountAmount;
    const subtotalBeforeVAT = Math.round((totalWithVAT / 1.07) * 100) / 100;
    const vatAmount = Math.round((totalWithVAT - subtotalBeforeVAT) * 100) / 100;

    // Validate payment total
    const paymentTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const changeTotal = payments.reduce((sum, p) => sum + Number(p.change_amount || 0), 0);
    const netPayment = paymentTotal - changeTotal;

    if (Math.abs(netPayment - totalWithVAT) > 0.01) {
      return NextResponse.json(
        { error: `ยอดชำระ (${netPayment}) ไม่ตรงกับยอดรวม (${totalWithVAT})` },
        { status: 400 }
      );
    }

    // Check stock availability (only when warehouse is assigned)
    const stockConfig = await getStockConfig(auth.companyId);
    if (warehouseId && stockConfig.stockEnabled && !stockConfig.allowOversell) {
      for (const item of items) {
        const { data: inv } = await supabaseAdmin
          .from('inventory')
          .select('quantity, reserved_quantity')
          .eq('warehouse_id', warehouseId)
          .eq('variation_id', item.variation_id)
          .eq('company_id', auth.companyId)
          .single();

        const available = inv ? Number(inv.quantity || 0) - Number(inv.reserved_quantity || 0) : 0;
        if (available < item.quantity) {
          return NextResponse.json(
            { error: `สต็อก "${item.product_name}" ไม่เพียงพอ (มี ${available}, ต้องการ ${item.quantity})` },
            { status: 400 }
          );
        }
      }
    }

    // Generate order number + receipt number
    const [orderNumResult, receiptNumResult] = await Promise.all([
      supabaseAdmin.rpc('generate_order_number', { p_company_id: auth.companyId }),
      supabaseAdmin.rpc('generate_pos_receipt_number', { p_company_id: auth.companyId }),
    ]);

    if (orderNumResult.error || receiptNumResult.error) {
      console.error('[POS] Number generation error:', orderNumResult.error, receiptNumResult.error);
      return NextResponse.json({ error: 'Failed to generate order/receipt number' }, { status: 500 });
    }

    // Determine payment_method
    let paymentMethod = payments[0]?.payment_method || 'cash';
    if (payments.length > 1) {
      paymentMethod = 'multi';
    }

    // Create order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        company_id: auth.companyId,
        order_number: orderNumResult.data,
        receipt_number: receiptNumResult.data,
        customer_id: customer_id || null,
        subtotal: subtotalBeforeVAT,
        vat_amount: vatAmount,
        discount_amount: orderDiscountAmount,
        total_amount: totalWithVAT,
        payment_method: paymentMethod,
        payment_status: 'paid',
        order_status: 'completed',
        source: 'pos',
        pos_session_id,
        ...(warehouseId ? { warehouse_id: warehouseId } : {}),
        notes: notes || null,
        created_by: auth.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      console.error('[POS] Order creation error:', orderError);
      return NextResponse.json({ error: orderError.message }, { status: 400 });
    }

    // Create order items (no shipments for POS)
    for (const item of itemsWithTotals) {
      const { error: itemError } = await supabaseAdmin
        .from('order_items')
        .insert({
          company_id: auth.companyId,
          order_id: order.id,
          variation_id: item.variation_id,
          product_id: item.product_id,
          product_code: item.product_code,
          product_name: item.product_name,
          variation_label: item.variation_label || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_percent: item.discount_percent || 0,
          discount_amount: item.discount_amount || 0,
          discount_type: item.discount_type || 'percent',
          subtotal: item.subtotal,
          total: item.total,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (itemError) {
        console.error('[POS] Item creation error:', itemError);
        await supabaseAdmin.from('orders').delete().eq('id', order.id);
        return NextResponse.json({ error: itemError.message }, { status: 400 });
      }
    }

    // Immediately deduct stock (not reserve — POS is instant)
    // Only when warehouse is assigned to this session
    if (warehouseId && stockConfig.stockEnabled) {
      for (const item of itemsWithTotals) {
        if (!item.variation_id) continue;
        try {
          const { data: inv } = await supabaseAdmin
            .from('inventory')
            .select('id, quantity')
            .eq('warehouse_id', warehouseId)
            .eq('variation_id', item.variation_id)
            .eq('company_id', auth.companyId)
            .single();

          if (inv) {
            const newQty = Number(inv.quantity || 0) - item.quantity;
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
                warehouse_id: warehouseId,
                variation_id: item.variation_id,
                type: 'out',
                quantity: item.quantity,
                balance_after: newQty,
                reference_type: 'pos_order',
                reference_id: order.id,
                notes: `POS ขาย ${receiptNumResult.data}`,
                created_by: auth.userId,
                created_at: new Date().toISOString(),
              });
          }
        } catch (stockErr) {
          console.error('[POS] Stock deduction error:', stockErr);
        }
      }
    }

    // Create payment records
    for (const tender of payments) {
      await supabaseAdmin
        .from('payment_records')
        .insert({
          company_id: auth.companyId,
          order_id: order.id,
          payment_method: tender.payment_method,
          payment_channel_id: tender.payment_channel_id || null,
          amount: tender.amount - (tender.change_amount || 0),
          status: 'verified',
          notes: tender.reference || null,
          created_by: auth.userId,
          payment_date: new Date().toISOString(),
          created_at: new Date().toISOString(),
        });
    }

    // Update session totals
    const { data: currentSession } = await supabaseAdmin
      .from('pos_sessions')
      .select('total_sales, total_orders')
      .eq('id', pos_session_id)
      .single();

    if (currentSession) {
      await supabaseAdmin
        .from('pos_sessions')
        .update({
          total_sales: Number(currentSession.total_sales || 0) + totalWithVAT,
          total_orders: Number(currentSession.total_orders || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pos_session_id);
    }

    // Return order with receipt data
    return NextResponse.json({
      order: {
        ...order,
        receipt_number: receiptNumResult.data,
        items: itemsWithTotals,
      },
      receipt: {
        receipt_number: receiptNumResult.data,
        order_number: orderNumResult.data,
        total_amount: totalWithVAT,
        subtotal: subtotalBeforeVAT,
        vat_amount: vatAmount,
        discount_amount: orderDiscountAmount,
        payments,
      },
    });
  } catch (err) {
    console.error('[POS] Order error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

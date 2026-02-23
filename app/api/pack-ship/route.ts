// Path: app/api/pack-ship/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// GET — Fetch orders for Pack & Ship page
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch orders that need fulfillment (not POS, not shipped)
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        order_status,
        payment_status,
        fulfillment_status,
        hold_reason,
        source,
        external_order_sn,
        external_status,
        shopee_account_id,
        delivery_date,
        delivery_name,
        delivery_phone,
        delivery_address,
        delivery_district,
        delivery_amphoe,
        delivery_province,
        delivery_postal_code,
        notes,
        internal_notes,
        total_amount,
        shipping_fee,
        created_at,
        packed_at,
        shipped_at,
        external_data,
        customer:customers (
          id,
          name,
          contact_person,
          phone
        )
      `)
      .eq('company_id', auth.companyId)
      .neq('source', 'pos')
      .in('order_status', ['new', 'shipping'])
      .neq('fulfillment_status', 'shipped')
      .order('created_at', { ascending: true });

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ orders: [], productSummary: [] });
    }

    const orderIds = orders.map(o => o.id);

    // Fetch order items for all orders
    const { data: allItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('id, order_id, product_id, variation_id, product_name, variation_label, product_code, quantity, unit_price')
      .eq('company_id', auth.companyId)
      .in('order_id', orderIds);

    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Fetch product images for all items
    const variationIds = [...new Set((allItems || []).map(i => i.variation_id).filter(Boolean))];
    const productIds = [...new Set((allItems || []).map(i => i.product_id).filter(Boolean))];

    let imageMap: Record<string, string> = {};
    if (variationIds.length > 0 || productIds.length > 0) {
      const orClauses = [
        variationIds.length > 0 ? `variation_id.in.(${variationIds.join(',')})` : '',
        productIds.length > 0 ? `product_id.in.(${productIds.join(',')})` : ''
      ].filter(Boolean).join(',');

      const { data: images } = await supabaseAdmin
        .from('product_images')
        .select('product_id, variation_id, image_url, sort_order')
        .eq('company_id', auth.companyId)
        .or(orClauses)
        .order('sort_order', { ascending: true });

      // Build image map: prefer variation-level, fall back to product-level
      const productImageMap: Record<string, string> = {};
      const variationImageMap: Record<string, string> = {};
      for (const img of images || []) {
        if (img.variation_id && !variationImageMap[img.variation_id]) {
          variationImageMap[img.variation_id] = img.image_url;
        }
        if (img.product_id && !productImageMap[img.product_id]) {
          productImageMap[img.product_id] = img.image_url;
        }
      }

      // Merge: variation image > product image
      for (const item of allItems || []) {
        const key = item.variation_id || item.product_id;
        imageMap[key] = variationImageMap[item.variation_id] || productImageMap[item.product_id] || '';
      }
    }

    // Group items by order
    const itemsByOrder: Record<string, typeof allItems> = {};
    for (const item of allItems || []) {
      if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
      itemsByOrder[item.order_id]!.push(item);
    }

    // Fetch channel info: Shopee accounts + LINE/FB contacts
    const shopeeAccountIds = [...new Set(orders.filter(o => o.shopee_account_id).map(o => o.shopee_account_id!))];
    const customerIds = [...new Set(orders.filter(o => (o.customer as any)?.id).map(o => (o.customer as any)!.id))];

    // Shopee account map: id → { shop_name, shop_logo }
    const shopeeAccountMap = new Map<string, { shop_name: string; shop_logo: string | null }>();
    if (shopeeAccountIds.length > 0) {
      const { data: shopeeAccounts } = await supabaseAdmin
        .from('shopee_accounts')
        .select('id, shop_name, metadata')
        .in('id', shopeeAccountIds);
      for (const sa of shopeeAccounts || []) {
        shopeeAccountMap.set(sa.id, {
          shop_name: sa.shop_name || 'Shopee',
          shop_logo: (sa.metadata as Record<string, unknown>)?.shop_logo as string || null,
        });
      }
    }

    // Customer channel map: customer_id → channel info (LINE/FB)
    const customerChannelMap = new Map<string, { platform: string; account_name: string; picture_url: string | null }>();
    if (customerIds.length > 0) {
      const [lineResult, fbResult] = await Promise.all([
        supabaseAdmin
          .from('line_contacts')
          .select('customer_id, picture_url, chat_account:chat_accounts(id, account_name)')
          .in('customer_id', customerIds),
        supabaseAdmin
          .from('fb_contacts')
          .select('customer_id, picture_url, chat_account:chat_accounts(id, account_name)')
          .in('customer_id', customerIds),
      ]);
      for (const lc of lineResult.data || []) {
        if (lc.customer_id && !customerChannelMap.has(lc.customer_id)) {
          const acc = lc.chat_account as unknown as { account_name?: string } | null;
          customerChannelMap.set(lc.customer_id, {
            platform: 'line',
            account_name: acc?.account_name || 'LINE',
            picture_url: lc.picture_url || null,
          });
        }
      }
      for (const fc of fbResult.data || []) {
        if (fc.customer_id && !customerChannelMap.has(fc.customer_id)) {
          const acc = fc.chat_account as unknown as { account_name?: string } | null;
          customerChannelMap.set(fc.customer_id, {
            platform: 'facebook',
            account_name: acc?.account_name || 'Facebook',
            picture_url: fc.picture_url || null,
          });
        }
      }
    }

    // Build enriched orders
    const enrichedOrders = orders.map(order => {
      const items = (itemsByOrder[order.id] || []).map(item => ({
        ...item,
        image: imageMap[item.variation_id || item.product_id] || null,
      }));

      // Extract shipping_carrier from external_data if Shopee
      let shippingCarrier = null;
      if (order.source === 'shopee' && order.external_data) {
        try {
          const extData = typeof order.external_data === 'string'
            ? JSON.parse(order.external_data)
            : order.external_data;
          shippingCarrier = extData.shipping_carrier || null;
        } catch { /* ignore */ }
      }

      // Build channel object (same pattern as orders/route.ts)
      let channel: { platform: string; account_name: string; picture_url: string | null } | null = null;
      if (order.source === 'shopee' && order.shopee_account_id) {
        const sa = shopeeAccountMap.get(order.shopee_account_id);
        if (sa) channel = { platform: 'shopee', account_name: sa.shop_name, picture_url: sa.shop_logo };
      } else if ((order.customer as any)?.id) {
        channel = customerChannelMap.get((order.customer as any).id) || null;
      }

      return {
        ...order,
        external_data: undefined, // don't send full external_data to frontend
        items,
        shipping_carrier: shippingCarrier,
        channel,
      };
    });

    // Build product summary (aggregate quantities across all orders)
    const summaryMap: Record<string, {
      productName: string;
      productCode: string;
      variationLabel: string | null;
      totalQuantity: number;
      image: string | null;
    }> = {};

    for (const item of allItems || []) {
      const key = item.variation_id || `${item.product_id}_${item.variation_label || ''}`;
      if (!summaryMap[key]) {
        summaryMap[key] = {
          productName: item.product_name,
          productCode: item.product_code || '',
          variationLabel: item.variation_label || null,
          totalQuantity: 0,
          image: imageMap[item.variation_id || item.product_id] || null,
        };
      }
      summaryMap[key].totalQuantity += item.quantity;
    }

    const productSummary = Object.values(summaryMap).sort((a, b) =>
      a.productName.localeCompare(b.productName, 'th')
    );

    return NextResponse.json({
      orders: enrichedOrders,
      productSummary,
    });
  } catch (error) {
    console.error('[Pack-Ship GET] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — Update fulfillment status
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { order_id, action, hold_reason } = body;

    if (!order_id || !action) {
      return NextResponse.json({ error: 'order_id and action are required' }, { status: 400 });
    }

    if (!['pack', 'ship', 'hold', 'unhold'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Fetch existing order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, order_status, fulfillment_status, warehouse_id')
      .eq('id', order_id)
      .eq('company_id', auth.companyId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const now = new Date().toISOString();

    if (action === 'pack') {
      await supabaseAdmin
        .from('orders')
        .update({
          fulfillment_status: 'packed',
          packed_at: now,
          packed_by: auth.userId,
          updated_at: now,
        })
        .eq('id', order_id)
        .eq('company_id', auth.companyId);

      return NextResponse.json({ success: true, fulfillment_status: 'packed' });
    }

    if (action === 'ship') {
      // Update fulfillment_status to shipped
      const updateData: Record<string, unknown> = {
        fulfillment_status: 'shipped',
        shipped_at: now,
        shipped_by: auth.userId,
        updated_at: now,
      };

      // Also set order_status to shipping if currently new (triggers stock deduction)
      if (order.order_status === 'new') {
        updateData.order_status = 'shipping';
      }

      await supabaseAdmin
        .from('orders')
        .update(updateData)
        .eq('id', order_id)
        .eq('company_id', auth.companyId);

      // Stock deduction (best-effort) — only when order_status changes new → shipping
      if (order.order_status === 'new') {
        try {
          const stockConfig = await getStockConfig(auth.companyId!);
          if (stockConfig.stockEnabled && order.warehouse_id) {
            const { data: orderItems } = await supabaseAdmin
              .from('order_items')
              .select('variation_id, quantity')
              .eq('order_id', order_id)
              .eq('company_id', auth.companyId);

            for (const oi of orderItems || []) {
              if (!oi.variation_id) continue;
              try {
                const { data: inv } = await supabaseAdmin
                  .from('inventory')
                  .select('id, quantity, reserved_quantity')
                  .eq('warehouse_id', order.warehouse_id)
                  .eq('variation_id', oi.variation_id)
                  .eq('company_id', auth.companyId)
                  .single();

                if (inv) {
                  const newQty = (inv.quantity || 0) - oi.quantity;
                  const newReserved = Math.max(0, (inv.reserved_quantity || 0) - oi.quantity);
                  await supabaseAdmin
                    .from('inventory')
                    .update({
                      quantity: newQty,
                      reserved_quantity: newReserved,
                      updated_at: now,
                    })
                    .eq('id', inv.id);

                  await supabaseAdmin
                    .from('inventory_transactions')
                    .insert({
                      company_id: auth.companyId,
                      warehouse_id: order.warehouse_id,
                      variation_id: oi.variation_id,
                      type: 'out',
                      quantity: oi.quantity,
                      balance_after: newQty,
                      reference_type: 'order',
                      reference_id: order_id,
                      notes: 'Deduct for order shipment (pack-ship)',
                      created_by: auth.userId,
                      created_at: now,
                    });
                }
              } catch (itemErr) {
                console.error(`[Pack-Ship STOCK] Error deducting for variation ${oi.variation_id}:`, itemErr);
              }
            }

            // Auto-sync stock to Shopee
            const varIds = (orderItems || []).map(oi => oi.variation_id).filter(Boolean) as string[];
            if (varIds.length > 0) {
              import('@/lib/shopee-auto-sync').then(m => m.triggerShopeeStockSync(varIds)).catch(() => {});
            }
          }
        } catch (stockErr) {
          console.error('[Pack-Ship STOCK] Error:', stockErr);
        }
      }

      return NextResponse.json({ success: true, fulfillment_status: 'shipped', order_status: order.order_status === 'new' ? 'shipping' : order.order_status });
    }

    if (action === 'hold') {
      await supabaseAdmin
        .from('orders')
        .update({
          fulfillment_status: 'on_hold',
          hold_reason: hold_reason || null,
          updated_at: now,
        })
        .eq('id', order_id)
        .eq('company_id', auth.companyId);

      return NextResponse.json({ success: true, fulfillment_status: 'on_hold' });
    }

    if (action === 'unhold') {
      await supabaseAdmin
        .from('orders')
        .update({
          fulfillment_status: 'pending',
          hold_reason: null,
          updated_at: now,
        })
        .eq('id', order_id)
        .eq('company_id', auth.companyId);

      return NextResponse.json({ success: true, fulfillment_status: 'pending' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('[Pack-Ship PUT] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

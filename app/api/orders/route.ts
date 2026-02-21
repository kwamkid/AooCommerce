// Path: app/api/orders/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// Type definitions
interface OrderItemInput {
  variation_id: string; // product_variations.id
  product_id: string; // products.id
  product_code: string;
  product_name: string;
  variation_label?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  notes?: string;
  shipments: {
    shipping_address_id: string;
    quantity: number;
    delivery_notes?: string;
    shipping_fee?: number;
  }[];
}

interface OrderData {
  customer_id?: string;
  delivery_date?: string;
  payment_method?: string;
  discount_amount?: number;
  notes?: string;
  internal_notes?: string;
  warehouse_id?: string;
  delivery_name?: string;
  delivery_phone?: string;
  delivery_address?: string;
  delivery_district?: string;
  delivery_amphoe?: string;
  delivery_province?: string;
  delivery_postal_code?: string;
  delivery_email?: string;
  items: OrderItemInput[];
}


// POST - Create new order with items and shipments
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const orderData: OrderData = await request.json();

    // Validate required fields
    if (!orderData.items || orderData.items.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: items' },
        { status: 400 }
      );
    }

    // Validate shipments for each item (only when customer is provided)
    if (orderData.customer_id) {
      for (const item of orderData.items) {
        if (!item.shipments || item.shipments.length === 0) {
          return NextResponse.json(
            { error: 'Each item must have at least one shipment' },
            { status: 400 }
          );
        }

        // Validate total shipment quantity matches item quantity
        const totalShipmentQty = item.shipments.reduce((sum, s) => sum + s.quantity, 0);
        if (totalShipmentQty !== item.quantity) {
          return NextResponse.json(
            { error: `Total shipment quantity (${totalShipmentQty}) does not match item quantity (${item.quantity})` },
            { status: 400 }
          );
        }
      }
    }

    // Calculate totals
    let subtotal = 0;
    const itemsWithTotals = orderData.items.map((item: any) => {
      // Support both discount_percent (legacy) and discount_value/discount_type (new)
      let discountPercent = 0;
      let discountAmountItem = 0;
      const itemSubtotal = item.quantity * item.unit_price;

      if (item.discount_type === 'amount' && item.discount_value) {
        discountAmountItem = item.discount_value;
        discountPercent = itemSubtotal > 0 ? (discountAmountItem / itemSubtotal) * 100 : 0;
      } else {
        discountPercent = item.discount_value || item.discount_percent || 0;
        discountAmountItem = itemSubtotal * (discountPercent / 100);
      }

      const itemTotal = itemSubtotal - discountAmountItem;
      subtotal += itemTotal;
      return {
        ...item,
        discount_percent: discountPercent,
        discount_amount: discountAmountItem,
        discount_type: item.discount_type || 'percent',
        subtotal: itemSubtotal,
        total: itemTotal
      };
    });

    console.log('[CREATE ORDER] items count:', orderData.items.length, 'subtotal:', subtotal, 'items:', orderData.items.map((i: any) => ({ name: i.product_name, qty: i.quantity, price: i.unit_price, address: i.shipments?.[0]?.shipping_address_id })));

    // Calculate total shipping fee (deduplicated by address)
    let totalShippingFee = 0;
    if (orderData.customer_id) {
      const shippingFeeByAddress = new Map<string, number>();
      orderData.items.forEach(item => {
        (item.shipments || []).forEach(s => {
          if (s.shipping_fee && !shippingFeeByAddress.has(s.shipping_address_id)) {
            shippingFeeByAddress.set(s.shipping_address_id, s.shipping_fee);
          }
        });
      });
      totalShippingFee = Array.from(shippingFeeByAddress.values()).reduce((sum, f) => sum + f, 0);
    } else if ((orderData as any).shipping_fee) {
      // Non-customer orders: shipping fee sent directly
      totalShippingFee = (orderData as any).shipping_fee;
    }

    const discountAmount = orderData.discount_amount || 0;
    // Prices are VAT-inclusive, so we reverse-calculate VAT from the total
    const totalWithVAT = subtotal - discountAmount + totalShippingFee;
    const subtotalBeforeVAT = Math.round((totalWithVAT / 1.07) * 100) / 100;
    const vatAmount = totalWithVAT - subtotalBeforeVAT;
    const totalAmount = totalWithVAT;
    console.log('[CREATE ORDER] itemsSubtotal:', subtotal, 'discount:', discountAmount, 'shipping:', totalShippingFee, 'subtotalBeforeVAT:', subtotalBeforeVAT, 'vat:', vatAmount, 'TOTAL:', totalAmount);

    // Generate order number
    const { data: orderNumber, error: codeError } = await supabaseAdmin
      .rpc('generate_order_number', { p_company_id: auth.companyId });

    if (codeError) {
      console.error('Order number generation error:', codeError);
      return NextResponse.json(
        { error: 'Failed to generate order number' },
        { status: 500 }
      );
    }

    // Create order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        company_id: auth.companyId,
        order_number: orderNumber,
        customer_id: orderData.customer_id || null,
        delivery_date: orderData.delivery_date || null,
        subtotal: subtotalBeforeVAT,
        vat_amount: vatAmount,
        discount_amount: discountAmount,
        shipping_fee: totalShippingFee,
        total_amount: totalAmount,
        payment_method: orderData.payment_method || null,
        payment_status: 'pending',
        order_status: 'new',
        notes: orderData.notes || null,
        internal_notes: orderData.internal_notes || null,
        delivery_name: orderData.delivery_name || null,
        delivery_phone: orderData.delivery_phone || null,
        delivery_address: orderData.delivery_address || null,
        delivery_district: orderData.delivery_district || null,
        delivery_amphoe: orderData.delivery_amphoe || null,
        delivery_province: orderData.delivery_province || null,
        delivery_postal_code: orderData.delivery_postal_code || null,
        delivery_email: orderData.delivery_email || null,
        created_by: auth.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (orderError) {
      console.error('Order creation error:', orderError);
      return NextResponse.json(
        { error: orderError.message },
        { status: 400 }
      );
    }

    // Create order items and shipments
    for (const item of itemsWithTotals) {
      // Create order item
      const { data: orderItem, error: itemError } = await supabaseAdmin
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
          discount_amount: item.discount_amount,
          discount_type: item.discount_type || 'percent',
          subtotal: item.subtotal,
          total: item.total,
          notes: item.notes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (itemError) {
        console.error('Order item creation error:', itemError);
        // Rollback: delete the order
        await supabaseAdmin.from('orders').delete().eq('id', order.id).eq('company_id', auth.companyId);
        return NextResponse.json(
          { error: itemError.message },
          { status: 400 }
        );
      }

      // Create shipments for this item (skip for orders without customer)
      if (orderData.customer_id && item.shipments && item.shipments.length > 0) {
        const shipmentsToInsert = item.shipments.map((shipment: any) => ({
          company_id: auth.companyId,
          order_item_id: orderItem.id,
          shipping_address_id: shipment.shipping_address_id,
          quantity: shipment.quantity,
          shipping_fee: shipment.shipping_fee || 0,
          delivery_status: 'pending',
          delivery_notes: shipment.delivery_notes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: shipmentError } = await supabaseAdmin
          .from('order_shipments')
          .insert(shipmentsToInsert);

        if (shipmentError) {
          console.error('Shipment creation error:', shipmentError);
          // Rollback: delete the order
          await supabaseAdmin.from('orders').delete().eq('id', order.id).eq('company_id', auth.companyId);
          return NextResponse.json(
            { error: shipmentError.message },
            { status: 400 }
          );
        }
      }
    }

    // --- Stock reservation (best-effort, errors logged but don't block order) ---
    try {
      const stockConfig = await getStockConfig(auth.companyId!);
      if (stockConfig.stockEnabled) {
        // Determine warehouse: use provided warehouse_id or find company's default warehouse
        let warehouseId = orderData.warehouse_id || null;
        if (!warehouseId) {
          const { data: defaultWarehouse } = await supabaseAdmin
            .from('warehouses')
            .select('id')
            .eq('company_id', auth.companyId)
            .eq('is_active', true)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .single();
          warehouseId = defaultWarehouse?.id || null;
        }

        if (warehouseId) {
          // Save warehouse_id to the order
          await supabaseAdmin
            .from('orders')
            .update({ warehouse_id: warehouseId })
            .eq('id', order.id)
            .eq('company_id', auth.companyId);

          for (const item of itemsWithTotals) {
            if (!item.variation_id) continue;
            try {
              // Check existing inventory row
              const { data: existingInv } = await supabaseAdmin
                .from('inventory')
                .select('id, quantity, reserved_quantity')
                .eq('warehouse_id', warehouseId)
                .eq('variation_id', item.variation_id)
                .eq('company_id', auth.companyId)
                .single();

              if (existingInv) {
                const available = (existingInv.quantity || 0) - (existingInv.reserved_quantity || 0);
                if (available < item.quantity) {
                  console.warn(`[STOCK RESERVE] Insufficient stock for variation ${item.variation_id}: available=${available}, requested=${item.quantity}. Reserving anyway.`);
                }
                const newReserved = (existingInv.reserved_quantity || 0) + item.quantity;
                await supabaseAdmin
                  .from('inventory')
                  .update({
                    reserved_quantity: newReserved,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', existingInv.id);

                // Create reserve transaction
                await supabaseAdmin
                  .from('inventory_transactions')
                  .insert({
                    company_id: auth.companyId,
                    warehouse_id: warehouseId,
                    variation_id: item.variation_id,
                    type: 'reserve',
                    quantity: item.quantity,
                    balance_after: existingInv.quantity,
                    reference_type: 'order',
                    reference_id: order.id,
                    notes: `Reserve for order ${order.order_number}`,
                    created_by: auth.userId,
                    created_at: new Date().toISOString(),
                  });
              } else {
                // Create inventory row with 0 quantity and reserved
                console.warn(`[STOCK RESERVE] No inventory row for variation ${item.variation_id} in warehouse ${warehouseId}. Creating with 0 qty.`);
                await supabaseAdmin
                  .from('inventory')
                  .insert({
                    company_id: auth.companyId,
                    warehouse_id: warehouseId,
                    variation_id: item.variation_id,
                    quantity: 0,
                    reserved_quantity: item.quantity,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  });

                await supabaseAdmin
                  .from('inventory_transactions')
                  .insert({
                    company_id: auth.companyId,
                    warehouse_id: warehouseId,
                    variation_id: item.variation_id,
                    type: 'reserve',
                    quantity: item.quantity,
                    balance_after: 0,
                    reference_type: 'order',
                    reference_id: order.id,
                    notes: `Reserve for order ${order.order_number}`,
                    created_by: auth.userId,
                    created_at: new Date().toISOString(),
                  });
              }
            } catch (itemStockErr) {
              console.error(`[STOCK RESERVE] Error reserving stock for variation ${item.variation_id}:`, itemStockErr);
            }
          }
        } else {
          console.warn('[STOCK RESERVE] Stock enabled but no warehouse found for company', auth.companyId);
        }
      }
    } catch (stockErr) {
      console.error('[STOCK RESERVE] Error during stock reservation:', stockErr);
    }
    // --- End stock reservation ---

    // Fetch complete order details (rpc returns array)
    const { data: completeOrder } = await supabaseAdmin
      .rpc('get_order_details', { p_order_id: order.id });

    // rpc returns an array — use first element, fall back to the inserted order
    const orderResult = Array.isArray(completeOrder) ? completeOrder[0] : completeOrder;

    return NextResponse.json({
      success: true,
      order: orderResult || order,
      id: order.id,
      order_number: order.order_number
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Get orders list or single order
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('id');

    // If ID is provided, fetch single order with full details
    if (orderId) {
      // Fetch order with customer
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select(`
          *,
          customer:customers (
            id,
            customer_code,
            name,
            contact_person,
            phone,
            email
          )
        `)
        .eq('id', orderId)
        .eq('company_id', auth.companyId)
        .single();

      if (orderError || !order) {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404 }
        );
      }

      // Fetch order items (product info already in order_items table)
      const { data: items, error: itemsError } = await supabaseAdmin
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)
        .eq('company_id', auth.companyId);

      if (itemsError) {
        return NextResponse.json(
          { error: itemsError.message },
          { status: 500 }
        );
      }

      // Fetch product images and shipments in parallel (batch)
      const variationIds = (items || []).map(i => i.variation_id).filter(Boolean);
      const productIds = (items || []).map(i => i.product_id).filter(Boolean);
      const itemIds = (items || []).map(i => i.id);

      const [imagesResult, shipmentsResult] = await Promise.all([
        (variationIds.length > 0 || productIds.length > 0)
          ? supabaseAdmin
              .from('product_images')
              .select('product_id, variation_id, image_url, sort_order')
              .eq('company_id', auth.companyId)
              .or(
                [
                  variationIds.length > 0 ? `variation_id.in.(${variationIds.join(',')})` : '',
                  productIds.length > 0 ? `product_id.in.(${productIds.join(',')})` : ''
                ].filter(Boolean).join(',')
              )
              .order('sort_order', { ascending: true })
          : Promise.resolve({ data: [] as { product_id: string; variation_id: string; image_url: string }[] }),
        itemIds.length > 0
          ? supabaseAdmin
              .from('order_shipments')
              .select(`
                *,
                shipping_address:shipping_addresses (
                  id,
                  address_name,
                  contact_person,
                  phone,
                  address_line1,
                  district,
                  amphoe,
                  province,
                  postal_code
                )
              `)
              .in('order_item_id', itemIds)
              .eq('company_id', auth.companyId)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      // Build image map: prefer variation image, fallback to product image
      const imageMap: Record<string, string> = {};
      const productImageMap: Record<string, string> = {};
      const variationImageMap: Record<string, string> = {};
      for (const img of imagesResult.data || []) {
        if (img.variation_id && !variationImageMap[img.variation_id]) {
          variationImageMap[img.variation_id] = img.image_url;
        }
        if (img.product_id && !productImageMap[img.product_id]) {
          productImageMap[img.product_id] = img.image_url;
        }
      }
      for (const item of items || []) {
        const image = variationImageMap[item.variation_id] || productImageMap[item.product_id];
        if (image) imageMap[item.id] = image;
      }

      // Group shipments by order_item_id
      const shipmentsByItem = new Map<string, any[]>();
      for (const shipment of shipmentsResult.data || []) {
        const key = shipment.order_item_id;
        if (!shipmentsByItem.has(key)) shipmentsByItem.set(key, []);
        shipmentsByItem.get(key)!.push(shipment);
      }

      const itemsWithShipments = (items || []).map(item => ({
        ...item,
        image: imageMap[item.id] || null,
        shipments: shipmentsByItem.get(item.id) || [],
      }));

      return NextResponse.json({
        order: {
          ...order,
          items: itemsWithShipments
        }
      });
    }

    // Otherwise, fetch orders list
    const customerId = searchParams.get('customer_id');
    const status = searchParams.get('status');
    const paymentStatus = searchParams.get('payment_status');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // Sort params
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortDir = searchParams.get('sort_dir') || 'desc';
    const ascending = sortDir === 'asc';

    // Query from orders table directly with customer join (avoids view issues with total_amount)
    // When searching by customer name, we need to find matching customer IDs first
    let searchCustomerIds: string[] | null = null;
    if (search) {
      const { data: matchingCustomers } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('company_id', auth.companyId)
        .ilike('name', `%${search}%`);
      searchCustomerIds = (matchingCustomers || []).map(c => c.id);
    }

    let query = supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, order_date, created_at, delivery_date,
        subtotal, discount_amount, vat_amount, shipping_fee, total_amount,
        order_status, payment_status, payment_method,
        source, external_status, external_order_sn,
        customer_id, shopee_account_id, created_by,
        delivery_name, delivery_phone,
        customer:customers (
          customer_code, name, contact_person, phone
        )
      `, { count: 'exact' })
      .eq('company_id', auth.companyId);

    // Apply filters
    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    if (status && status !== 'all') {
      query = query.eq('order_status', status);
    }

    if (paymentStatus && paymentStatus !== 'all') {
      query = query.eq('payment_status', paymentStatus);
    }

    const sourceFilter = searchParams.get('source');
    if (sourceFilter === 'exclude_pos') {
      query = query.neq('source', 'pos');
    } else if (sourceFilter && sourceFilter !== 'all') {
      query = query.eq('source', sourceFilter);
    }

    const createdByFilter = searchParams.get('created_by');
    if (createdByFilter && createdByFilter !== 'all') {
      query = query.eq('created_by', createdByFilter);
    }

    if (search) {
      if (searchCustomerIds && searchCustomerIds.length > 0) {
        query = query.or(`order_number.ilike.%${search}%,customer_id.in.(${searchCustomerIds.join(',')}),delivery_name.ilike.%${search}%`);
      } else {
        query = query.or(`order_number.ilike.%${search}%,delivery_name.ilike.%${search}%`);
      }
    }

    // Add pagination and ordering
    const allowedSortColumns = ['order_date', 'created_at', 'delivery_date', 'total_amount', 'order_number'];
    const sortColumn = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';

    // Build status counts query (independent of status/payment filters)
    let countQuery = supabaseAdmin
      .from('orders')
      .select('order_status, payment_status')
      .eq('company_id', auth.companyId);

    if (sourceFilter === 'exclude_pos') {
      countQuery = countQuery.neq('source', 'pos');
    } else if (sourceFilter && sourceFilter !== 'all') {
      countQuery = countQuery.eq('source', sourceFilter);
    }
    if (customerId) {
      countQuery = countQuery.eq('customer_id', customerId);
    }
    if (createdByFilter && createdByFilter !== 'all') {
      countQuery = countQuery.eq('created_by', createdByFilter);
    }
    if (search) {
      if (searchCustomerIds && searchCustomerIds.length > 0) {
        countQuery = countQuery.or(`order_number.ilike.%${search}%,customer_id.in.(${searchCustomerIds.join(',')}),delivery_name.ilike.%${search}%`);
      } else {
        countQuery = countQuery.or(`order_number.ilike.%${search}%,delivery_name.ilike.%${search}%`);
      }
    }

    // Run main query + status counts in parallel
    const [mainResult, countResult] = await Promise.all([
      query
        .order(sortColumn, { ascending, nullsFirst: false })
        .range(offset, offset + limit - 1),
      countQuery,
    ]);

    const { data: rawOrders, error, count } = mainResult;
    const { data: allStatusRows } = countResult;

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Flatten customer data for backward compatibility
    const orders = (rawOrders || []).map((o: any) => ({
      ...o,
      customer_code: o.customer?.customer_code || null,
      customer_name: o.customer?.name || o.delivery_name || null,
      contact_person: o.customer?.contact_person || null,
      customer_phone: o.customer?.phone || o.delivery_phone || null,
      customer: undefined
    }));

    const statusCounts: Record<string, number> = { all: 0, new: 0, shipping: 0, completed: 0, cancelled: 0 };
    const paymentCounts: Record<string, number> = { all: 0, pending: 0, verifying: 0, paid: 0, cancelled: 0 };

    (allStatusRows || []).forEach((row: any) => {
      statusCounts.all++;
      if (row.order_status in statusCounts) statusCounts[row.order_status]++;
      paymentCounts.all++;
      if (row.payment_status in paymentCounts) paymentCounts[row.payment_status]++;
    });

    // Early return if no orders
    if (!orders || orders.length === 0) {
      return NextResponse.json({
        orders: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        statusCounts,
        paymentCounts
      });
    }

    // Get all order IDs for batch fetching branch names
    const orderIds = orders.map(o => o.id);

    // Collect customer IDs and shopee account IDs for channel info
    const customerIds = [...new Set(orders.map((o: any) => o.customer_id).filter(Boolean))];
    const shopeeAccountIds = [...new Set(orders.map((o: any) => o.shopee_account_id).filter(Boolean))];

    // Fetch company members for "created by" filter options
    const { data: memberRows } = await supabaseAdmin
      .from('company_members')
      .select('user_id')
      .eq('company_id', auth.companyId)
      .eq('is_active', true);

    const memberUserIds = (memberRows || []).map(m => m.user_id).filter(Boolean);
    let createdByOptions: { id: string; name: string }[] = [];
    if (memberUserIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name, email')
        .in('id', memberUserIds);
      createdByOptions = (profiles || []).map(p => ({
        id: p.id,
        name: p.name || p.email || 'Unknown',
      }));
    }

    // Batch fetch: branch names + channel info in parallel
    const [branchResult, lineResult, fbResult, shopeeResult, chatAccountsResult] = await Promise.all([
      // Branch names
      supabaseAdmin
        .from('order_items')
        .select(`
          order_id,
          order_shipments!inner (
            shipping_address:shipping_addresses!inner (
              address_name
            )
          )
        `)
        .in('order_id', orderIds)
        .eq('company_id', auth.companyId),
      // LINE contacts → chat_accounts for customers
      customerIds.length > 0
        ? supabaseAdmin
            .from('line_contacts')
            .select('customer_id, display_name, picture_url, chat_account_id, chat_account:chat_accounts(id, account_name, platform)')
            .eq('company_id', auth.companyId)
            .in('customer_id', customerIds)
        : Promise.resolve({ data: [] as any[] }),
      // FB contacts → chat_accounts for customers
      customerIds.length > 0
        ? supabaseAdmin
            .from('fb_contacts')
            .select('customer_id, display_name, picture_url, chat_account_id, chat_account:chat_accounts(id, account_name, platform)')
            .eq('company_id', auth.companyId)
            .in('customer_id', customerIds)
        : Promise.resolve({ data: [] as any[] }),
      // Shopee accounts
      shopeeAccountIds.length > 0
        ? supabaseAdmin
            .from('shopee_accounts')
            .select('id, shop_name, metadata')
            .in('id', shopeeAccountIds)
        : Promise.resolve({ data: [] as any[] }),
      // All chat accounts for this company (for filter options with profile pics)
      supabaseAdmin
        .from('chat_accounts')
        .select('id, platform, account_name, credentials')
        .eq('company_id', auth.companyId)
        .eq('is_active', true),
    ]);

    // Build branch names map
    const orderBranchesMap = new Map<string, Set<string>>();
    (branchResult.data || []).forEach((item: any) => {
      const orderId = item.order_id;
      if (!orderBranchesMap.has(orderId)) {
        orderBranchesMap.set(orderId, new Set());
      }
      (item.order_shipments || []).forEach((shipment: any) => {
        if (shipment.shipping_address?.address_name) {
          orderBranchesMap.get(orderId)!.add(shipment.shipping_address.address_name);
        }
      });
    });

    // Build channel map: customer_id → channel info (prefer LINE, then FB)
    const customerChannelMap = new Map<string, { platform: string; account_name: string; account_id: string; picture_url: string | null }>();
    for (const lc of (lineResult.data || [])) {
      if (lc.customer_id && !customerChannelMap.has(lc.customer_id)) {
        const acc = lc.chat_account as any;
        customerChannelMap.set(lc.customer_id, {
          platform: 'line',
          account_name: acc?.account_name || 'LINE',
          account_id: acc?.id || lc.chat_account_id || '',
          picture_url: lc.picture_url || null,
        });
      }
    }
    for (const fc of (fbResult.data || [])) {
      if (fc.customer_id && !customerChannelMap.has(fc.customer_id)) {
        const acc = fc.chat_account as any;
        customerChannelMap.set(fc.customer_id, {
          platform: 'facebook',
          account_name: acc?.account_name || 'Facebook',
          account_id: acc?.id || fc.chat_account_id || '',
          picture_url: fc.picture_url || null,
        });
      }
    }

    // Build shopee account map
    const shopeeAccountMap = new Map<string, { shop_name: string; shop_logo: string | null }>();
    for (const sa of (shopeeResult.data || [])) {
      shopeeAccountMap.set(sa.id, {
        shop_name: sa.shop_name || 'Shopee',
        shop_logo: (sa.metadata as any)?.shop_logo || null,
      });
    }

    // Build chat account picture map from credentials
    const chatAccountPicMap = new Map<string, string>();
    for (const ca of (chatAccountsResult.data || [])) {
      const creds = ca.credentials as any;
      const pic = ca.platform === 'line'
        ? creds?.bot_picture_url
        : creds?.page_picture_url || creds?.ig_profile_picture_url;
      if (pic) chatAccountPicMap.set(ca.id, pic);
    }

    // Build channel filter options with profile pics
    const channelOptions: { id: string; platform: string; name: string; picture_url: string | null }[] = [];
    const seenChannelIds = new Set<string>();

    // Add all active chat accounts (LINE/FB)
    for (const ca of (chatAccountsResult.data || [])) {
      if (!seenChannelIds.has(ca.id)) {
        seenChannelIds.add(ca.id);
        channelOptions.push({
          id: ca.id,
          platform: ca.platform,
          name: ca.account_name,
          picture_url: chatAccountPicMap.get(ca.id) || null,
        });
      }
    }

    // Add all active shopee accounts
    const { data: allShopeeAccounts } = await supabaseAdmin
      .from('shopee_accounts')
      .select('id, shop_name, metadata')
      .eq('company_id', auth.companyId)
      .eq('is_active', true);
    for (const sa of (allShopeeAccounts || [])) {
      if (!seenChannelIds.has(sa.id)) {
        seenChannelIds.add(sa.id);
        channelOptions.push({
          id: sa.id,
          platform: 'shopee',
          name: sa.shop_name || 'Shopee',
          picture_url: (sa.metadata as any)?.shop_logo || null,
        });
      }
    }

    // Build created_by name map
    const createdByNameMap = new Map<string, string>();
    for (const opt of createdByOptions) {
      createdByNameMap.set(opt.id, opt.name);
    }

    // Map orders with branch names + channel info + created_by_name
    const ordersWithDetails = orders.map((order: any) => {
      let channel = null;
      if (order.source === 'shopee' && order.shopee_account_id) {
        const sa = shopeeAccountMap.get(order.shopee_account_id);
        if (sa) {
          channel = { platform: 'shopee', account_name: sa.shop_name, account_id: order.shopee_account_id, picture_url: sa.shop_logo };
        }
      } else if (order.customer_id) {
        channel = customerChannelMap.get(order.customer_id) || null;
      }
      return {
        ...order,
        branch_names: Array.from(orderBranchesMap.get(order.id) || []),
        channel,
        created_by_name: order.created_by ? createdByNameMap.get(order.created_by) || null : null,
      };
    });

    return NextResponse.json({
      orders: ordersWithDetails,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      },
      statusCounts,
      paymentCounts,
      channelOptions,
      createdByOptions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update order (full update with items and shipments)
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, items, delivery_date, payment_method, discount_amount, notes, internal_notes } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Check if order exists and is editable (only 'new' status can be fully edited)
    const { data: existingOrder, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('id, order_status')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (fetchError || !existingOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Allow editing only for 'new' orders, or allow simple status updates for any order
    const isFullUpdate = items && Array.isArray(items);
    if (isFullUpdate && existingOrder.order_status !== 'new') {
      return NextResponse.json(
        { error: `Cannot edit order items with status: ${existingOrder.order_status}. Only 'new' orders can be fully edited.` },
        { status: 400 }
      );
    }

    // If items are provided, this is a full update (delete old items/shipments and create new ones)
    if (items && Array.isArray(items)) {
      // Validate items structure
      if (items.length === 0) {
        return NextResponse.json(
          { error: 'Order must have at least one item' },
          { status: 400 }
        );
      }

      // Validate shipments for each item
      for (const item of items) {
        if (!item.shipments || item.shipments.length === 0) {
          return NextResponse.json(
            { error: 'Each item must have at least one shipment' },
            { status: 400 }
          );
        }

        const totalShipmentQty = item.shipments.reduce((sum: number, s: any) => sum + s.quantity, 0);
        if (totalShipmentQty !== item.quantity) {
          return NextResponse.json(
            { error: `Total shipment quantity (${totalShipmentQty}) does not match item quantity (${item.quantity})` },
            { status: 400 }
          );
        }
      }

      // Calculate totals
      let subtotal = 0;
      const itemsWithTotals = items.map((item: any) => {
        // Support both discount_percent (legacy) and discount_value/discount_type (new)
        let discountPercent = 0;
        let discountAmountItem = 0;
        const itemSubtotal = item.quantity * item.unit_price;

        if (item.discount_type === 'amount' && item.discount_value) {
          discountAmountItem = item.discount_value;
          discountPercent = itemSubtotal > 0 ? (discountAmountItem / itemSubtotal) * 100 : 0;
        } else {
          discountPercent = item.discount_value || item.discount_percent || 0;
          discountAmountItem = itemSubtotal * (discountPercent / 100);
        }

        const itemTotal = itemSubtotal - discountAmountItem;
        subtotal += itemTotal;
        return {
          ...item,
          discount_percent: discountPercent,
          discount_amount: discountAmountItem,
          discount_type: item.discount_type || 'percent',
          subtotal: itemSubtotal,
          total: itemTotal
        };
      });

      console.log('[UPDATE ORDER] items count:', items.length, 'subtotal:', subtotal, 'items:', items.map((i: any) => ({ name: i.product_name, qty: i.quantity, price: i.unit_price, address: i.shipments?.[0]?.shipping_address_id })));

      // Calculate total shipping fee (deduplicated by address)
      const shippingFeeByAddress = new Map<string, number>();
      items.forEach((item: any) => {
        item.shipments.forEach((s: any) => {
          if (s.shipping_fee && !shippingFeeByAddress.has(s.shipping_address_id)) {
            shippingFeeByAddress.set(s.shipping_address_id, s.shipping_fee);
          }
        });
      });
      const totalShippingFee = Array.from(shippingFeeByAddress.values()).reduce((sum, f) => sum + f, 0);

      const orderDiscountAmount = discount_amount || 0;
      // Prices are VAT-inclusive, so we reverse-calculate VAT from the total
      const totalWithVAT = subtotal - orderDiscountAmount + totalShippingFee;
      const subtotalBeforeVAT = Math.round((totalWithVAT / 1.07) * 100) / 100;
      const vatAmount = totalWithVAT - subtotalBeforeVAT;
      const totalAmount = totalWithVAT;
      console.log('[UPDATE ORDER] itemsSubtotal:', subtotal, 'discount:', orderDiscountAmount, 'shipping:', totalShippingFee, 'subtotalBeforeVAT:', subtotalBeforeVAT, 'vat:', vatAmount, 'TOTAL:', totalAmount);

      // Delete existing order items (cascades to shipments via foreign key)
      const { error: deleteItemsError } = await supabaseAdmin
        .from('order_items')
        .delete()
        .eq('order_id', id)
        .eq('company_id', auth.companyId);

      if (deleteItemsError) {
        console.error('Error deleting old order items:', deleteItemsError);
        return NextResponse.json(
          { error: 'Failed to delete old order items' },
          { status: 500 }
        );
      }

      // Update order basic info
      const { error: updateOrderError } = await supabaseAdmin
        .from('orders')
        .update({
          delivery_date: delivery_date || null,
          subtotal: subtotalBeforeVAT,
          vat_amount: vatAmount,
          discount_amount: orderDiscountAmount,
          shipping_fee: totalShippingFee,
          total_amount: totalAmount,
          payment_method: payment_method || null,
          notes: notes || null,
          internal_notes: internal_notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('company_id', auth.companyId);

      if (updateOrderError) {
        console.error('Order update error:', updateOrderError);
        return NextResponse.json(
          { error: updateOrderError.message },
          { status: 500 }
        );
      }

      // Create new order items and shipments
      for (const item of itemsWithTotals) {
        const { data: orderItem, error: itemError } = await supabaseAdmin
          .from('order_items')
          .insert({
            company_id: auth.companyId,
            order_id: id,
            variation_id: item.variation_id,
            product_id: item.product_id,
            product_code: item.product_code,
            product_name: item.product_name,
            variation_label: item.variation_label || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent || 0,
            discount_amount: item.discount_amount,
            discount_type: item.discount_type || 'percent',
            subtotal: item.subtotal,
            total: item.total,
            notes: item.notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (itemError) {
          console.error('Order item creation error:', itemError);
          return NextResponse.json(
            { error: itemError.message },
            { status: 400 }
          );
        }

        // Create shipments for this item
        const shipmentsToInsert = item.shipments.map((shipment: any) => ({
          company_id: auth.companyId,
          order_item_id: orderItem.id,
          shipping_address_id: shipment.shipping_address_id,
          quantity: shipment.quantity,
          shipping_fee: shipment.shipping_fee || 0,
          delivery_status: 'pending',
          delivery_notes: shipment.delivery_notes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));

        const { error: shipmentError } = await supabaseAdmin
          .from('order_shipments')
          .insert(shipmentsToInsert);

        if (shipmentError) {
          console.error('Shipment creation error:', shipmentError);
          return NextResponse.json(
            { error: shipmentError.message },
            { status: 400 }
          );
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Order updated successfully'
      });
    } else {
      // Simple update (only basic fields, no items/shipments change)
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Only update fields that are provided
      if (delivery_date !== undefined) updateData.delivery_date = delivery_date || null;
      if (payment_method !== undefined) updateData.payment_method = payment_method || null;
      if (discount_amount !== undefined) updateData.discount_amount = discount_amount || 0;
      if (notes !== undefined) updateData.notes = notes || null;
      if (internal_notes !== undefined) updateData.internal_notes = internal_notes || null;
      if (body.shipping_fee !== undefined) updateData.shipping_fee = body.shipping_fee || 0;
      if (body.order_status !== undefined) updateData.order_status = body.order_status;
      if (body.payment_status !== undefined) updateData.payment_status = body.payment_status;

      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update(updateData)
        .eq('id', id)
        .eq('company_id', auth.companyId);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }

      // --- Stock logic on status change (best-effort) ---
      if (body.order_status && body.order_status !== existingOrder.order_status) {
        try {
          const stockConfig = await getStockConfig(auth.companyId!);
          if (stockConfig.stockEnabled) {
            // Fetch the order's warehouse_id
            const { data: orderForStock } = await supabaseAdmin
              .from('orders')
              .select('warehouse_id')
              .eq('id', id)
              .eq('company_id', auth.companyId)
              .single();

            const warehouseId = orderForStock?.warehouse_id;
            if (warehouseId) {
              // Fetch order items
              const { data: orderItems } = await supabaseAdmin
                .from('order_items')
                .select('variation_id, quantity')
                .eq('order_id', id)
                .eq('company_id', auth.companyId);

              const oldStatus = existingOrder.order_status;
              const newStatus = body.order_status;

              if (oldStatus === 'new' && newStatus === 'shipping') {
                // Deduct stock: quantity -= qty, reserved_quantity -= qty, create 'out' tx
                for (const oi of orderItems || []) {
                  if (!oi.variation_id) continue;
                  try {
                    const { data: inv } = await supabaseAdmin
                      .from('inventory')
                      .select('id, quantity, reserved_quantity')
                      .eq('warehouse_id', warehouseId)
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
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', inv.id);

                      await supabaseAdmin
                        .from('inventory_transactions')
                        .insert({
                          company_id: auth.companyId,
                          warehouse_id: warehouseId,
                          variation_id: oi.variation_id,
                          type: 'out',
                          quantity: oi.quantity,
                          balance_after: newQty,
                          reference_type: 'order',
                          reference_id: id,
                          notes: `Deduct for order shipment`,
                          created_by: auth.userId,
                          created_at: new Date().toISOString(),
                        });
                    }
                  } catch (itemErr) {
                    console.error(`[STOCK OUT] Error deducting stock for variation ${oi.variation_id}:`, itemErr);
                  }
                }

                // Auto-sync stock to Shopee after shipping deduction
                const shippingVarIds = (orderItems || []).map((oi: { variation_id?: string }) => oi.variation_id).filter(Boolean) as string[];
                if (shippingVarIds.length > 0) {
                  import('@/lib/shopee-auto-sync').then(m => m.triggerShopeeStockSync(shippingVarIds)).catch(() => {});
                }
              } else if (newStatus === 'cancelled') {
                if (oldStatus === 'new') {
                  // Unreserve: reserved_quantity -= qty, create 'unreserve' tx
                  for (const oi of orderItems || []) {
                    if (!oi.variation_id) continue;
                    try {
                      const { data: inv } = await supabaseAdmin
                        .from('inventory')
                        .select('id, quantity, reserved_quantity')
                        .eq('warehouse_id', warehouseId)
                        .eq('variation_id', oi.variation_id)
                        .eq('company_id', auth.companyId)
                        .single();

                      if (inv) {
                        const newReserved = Math.max(0, (inv.reserved_quantity || 0) - oi.quantity);
                        await supabaseAdmin
                          .from('inventory')
                          .update({
                            reserved_quantity: newReserved,
                            updated_at: new Date().toISOString(),
                          })
                          .eq('id', inv.id);

                        await supabaseAdmin
                          .from('inventory_transactions')
                          .insert({
                            company_id: auth.companyId,
                            warehouse_id: warehouseId,
                            variation_id: oi.variation_id,
                            type: 'unreserve',
                            quantity: oi.quantity,
                            balance_after: inv.quantity,
                            reference_type: 'order',
                            reference_id: id,
                            notes: `Unreserve for cancelled order`,
                            created_by: auth.userId,
                            created_at: new Date().toISOString(),
                          });
                      }
                    } catch (itemErr) {
                      console.error(`[STOCK UNRESERVE] Error unreserving stock for variation ${oi.variation_id}:`, itemErr);
                    }
                  }
                } else if (oldStatus === 'shipping') {
                  // Return stock: quantity += qty, create 'return' tx
                  for (const oi of orderItems || []) {
                    if (!oi.variation_id) continue;
                    try {
                      const { data: inv } = await supabaseAdmin
                        .from('inventory')
                        .select('id, quantity, reserved_quantity')
                        .eq('warehouse_id', warehouseId)
                        .eq('variation_id', oi.variation_id)
                        .eq('company_id', auth.companyId)
                        .single();

                      if (inv) {
                        const newQty = (inv.quantity || 0) + oi.quantity;
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
                            variation_id: oi.variation_id,
                            type: 'return',
                            quantity: oi.quantity,
                            balance_after: newQty,
                            reference_type: 'order',
                            reference_id: id,
                            notes: `Return stock for cancelled shipment`,
                            created_by: auth.userId,
                            created_at: new Date().toISOString(),
                          });
                      }
                    } catch (itemErr) {
                      console.error(`[STOCK RETURN] Error returning stock for variation ${oi.variation_id}:`, itemErr);
                    }
                  }

                  // Auto-sync stock to Shopee after cancel return
                  const cancelVarIds = (orderItems || []).map((oi: { variation_id?: string }) => oi.variation_id).filter(Boolean) as string[];
                  if (cancelVarIds.length > 0) {
                    import('@/lib/shopee-auto-sync').then(m => m.triggerShopeeStockSync(cancelVarIds)).catch(() => {});
                  }
                }
              }
            }
          }
        } catch (stockErr) {
          console.error('[STOCK STATUS CHANGE] Error during stock update:', stockErr);
        }
      }
      // --- End stock logic on status change ---

      return NextResponse.json({
        success: true,
        message: 'Order updated successfully'
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Cancel order
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('id');

    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Fetch current order status and warehouse_id before cancelling
    const { data: orderBeforeCancel } = await supabaseAdmin
      .from('orders')
      .select('order_status, warehouse_id')
      .eq('id', orderId)
      .eq('company_id', auth.companyId)
      .single();

    // Cancel order - set both order_status and payment_status to cancelled
    const { error } = await supabaseAdmin
      .from('orders')
      .update({
        order_status: 'cancelled',
        payment_status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .eq('company_id', auth.companyId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // --- Stock return/unreserve on cancel (best-effort) ---
    if (orderBeforeCancel && orderBeforeCancel.order_status !== 'cancelled') {
      try {
        const stockConfig = await getStockConfig(auth.companyId!);
        if (stockConfig.stockEnabled && orderBeforeCancel.warehouse_id) {
          const warehouseId = orderBeforeCancel.warehouse_id;
          const oldStatus = orderBeforeCancel.order_status;

          // Fetch order items
          const { data: orderItems } = await supabaseAdmin
            .from('order_items')
            .select('variation_id, quantity')
            .eq('order_id', orderId)
            .eq('company_id', auth.companyId);

          if (oldStatus === 'new') {
            // Unreserve: reserved_quantity -= qty, create 'unreserve' tx
            for (const oi of orderItems || []) {
              if (!oi.variation_id) continue;
              try {
                const { data: inv } = await supabaseAdmin
                  .from('inventory')
                  .select('id, quantity, reserved_quantity')
                  .eq('warehouse_id', warehouseId)
                  .eq('variation_id', oi.variation_id)
                  .eq('company_id', auth.companyId)
                  .single();

                if (inv) {
                  const newReserved = Math.max(0, (inv.reserved_quantity || 0) - oi.quantity);
                  await supabaseAdmin
                    .from('inventory')
                    .update({
                      reserved_quantity: newReserved,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', inv.id);

                  await supabaseAdmin
                    .from('inventory_transactions')
                    .insert({
                      company_id: auth.companyId,
                      warehouse_id: warehouseId,
                      variation_id: oi.variation_id,
                      type: 'unreserve',
                      quantity: oi.quantity,
                      balance_after: inv.quantity,
                      reference_type: 'order',
                      reference_id: orderId,
                      notes: `Unreserve for cancelled order`,
                      created_by: auth.userId,
                      created_at: new Date().toISOString(),
                    });
                }
              } catch (itemErr) {
                console.error(`[STOCK UNRESERVE DELETE] Error unreserving stock for variation ${oi.variation_id}:`, itemErr);
              }
            }
          } else if (oldStatus === 'shipping') {
            // Return stock: quantity += qty, create 'return' tx
            for (const oi of orderItems || []) {
              if (!oi.variation_id) continue;
              try {
                const { data: inv } = await supabaseAdmin
                  .from('inventory')
                  .select('id, quantity, reserved_quantity')
                  .eq('warehouse_id', warehouseId)
                  .eq('variation_id', oi.variation_id)
                  .eq('company_id', auth.companyId)
                  .single();

                if (inv) {
                  const newQty = (inv.quantity || 0) + oi.quantity;
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
                      variation_id: oi.variation_id,
                      type: 'return',
                      quantity: oi.quantity,
                      balance_after: newQty,
                      reference_type: 'order',
                      reference_id: orderId,
                      notes: `Return stock for cancelled shipment`,
                      created_by: auth.userId,
                      created_at: new Date().toISOString(),
                    });
                }
              } catch (itemErr) {
                console.error(`[STOCK RETURN DELETE] Error returning stock for variation ${oi.variation_id}:`, itemErr);
              }
            }

            // Auto-sync stock to Shopee after delete cancel return
            const deleteVarIds = (orderItems || []).map((oi: { variation_id?: string }) => oi.variation_id).filter(Boolean) as string[];
            if (deleteVarIds.length > 0) {
              import('@/lib/shopee-auto-sync').then(m => m.triggerShopeeStockSync(deleteVarIds)).catch(() => {});
            }
          }
        }
      } catch (stockErr) {
        console.error('[STOCK DELETE CANCEL] Error during stock update:', stockErr);
      }
    }
    // --- End stock return/unreserve on cancel ---

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'start_date and end_date are required' },
        { status: 400 }
      );
    }

    // Step 1: Fetch orders in date range (exclude cancelled)
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        order_date,
        delivery_date,
        order_status,
        payment_status,
        payment_method,
        total_amount,
        notes,
        internal_notes,
        customer:customers (
          id,
          customer_code,
          name,
          contact_person,
          phone
        )
      `)
      .eq('company_id', companyId)
      .gte('delivery_date', startDate)
      .lte('delivery_date', endDate)
      .neq('order_status', 'cancelled')
      .order('delivery_date', { ascending: true });

    if (ordersError) {
      console.error('Orders fetch error:', ordersError);
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    const orderIds = orders?.map(o => o.id) || [];

    if (orderIds.length === 0) {
      return NextResponse.json({
        report: {
          startDate,
          endDate,
          byDate: [],
          productSummary: [],
          totals: { totalDates: 0, totalDeliveries: 0, totalBottles: 0 }
        }
      });
    }

    // Step 2: Fetch order items (include variation_id for variation images)
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select(`
        id,
        order_id,
        variation_id,
        product_id,
        product_code,
        product_name,
        bottle_size,
        quantity,
        unit_price
      `)
      .in('order_id', orderIds)
      .eq('company_id', companyId);

    if (itemsError) {
      console.error('Order items fetch error:', itemsError);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    const orderItemIds = orderItems?.map(i => i.id) || [];

    if (orderItemIds.length === 0) {
      return NextResponse.json({
        report: {
          startDate,
          endDate,
          byDate: [],
          productSummary: [],
          totals: { totalDates: 0, totalDeliveries: 0, totalBottles: 0 }
        }
      });
    }

    // Step 2b: Fetch images — variation images from product_images, fallback to product.image
    const productIds = [...new Set(orderItems?.map(i => i.product_id).filter(Boolean))];
    const variationIds = [...new Set(orderItems?.map(i => i.variation_id).filter(Boolean))];

    // Map: variation_id -> image_url (from product_images table)
    const variationImageMap = new Map<string, string>();
    // Map: product_id -> image_url (fallback from product_images or products.image)
    const productImageMap = new Map<string, string>();

    // Fetch from product_images table (both variation-level and product-level)
    const orConditions: string[] = [];
    if (variationIds.length > 0) {
      orConditions.push(`variation_id.in.(${variationIds.join(',')})`);
    }
    if (productIds.length > 0) {
      orConditions.push(`product_id.in.(${productIds.join(',')})`);
    }

    if (orConditions.length > 0) {
      const { data: images } = await supabaseAdmin
        .from('product_images')
        .select('product_id, variation_id, image_url, sort_order')
        .or(orConditions.join(','))
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true });

      (images || []).forEach(img => {
        if (img.variation_id && !variationImageMap.has(img.variation_id)) {
          variationImageMap.set(img.variation_id, img.image_url);
        }
        if (img.product_id && !productImageMap.has(img.product_id)) {
          productImageMap.set(img.product_id, img.image_url);
        }
      });
    }

    // Also fetch products.image as final fallback
    if (productIds.length > 0) {
      const { data: productsData } = await supabaseAdmin
        .from('products')
        .select('id, image')
        .in('id', productIds);

      productsData?.forEach(p => {
        if (p.image && !productImageMap.has(p.id)) {
          productImageMap.set(p.id, p.image);
        }
      });
    }

    // Step 2c: Fetch barcodes from product_variations
    const variationBarcodeMap = new Map<string, string>();
    if (variationIds.length > 0) {
      const { data: variations } = await supabaseAdmin
        .from('product_variations')
        .select('id, barcode')
        .in('id', variationIds)
        .eq('company_id', companyId);

      (variations || []).forEach(v => {
        if (v.barcode) {
          variationBarcodeMap.set(v.id, v.barcode);
        }
      });
    }

    // Step 3: Fetch shipments with shipping addresses
    const { data: shipments, error: shipmentsError } = await supabaseAdmin
      .from('order_shipments')
      .select(`
        id,
        order_item_id,
        shipping_address_id,
        quantity,
        delivery_status,
        delivery_date,
        delivery_notes,
        shipping_address:shipping_addresses (
          id,
          address_name,
          contact_person,
          phone,
          address_line1,
          district,
          amphoe,
          province,
          postal_code,
          google_maps_link
        )
      `)
      .in('order_item_id', orderItemIds)
      .eq('company_id', companyId);

    if (shipmentsError) {
      console.error('Shipments fetch error:', shipmentsError);
      return NextResponse.json({ error: shipmentsError.message }, { status: 500 });
    }

    // Build lookup maps
    const orderMap = new Map(orders?.map(o => [o.id, o]));
    const orderItemMap = new Map(orderItems?.map(i => [i.id, i]));

    // Group by delivery_date -> (order_id, shipping_address_id) -> products
    const byDateMap = new Map<string, Map<string, {
      orderId: string;
      orderNumber: string;
      orderStatus: string;
      paymentStatus: string;
      paymentMethod: string | null;
      totalAmount: number;
      orderNotes: string | null;
      internalNotes: string | null;
      customer: any;
      shippingAddress: any;
      deliveryNotes: string | null;
      products: Map<string, { productName: string; productCode: string; bottleSize: string | null; quantity: number; image: string | null; barcode: string | null }>;
    }>>();

    // Product summary across all dates
    const productSummaryMap = new Map<string, { productName: string; productCode: string; bottleSize: string | null; totalQuantity: number; image: string | null; barcode: string | null }>();

    shipments?.forEach(shipment => {
      const orderItem = orderItemMap.get(shipment.order_item_id);
      if (!orderItem) return;

      const order = orderMap.get(orderItem.order_id);
      if (!order) return;

      const deliveryDate = order.delivery_date;
      const addressId = shipment.shipping_address_id;
      const deliveryKey = `${order.id}__${addressId}`;

      // Initialize date group
      if (!byDateMap.has(deliveryDate)) {
        byDateMap.set(deliveryDate, new Map());
      }

      const dateDeliveries = byDateMap.get(deliveryDate)!;

      // Initialize delivery entry
      if (!dateDeliveries.has(deliveryKey)) {
        const addr = shipment.shipping_address as any;
        dateDeliveries.set(deliveryKey, {
          orderId: order.id,
          orderNumber: order.order_number,
          orderStatus: order.order_status,
          paymentStatus: order.payment_status || 'pending',
          paymentMethod: order.payment_method || null,
          totalAmount: order.total_amount || 0,
          orderNotes: order.notes || null,
          internalNotes: order.internal_notes || null,
          customer: {
            id: (order.customer as any)?.id,
            customerCode: (order.customer as any)?.customer_code,
            name: (order.customer as any)?.name,
            contactPerson: (order.customer as any)?.contact_person || null,
            phone: (order.customer as any)?.phone || null,
          },
          shippingAddress: {
            id: addr?.id,
            addressName: addr?.address_name || 'ไม่ระบุ',
            contactPerson: addr?.contact_person || null,
            phone: addr?.phone || null,
            addressLine1: addr?.address_line1 || '',
            district: addr?.district || null,
            amphoe: addr?.amphoe || null,
            province: addr?.province || '',
            postalCode: addr?.postal_code || null,
            googleMapsLink: addr?.google_maps_link || null,
          },
          deliveryNotes: shipment.delivery_notes || null,
          products: new Map(),
        });
      }

      const delivery = dateDeliveries.get(deliveryKey)!;

      // Merge delivery notes if shipment has notes and we haven't captured it
      if (shipment.delivery_notes && !delivery.deliveryNotes) {
        delivery.deliveryNotes = shipment.delivery_notes;
      }

      // Add product (merge quantities if same product+bottle in same delivery)
      const productKey = `${orderItem.product_code}__${orderItem.bottle_size || ''}`;
      // Variation image > product_images product-level > products.image
      const itemImage = (orderItem.variation_id ? variationImageMap.get(orderItem.variation_id) : null)
        || productImageMap.get(orderItem.product_id) || null;
      const itemBarcode = (orderItem.variation_id ? variationBarcodeMap.get(orderItem.variation_id) : null) || null;
      if (!delivery.products.has(productKey)) {
        delivery.products.set(productKey, {
          productName: orderItem.product_name,
          productCode: orderItem.product_code,
          bottleSize: orderItem.bottle_size || null,
          quantity: 0,
          image: itemImage,
          barcode: itemBarcode,
        });
      }
      delivery.products.get(productKey)!.quantity += shipment.quantity;

      // Track product summary
      if (!productSummaryMap.has(productKey)) {
        productSummaryMap.set(productKey, {
          productName: orderItem.product_name,
          productCode: orderItem.product_code,
          bottleSize: orderItem.bottle_size || null,
          totalQuantity: 0,
          image: itemImage,
          barcode: itemBarcode,
        });
      }
      productSummaryMap.get(productKey)!.totalQuantity += shipment.quantity;
    });

    // Convert to response structure
    let totalDeliveries = 0;
    let totalBottles = 0;

    const byDate = Array.from(byDateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, deliveriesMap]) => {
        const deliveries = Array.from(deliveriesMap.values()).map(d => {
          const products = Array.from(d.products.values());
          const deliveryBottles = products.reduce((sum, p) => sum + p.quantity, 0);
          totalBottles += deliveryBottles;
          totalDeliveries++;
          return {
            orderId: d.orderId,
            orderNumber: d.orderNumber,
            orderStatus: d.orderStatus,
            paymentStatus: d.paymentStatus,
            paymentMethod: d.paymentMethod,
            totalAmount: d.totalAmount,
            orderNotes: d.orderNotes,
            internalNotes: d.internalNotes,
            customer: d.customer,
            shippingAddress: d.shippingAddress,
            deliveryNotes: d.deliveryNotes,
            products,
            totalBottles: deliveryBottles,
          };
        });

        return {
          date,
          deliveries,
          dateTotals: {
            totalDeliveries: deliveries.length,
            totalBottles: deliveries.reduce((sum, d) => sum + d.totalBottles, 0),
          },
        };
      });

    const productSummary = Array.from(productSummaryMap.values())
      .sort((a, b) => b.totalQuantity - a.totalQuantity);

    return NextResponse.json({
      report: {
        startDate,
        endDate,
        byDate,
        productSummary,
        totals: {
          totalDates: byDate.length,
          totalDeliveries,
          totalBottles,
        },
      },
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

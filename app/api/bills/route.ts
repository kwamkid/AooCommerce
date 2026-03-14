// Path: app/api/bills/route.ts
// Public API for bill online - no authentication required
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('id');

    if (!orderId) {
      return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
    }

    // Fetch order by id
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, order_date, delivery_date,
        subtotal, discount_amount, vat_amount, shipping_fee, total_amount,
        order_status, payment_status, notes, company_id, customer_id,
        delivery_name, delivery_phone, delivery_address,
        delivery_district, delivery_amphoe, delivery_province, delivery_postal_code, delivery_email,
        expires_at, cancellation_reason,
        customer:customers (
          name, contact_person, phone, email,
          billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code,
          tax_company_name, tax_id, tax_branch,
          customer_type
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Auto-cancel expired orders on load
    let isExpired = false;
    if (order.expires_at && order.order_status === 'new' && order.payment_status === 'pending') {
      if (new Date(order.expires_at) < new Date()) {
        await supabaseAdmin
          .from('orders')
          .update({ order_status: 'cancelled', cancellation_reason: 'expired', updated_at: new Date().toISOString() })
          .eq('id', orderId);
        order.order_status = 'cancelled';
        order.cancellation_reason = 'expired';
        isExpired = true;
      }
    }

    // Mark cancelled orders
    let isCancelled = false;
    if (order.order_status === 'cancelled') {
      if (order.cancellation_reason === 'expired') {
        isExpired = true;
      } else {
        isCancelled = true;
      }
    }

    // Wave 2: Fetch company, items, payment records, payment channels in parallel
    const [companyResult, itemsResult, paymentRecordsResult, paymentChannelsResult] = await Promise.all([
      supabaseAdmin
        .from('companies')
        .select('name, logo_url, vat_registered')
        .eq('id', order.company_id)
        .single(),
      supabaseAdmin
        .from('order_items')
        .select(`
          id, variation_id, product_id, product_code, product_name, variation_label,
          quantity, unit_price, discount_percent, discount_amount, subtotal, total, promotion_id, promotion_components
        `)
        .eq('order_id', order.id),
      supabaseAdmin
        .from('payment_records')
        .select('id, payment_method, amount, transfer_date, transfer_time, slip_image_url, status, notes, payment_date')
        .eq('order_id', order.id)
        .order('payment_date', { ascending: false })
        .limit(1),
      supabaseAdmin
        .from('payment_channels')
        .select('id, type, name, is_active, config, sort_order')
        .eq('company_id', order.company_id)
        .eq('channel_group', 'bill_online')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
    ]);

    const company = companyResult.data;
    const items = itemsResult.data;
    const paymentRecords = paymentRecordsResult.data;
    const paymentChannels = paymentChannelsResult.data;

    // Fetch promotion headers (name/type) for items with promotion_id
    // promotion_components are stored as JSONB in order_items column
    const promoIds = [...new Set((items || []).map(i => (i as any).promotion_id).filter(Boolean))];
    let promoMap: Record<string, { name: string; type: string }> = {};
    if (promoIds.length > 0) {
      const { data: promoHeaders } = await supabaseAdmin
        .from('promotions').select('id, name, promotion_type').in('id', promoIds);
      for (const h of promoHeaders || []) {
        promoMap[h.id] = { name: h.name, type: h.promotion_type };
      }
    }

    // Wave 3: Fetch images + shipments in parallel (depend on items)
    const variationIds = (items || []).map(i => i.variation_id).filter(Boolean);
    const productIds = (items || []).map(i => i.product_id).filter(Boolean);
    const itemIds = (items || []).map(i => i.id);

    const [imagesResult, shipmentsResult] = await Promise.all([
      (variationIds.length > 0 || productIds.length > 0)
        ? supabaseAdmin
            .from('product_images')
            .select('product_id, variation_id, image_url, sort_order')
            .or(
              [
                variationIds.length > 0 ? `variation_id.in.(${variationIds.join(',')})` : '',
                productIds.length > 0 ? `product_id.in.(${productIds.join(',')})` : ''
              ].filter(Boolean).join(',')
            )
            .order('sort_order', { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      itemIds.length > 0
        ? supabaseAdmin
            .from('order_shipments')
            .select(`
              order_item_id, quantity, shipping_fee,
              shipping_address:shipping_addresses (
                id, address_name, contact_person, phone,
                address_line1, district, amphoe, province, postal_code
              )
            `)
            .in('order_item_id', itemIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // Build image map
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

    const shipments = shipmentsResult.data;

    // Group items by branch (shipping_address)
    interface BranchData {
      address_name: string;
      contact_person?: string;
      phone?: string;
      address_line1: string;
      district?: string;
      amphoe?: string;
      province?: string;
      postal_code?: string;
      shipping_fee: number;
      items: any[];
    }

    const branchMap = new Map<string, BranchData>();

    for (const shipment of (shipments || []) as any[]) {
      const addr = shipment.shipping_address;
      if (!addr) continue;

      const addrId = addr.id;
      if (!branchMap.has(addrId)) {
        branchMap.set(addrId, {
          address_name: addr.address_name,
          contact_person: addr.contact_person,
          phone: addr.phone,
          address_line1: addr.address_line1,
          district: addr.district,
          amphoe: addr.amphoe,
          province: addr.province,
          postal_code: addr.postal_code,
          shipping_fee: shipment.shipping_fee || 0,
          items: []
        });
      }

      // Find the order_item for this shipment
      const item = (items || []).find(i => i.id === shipment.order_item_id);
      if (item) {
        const branch = branchMap.get(addrId)!;
        // Check if already added (avoid duplicates)
        if (!branch.items.find((i: any) => i.id === item.id)) {
          const pid = (item as any).promotion_id;
          const pm = pid ? promoMap[pid] : null;
          branch.items.push({
            product_code: item.product_code,
            product_name: pm ? pm.name : item.product_name,
            variation_label: item.variation_label,
            quantity: shipment.quantity || item.quantity,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent,
            discount_amount: item.discount_amount,
            subtotal: item.subtotal,
            total: item.total,
            image: imageMap[item.id] || null,
            promotion_id: pid || null,
            promotion_name: pm?.name || null,
            promotion_type: pm?.type || null,
            promotion_components: (item as any).promotion_components || null,
          });
        }
      }
    }

    const branches = Array.from(branchMap.values());

    // Flat items list (for backward compat / single-branch orders)
    const flatItems = (items || []).map(item => {
      const pid = (item as any).promotion_id;
      const pm = pid ? promoMap[pid] : null;
      return {
      product_code: item.product_code,
      product_name: pm ? pm.name : item.product_name,
      variation_label: item.variation_label,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_percent: item.discount_percent,
      discount_amount: item.discount_amount,
      subtotal: item.subtotal,
      total: item.total,
      image: imageMap[item.id] || null,
      promotion_id: pid || null,
      promotion_name: pm?.name || null,
      promotion_type: pm?.type || null,
      promotion_components: (item as any).promotion_components || null,
    };
    });

    const paymentRecord = paymentRecords && paymentRecords.length > 0 ? paymentRecords[0] : null;

    // Sanitize payment channels — strip sensitive data before sending to public page
    const customerData = order.customer as unknown as Record<string, unknown> | null;
    const customerType = (customerData?.customer_type as string) || 'retail';
    const orderAmount = order.total_amount as number;

    const sanitizedChannels = (paymentChannels || []).map(ch => {
      const cfg = ch.config as Record<string, unknown>;

      if (ch.type === 'payment_gateway') {
        const channels = (cfg.channels || {}) as Record<string, Record<string, unknown>>;
        const availableChannels = Object.entries(channels)
          .filter(([, conf]) => {
            if (!conf.enabled) return false;
            if (conf.min_amount && orderAmount < (conf.min_amount as number)) return false;
            if (conf.customer_types && Array.isArray(conf.customer_types) && conf.customer_types.length > 0) {
              if (!conf.customer_types.includes(customerType)) return false;
            }
            return true;
          })
          .map(([code, conf]) => ({ code, fee_payer: (conf.fee_payer as string) || 'merchant' }));

        return { type: ch.type, name: ch.name, available_channels: availableChannels };
      }

      if (ch.type === 'bank_transfer') {
        return {
          type: ch.type,
          name: ch.name,
          config: { bank_code: cfg.bank_code, account_number: cfg.account_number, account_name: cfg.account_name, promptpay_id: cfg.promptpay_id },
        };
      }

      // cash
      return { type: ch.type, name: ch.name, config: { description: cfg.description } };
    }).filter(Boolean);

    // Build customer info for bill display
    // Shipping address: from delivery snapshot → fallback to default shipping_address
    // Tax info: always from customerData (customers table)
    let shippingInfo: {
      name: string; phone?: string; email?: string;
      address?: string; district?: string; amphoe?: string; province?: string; postal_code?: string;
    } | null = null;

    // Priority 1: delivery snapshot on the order
    if (order.delivery_name) {
      shippingInfo = {
        name: order.delivery_name,
        phone: order.delivery_phone,
        email: order.delivery_email,
        address: order.delivery_address,
        district: order.delivery_district,
        amphoe: order.delivery_amphoe,
        province: order.delivery_province,
        postal_code: order.delivery_postal_code,
      };
    }

    // Priority 2: default shipping_address from customer
    if (!shippingInfo && order.customer_id) {
      const { data: defaultAddr } = await supabaseAdmin
        .from('shipping_addresses')
        .select('contact_person, phone, address_line1, district, amphoe, province, postal_code')
        .eq('customer_id', order.customer_id)
        .eq('is_default', true)
        .eq('is_active', true)
        .single();
      if (defaultAddr) {
        shippingInfo = {
          name: defaultAddr.contact_person || (customerData?.name as string) || '',
          phone: defaultAddr.phone || (customerData?.phone as string) || '',
          email: (customerData?.email as string) || '',
          address: defaultAddr.address_line1 || '',
          district: defaultAddr.district || '',
          amphoe: defaultAddr.amphoe || '',
          province: defaultAddr.province || '',
          postal_code: defaultAddr.postal_code || '',
        };
      }
    }

    // Priority 3: customer name/phone only (no address)
    if (!shippingInfo && customerData) {
      shippingInfo = {
        name: (customerData.name as string) || '',
        phone: (customerData.phone as string) || '',
        email: (customerData.email as string) || '',
      };
    }

    // Merge: shipping address + tax info from customer
    const billCustomer = shippingInfo ? {
      ...shippingInfo,
      // Tax/billing info always from customers table
      billing_address: (customerData?.billing_address as string) || undefined,
      billing_district: (customerData?.billing_district as string) || undefined,
      billing_amphoe: (customerData?.billing_amphoe as string) || undefined,
      billing_province: (customerData?.billing_province as string) || undefined,
      billing_postal_code: (customerData?.billing_postal_code as string) || undefined,
      tax_company_name: (customerData?.tax_company_name as string) || undefined,
      tax_id: (customerData?.tax_id as string) || undefined,
      tax_branch: (customerData?.tax_branch as string) || undefined,
      contact_person: (customerData?.contact_person as string) || undefined,
    } : customerData ? {
      name: (customerData.name as string) || '',
      phone: (customerData.phone as string) || '',
      email: (customerData.email as string) || '',
      contact_person: (customerData.contact_person as string) || undefined,
      billing_address: (customerData.billing_address as string) || undefined,
      billing_district: (customerData.billing_district as string) || undefined,
      billing_amphoe: (customerData.billing_amphoe as string) || undefined,
      billing_province: (customerData.billing_province as string) || undefined,
      billing_postal_code: (customerData.billing_postal_code as string) || undefined,
      tax_company_name: (customerData.tax_company_name as string) || undefined,
      tax_id: (customerData.tax_id as string) || undefined,
      tax_branch: (customerData.tax_branch as string) || undefined,
    } : null;

    return NextResponse.json({
      bill: {
        ...order,
        company_name: company?.name || '',
        company_logo: company?.logo_url || null,
        vat_registered: company?.vat_registered || false,
        items: flatItems,
        branches,
        payment_record: paymentRecord,
        payment_channels: sanitizedChannels,
        customer_type: customerType,
        customer: billCustomer,
        needs_delivery_info: !order.delivery_name || !order.delivery_phone || !order.delivery_address,
        is_expired: isExpired,
        is_cancelled: isCancelled,
        shipping_addresses: branches.map(b => ({
          address_name: b.address_name,
          contact_person: b.contact_person,
          phone: b.phone,
          address_line1: b.address_line1,
          district: b.district,
          amphoe: b.amphoe,
          province: b.province,
          postal_code: b.postal_code
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching bill:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Customer payment notification (public, no auth required)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const orderId = formData.get('order_id') as string;
    const paymentMethod = formData.get('payment_method') as string;
    const transferDate = formData.get('transfer_date') as string | null;
    const transferTime = formData.get('transfer_time') as string | null;
    const notes = formData.get('notes') as string | null;
    const slipImage = formData.get('slip_image') as File | null;

    if (!orderId || !paymentMethod) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate order exists and payment_status is pending
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, total_amount, payment_status, order_status, company_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.order_status === 'cancelled') {
      return NextResponse.json({ error: 'คำสั่งซื้อถูกยกเลิกแล้ว' }, { status: 400 });
    }

    if (order.payment_status !== 'pending') {
      return NextResponse.json({ error: 'ไม่สามารถแจ้งชำระได้ในสถานะนี้' }, { status: 400 });
    }

    // Upload slip image if provided
    let slipImageUrl: string | null = null;
    if (slipImage) {
      // Validate file size (max 5MB)
      if (slipImage.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'ไฟล์สลิปใหญ่เกินไป (สูงสุด 5MB)' }, { status: 400 });
      }

      // Validate MIME type
      if (!slipImage.type.startsWith('image/')) {
        return NextResponse.json({ error: 'ไฟล์สลิปต้องเป็นรูปภาพเท่านั้น' }, { status: 400 });
      }

      const timestamp = Date.now();
      const ext = slipImage.name.split('.').pop() || 'jpg';
      const filePath = `${orderId}/${timestamp}.${ext}`;

      const arrayBuffer = await slipImage.arrayBuffer();
      const { error: uploadError } = await supabaseAdmin.storage
        .from('payment-slips')
        .upload(filePath, arrayBuffer, {
          contentType: slipImage.type,
          upsert: false
        });

      if (uploadError) {
        console.error('Slip upload error:', uploadError);
        return NextResponse.json({ error: 'ไม่สามารถอัพโหลดสลิปได้' }, { status: 500 });
      }

      const { data: publicUrl } = supabaseAdmin.storage
        .from('payment-slips')
        .getPublicUrl(filePath);

      slipImageUrl = publicUrl.publicUrl;
    }

    // Create payment record with status 'pending' (customer-initiated)
    // Map bank_transfer/promptpay → transfer (DB constraint: cash, transfer, credit, cheque)
    const dbPaymentMethod = (paymentMethod === 'bank_transfer' || paymentMethod === 'promptpay') ? 'transfer' : paymentMethod;
    const { error: insertError } = await supabaseAdmin
      .from('payment_records')
      .insert({
        order_id: orderId,
        company_id: order.company_id,
        payment_method: dbPaymentMethod,
        amount: order.total_amount,
        transfer_date: (paymentMethod === 'transfer' || paymentMethod === 'bank_transfer') ? transferDate : null,
        transfer_time: (paymentMethod === 'transfer' || paymentMethod === 'bank_transfer') ? transferTime : null,
        slip_image_url: slipImageUrl,
        status: 'pending',
        notes: notes || null,
      });

    if (insertError) {
      console.error('Payment record insert error:', insertError);
      return NextResponse.json({ error: 'ไม่สามารถบันทึกข้อมูลได้' }, { status: 500 });
    }

    // Update order payment_status to 'verifying' + auto-advance to ready_to_ship
    const updateData: Record<string, any> = {
      payment_status: 'verifying',
      updated_at: new Date().toISOString(),
    };
    if (order.order_status === 'new') {
      updateData.order_status = 'ready_to_ship';
    }
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update(updateData)
      .eq('id', orderId);

    if (updateError) {
      console.error('Order update error:', updateError);
      return NextResponse.json({ error: 'ไม่สามารถอัพเดทสถานะได้' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in bills POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Customer fills in delivery info (public, no auth required)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { order_id, delivery_name, delivery_phone, delivery_address,
            delivery_district, delivery_amphoe, delivery_province, delivery_postal_code, delivery_email } = body;

    if (!order_id || !delivery_name || !delivery_phone || !delivery_address || !delivery_province || !delivery_postal_code) {
      return NextResponse.json(
        { error: 'กรุณากรอกชื่อ เบอร์โทร ที่อยู่ จังหวัด และรหัสไปรษณีย์' },
        { status: 400 }
      );
    }

    // Validate phone: 10 digits starting with 0
    const cleanPhone = delivery_phone.replace(/[-\s]/g, '');
    if (!/^0\d{9}$/.test(cleanPhone)) {
      return NextResponse.json(
        { error: 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก เริ่มด้วย 0' },
        { status: 400 }
      );
    }

    // Validate postal code: 5 digits
    if (!/^\d{5}$/.test(delivery_postal_code.trim())) {
      return NextResponse.json(
        { error: 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก' },
        { status: 400 }
      );
    }

    // Validate email (optional)
    if (delivery_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(delivery_email)) {
      return NextResponse.json(
        { error: 'รูปแบบอีเมลไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    // Verify order exists and has no customer_id
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, customer_id, order_status')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.order_status === 'cancelled') {
      return NextResponse.json({ error: 'คำสั่งซื้อถูกยกเลิกแล้ว' }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        delivery_name,
        delivery_phone,
        delivery_address,
        delivery_district: delivery_district || null,
        delivery_amphoe: delivery_amphoe || null,
        delivery_province: delivery_province || null,
        delivery_postal_code: delivery_postal_code || null,
        delivery_email: delivery_email || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order_id);

    if (updateError) {
      console.error('Delivery info update error:', updateError);
      return NextResponse.json({ error: 'ไม่สามารถบันทึกข้อมูลได้' }, { status: 500 });
    }

    // Sync delivery info to shipping_addresses (single source of truth) + contact info to customer
    if (order.customer_id) {
      try {
        // Sync contact info only (not address) to customer
        await supabaseAdmin
          .from('customers')
          .update({
            contact_person: delivery_name,
            phone: cleanPhone,
            email: delivery_email || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.customer_id);

        // Upsert default shipping address only if address data is complete enough
        // (address_line1 and province are NOT NULL in shipping_addresses)
        if (delivery_address && delivery_province) {
          const { data: existingAddr } = await supabaseAdmin
            .from('shipping_addresses')
            .select('id')
            .eq('customer_id', order.customer_id)
            .eq('is_default', true)
            .single();

          const addrPayload = {
            customer_id: order.customer_id,
            address_name: 'ที่อยู่หลัก',
            contact_person: delivery_name,
            phone: cleanPhone,
            address_line1: delivery_address,
            district: delivery_district || null,
            amphoe: delivery_amphoe || null,
            province: delivery_province,
            postal_code: delivery_postal_code || null,
            is_default: true,
          };

          let shippingAddressId: string | null = null;

          if (existingAddr) {
            await supabaseAdmin
              .from('shipping_addresses')
              .update({ ...addrPayload, updated_at: new Date().toISOString() })
              .eq('id', existingAddr.id);
            shippingAddressId = existingAddr.id;
          } else {
            // Need company_id for new shipping address
            const { data: customer } = await supabaseAdmin
              .from('customers')
              .select('company_id')
              .eq('id', order.customer_id)
              .single();
            if (customer) {
              const { data: newAddr } = await supabaseAdmin
                .from('shipping_addresses')
                .insert({ ...addrPayload, company_id: customer.company_id })
                .select('id')
                .single();
              shippingAddressId = newAddr?.id || null;
            }
          }

          // Link order to shipping_address
          if (shippingAddressId) {
            await supabaseAdmin
              .from('orders')
              .update({ shipping_address_id: shippingAddressId })
              .eq('id', order_id);
          }
        }
      } catch (syncError) {
        // Non-critical: log but don't fail the request
        console.error('Error syncing delivery info to shipping_address:', syncError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in bills PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

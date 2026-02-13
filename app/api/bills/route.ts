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
        order_status, payment_status, notes,
        customer:customers (
          name, contact_person, phone, email,
          address, district, amphoe, province, postal_code,
          tax_company_name, tax_id, tax_branch,
          customer_type_new
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Don't show cancelled orders
    if (order.order_status === 'cancelled') {
      return NextResponse.json({ error: 'Order has been cancelled' }, { status: 404 });
    }

    // Fetch order items with shipments (to group by branch)
    const { data: items } = await supabaseAdmin
      .from('order_items')
      .select(`
        id, variation_id, product_id, product_code, product_name, bottle_size,
        quantity, unit_price, discount_percent, discount_amount, subtotal, total
      `)
      .eq('order_id', order.id);

    // Fetch product images
    const variationIds = (items || []).map(i => i.variation_id).filter(Boolean);
    const productIds = (items || []).map(i => i.product_id).filter(Boolean);
    let imageMap: Record<string, string> = {};

    if (variationIds.length > 0 || productIds.length > 0) {
      const { data: images } = await supabaseAdmin
        .from('product_images')
        .select('product_id, variation_id, image_url, sort_order')
        .or(
          [
            variationIds.length > 0 ? `variation_id.in.(${variationIds.join(',')})` : '',
            productIds.length > 0 ? `product_id.in.(${productIds.join(',')})` : ''
          ].filter(Boolean).join(',')
        )
        .order('sort_order', { ascending: true });

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

      for (const item of items || []) {
        const image = variationImageMap[item.variation_id] || productImageMap[item.product_id];
        if (image) imageMap[item.id] = image;
      }
    }

    // Fetch shipments with addresses for all items
    const itemIds = (items || []).map(i => i.id);
    const { data: shipments } = await supabaseAdmin
      .from('order_shipments')
      .select(`
        order_item_id, quantity, shipping_fee,
        shipping_address:shipping_addresses (
          id, address_name, contact_person, phone,
          address_line1, district, amphoe, province, postal_code
        )
      `)
      .in('order_item_id', itemIds);

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
          branch.items.push({
            product_code: item.product_code,
            product_name: item.product_name,
            bottle_size: item.bottle_size,
            quantity: shipment.quantity || item.quantity,
            unit_price: item.unit_price,
            discount_percent: item.discount_percent,
            discount_amount: item.discount_amount,
            subtotal: item.subtotal,
            total: item.total,
            image: imageMap[item.id] || null
          });
        }
      }
    }

    const branches = Array.from(branchMap.values());

    // Flat items list (for backward compat / single-branch orders)
    const flatItems = (items || []).map(item => ({
      product_code: item.product_code,
      product_name: item.product_name,
      bottle_size: item.bottle_size,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_percent: item.discount_percent,
      discount_amount: item.discount_amount,
      subtotal: item.subtotal,
      total: item.total,
      image: imageMap[item.id] || null
    }));

    // Fetch latest payment record (for showing slip/status on bill page)
    const { data: paymentRecords } = await supabaseAdmin
      .from('payment_records')
      .select('id, payment_method, amount, transfer_date, transfer_time, slip_image_url, status, notes, payment_date')
      .eq('order_id', order.id)
      .order('payment_date', { ascending: false })
      .limit(1);

    const paymentRecord = paymentRecords && paymentRecords.length > 0 ? paymentRecords[0] : null;

    // Fetch active payment channels for bill_online
    const { data: paymentChannels } = await supabaseAdmin
      .from('payment_channels')
      .select('id, type, name, is_active, config, sort_order')
      .eq('channel_group', 'bill_online')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    // Sanitize payment channels — strip sensitive data before sending to public page
    const customerData = order.customer as unknown as Record<string, unknown> | null;
    const customerType = (customerData?.customer_type_new as string) || 'retail';
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

        if (availableChannels.length === 0) return null;
        return { type: ch.type, name: ch.name, available_channels: availableChannels };
      }

      if (ch.type === 'bank_transfer') {
        return {
          type: ch.type,
          name: ch.name,
          config: { bank_code: cfg.bank_code, account_number: cfg.account_number, account_name: cfg.account_name },
        };
      }

      // cash
      return { type: ch.type, name: ch.name, config: { description: cfg.description } };
    }).filter(Boolean);

    return NextResponse.json({
      bill: {
        ...order,
        items: flatItems,
        branches,
        payment_record: paymentRecord,
        payment_channels: sanitizedChannels,
        customer_type: customerType,
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
      .select('id, total_amount, payment_status, order_status')
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
    const { error: insertError } = await supabaseAdmin
      .from('payment_records')
      .insert({
        order_id: orderId,
        payment_method: paymentMethod,
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

    // Update order payment_status to 'verifying'
    const { error: updateError } = await supabaseAdmin
      .from('orders')
      .update({
        payment_status: 'verifying',
        updated_at: new Date().toISOString()
      })
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

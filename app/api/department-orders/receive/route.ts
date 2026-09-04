// Public API for department order receive — no authentication required
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { receiveFromTransit } from '@/lib/stock-service';
import { getConsignmentDestinationWarehouse } from '@/lib/consignment-warehouse';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SECRET_KEY!),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// GET — Fetch department order by receive_token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const { data: order, error } = await supabaseAdmin
      .from('department_orders')
      .select(`
        id, department_order_number, status, notes, created_at, shipped_at, received_at,
        receive_token, receiver_name, receive_photo_url, receive_notes,
        shipping_method, shipping_carrier, tracking_number, total_amount,
        customer:customers(id, name, customer_code, phone),
        items:department_order_items(
          id, product_id, variation_id, product_name, variation_label,
          quantity, received_quantity, unit_price
        ),
        company:companies(id, name, logo_url)
      `)
      .eq('receive_token', token)
      .order('sort_order', { referencedTable: 'department_order_items', ascending: true })
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'ไม่พบใบส่งห้าง' }, { status: 404 });
    }

    // Fetch product images for items
    const items = order.items as { product_id?: string | null; variation_id?: string | null }[];
    const variationIds = items.map(i => i.variation_id).filter(Boolean) as string[];
    const productIds = items.map(i => i.product_id).filter(Boolean) as string[];

    const imageMap: Record<string, string> = {};
    const skuMap: Record<string, string> = {};
    if (variationIds.length > 0 || productIds.length > 0) {
      const orParts: string[] = [];
      if (variationIds.length > 0) orParts.push(`variation_id.in.(${[...new Set(variationIds)].join(',')})`);
      if (productIds.length > 0) orParts.push(`product_id.in.(${[...new Set(productIds)].join(',')})`);
      const { data: images } = await supabaseAdmin
        .from('product_images')
        .select('product_id, variation_id, image_url')
        .or(orParts.join(','))
        .order('sort_order', { ascending: true });
      for (const img of images || []) {
        if (img.variation_id && !imageMap[`v:${img.variation_id}`]) imageMap[`v:${img.variation_id}`] = img.image_url;
        if (img.product_id && !imageMap[`p:${img.product_id}`]) imageMap[`p:${img.product_id}`] = img.image_url;
      }
      // Fetch SKUs from product_variations
      if (variationIds.length > 0) {
        const { data: variations } = await supabaseAdmin
          .from('product_variations')
          .select('id, sku')
          .in('id', [...new Set(variationIds)]);
        for (const v of variations || []) {
          if (v.sku) skuMap[v.id] = v.sku;
        }
      }
    }

    const enrichedItems = (order.items as {
      id: string; product_id?: string | null; variation_id?: string | null;
      product_name: string; variation_label?: string | null;
      quantity: number; received_quantity: number; unit_price: number;
    }[]).map(item => ({
      ...item,
      image: (item.variation_id ? imageMap[`v:${item.variation_id}`] : null)
        || (item.product_id ? imageMap[`p:${item.product_id}`] : null)
        || null,
      sku: (item.variation_id ? skuMap[item.variation_id] : null) || null,
    }));

    return NextResponse.json({
      order: { ...order, items: enrichedItems },
    });
  } catch (error) {
    console.error('GET department order receive error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Receive department order items (public, no auth)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const token = formData.get('token') as string;
    const receiverName = formData.get('receiver_name') as string;
    const itemsJson = formData.get('items') as string;
    const receiveNotes = formData.get('receive_notes') as string | null;
    const photo = formData.get('photo') as File | null;

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }
    if (!receiverName || !receiverName.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุชื่อผู้รับ' }, { status: 400 });
    }
    if (!itemsJson) {
      return NextResponse.json({ error: 'กรุณาระบุจำนวนที่รับ' }, { status: 400 });
    }

    let receivedItems: { item_id: string; received_quantity: number }[];
    try {
      receivedItems = JSON.parse(itemsJson);
    } catch {
      return NextResponse.json({ error: 'Invalid items format' }, { status: 400 });
    }

    // Fetch department order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('department_orders')
      .select('*, items:department_order_items(*)')
      .eq('receive_token', token)
      .order('sort_order', { referencedTable: 'department_order_items', ascending: true })
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'ไม่พบใบส่งห้าง' }, { status: 404 });
    }

    if (order.status !== 'shipped') {
      const statusMessages: Record<string, string> = {
        draft: 'ใบส่งห้างนี้ยังไม่ได้จัดส่ง',
        pending_confirm: 'ใบส่งห้างนี้ถูกรับสินค้าไปแล้ว',
        received: 'ใบส่งห้างนี้ถูกรับสินค้าไปแล้ว',
        partial_received: 'ใบส่งห้างนี้ถูกรับสินค้าไปแล้ว',
        cancelled: 'ใบส่งห้างนี้ถูกยกเลิกแล้ว',
      };
      return NextResponse.json({
        error: statusMessages[order.status] || 'ไม่สามารถรับสินค้าในสถานะนี้ได้',
      }, { status: 400 });
    }

    // Upload photo if provided
    let receivePhotoUrl: string | null = null;
    if (photo && photo.size > 0) {
      if (photo.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'ไฟล์รูปใหญ่เกินไป (สูงสุด 5MB)' }, { status: 400 });
      }
      if (!photo.type.startsWith('image/')) {
        return NextResponse.json({ error: 'ไฟล์ต้องเป็นรูปภาพเท่านั้น' }, { status: 400 });
      }

      const timestamp = Date.now();
      const ext = photo.name.split('.').pop() || 'jpg';
      const filePath = `dept-orders/${order.id}/${timestamp}.${ext}`;

      const arrayBuffer = await photo.arrayBuffer();
      const { error: uploadError } = await supabaseAdmin.storage
        .from('replenishment-receipts')
        .upload(filePath, arrayBuffer, {
          contentType: photo.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Photo upload error:', uploadError);
      } else {
        const { data: publicUrl } = supabaseAdmin.storage
          .from('replenishment-receipts')
          .getPublicUrl(filePath);
        receivePhotoUrl = publicUrl.publicUrl;
      }
    }

    // Update received_quantity per item
    let allMatch = true;
    for (const ri of receivedItems) {
      const { item_id, received_quantity } = ri;
      if (received_quantity === undefined || received_quantity === null) continue;

      const orderItem = order.items.find((i: any) => i.id === item_id);
      if (!orderItem) continue;

      if (received_quantity < 0) continue;

      await supabaseAdmin
        .from('department_order_items')
        .update({ received_quantity })
        .eq('id', item_id);

      if (received_quantity !== orderItem.quantity) {
        allMatch = false;
      }
    }

    // Determine status: auto-pass if all match, otherwise pending_confirm
    const newStatus = allMatch ? 'received' : 'pending_confirm';

    await supabaseAdmin
      .from('department_orders')
      .update({
        status: newStatus,
        received_at: allMatch ? new Date().toISOString() : null,
        receiver_name: receiverName.trim(),
        receive_photo_url: receivePhotoUrl,
        receive_notes: receiveNotes?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    // If all match (auto-received), add stock to consignment warehouse + clear in_transit
    if (allMatch) {
      try {
        const consignWarehouse = await getConsignmentDestinationWarehouse(
          supabaseAdmin, order.company_id, order.customer_id, order.counter_id
        );

        if (consignWarehouse) {
          const allItems = order.items as {
            id: string; variation_id: string | null; quantity: number;
          }[];

          for (const item of allItems) {
            if (!item.variation_id) continue;
            const qty = item.quantity || 0;
            if (qty <= 0) continue;

            await receiveFromTransit({
              supabase: supabaseAdmin,
              companyId: order.company_id,
              sourceWarehouseId: order.warehouse_id || '',
              destWarehouseId: consignWarehouse.id,
              variationId: item.variation_id,
              qty,
              referenceType: 'department_order',
              referenceId: order.id,
              notes: `รับเข้าคลังห้าง: ${order.department_order_number}`,
            });
          }
        }
      } catch (err) {
        console.error('Auto-receive inventory update error:', err);
      }
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error('POST department order receive error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

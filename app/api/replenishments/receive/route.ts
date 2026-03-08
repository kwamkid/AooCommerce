// Public API for replenishment receive — no authentication required
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { receiveFromTransit } from '@/lib/stock-service';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// GET — Fetch replenishment by receive_token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const { data: replenishment, error } = await supabaseAdmin
      .from('replenishments')
      .select(`
        id, replenishment_number, status, notes, created_at, shipped_at, received_at,
        receive_token, receiver_name, receive_photo_url, receive_notes,
        shipping_method, shipping_carrier, tracking_number, total_amount,
        customer:customers(id, name, customer_code, phone),
        items:replenishment_items(
          id, product_id, variation_id, product_name, variation_label,
          quantity, received_quantity, unit_price, sku
        ),
        company:companies(id, name, logo_url)
      `)
      .eq('receive_token', token)
      .single();

    if (error || !replenishment) {
      return NextResponse.json({ error: 'ไม่พบใบเติมสินค้า' }, { status: 404 });
    }

    // Fetch product images for items
    const items = replenishment.items as { product_id?: string | null; variation_id?: string | null }[];
    const variationIds = items.map(i => i.variation_id).filter(Boolean) as string[];
    const productIds = items.map(i => i.product_id).filter(Boolean) as string[];

    const imageMap: Record<string, string> = {};
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
    }

    const enrichedItems = (replenishment.items as {
      id: string; product_id?: string | null; variation_id?: string | null;
      product_name: string; variation_label?: string | null;
      quantity: number; received_quantity: number; unit_price: number; sku?: string | null;
    }[]).map(item => ({
      ...item,
      image: (item.variation_id ? imageMap[`v:${item.variation_id}`] : null)
        || (item.product_id ? imageMap[`p:${item.product_id}`] : null)
        || null,
    }));

    return NextResponse.json({
      replenishment: { ...replenishment, items: enrichedItems },
    });
  } catch (error) {
    console.error('GET replenishment receive error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Receive replenishment items (public, no auth)
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

    // Fetch replenishment
    const { data: replenishment, error: rpError } = await supabaseAdmin
      .from('replenishments')
      .select('*, items:replenishment_items(*)')
      .eq('receive_token', token)
      .single();

    if (rpError || !replenishment) {
      return NextResponse.json({ error: 'ไม่พบใบเติมสินค้า' }, { status: 404 });
    }

    if (replenishment.status !== 'shipped') {
      const statusMessages: Record<string, string> = {
        pending: 'ใบเติมสินค้านี้ยังไม่ได้จัดส่ง',
        pending_confirm: 'ใบเติมสินค้านี้ถูกรับสินค้าไปแล้ว',
        received: 'ใบเติมสินค้านี้ถูกรับสินค้าไปแล้ว',
        partial_received: 'ใบเติมสินค้านี้ถูกรับสินค้าไปแล้ว',
        cancelled: 'ใบเติมสินค้านี้ถูกยกเลิกแล้ว',
      };
      return NextResponse.json({
        error: statusMessages[replenishment.status] || 'ไม่สามารถรับสินค้าในสถานะนี้ได้',
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
      const filePath = `${replenishment.id}/${timestamp}.${ext}`;

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

      const repItem = replenishment.items.find((i: any) => i.id === item_id);
      if (!repItem) continue;

      if (received_quantity < 0 || received_quantity > repItem.quantity) continue;

      await supabaseAdmin
        .from('replenishment_items')
        .update({ received_quantity })
        .eq('id', item_id);

      if (received_quantity !== repItem.quantity) {
        allMatch = false;
      }
    }

    // Determine status: auto-pass if all match, otherwise pending_confirm
    const newStatus = allMatch ? 'received' : 'pending_confirm';

    await supabaseAdmin
      .from('replenishments')
      .update({
        status: newStatus,
        received_at: allMatch ? new Date().toISOString() : null,
        receiver_name: receiverName.trim(),
        receive_photo_url: receivePhotoUrl,
        receive_notes: receiveNotes?.trim() || null,
      })
      .eq('id', replenishment.id);

    // If all match (auto-received), add stock to consignment warehouse + clear in_transit
    if (allMatch) {
      try {
        const { data: consignWarehouse } = await supabaseAdmin
          .from('warehouses')
          .select('id')
          .eq('company_id', replenishment.company_id)
          .eq('customer_id', replenishment.customer_id)
          .eq('warehouse_type', 'consignment')
          .single();

        if (consignWarehouse) {
          const allItems = replenishment.items as {
            id: string; variation_id: string | null; quantity: number;
          }[];

          for (const item of allItems) {
            if (!item.variation_id) continue;
            const qty = item.quantity || 0;
            if (qty <= 0) continue;

            await receiveFromTransit({
              supabase: supabaseAdmin,
              companyId: replenishment.company_id,
              sourceWarehouseId: replenishment.warehouse_id || '',
              destWarehouseId: consignWarehouse.id,
              variationId: item.variation_id,
              qty,
              referenceType: 'replenishment',
              referenceId: replenishment.id,
              notes: `รับเข้าคลังตัวแทน: ${replenishment.replenishment_number}`,
            });
          }
        }
      } catch (err) {
        console.error('Auto-receive inventory update error:', err);
      }
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error('POST replenishment receive error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

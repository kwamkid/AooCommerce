// Path: app/api/transfers/receive/route.ts
// Public API for transfer receive — no authentication required
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { receiveFromTransit, cancelFromShipped } from '@/lib/stock-service';
import { pushStockAfter } from '@/lib/marketplace/push-after';
import { isAllowedImageUpload } from '@/lib/upload-validation';

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

// GET — Fetch transfer by receive_token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const { data: transfer, error } = await supabaseAdmin
      .from('inventory_transfers')
      .select(`
        id, transfer_number, status, notes, created_at, shipped_at, received_at,
        receive_token, receiver_name, receive_photo_url, receive_notes,
        from_warehouse:warehouses!inventory_transfers_from_warehouse_id_fkey(id, name, code),
        to_warehouse:warehouses!inventory_transfers_to_warehouse_id_fkey(id, name, code),
        items:inventory_transfer_items(
          id, variation_id, qty_sent, qty_received, notes,
          variation:product_variations(
            id, variation_label, sku, barcode, attributes,
            product:products(id, code, name, image)
          )
        ),
        company:companies(id, name, logo_url)
      `)
      .eq('receive_token', token)
      .single();

    if (error || !transfer) {
      return NextResponse.json({ error: 'ไม่พบใบโอนย้าย' }, { status: 404 });
    }

    return NextResponse.json({ transfer });
  } catch (error) {
    console.error('GET transfer receive error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Receive transfer items (public, no auth)
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

    let receivedItems: { item_id: string; qty_received: number }[];
    try {
      receivedItems = JSON.parse(itemsJson);
    } catch {
      return NextResponse.json({ error: 'Invalid items format' }, { status: 400 });
    }

    // Fetch transfer
    const { data: transfer, error: tfError } = await supabaseAdmin
      .from('inventory_transfers')
      .select('*, items:inventory_transfer_items(*)')
      .eq('receive_token', token)
      .single();

    if (tfError || !transfer) {
      return NextResponse.json({ error: 'ไม่พบใบโอนย้าย' }, { status: 404 });
    }

    if (transfer.status !== 'shipping') {
      const statusMessages: Record<string, string> = {
        pending: 'ใบโอนย้ายนี้ยังไม่ได้จัดส่ง',
        received: 'ใบโอนย้ายนี้ถูกรับสินค้าไปแล้ว',
        cancelled: 'ใบโอนย้ายนี้ถูกยกเลิกแล้ว',
      };
      return NextResponse.json({
        error: statusMessages[transfer.status] || 'ไม่สามารถรับสินค้าในสถานะนี้ได้',
      }, { status: 400 });
    }

    // Upload photo if provided
    let receivePhotoUrl: string | null = null;
    if (photo && photo.size > 0) {
      if (photo.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'ไฟล์รูปใหญ่เกินไป (สูงสุด 5MB)' }, { status: 400 });
      }
      if (!isAllowedImageUpload(photo)) {
        return NextResponse.json({ error: 'ไฟล์ต้องเป็นรูปภาพ (jpg/png/webp) เท่านั้น' }, { status: 400 });
      }

      const timestamp = Date.now();
      const ext = photo.name.split('.').pop() || 'jpg';
      const filePath = `${transfer.id}/${timestamp}.${ext}`;

      const arrayBuffer = await photo.arrayBuffer();
      const { error: uploadError } = await supabaseAdmin.storage
        .from('transfer-receipts')
        .upload(filePath, arrayBuffer, {
          contentType: photo.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Photo upload error:', uploadError);
        // Non-blocking — continue without photo
      } else {
        const { data: publicUrl } = supabaseAdmin.storage
          .from('transfer-receipts')
          .getPublicUrl(filePath);
        receivePhotoUrl = publicUrl.publicUrl;
      }
    }

    const sentItems = transfer.items as { id: string; variation_id: string; qty_sent: number }[];
    const receivedMap = new Map<string, number>();
    for (const ri of receivedItems) {
      if (ri.qty_received === undefined || ri.qty_received === null) continue;
      const sentItem = sentItems.find(i => i.id === ri.item_id);
      if (!sentItem) continue;
      if (ri.qty_received < 0 || ri.qty_received > sentItem.qty_sent) {
        return NextResponse.json(
          { error: `จำนวนรับต้องอยู่ระหว่าง 0 ถึง ${sentItem.qty_sent}` },
          { status: 400 }
        );
      }
      receivedMap.set(ri.item_id, ri.qty_received);
    }

    // Determine status: if all received matches sent → received, else → pending_confirm
    const allMatch = sentItems.every(i => (receivedMap.get(i.id) ?? 0) === i.qty_sent);
    const newStatus = allMatch ? 'received' : 'pending_confirm';

    /**
     * ล็อกกันกดซ้ำก่อนแตะสต็อก — หน้านี้เป็นลิงก์สาธารณะ (ไม่ต้องล็อกอิน) ผู้รับกดซ้ำหรือ
     * เน็ตสะดุดแล้วกดใหม่ได้ง่ายมาก รับสองรอบ = ของเข้าปลายทางสองเท่า in_transit ติดลบ
     */
    const { data: locked } = await supabaseAdmin
      .from('inventory_transfers')
      .update({
        status: newStatus,
        received_at: allMatch ? new Date().toISOString() : null,
        receiver_name: receiverName.trim(),
        receive_photo_url: receivePhotoUrl,
        receive_notes: receiveNotes?.trim() || null,
      })
      .eq('id', transfer.id)
      .eq('status', 'shipping')
      .select('id');

    if (!locked || locked.length === 0) {
      return NextResponse.json({ error: 'ใบโอนย้ายนี้ถูกรับสินค้าไปแล้ว' }, { status: 409 });
    }

    /**
     * วนจาก**รายการที่ส่งจริง** ไม่ใช่เฉพาะแถวที่ผู้รับกรอกมา — แถวที่ไม่ได้กรอกจะไม่ถูกแตะเลย
     * ของค้างใน in_transit ทั้งที่ใบปิดไปแล้ว = ของหายถาวร ไม่กรอก → ถือว่ารับ 0 คืนต้นทางให้หมด
     */
    for (const sentItem of sentItems) {
      const qtyReceived = receivedMap.get(sentItem.id) ?? 0;

      await supabaseAdmin
        .from('inventory_transfer_items')
        .update({ qty_received: qtyReceived })
        .eq('id', sentItem.id);

      if (qtyReceived > 0) {
        await receiveFromTransit({
          supabase: supabaseAdmin,
          companyId: transfer.company_id,
          sourceWarehouseId: transfer.from_warehouse_id,
          destWarehouseId: transfer.to_warehouse_id,
          variationId: sentItem.variation_id,
          qty: qtyReceived,
          referenceType: 'transfer',
          referenceId: transfer.id,
          notes: `รับโอนย้ายเข้า ${transfer.transfer_number}`,
        });
      }

      const shortfall = sentItem.qty_sent - qtyReceived;
      if (shortfall > 0) {
        await cancelFromShipped({
          supabase: supabaseAdmin,
          companyId: transfer.company_id,
          warehouseId: transfer.from_warehouse_id,
          variationId: sentItem.variation_id,
          qty: shortfall,
          referenceType: 'transfer',
          referenceId: transfer.id,
          notes: `คืนจากโอนย้าย ${transfer.transfer_number} (รับไม่ครบ)`,
        });
      }
    }

    // รับเข้าปลายทาง + ส่วนที่รับไม่ครบคืนต้นทาง → ยอดเปลี่ยนสองคลัง ต้องดันทั้งคู่
    pushStockAfter(
      sentItems.map(i => i.variation_id),
      [transfer.to_warehouse_id, transfer.from_warehouse_id],
    );

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error('POST transfer receive error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Path: app/api/transfers/receive/route.ts
// Public API for transfer receive — no authentication required
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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
      if (!photo.type.startsWith('image/')) {
        return NextResponse.json({ error: 'ไฟล์ต้องเป็นรูปภาพเท่านั้น' }, { status: 400 });
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

    // Process each item: add to destination, return shortfall to source
    for (const ri of receivedItems) {
      const { item_id, qty_received } = ri;
      if (qty_received === undefined || qty_received === null) continue;

      const transferItem = transfer.items.find((i: any) => i.id === item_id);
      if (!transferItem) continue;

      if (qty_received < 0 || qty_received > transferItem.qty_sent) continue;

      // Update transfer item
      await supabaseAdmin
        .from('inventory_transfer_items')
        .update({ qty_received })
        .eq('id', item_id);

      // Add to destination warehouse
      if (qty_received > 0) {
        const { data: destInv } = await supabaseAdmin
          .from('inventory')
          .select('id, quantity')
          .eq('warehouse_id', transfer.to_warehouse_id)
          .eq('variation_id', transferItem.variation_id)
          .single();

        const newDestQty = (destInv?.quantity || 0) + qty_received;
        if (destInv) {
          await supabaseAdmin
            .from('inventory')
            .update({ quantity: newDestQty, updated_at: new Date().toISOString() })
            .eq('id', destInv.id);
        } else {
          await supabaseAdmin
            .from('inventory')
            .insert({
              company_id: transfer.company_id,
              warehouse_id: transfer.to_warehouse_id,
              variation_id: transferItem.variation_id,
              quantity: newDestQty,
              reserved_quantity: 0,
            });
        }

        await supabaseAdmin
          .from('inventory_transactions')
          .insert({
            company_id: transfer.company_id,
            warehouse_id: transfer.to_warehouse_id,
            variation_id: transferItem.variation_id,
            type: 'transfer_in',
            quantity: qty_received,
            balance_after: newDestQty,
            reference_type: 'transfer',
            reference_id: transfer.id,
            notes: `รับโอนย้ายเข้า ${transfer.transfer_number}`,
          });
      }

      // Return shortfall to source
      const shortfall = transferItem.qty_sent - qty_received;
      if (shortfall > 0) {
        const { data: sourceInv } = await supabaseAdmin
          .from('inventory')
          .select('id, quantity')
          .eq('warehouse_id', transfer.from_warehouse_id)
          .eq('variation_id', transferItem.variation_id)
          .single();

        const newSourceQty = (sourceInv?.quantity || 0) + shortfall;
        if (sourceInv) {
          await supabaseAdmin
            .from('inventory')
            .update({ quantity: newSourceQty, updated_at: new Date().toISOString() })
            .eq('id', sourceInv.id);
        }

        await supabaseAdmin
          .from('inventory_transactions')
          .insert({
            company_id: transfer.company_id,
            warehouse_id: transfer.from_warehouse_id,
            variation_id: transferItem.variation_id,
            type: 'return',
            quantity: shortfall,
            balance_after: newSourceQty,
            reference_type: 'transfer',
            reference_id: transfer.id,
            notes: `คืนจากโอนย้าย ${transfer.transfer_number} (รับไม่ครบ)`,
          });
      }
    }

    // Determine status: if all received matches sent → received, else → pending_confirm
    const allMatch = receivedItems.every(ri => {
      const transferItem = transfer.items.find((i: any) => i.id === ri.item_id);
      return transferItem && ri.qty_received === transferItem.qty_sent;
    });
    const newStatus = allMatch ? 'received' : 'pending_confirm';

    // Update transfer status
    await supabaseAdmin
      .from('inventory_transfers')
      .update({
        status: newStatus,
        received_at: allMatch ? new Date().toISOString() : null,
        receiver_name: receiverName.trim(),
        receive_photo_url: receivePhotoUrl,
        receive_notes: receiveNotes?.trim() || null,
      })
      .eq('id', transfer.id);

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error('POST transfer receive error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

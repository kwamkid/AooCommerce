// Path: app/api/inventory/transfers/route.ts
// Two-step transfer: create/ship → receive
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

function canManageWarehouse(role: string | undefined, memberWarehouseIds: string[] | null, warehouseId: string): boolean {
  if (isAdminRole(role)) return true;
  if (!memberWarehouseIds || memberWarehouseIds.length === 0) return true; // null = all
  return memberWarehouseIds.includes(warehouseId);
}

// GET - List transfers
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const warehouseId = searchParams.get('warehouse_id');
    const transferId = searchParams.get('id');

    // Single transfer detail
    if (transferId) {
      const { data: transfer, error } = await supabaseAdmin
        .from('inventory_transfers')
        .select(`
          *,
          from_warehouse:warehouses!inventory_transfers_from_warehouse_id_fkey(id, name, code),
          to_warehouse:warehouses!inventory_transfers_to_warehouse_id_fkey(id, name, code),
          created_by_user:user_profiles!inventory_transfers_created_by_fkey(id, name, email),
          shipped_by_user:user_profiles!inventory_transfers_shipped_by_fkey(id, name, email),
          received_by_user:user_profiles!inventory_transfers_received_by_fkey(id, name, email),
          items:inventory_transfer_items(
            id, variation_id, qty_sent, qty_received, notes,
            variation:product_variations!inventory_transfer_items_variation_id_fkey(
              id, bottle_size, sku, attributes,
              product:products!product_variations_product_id_fkey(id, code, name, image)
            )
          )
        `)
        .eq('id', transferId)
        .eq('company_id', auth.companyId)
        .single();

      if (error || !transfer) {
        return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
      }

      return NextResponse.json({ transfer });
    }

    // List transfers
    let query = supabaseAdmin
      .from('inventory_transfers')
      .select(`
        id, transfer_number, status, notes, created_at, shipped_at, received_at,
        from_warehouse:warehouses!inventory_transfers_from_warehouse_id_fkey(id, name, code),
        to_warehouse:warehouses!inventory_transfers_to_warehouse_id_fkey(id, name, code),
        created_by_user:user_profiles!inventory_transfers_created_by_fkey(id, name),
        items:inventory_transfer_items(id)
      `)
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (warehouseId) {
      query = query.or(`from_warehouse_id.eq.${warehouseId},to_warehouse_id.eq.${warehouseId}`);
    }

    const { data: transfers, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ transfers: transfers || [] });
  } catch (error) {
    console.error('GET transfers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create and ship transfer
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRole) && auth.companyRole !== 'warehouse' && auth.companyRole !== 'manager') {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์สร้างใบโอนย้าย' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.companyId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const { from_warehouse_id, to_warehouse_id, items, notes } = body;

    if (!from_warehouse_id || !to_warehouse_id) {
      return NextResponse.json({ error: 'กรุณาเลือกคลังต้นทางและปลายทาง' }, { status: 400 });
    }
    if (from_warehouse_id === to_warehouse_id) {
      return NextResponse.json({ error: 'คลังต้นทางและปลายทางต้องไม่เป็นคลังเดียวกัน' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
    }

    // Check warehouse permission for source warehouse
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('warehouse_ids')
      .eq('company_id', auth.companyId)
      .eq('user_id', auth.userId)
      .single();

    if (!canManageWarehouse(auth.companyRole, membership?.warehouse_ids, from_warehouse_id)) {
      return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดการคลังต้นทางนี้' }, { status: 403 });
    }

    // Verify both warehouses belong to company
    const [fromWh, toWh] = await Promise.all([
      supabaseAdmin.from('warehouses').select('id').eq('id', from_warehouse_id).eq('company_id', auth.companyId).eq('is_active', true).single(),
      supabaseAdmin.from('warehouses').select('id').eq('id', to_warehouse_id).eq('company_id', auth.companyId).eq('is_active', true).single(),
    ]);

    if (!fromWh.data) return NextResponse.json({ error: 'คลังต้นทางไม่พบ' }, { status: 404 });
    if (!toWh.data) return NextResponse.json({ error: 'คลังปลายทางไม่พบ' }, { status: 404 });

    // Validate stock for all items
    const errors: { variation_id: string; error: string }[] = [];
    const validItems: { variation_id: string; quantity: number }[] = [];

    for (const item of items) {
      const { variation_id, quantity } = item;
      if (!variation_id || !quantity || quantity <= 0) continue;

      const { data: sourceInv } = await supabaseAdmin
        .from('inventory')
        .select('quantity, reserved_quantity')
        .eq('warehouse_id', from_warehouse_id)
        .eq('variation_id', variation_id)
        .single();

      const sourceQty = sourceInv?.quantity || 0;
      const sourceReserved = sourceInv?.reserved_quantity || 0;
      const sourceAvailable = sourceQty - sourceReserved;

      if (quantity > sourceAvailable) {
        errors.push({
          variation_id,
          error: `มี ${sourceAvailable} ชิ้นพร้อมโอน (คงเหลือ ${sourceQty}, จอง ${sourceReserved}) แต่ขอโอน ${quantity} ชิ้น`,
        });
      } else {
        validItems.push({ variation_id, quantity });
      }
    }

    if (errors.length > 0 && validItems.length === 0) {
      return NextResponse.json({ error: errors[0].error, errors }, { status: 400 });
    }

    // Generate transfer number
    const { data: tfNum } = await supabaseAdmin.rpc('generate_transfer_number', { p_company_id: auth.companyId });
    const transferNumber = tfNum || `TF-${Date.now()}`;

    // Create transfer header (status = shipped, deduct stock immediately)
    const { data: transfer, error: transferError } = await supabaseAdmin
      .from('inventory_transfers')
      .insert({
        company_id: auth.companyId,
        transfer_number: transferNumber,
        from_warehouse_id,
        to_warehouse_id,
        status: 'shipped',
        notes: notes || null,
        shipped_at: new Date().toISOString(),
        shipped_by: auth.userId,
        created_by: auth.userId,
      })
      .select('id, transfer_number')
      .single();

    if (transferError || !transfer) {
      console.error('Create transfer error:', transferError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างใบโอนย้ายได้' }, { status: 500 });
    }

    // Create items and deduct from source
    const results: { variation_id: string; qty_sent: number }[] = [];

    for (const item of validItems) {
      // Insert transfer item
      await supabaseAdmin
        .from('inventory_transfer_items')
        .insert({
          transfer_id: transfer.id,
          variation_id: item.variation_id,
          qty_sent: item.quantity,
        });

      // Deduct from source warehouse
      const { data: sourceInv } = await supabaseAdmin
        .from('inventory')
        .select('id, quantity')
        .eq('warehouse_id', from_warehouse_id)
        .eq('variation_id', item.variation_id)
        .single();

      const newSourceQty = (sourceInv?.quantity || 0) - item.quantity;
      if (sourceInv) {
        await supabaseAdmin
          .from('inventory')
          .update({ quantity: newSourceQty, updated_at: new Date().toISOString() })
          .eq('id', sourceInv.id);
      }

      // Create transfer_out transaction
      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          company_id: auth.companyId,
          warehouse_id: from_warehouse_id,
          variation_id: item.variation_id,
          type: 'transfer_out',
          quantity: item.quantity,
          balance_after: newSourceQty,
          reference_type: 'transfer',
          reference_id: transfer.id,
          notes: `โอนย้ายออก ${transferNumber}`,
          created_by: auth.userId,
        });

      results.push({ variation_id: item.variation_id, qty_sent: item.quantity });
    }

    return NextResponse.json({
      success: true,
      transfer_id: transfer.id,
      transfer_number: transfer.transfer_number,
      results,
      errors,
    });
  } catch (error) {
    console.error('POST transfers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Receive transfer (or cancel)
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { transfer_id, action, items: receivedItems, receive_notes } = body;

    if (!transfer_id || !action) {
      return NextResponse.json({ error: 'Missing transfer_id or action' }, { status: 400 });
    }

    // Get transfer
    const { data: transfer, error: tfError } = await supabaseAdmin
      .from('inventory_transfers')
      .select('*, items:inventory_transfer_items(*)')
      .eq('id', transfer_id)
      .eq('company_id', auth.companyId)
      .single();

    if (tfError || !transfer) {
      return NextResponse.json({ error: 'ไม่พบใบโอนย้าย' }, { status: 404 });
    }

    // Check warehouse permission for destination
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('warehouse_ids')
      .eq('company_id', auth.companyId)
      .eq('user_id', auth.userId)
      .single();

    if (action === 'receive') {
      if (transfer.status !== 'shipped') {
        return NextResponse.json({ error: 'ใบโอนย้ายนี้ไม่อยู่ในสถานะพร้อมรับ' }, { status: 400 });
      }

      if (!canManageWarehouse(auth.companyRole, membership?.warehouse_ids, transfer.to_warehouse_id)) {
        return NextResponse.json({ error: 'คุณไม่มีสิทธิ์รับสินค้าที่คลังปลายทางนี้' }, { status: 403 });
      }

      if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
        return NextResponse.json({ error: 'กรุณาระบุจำนวนที่รับ' }, { status: 400 });
      }

      let allFull = true;

      for (const ri of receivedItems) {
        const { item_id, qty_received } = ri;
        if (qty_received === undefined || qty_received === null) continue;

        const transferItem = transfer.items.find((i: any) => i.id === item_id);
        if (!transferItem) continue;

        if (qty_received < 0) {
          return NextResponse.json({ error: 'จำนวนรับไม่สามารถติดลบได้' }, { status: 400 });
        }
        if (qty_received > transferItem.qty_sent) {
          return NextResponse.json({ error: `จำนวนรับไม่สามารถมากกว่าจำนวนส่ง (${transferItem.qty_sent})` }, { status: 400 });
        }

        if (qty_received < transferItem.qty_sent) {
          allFull = false;
        }

        // Update transfer item qty_received
        await supabaseAdmin
          .from('inventory_transfer_items')
          .update({ qty_received })
          .eq('id', item_id);

        if (qty_received > 0) {
          // Add to destination warehouse
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
                company_id: auth.companyId,
                warehouse_id: transfer.to_warehouse_id,
                variation_id: transferItem.variation_id,
                quantity: newDestQty,
                reserved_quantity: 0,
              });
          }

          // Create transfer_in transaction
          await supabaseAdmin
            .from('inventory_transactions')
            .insert({
              company_id: auth.companyId,
              warehouse_id: transfer.to_warehouse_id,
              variation_id: transferItem.variation_id,
              type: 'transfer_in',
              quantity: qty_received,
              balance_after: newDestQty,
              reference_type: 'transfer',
              reference_id: transfer.id,
              notes: `รับโอนย้ายเข้า ${transfer.transfer_number}`,
              created_by: auth.userId,
            });
        }

        // If qty_received < qty_sent, return the difference to source
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

          // Create return transaction
          await supabaseAdmin
            .from('inventory_transactions')
            .insert({
              company_id: auth.companyId,
              warehouse_id: transfer.from_warehouse_id,
              variation_id: transferItem.variation_id,
              type: 'return',
              quantity: shortfall,
              balance_after: newSourceQty,
              reference_type: 'transfer',
              reference_id: transfer.id,
              notes: `คืนจากโอนย้าย ${transfer.transfer_number} (รับไม่ครบ)`,
              created_by: auth.userId,
            });
        }
      }

      // Update transfer status
      await supabaseAdmin
        .from('inventory_transfers')
        .update({
          status: allFull ? 'received' : 'partial',
          received_at: new Date().toISOString(),
          received_by: auth.userId,
          receive_notes: receive_notes || null,
        })
        .eq('id', transfer_id);

      return NextResponse.json({ success: true, status: allFull ? 'received' : 'partial' });
    }

    if (action === 'cancel') {
      if (transfer.status !== 'shipped') {
        return NextResponse.json({ error: 'สามารถยกเลิกได้เฉพาะใบที่อยู่ในสถานะ "จัดส่งแล้ว" เท่านั้น' }, { status: 400 });
      }

      // Only admin/owner or source warehouse user can cancel
      if (!isAdminRole(auth.companyRole) && !canManageWarehouse(auth.companyRole, membership?.warehouse_ids, transfer.from_warehouse_id)) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์ยกเลิกใบโอนย้ายนี้' }, { status: 403 });
      }

      // Return stock to source
      for (const item of transfer.items) {
        const { data: sourceInv } = await supabaseAdmin
          .from('inventory')
          .select('id, quantity')
          .eq('warehouse_id', transfer.from_warehouse_id)
          .eq('variation_id', item.variation_id)
          .single();

        const newSourceQty = (sourceInv?.quantity || 0) + item.qty_sent;
        if (sourceInv) {
          await supabaseAdmin
            .from('inventory')
            .update({ quantity: newSourceQty, updated_at: new Date().toISOString() })
            .eq('id', sourceInv.id);
        }

        await supabaseAdmin
          .from('inventory_transactions')
          .insert({
            company_id: auth.companyId,
            warehouse_id: transfer.from_warehouse_id,
            variation_id: item.variation_id,
            type: 'return',
            quantity: item.qty_sent,
            balance_after: newSourceQty,
            reference_type: 'transfer',
            reference_id: transfer.id,
            notes: `คืนจากยกเลิกโอนย้าย ${transfer.transfer_number}`,
            created_by: auth.userId,
          });
      }

      await supabaseAdmin
        .from('inventory_transfers')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer_id);

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('PUT transfers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

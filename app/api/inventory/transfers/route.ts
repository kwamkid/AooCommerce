// Path: app/api/inventory/transfers/route.ts
// Three-step transfer: pending (reserve) → shipping (deduct) → received (add dest)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole, canManageInventory } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';
import { reserveStock, deductAndUnreserve, transferIn, returnStock, unreserveStock } from '@/lib/stock-service';

function canManageWarehouse(roles: string[] | undefined, memberWarehouseIds: string[] | null, warehouseId: string): boolean {
  if (isAdminRole(roles)) return true;
  if (!Array.isArray(memberWarehouseIds)) return true; // null/undefined = all access
  return memberWarehouseIds.includes(warehouseId); // [] = no access, ['id'] = specific
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
          items:inventory_transfer_items(
            id, variation_id, qty_sent, qty_received, confirmed_quantity, notes,
            variation:product_variations(
              id, variation_label, sku, attributes,
              product:products(id, code, name, image)
            )
          )
        `)
        .eq('id', transferId)
        .eq('company_id', auth.companyId)
        .single();

      if (error || !transfer) {
        console.error('GET transfer by id error:', { transferId, error: error?.message, code: error?.code, details: error?.details, hint: error?.hint });
        return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
      }

      // Fetch user profiles for created_by, shipped_by, received_by
      const profileIds = [transfer.created_by, transfer.shipped_by, transfer.received_by].filter(Boolean);
      let profileMap: Record<string, { id: string; name: string; email: string }> = {};
      if (profileIds.length > 0) {
        const { data: profiles } = await supabaseAdmin.from('user_profiles').select('id, name, email').in('id', profileIds);
        if (profiles) profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
      }
      const t = transfer as Record<string, unknown>;
      t.created_by_user = transfer.created_by ? profileMap[transfer.created_by] || null : null;
      t.shipped_by_user = transfer.shipped_by ? profileMap[transfer.shipped_by] || null : null;
      t.received_by_user = transfer.received_by ? profileMap[transfer.received_by] || null : null;

      return NextResponse.json({ transfer });
    }

    // List transfers
    let query = supabaseAdmin
      .from('inventory_transfers')
      .select(`
        id, transfer_number, status, notes, created_at, shipped_at, received_at, created_by, receive_token,
        receiver_name, receive_photo_url,
        from_warehouse:warehouses!inventory_transfers_from_warehouse_id_fkey(id, name, code),
        to_warehouse:warehouses!inventory_transfers_to_warehouse_id_fkey(id, name, code),
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

    const userIds = [...new Set((transfers || []).map(r => r.created_by).filter(Boolean))];
    let userMap: Record<string, { id: string; name: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin.from('user_profiles').select('id, name').in('id', userIds);
      if (profiles) userMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    }

    const result = (transfers || []).map(r => ({
      ...r,
      created_by_user: r.created_by ? userMap[r.created_by] || null : null,
    }));

    return NextResponse.json({ transfers: result });
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
    if (!canManageInventory(auth.companyRoles)) {
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

    if (!canManageWarehouse(auth.companyRoles, membership?.warehouse_ids, from_warehouse_id)) {
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

    // Create transfer header (status = pending, reserve stock)
    const { data: transfer, error: transferError } = await supabaseAdmin
      .from('inventory_transfers')
      .insert({
        company_id: auth.companyId,
        transfer_number: transferNumber,
        from_warehouse_id,
        to_warehouse_id,
        status: 'pending',
        notes: notes || null,
        created_by: auth.userId,
      })
      .select('id, transfer_number, receive_token')
      .single();

    if (transferError || !transfer) {
      console.error('Create transfer error:', transferError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างใบโอนย้ายได้' }, { status: 500 });
    }

    // Create items and reserve stock at source
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

      // Reserve stock at source warehouse
      await reserveStock({
        supabase: supabaseAdmin,
        companyId: auth.companyId!,
        warehouseId: from_warehouse_id,
        variationId: item.variation_id,
        qty: item.quantity,
        referenceType: 'transfer',
        referenceId: transfer.id,
        notes: `จองสินค้าโอนย้าย ${transferNumber}`,
        createdBy: auth.userId,
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

    // === ACTION: SHIP (pending → shipping) ===
    if (action === 'ship') {
      if (transfer.status !== 'pending') {
        return NextResponse.json({ error: 'สามารถจัดส่งได้เฉพาะใบที่อยู่ในสถานะ "ที่ต้องจัดส่ง" เท่านั้น' }, { status: 400 });
      }

      if (!canManageWarehouse(auth.companyRoles, membership?.warehouse_ids, transfer.from_warehouse_id)) {
        return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดส่งจากคลังต้นทางนี้' }, { status: 403 });
      }

      // Deduct quantity + release reserved_quantity at source
      for (const item of transfer.items) {
        await deductAndUnreserve({
          supabase: supabaseAdmin,
          companyId: auth.companyId!,
          warehouseId: transfer.from_warehouse_id,
          variationId: item.variation_id,
          qty: item.qty_sent,
          referenceType: 'transfer',
          referenceId: transfer.id,
          notes: `โอนย้ายออก ${transfer.transfer_number}`,
          createdBy: auth.userId,
          transactionType: 'transfer_out',
        });
      }

      await supabaseAdmin
        .from('inventory_transfers')
        .update({
          status: 'shipping',
          shipped_at: new Date().toISOString(),
          shipped_by: auth.userId,
        })
        .eq('id', transfer_id);

      return NextResponse.json({ success: true, status: 'shipping' });
    }

    // === ACTION: RECEIVE (shipping → received) ===
    if (action === 'receive') {
      if (transfer.status !== 'shipping') {
        return NextResponse.json({ error: 'ใบโอนย้ายนี้ไม่อยู่ในสถานะกำลังส่ง' }, { status: 400 });
      }

      if (!canManageWarehouse(auth.companyRoles, membership?.warehouse_ids, transfer.to_warehouse_id)) {
        return NextResponse.json({ error: 'คุณไม่มีสิทธิ์รับสินค้าที่คลังปลายทางนี้' }, { status: 403 });
      }

      if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
        return NextResponse.json({ error: 'กรุณาระบุจำนวนที่รับ' }, { status: 400 });
      }

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

        // Update transfer item qty_received
        await supabaseAdmin
          .from('inventory_transfer_items')
          .update({ qty_received })
          .eq('id', item_id);

        if (qty_received > 0) {
          await transferIn({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: transfer.to_warehouse_id,
            variationId: transferItem.variation_id,
            qty: qty_received,
            referenceType: 'transfer',
            referenceId: transfer.id,
            notes: `รับโอนย้ายเข้า ${transfer.transfer_number}`,
            createdBy: auth.userId,
          });
        }

        // If qty_received < qty_sent, return the difference to source
        const shortfall = transferItem.qty_sent - qty_received;
        if (shortfall > 0) {
          await returnStock({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: transfer.from_warehouse_id,
            variationId: transferItem.variation_id,
            qty: shortfall,
            referenceType: 'transfer',
            referenceId: transfer.id,
            notes: `คืนจากโอนย้าย ${transfer.transfer_number} (รับไม่ครบ)`,
            createdBy: auth.userId,
          });
        }
      }

      // Update transfer status — always 'received' (no more 'partial')
      await supabaseAdmin
        .from('inventory_transfers')
        .update({
          status: 'received',
          received_at: new Date().toISOString(),
          received_by: auth.userId,
          receive_notes: receive_notes || null,
        })
        .eq('id', transfer_id);

      return NextResponse.json({ success: true, status: 'received' });
    }

    // === ACTION: CONFIRM (pending_confirm → received/partial) ===
    if (action === 'confirm') {
      if (transfer.status !== 'pending_confirm') {
        return NextResponse.json({ error: 'สามารถยืนยันได้เฉพาะสถานะ "รอยืนยัน" เท่านั้น' }, { status: 400 });
      }

      const { confirmed_items } = body;
      if (confirmed_items && Array.isArray(confirmed_items)) {
        for (const ci of confirmed_items as { item_id: string; confirmed_quantity: number }[]) {
          await supabaseAdmin
            .from('inventory_transfer_items')
            .update({ confirmed_quantity: ci.confirmed_quantity })
            .eq('id', ci.item_id);
        }
      }

      // Determine final status
      const { data: allItems } = await supabaseAdmin
        .from('inventory_transfer_items')
        .select('qty_sent, qty_received, confirmed_quantity')
        .eq('transfer_id', transfer_id);

      const allConfirmed = (allItems || []).every(
        (i: any) => (i.confirmed_quantity || i.qty_received || 0) >= i.qty_sent
      );

      await supabaseAdmin
        .from('inventory_transfers')
        .update({
          status: allConfirmed ? 'received' : 'received',
          received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer_id);

      return NextResponse.json({ success: true, status: 'received' });
    }

    // === ACTION: CANCEL (pending or shipping → cancelled) ===
    if (action === 'cancel') {
      if (transfer.status !== 'pending' && transfer.status !== 'shipping') {
        return NextResponse.json({ error: 'สามารถยกเลิกได้เฉพาะใบที่อยู่ในสถานะ "ที่ต้องจัดส่ง" หรือ "กำลังส่ง" เท่านั้น' }, { status: 400 });
      }

      // Only admin/owner or source warehouse user can cancel
      if (!isAdminRole(auth.companyRoles) && !canManageWarehouse(auth.companyRoles, membership?.warehouse_ids, transfer.from_warehouse_id)) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์ยกเลิกใบโอนย้ายนี้' }, { status: 403 });
      }

      if (transfer.status === 'pending') {
        for (const item of transfer.items) {
          await unreserveStock({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: transfer.from_warehouse_id,
            variationId: item.variation_id,
            qty: item.qty_sent,
            referenceType: 'transfer',
            referenceId: transfer.id,
            notes: `ยกเลิกจองโอนย้าย ${transfer.transfer_number}`,
            createdBy: auth.userId,
          });
        }
      } else {
        // shipping → cancelled: return stock to source
        for (const item of transfer.items) {
          await returnStock({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: transfer.from_warehouse_id,
            variationId: item.variation_id,
            qty: item.qty_sent,
            referenceType: 'transfer',
            referenceId: transfer.id,
            notes: `คืนจากยกเลิกโอนย้าย ${transfer.transfer_number}`,
            createdBy: auth.userId,
          });
        }
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

// PATCH - Update notes
export async function PATCH(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('inventory_transfers')
      .update({ notes: notes || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH transfers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

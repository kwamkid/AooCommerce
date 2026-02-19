import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole, hasAnyRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// POST - Transfer stock between warehouses
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasAnyRole(auth.companyRoles, ['owner','admin','warehouse','manager'])) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์โอนย้ายสินค้า' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.companyId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const { from_warehouse_id, to_warehouse_id, items, notes: batchNotes } = body;

    if (!from_warehouse_id || !to_warehouse_id) {
      return NextResponse.json({ error: 'กรุณาเลือกคลังต้นทางและปลายทาง' }, { status: 400 });
    }
    if (from_warehouse_id === to_warehouse_id) {
      return NextResponse.json({ error: 'คลังต้นทางและปลายทางต้องไม่เป็นคลังเดียวกัน' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
    }

    // Verify both warehouses belong to company
    const { data: fromWarehouse } = await supabaseAdmin
      .from('warehouses')
      .select('id')
      .eq('id', from_warehouse_id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    const { data: toWarehouse } = await supabaseAdmin
      .from('warehouses')
      .select('id')
      .eq('id', to_warehouse_id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    if (!fromWarehouse) {
      return NextResponse.json({ error: 'คลังต้นทางไม่พบ' }, { status: 404 });
    }
    if (!toWarehouse) {
      return NextResponse.json({ error: 'คลังปลายทางไม่พบ' }, { status: 404 });
    }

    // Generate a transfer group ID
    const transferGroupId = crypto.randomUUID();
    const results = [];
    const errors = [];

    for (const item of items) {
      const { variation_id, quantity } = item;
      if (!variation_id || !quantity || quantity <= 0) continue;

      // Check source inventory
      const { data: sourceInv } = await supabaseAdmin
        .from('inventory')
        .select('id, quantity, reserved_quantity')
        .eq('warehouse_id', from_warehouse_id)
        .eq('variation_id', variation_id)
        .single();

      const sourceQty = sourceInv?.quantity || 0;
      const sourceReserved = sourceInv?.reserved_quantity || 0;
      const sourceAvailable = sourceQty - sourceReserved;

      if (quantity > sourceAvailable) {
        errors.push({
          variation_id,
          error: `สินค้ามี ${sourceAvailable} ชิ้นพร้อมโอน (คงเหลือ ${sourceQty}, จอง ${sourceReserved}) แต่ขอโอน ${quantity} ชิ้น`,
        });
        continue;
      }

      // Deduct from source
      const newSourceQty = sourceQty - quantity;
      if (sourceInv) {
        await supabaseAdmin
          .from('inventory')
          .update({ quantity: newSourceQty, updated_at: new Date().toISOString() })
          .eq('id', sourceInv.id);
      }

      // Add to destination (upsert)
      const { data: destInv } = await supabaseAdmin
        .from('inventory')
        .select('id, quantity')
        .eq('warehouse_id', to_warehouse_id)
        .eq('variation_id', variation_id)
        .single();

      const newDestQty = (destInv?.quantity || 0) + quantity;
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
            warehouse_id: to_warehouse_id,
            variation_id,
            quantity: newDestQty,
            reserved_quantity: 0,
          });
      }

      // Create transfer_out transaction (source)
      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          company_id: auth.companyId,
          warehouse_id: from_warehouse_id,
          variation_id,
          type: 'transfer_out',
          quantity,
          balance_after: newSourceQty,
          reference_type: 'transfer',
          reference_id: transferGroupId,
          notes: batchNotes || 'โอนย้ายสินค้า',
          created_by: auth.userId,
        });

      // Create transfer_in transaction (destination)
      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          company_id: auth.companyId,
          warehouse_id: to_warehouse_id,
          variation_id,
          type: 'transfer_in',
          quantity,
          balance_after: newDestQty,
          reference_type: 'transfer',
          reference_id: transferGroupId,
          notes: batchNotes || 'โอนย้ายสินค้า',
          created_by: auth.userId,
        });

      results.push({ variation_id, quantity, from_balance: newSourceQty, to_balance: newDestQty });
    }

    if (errors.length > 0 && results.length === 0) {
      return NextResponse.json({ error: errors[0].error, errors }, { status: 400 });
    }

    return NextResponse.json({ success: true, transfer_id: transferGroupId, results, errors });
  } catch (error) {
    console.error('POST inventory/transfer error:', error);
    return NextResponse.json({ error: 'Failed to transfer stock' }, { status: 500 });
  }
}

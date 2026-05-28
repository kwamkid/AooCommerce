import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole, canManageInventory } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';
import { transferOut, transferIn, InsufficientStockError } from '@/lib/stock-service';

// POST - Transfer stock between warehouses
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManageInventory(auth.companyRoles)) {
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
    const noteText = batchNotes || 'โอนย้ายสินค้า';

    for (const item of items) {
      const { variation_id, quantity } = item;
      if (!variation_id || !quantity || quantity <= 0) continue;

      try {
        const outResult = await transferOut({
          supabase: supabaseAdmin,
          companyId: auth.companyId!,
          warehouseId: from_warehouse_id,
          variationId: variation_id,
          qty: quantity,
          referenceType: 'transfer',
          referenceId: transferGroupId,
          notes: noteText,
          createdBy: auth.userId,
          checkAvailable: true,
        });

        const inResult = await transferIn({
          supabase: supabaseAdmin,
          companyId: auth.companyId!,
          warehouseId: to_warehouse_id,
          variationId: variation_id,
          qty: quantity,
          referenceType: 'transfer',
          referenceId: transferGroupId,
          notes: noteText,
          createdBy: auth.userId,
        });

        results.push({ variation_id, quantity, from_balance: outResult.balanceAfter, to_balance: inResult.balanceAfter });
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          errors.push({ variation_id, error: `สินค้ามี ${err.available} ชิ้นพร้อมโอน (คงเหลือ ${err.currentQty}, จอง ${err.reservedQty}) แต่ขอโอน ${quantity} ชิ้น` });
        } else {
          throw err;
        }
      }
    }

    // Auto-sync stock to Shopee if linked
    const syncVariationIds = results.map((r: { variation_id: string }) => r.variation_id);
    if (syncVariationIds.length > 0) {
      const { triggerShopeeStockSync } = await import('@/lib/shopee/auto-sync');
      triggerShopeeStockSync(syncVariationIds);
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

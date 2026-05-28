import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole, canManageInventory } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';
import { deductStock, InsufficientStockError } from '@/lib/stock-service';

// POST - Issue stock out of warehouse (manual)
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManageInventory(auth.companyRoles)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เบิกสินค้า' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.companyId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const { warehouse_id, items, notes: batchNotes } = body;

    if (!warehouse_id) {
      return NextResponse.json({ error: 'กรุณาเลือกคลังสินค้า' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
    }

    // Verify warehouse
    const { data: warehouse } = await supabaseAdmin
      .from('warehouses')
      .select('id')
      .eq('id', warehouse_id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    if (!warehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    const results = [];
    const errors = [];

    for (const item of items) {
      const { variation_id, quantity, reason, notes } = item;
      if (!variation_id || !quantity || quantity <= 0) continue;

      const noteText = [reason, notes, batchNotes].filter(Boolean).join(' - ') || 'เบิกออกสินค้า';

      try {
        const result = await deductStock({
          supabase: supabaseAdmin,
          companyId: auth.companyId!,
          warehouseId: warehouse_id,
          variationId: variation_id,
          qty: quantity,
          referenceType: 'manual',
          referenceId: '',
          notes: noteText,
          createdBy: auth.userId,
          checkAvailable: true,
        });
        results.push({ variation_id, quantity, new_balance: result.balanceAfter });
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          errors.push({ variation_id, error: err.message });
        } else {
          throw err;
        }
      }
    }

    // Auto-sync stock to Shopee if linked
    const syncVarIds = results.map((r: { variation_id: string }) => r.variation_id);
    if (syncVarIds.length > 0) {
      const { triggerShopeeStockSync } = await import('@/lib/shopee/auto-sync');
      triggerShopeeStockSync(syncVarIds);
    }

    if (errors.length > 0 && results.length === 0) {
      return NextResponse.json({ error: errors[0].error, errors }, { status: 400 });
    }

    return NextResponse.json({ success: true, results, errors });
  } catch (error) {
    console.error('POST inventory/issue error:', error);
    return NextResponse.json({ error: 'Failed to issue stock' }, { status: 500 });
  }
}

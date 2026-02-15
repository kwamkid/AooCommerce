import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// POST - Issue stock out of warehouse (manual)
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRole) && auth.companyRole !== 'warehouse' && auth.companyRole !== 'manager') {
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

      // Get current inventory
      const { data: existing } = await supabaseAdmin
        .from('inventory')
        .select('id, quantity, reserved_quantity')
        .eq('warehouse_id', warehouse_id)
        .eq('variation_id', variation_id)
        .single();

      const currentQty = existing?.quantity || 0;
      const reservedQty = existing?.reserved_quantity || 0;
      const available = currentQty - reservedQty;

      if (quantity > available) {
        errors.push({
          variation_id,
          error: `สินค้ามี ${available} ชิ้นพร้อมเบิก (คงเหลือ ${currentQty}, จอง ${reservedQty}) แต่ขอเบิก ${quantity} ชิ้น`,
        });
        continue;
      }

      const newQuantity = currentQty - quantity;

      if (existing) {
        await supabaseAdmin
          .from('inventory')
          .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }

      // Create transaction
      const noteText = [reason, notes, batchNotes].filter(Boolean).join(' - ') || 'เบิกออกสินค้า';
      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          company_id: auth.companyId,
          warehouse_id,
          variation_id,
          type: 'out',
          quantity,
          balance_after: newQuantity,
          reference_type: 'manual',
          notes: noteText,
          created_by: auth.userId,
        });

      results.push({ variation_id, quantity, new_balance: newQuantity });
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

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole, hasAnyRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// POST - Receive stock into warehouse
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasAnyRole(auth.companyRoles, ['owner','admin','warehouse','manager'])) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์รับเข้าสินค้า' }, { status: 403 });
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
    for (const item of items) {
      const { variation_id, quantity, notes } = item;
      if (!variation_id || !quantity || quantity <= 0) continue;

      // Upsert inventory
      const { data: existing } = await supabaseAdmin
        .from('inventory')
        .select('id, quantity')
        .eq('warehouse_id', warehouse_id)
        .eq('variation_id', variation_id)
        .single();

      const newQuantity = (existing?.quantity || 0) + quantity;

      if (existing) {
        await supabaseAdmin
          .from('inventory')
          .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabaseAdmin
          .from('inventory')
          .insert({
            company_id: auth.companyId,
            warehouse_id,
            variation_id,
            quantity: newQuantity,
            reserved_quantity: 0,
          });
      }

      // Create transaction
      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          company_id: auth.companyId,
          warehouse_id,
          variation_id,
          type: 'in',
          quantity,
          balance_after: newQuantity,
          reference_type: 'manual',
          notes: notes || batchNotes || 'รับเข้าสินค้า',
          created_by: auth.userId,
        });

      results.push({ variation_id, quantity, new_balance: newQuantity });
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('POST inventory/receive error:', error);
    return NextResponse.json({ error: 'Failed to receive stock' }, { status: 500 });
  }
}

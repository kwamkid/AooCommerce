import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// GET - List inventory (stock levels)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stockConfig = await getStockConfig(auth.userId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouse_id');
    const search = searchParams.get('search');
    const lowStockOnly = searchParams.get('low_stock') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // Build query: inventory joined with product_variations and products
    let query = supabaseAdmin
      .from('inventory')
      .select(`
        id, warehouse_id, variation_id, quantity, reserved_quantity, updated_at,
        warehouse:warehouses!inner(id, name, code),
        variation:product_variations!inner(
          id, bottle_size, sku, barcode, default_price, min_stock, attributes, is_active,
          product:products!inner(id, code, name, image, is_active)
        )
      `, { count: 'exact' })
      .eq('company_id', auth.companyId);

    if (warehouseId) {
      query = query.eq('warehouse_id', warehouseId);
    }

    // Fetch all data first, then filter in JS for complex conditions
    const { data: allData, error, count: totalCount } = await query
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let items = (allData || []).map((item: any) => {
      const variation = item.variation;
      const product = variation?.product;
      const warehouse = item.warehouse;
      const minStock = (variation?.min_stock as number) || 0;
      const available = (item.quantity || 0) - (item.reserved_quantity || 0);

      return {
        id: item.id,
        warehouse_id: item.warehouse_id,
        warehouse_name: warehouse?.name || '',
        warehouse_code: warehouse?.code || '',
        variation_id: item.variation_id,
        product_id: product?.id || '',
        product_code: product?.code || '',
        product_name: product?.name || '',
        product_image: product?.image || null,
        bottle_size: variation?.bottle_size || '',
        sku: variation?.sku || '',
        barcode: variation?.barcode || '',
        attributes: variation?.attributes || null,
        default_price: variation?.default_price || 0,
        quantity: item.quantity || 0,
        reserved_quantity: item.reserved_quantity || 0,
        available,
        min_stock: minStock,
        is_low_stock: minStock > 0 && available <= minStock,
        is_out_of_stock: available <= 0,
        updated_at: item.updated_at,
      };
    });

    // Apply search filter
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(item =>
        item.product_name.toLowerCase().includes(s) ||
        item.product_code.toLowerCase().includes(s) ||
        item.sku.toLowerCase().includes(s) ||
        item.barcode.toLowerCase().includes(s)
      );
    }

    // Apply low stock filter
    if (lowStockOnly) {
      items = items.filter(item => item.is_low_stock || item.is_out_of_stock);
    }

    const total = items.length;
    const paginatedItems = items.slice(offset, offset + limit);

    // Count low stock items (for badge)
    const lowStockCount = items.filter(item => item.is_low_stock || item.is_out_of_stock).length;

    return NextResponse.json({
      items: paginatedItems,
      total,
      page,
      limit,
      lowStockCount,
    });
  } catch (error) {
    console.error('GET inventory error:', error);
    return NextResponse.json({ error: 'Failed to fetch inventory' }, { status: 500 });
  }
}

// POST - Manual stock adjust
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRole) && auth.companyRole !== 'warehouse' && auth.companyRole !== 'manager') {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ปรับ stock' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.userId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const { warehouse_id, variation_id, new_quantity, notes } = body;

    if (!warehouse_id || !variation_id || new_quantity === undefined) {
      return NextResponse.json({ error: 'warehouse_id, variation_id, and new_quantity are required' }, { status: 400 });
    }

    if (new_quantity < 0) {
      return NextResponse.json({ error: 'จำนวนต้องไม่ติดลบ' }, { status: 400 });
    }

    // Verify warehouse belongs to company
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

    // Get current inventory
    const { data: existing } = await supabaseAdmin
      .from('inventory')
      .select('id, quantity')
      .eq('warehouse_id', warehouse_id)
      .eq('variation_id', variation_id)
      .single();

    const oldQuantity = existing?.quantity || 0;
    const adjustAmount = new_quantity - oldQuantity;

    if (adjustAmount === 0) {
      return NextResponse.json({ success: true, message: 'No change needed' });
    }

    // Upsert inventory
    if (existing) {
      await supabaseAdmin
        .from('inventory')
        .update({
          quantity: new_quantity,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('inventory')
        .insert({
          company_id: auth.companyId,
          warehouse_id,
          variation_id,
          quantity: new_quantity,
          reserved_quantity: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
    }

    // Create transaction log
    await supabaseAdmin
      .from('inventory_transactions')
      .insert({
        company_id: auth.companyId,
        warehouse_id,
        variation_id,
        type: 'adjust',
        quantity: Math.abs(adjustAmount),
        balance_after: new_quantity,
        reference_type: 'manual',
        notes: notes || `ปรับ stock จาก ${oldQuantity} เป็น ${new_quantity}`,
        created_by: auth.userId,
        created_at: new Date().toISOString(),
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST inventory error:', error);
    return NextResponse.json({ error: 'Failed to adjust inventory' }, { status: 500 });
  }
}

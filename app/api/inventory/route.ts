import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// GET - List inventory (stock levels) — shows ALL products, including those with no stock
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stockConfig = await getStockConfig(auth.companyId!);
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

    // 1) Fetch all active product variations for this company
    const { data: variations, error: varError } = await supabaseAdmin
      .from('product_variations')
      .select(`
        id, bottle_size, sku, barcode, default_price, min_stock, attributes, is_active,
        product:products!inner(id, code, name, image, is_active, company_id)
      `)
      .eq('product.company_id', auth.companyId)
      .eq('is_active', true)
      .eq('product.is_active', true);

    if (varError) throw varError;

    // 2) Fetch inventory records (optionally filtered by warehouse)
    let invQuery = supabaseAdmin
      .from('inventory')
      .select('id, warehouse_id, variation_id, quantity, reserved_quantity, updated_at')
      .eq('company_id', auth.companyId);

    if (warehouseId) {
      invQuery = invQuery.eq('warehouse_id', warehouseId);
    }

    const { data: inventoryData, error: invError } = await invQuery;
    if (invError) throw invError;

    // 3) Fetch variation images (first image per variation, sorted by sort_order)
    const allVariationIds = (variations || []).map((v: { id: string }) => v.id);
    const variationImageMap = new Map<string, string>();
    if (allVariationIds.length > 0) {
      const { data: varImages } = await supabaseAdmin
        .from('product_images')
        .select('variation_id, image_url, sort_order')
        .in('variation_id', allVariationIds)
        .eq('company_id', auth.companyId)
        .order('sort_order', { ascending: true });

      if (varImages) {
        for (const img of varImages) {
          if (img.variation_id && !variationImageMap.has(img.variation_id)) {
            variationImageMap.set(img.variation_id, img.image_url);
          }
        }
      }
    }

    // 4) Build inventory lookup: variation_id -> aggregated stock
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stockMap: Record<string, { quantity: number; reserved_quantity: number; updated_at: string | null }> = {};
    (inventoryData || []).forEach((inv: { variation_id: string; quantity: number; reserved_quantity: number; updated_at: string }) => {
      if (!stockMap[inv.variation_id]) {
        stockMap[inv.variation_id] = { quantity: 0, reserved_quantity: 0, updated_at: null };
      }
      stockMap[inv.variation_id].quantity += (inv.quantity || 0);
      stockMap[inv.variation_id].reserved_quantity += (inv.reserved_quantity || 0);
      if (!stockMap[inv.variation_id].updated_at || inv.updated_at > stockMap[inv.variation_id].updated_at!) {
        stockMap[inv.variation_id].updated_at = inv.updated_at;
      }
    });

    // 5) Map all variations to inventory items (including those with no stock)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let items = (variations || []).map((v: any) => {
      const product = v.product;
      const stock = stockMap[v.id] || { quantity: 0, reserved_quantity: 0, updated_at: null };
      const minStock = (v.min_stock as number) || 0;
      const available = stock.quantity - stock.reserved_quantity;

      return {
        id: v.id,
        warehouse_id: null,
        warehouse_name: '',
        warehouse_code: '',
        variation_id: v.id,
        product_id: product?.id || '',
        product_code: product?.code || '',
        product_name: product?.name || '',
        product_image: variationImageMap.get(v.id) || product?.image || null,
        bottle_size: v.bottle_size || '',
        sku: v.sku || '',
        barcode: v.barcode || '',
        attributes: v.attributes || null,
        default_price: v.default_price || 0,
        quantity: stock.quantity,
        reserved_quantity: stock.reserved_quantity,
        available,
        min_stock: minStock,
        is_low_stock: minStock > 0 && available <= minStock,
        is_out_of_stock: available <= 0 && stock.quantity === 0,
        updated_at: stock.updated_at,
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
      items = items.filter(item => item.is_low_stock || (item.is_out_of_stock && item.min_stock > 0));
    }

    // Sort: low stock first, then by product name
    items.sort((a, b) => {
      if (a.is_low_stock && !b.is_low_stock) return -1;
      if (!a.is_low_stock && b.is_low_stock) return 1;
      return a.product_name.localeCompare(b.product_name);
    });

    const total = items.length;
    const paginatedItems = items.slice(offset, offset + limit);

    // Count low stock items (for badge)
    const lowStockCount = items.filter(item => item.is_low_stock || (item.is_out_of_stock && item.min_stock > 0)).length;

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

    const stockConfig = await getStockConfig(auth.companyId!);
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

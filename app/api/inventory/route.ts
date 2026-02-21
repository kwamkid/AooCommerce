import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole, hasAnyRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// Fallback: legacy query when views/RPC not yet created
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function legacyInventoryQuery(companyId: string, warehouseId: string | null, search: string | null): Promise<any[]> {
  const [varResult, invResult, imgResult] = await Promise.all([
    supabaseAdmin
      .from('product_variations')
      .select(`
        id, variation_label, sku, barcode, default_price, min_stock, attributes, is_active,
        product:products!inner(id, code, name, image, is_active, company_id)
      `)
      .eq('product.company_id', companyId)
      .eq('is_active', true)
      .eq('product.is_active', true),
    (() => {
      let q = supabaseAdmin
        .from('inventory')
        .select('variation_id, quantity, reserved_quantity, updated_at')
        .eq('company_id', companyId);
      if (warehouseId) q = q.eq('warehouse_id', warehouseId);
      return q;
    })(),
    supabaseAdmin
      .from('product_images')
      .select('variation_id, image_url, sort_order')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true }),
  ]);

  const variations = varResult.data || [];
  const inventoryData = invResult.data || [];

  // Build image map (first image per variation)
  const imageMap = new Map<string, string>();
  for (const img of (imgResult.data || [])) {
    if (img.variation_id && !imageMap.has(img.variation_id)) {
      imageMap.set(img.variation_id, img.image_url);
    }
  }

  // Build stock map
  const stockMap: Record<string, { quantity: number; reserved_quantity: number; updated_at: string | null }> = {};
  for (const inv of inventoryData) {
    if (!stockMap[inv.variation_id]) {
      stockMap[inv.variation_id] = { quantity: 0, reserved_quantity: 0, updated_at: null };
    }
    stockMap[inv.variation_id].quantity += (inv.quantity || 0);
    stockMap[inv.variation_id].reserved_quantity += (inv.reserved_quantity || 0);
    if (!stockMap[inv.variation_id].updated_at || inv.updated_at > stockMap[inv.variation_id].updated_at!) {
      stockMap[inv.variation_id].updated_at = inv.updated_at;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items = variations.map((v: any) => {
    const product = v.product;
    const stock = stockMap[v.id] || { quantity: 0, reserved_quantity: 0, updated_at: null };
    const available = stock.quantity - stock.reserved_quantity;
    return {
      variation_id: v.id,
      product_id: product?.id || '',
      product_code: product?.code || '',
      product_name: product?.name || '',
      product_image: imageMap.get(v.id) || product?.image || null,
      variation_label: v.variation_label || '',
      sku: v.sku || '',
      barcode: v.barcode || '',
      attributes: v.attributes || null,
      default_price: v.default_price || 0,
      min_stock: (v.min_stock as number) || 0,
      quantity: stock.quantity,
      reserved_quantity: stock.reserved_quantity,
      available,
      updated_at: stock.updated_at,
    };
  });

  // Apply search in JS for fallback
  if (search) {
    const s = search.toLowerCase();
    items = items.filter((item: { product_name: string; product_code: string; sku: string; barcode: string }) =>
      item.product_name.toLowerCase().includes(s) ||
      item.product_code.toLowerCase().includes(s) ||
      item.sku.toLowerCase().includes(s) ||
      item.barcode.toLowerCase().includes(s)
    );
  }

  return items;
}

// GET - List inventory (stock levels) — shows ALL products, including those with no stock
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouse_id');
    const search = searchParams.get('search');
    const lowStockOnly = searchParams.get('low_stock') === 'true';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // Try optimized view/RPC first, fallback to legacy if view doesn't exist
    let rawItems: { variation_id: string; product_id: string; product_code: string; product_name: string; product_image: string | null; variation_label: string; sku: string; barcode: string; attributes: unknown; default_price: number; min_stock: number; quantity: number; reserved_quantity: number; available: number; updated_at: string | null }[];
    let stockConfig;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let buildQuery: () => any;
    if (warehouseId) {
      buildQuery = () => supabaseAdmin.rpc('get_inventory_by_warehouse', {
        p_company_id: auth.companyId,
        p_warehouse_id: warehouseId,
      });
    } else {
      buildQuery = () => supabaseAdmin
        .from('inventory_summary')
        .select('*')
        .eq('company_id', auth.companyId);
    }

    let mainQuery = buildQuery();
    if (search) {
      const s = `%${search}%`;
      mainQuery = mainQuery.or(`product_name.ilike.${s},product_code.ilike.${s},sku.ilike.${s},barcode.ilike.${s}`);
    }

    const [stockConfigResult, queryResult] = await Promise.all([
      getStockConfig(auth.companyId!),
      mainQuery,
    ]);
    stockConfig = stockConfigResult;

    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    if (queryResult.error) {
      // View/RPC not available → fallback to legacy queries
      console.warn('inventory_summary view not available, using fallback:', queryResult.error.message);
      rawItems = await legacyInventoryQuery(auth.companyId!, warehouseId, search);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rawItems = (queryResult.data || []).map((row: any) => ({
        variation_id: row.variation_id,
        product_id: row.product_id || '',
        product_code: row.product_code || '',
        product_name: row.product_name || '',
        product_image: row.product_image || null,
        variation_label: row.variation_label || '',
        sku: row.sku || '',
        barcode: row.barcode || '',
        attributes: row.attributes || null,
        default_price: row.default_price || 0,
        min_stock: row.min_stock || 0,
        quantity: row.quantity || 0,
        reserved_quantity: row.reserved_quantity || 0,
        available: row.available ?? (row.quantity - row.reserved_quantity),
        updated_at: row.updated_at,
      }));
    }

    let items = rawItems.map(row => {
      const minStock = row.min_stock || 0;
      const available = row.available;
      return {
        id: row.variation_id,
        warehouse_id: null,
        warehouse_name: '',
        warehouse_code: '',
        variation_id: row.variation_id,
        product_id: row.product_id,
        product_code: row.product_code,
        product_name: row.product_name,
        product_image: row.product_image,
        variation_label: row.variation_label,
        sku: row.sku,
        barcode: row.barcode,
        attributes: row.attributes,
        default_price: row.default_price,
        quantity: row.quantity,
        reserved_quantity: row.reserved_quantity,
        available,
        min_stock: minStock,
        is_low_stock: minStock > 0 && available <= minStock,
        is_out_of_stock: available <= 0 && row.quantity === 0,
        updated_at: row.updated_at,
      };
    });

    // Low stock filter
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
    const lowStockCount = items.filter(item => item.is_low_stock || (item.is_out_of_stock && item.min_stock > 0)).length;
    const paginatedItems = items.slice(offset, offset + limit);

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
    if (!hasAnyRole(auth.companyRoles, ['owner','admin','warehouse'])) {
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

    // Auto-sync stock to Shopee if linked
    const { triggerShopeeStockSync } = await import('@/lib/shopee-auto-sync');
    triggerShopeeStockSync([variation_id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST inventory error:', error);
    return NextResponse.json({ error: 'Failed to adjust inventory' }, { status: 500 });
  }
}

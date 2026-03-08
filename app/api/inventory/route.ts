import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole, hasAnyRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';
import { adjustStock } from '@/lib/stock-service';

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
        .select('variation_id, quantity, reserved_quantity, in_transit_quantity, updated_at')
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
  const stockMap: Record<string, { quantity: number; reserved_quantity: number; in_transit_quantity: number; updated_at: string | null }> = {};
  for (const inv of inventoryData) {
    if (!stockMap[inv.variation_id]) {
      stockMap[inv.variation_id] = { quantity: 0, reserved_quantity: 0, in_transit_quantity: 0, updated_at: null };
    }
    stockMap[inv.variation_id].quantity += (inv.quantity || 0);
    stockMap[inv.variation_id].reserved_quantity += (inv.reserved_quantity || 0);
    stockMap[inv.variation_id].in_transit_quantity += (inv.in_transit_quantity || 0);
    if (!stockMap[inv.variation_id].updated_at || inv.updated_at > stockMap[inv.variation_id].updated_at!) {
      stockMap[inv.variation_id].updated_at = inv.updated_at;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items = variations.map((v: any) => {
    const product = v.product;
    const stock = stockMap[v.id] || { quantity: 0, reserved_quantity: 0, in_transit_quantity: 0, updated_at: null };
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
      in_transit_quantity: stock.in_transit_quantity,
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

    const stockConfig = await getStockConfig(auth.companyId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouse_id');
    const search = searchParams.get('search');
    const lowStockOnly = searchParams.get('low_stock') === 'true';
    const categoryId = searchParams.get('category_id');
    const brandId = searchParams.get('brand_id');
    const supplierId = searchParams.get('supplier_id');
    const dealerId = searchParams.get('dealer_id'); // filter by consignment dealer
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    // Resolve dealer_id → consignment warehouse_id (if filtering by dealer)
    let dealerWarehouseId: string | null = null;
    if (dealerId) {
      const { data: dw } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('company_id', auth.companyId!)
        .eq('customer_id', dealerId)
        .eq('warehouse_type', 'consignment')
        .single();
      dealerWarehouseId = dw?.id ?? null;
    }

    // Fetch consignment warehouses with customer info first (needed for warehouse IDs)
    const consignWarehousesRes = await supabaseAdmin
      .from('warehouses')
      .select('id, name, customer_id')
      .eq('company_id', auth.companyId!)
      .eq('warehouse_type', 'consignment');

    const consignWarehouseIds = (consignWarehousesRes.data || []).map(w => w.id);

    // Fetch consignment stock from inventory using actual array of IDs
    const consignStockPromise = consignWarehouseIds.length > 0
      ? supabaseAdmin
          .from('inventory')
          .select('variation_id, quantity, warehouse_id')
          .eq('company_id', auth.companyId!)
          .gt('quantity', 0)
          .in('warehouse_id', consignWarehouseIds)
      : Promise.resolve({ data: [] });

    // Fetch in-transit breakdown from shipped replenishments
    const inTransitPromise = supabaseAdmin
      .from('replenishment_items')
      .select('variation_id, quantity, replenishment:replenishments!inner(customer_id, warehouse_id, status)')
      .eq('replenishment.company_id', auth.companyId!)
      .eq('replenishment.status', 'shipped');

    // Try new RPC first (supports all filters + server-side pagination)
    const [rpcResult, consignStockRes, inTransitRes] = await Promise.all([
      supabaseAdmin.rpc('get_inventory_filtered', {
        p_company_id: auth.companyId,
        p_warehouse_id: dealerWarehouseId || warehouseId || null,
        p_search: search || null,
        p_category_id: categoryId || null,
        p_brand_id: brandId || null,
        p_supplier_id: supplierId || null,
        p_low_stock: lowStockOnly,
        p_limit: dealerWarehouseId ? 99999 : limit,
        p_offset: dealerWarehouseId ? 0 : offset,
      }),
      consignStockPromise,
      inTransitPromise,
    ]);

    // Build in-transit map: variation_id → { total, breakdown by customer }
    const inTransitMap: Record<string, { total: number; breakdown: { customer_id: string; customer_name: string; qty: number }[] }> = {};
    // Need customer names for breakdown
    const customerIdsForTransit = new Set<string>();
    for (const row of inTransitRes.data || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rep = row.replenishment as any;
      if (rep?.customer_id) customerIdsForTransit.add(rep.customer_id);
    }
    const transitCustomerMap: Record<string, string> = {};
    if (customerIdsForTransit.size > 0) {
      const { data: customers } = await supabaseAdmin
        .from('customers')
        .select('id, name')
        .in('id', [...customerIdsForTransit]);
      for (const c of customers || []) {
        transitCustomerMap[c.id] = c.name;
      }
    }
    for (const row of inTransitRes.data || []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rep = row.replenishment as any;
      if (!row.variation_id || !rep?.customer_id) continue;
      const qty = row.quantity || 0;
      if (qty <= 0) continue;

      if (!inTransitMap[row.variation_id]) {
        inTransitMap[row.variation_id] = { total: 0, breakdown: [] };
      }
      inTransitMap[row.variation_id].total += qty;

      // Merge by customer_id
      const existing = inTransitMap[row.variation_id].breakdown.find(b => b.customer_id === rep.customer_id);
      if (existing) {
        existing.qty += qty;
      } else {
        inTransitMap[row.variation_id].breakdown.push({
          customer_id: rep.customer_id,
          customer_name: transitCustomerMap[rep.customer_id] || 'ไม่ทราบ',
          qty,
        });
      }
    }

    // Build consignment maps from inventory data
    const warehouseMap: Record<string, { customer_id: string; name: string }> = {};
    for (const w of consignWarehousesRes.data || []) {
      if (w.customer_id) warehouseMap[w.id] = { customer_id: w.customer_id, name: w.name };
    }
    // Map: variation_id → { total_qty, breakdown }
    const consignMap: Record<string, { total: number; breakdown: { customer_id: string; customer_name: string; qty: number }[] }> = {};
    for (const row of consignStockRes.data || []) {
      const wh = warehouseMap[row.warehouse_id];
      if (!wh) continue;
      if (!consignMap[row.variation_id]) {
        consignMap[row.variation_id] = { total: 0, breakdown: [] };
      }
      consignMap[row.variation_id].total += row.quantity;
      consignMap[row.variation_id].breakdown.push({
        customer_id: wh.customer_id,
        customer_name: wh.name,
        qty: row.quantity,
      });
    }

    // Helper to attach consign + in_transit fields
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const attachConsign = (item: any) => {
      const c = consignMap[item.variation_id];
      const t = inTransitMap[item.variation_id];
      return {
        ...item,
        consign_qty: c?.total ?? 0,
        consign_breakdown: c?.breakdown ?? [],
        in_transit_quantity: t?.total ?? 0,
        in_transit_breakdown: t?.breakdown ?? [],
      };
    };

    if (!rpcResult.error && rpcResult.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = rpcResult.data as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let items = (result.items || []).map((row: any) => {
        const minStock = row.min_stock || 0;
        const available = row.available ?? (row.quantity - row.reserved_quantity);
        return attachConsign({
          id: row.variation_id,
          warehouse_id: null,
          warehouse_name: '',
          warehouse_code: '',
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
          quantity: row.quantity || 0,
          reserved_quantity: row.reserved_quantity || 0,
          available,
          min_stock: minStock,
          is_low_stock: minStock > 0 && available <= minStock,
          is_out_of_stock: available <= 0 && row.quantity === 0,
          updated_at: row.updated_at,
        });
      });

      // Filter by dealer: only items that have consign stock for this dealer
      if (dealerWarehouseId) {
        items = items.filter((item: { consign_breakdown: { customer_id: string }[] }) =>
          item.consign_breakdown.some((b: { customer_id: string }) => b.customer_id === dealerId)
        );
        const total = items.length;
        return NextResponse.json({
          items: items.slice(offset, offset + limit),
          total,
          page,
          limit,
          lowStockCount: 0,
        });
      }

      return NextResponse.json({
        items,
        total: result.total || 0,
        page,
        limit,
        lowStockCount: result.lowStockCount || 0,
      });
    }

    // Fallback: old view/RPC path (no category/brand/supplier filters)
    console.warn('get_inventory_filtered RPC not available, using fallback:', rpcResult.error?.message);

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

    const queryResult = await mainQuery;
    let rawItems: { variation_id: string; product_id: string; product_code: string; product_name: string; product_image: string | null; variation_label: string; sku: string; barcode: string; attributes: unknown; default_price: number; min_stock: number; quantity: number; reserved_quantity: number; available: number; updated_at: string | null }[];

    if (queryResult.error) {
      console.warn('inventory_summary view not available, using legacy fallback:', queryResult.error.message);
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
      return attachConsign({
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
      });
    });

    // Filter by dealer: only items that have consign stock for this dealer
    if (dealerWarehouseId) {
      items = items.filter(item =>
        (item.consign_breakdown as { customer_id: string }[]).some(b => b.customer_id === dealerId)
      );
    }

    if (lowStockOnly) {
      items = items.filter(item => item.is_low_stock || (item.is_out_of_stock && item.min_stock > 0));
    }

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

    await adjustStock({
      supabase: supabaseAdmin,
      companyId: auth.companyId!,
      warehouseId: warehouse_id,
      variationId: variation_id,
      newQuantity: new_quantity,
      referenceType: 'manual',
      referenceId: '',
      notes: notes || `ปรับ stock เป็น ${new_quantity}`,
      createdBy: auth.userId,
    });

    // Auto-sync stock to Shopee if linked
    const { triggerShopeeStockSync } = await import('@/lib/shopee/auto-sync');
    triggerShopeeStockSync([variation_id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST inventory error:', error);
    return NextResponse.json({ error: 'Failed to adjust inventory' }, { status: 500 });
  }
}

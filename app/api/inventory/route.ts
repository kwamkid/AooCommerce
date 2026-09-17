import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';
import { adjustStock } from '@/lib/stock-service';
import { fetchAllRows } from '@/lib/supabase-paging';
import { guardFeature } from '@/lib/package-gates-server';

/* ============================================================================
 * view=list — หน้าสต็อกใหม่ (`/inventory` แท็บสินค้าคงคลัง)
 * RPC `get_inventory_list` รอบเดียวได้ครบ: หน้าปัจจุบัน + จำนวนต่อแท็บสถานะ +
 * ยอดแยกตามคลัง + ยอดกำลังส่ง — ไม่แตะเส้นทางเดิมด้านล่าง (มีอีก 14 ที่เรียกอยู่)
 * ==========================================================================*/

/** numeric ของ Postgres มาเป็น string ได้ — บังคับเป็นตัวเลขก่อนส่งออก */
const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

interface RawWarehouseRow {
  warehouse_id: string;
  name: string;
  type: 'internal' | 'consignment';
  customer_id: string | null;
  customer_name: string | null;
  quantity: unknown;
  reserved: unknown;
  available: unknown;
  in_transit: unknown;
}

interface RawTransitRow {
  customer_id: string;
  customer_name: string;
  qty: unknown;
}

interface RawListItem {
  variation_id: string;
  product_id: string;
  product_code: string | null;
  product_name: string | null;
  variation_label: string | null;
  is_simple: boolean;
  sku: string | null;
  barcode: string | null;
  attributes: Record<string, string> | null;
  default_price: unknown;
  image_url: string | null;
  min_stock: unknown;
  quantity: unknown;
  reserved: unknown;
  available: unknown;
  in_transit: unknown;
  consign_qty: unknown;
  status: string;
  updated_at: string | null;
  by_warehouse: RawWarehouseRow[] | null;
  in_transit_breakdown: RawTransitRow[] | null;
}

async function inventoryListView(searchParams: URLSearchParams, companyId: string) {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
  const search = searchParams.get('search');
  const warehouseId = searchParams.get('warehouse_id');
  const dealerId = searchParams.get('dealer_id');
  const categoryId = searchParams.get('category_id');
  const brandId = searchParams.get('brand_id');
  const supplierId = searchParams.get('supplier_id');
  const status = searchParams.get('status') || 'stocked';
  const sortBy = searchParams.get('sort_by') || 'name';
  const sortAsc = searchParams.get('sort_asc') !== '0';

  // ตัวแทน 1 รายมีคลังเคาน์เตอร์ได้หลายคลัง — ส่งมาทั้ง dealer + warehouse ให้ dealer ชนะ
  let warehouseIds: string[] | null = null;
  if (dealerId) {
    const { data: dealerWarehouses } = await supabaseAdmin
      .from('warehouses')
      .select('id')
      .eq('company_id', companyId)
      .eq('warehouse_type', 'consignment')
      .eq('customer_id', dealerId);
    const ids = (dealerWarehouses || []).map(w => w.id);
    // ตัวแทนที่ยังไม่มีคลัง = ไม่มีของแน่นอน ไม่ต้องรบกวน DB
    if (ids.length === 0) {
      return NextResponse.json({ items: [], total: 0, status_counts: null, page, limit });
    }
    warehouseIds = ids;
  } else if (warehouseId) {
    warehouseIds = [warehouseId];
  }

  const { data, error } = await supabaseAdmin.rpc('get_inventory_list', {
    p_company_id: companyId,
    p_page: page,
    p_limit: limit,
    p_search: search || null,
    p_warehouse_ids: warehouseIds,
    p_category_id: categoryId || null,
    p_brand_id: brandId || null,
    p_supplier_id: supplierId || null,
    p_status: status,
    p_sort_by: sortBy,
    p_sort_asc: sortAsc,
  });

  if (error) {
    console.error('get_inventory_list error:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch inventory' }, { status: 500 });
  }

  const result = (data || {}) as { total?: unknown; status_counts?: unknown; items?: RawListItem[] };

  const items = (result.items || []).map(row => ({
    variation_id: row.variation_id,
    product_id: row.product_id,
    product_code: row.product_code || '',
    product_name: row.product_name || '',
    variation_label: row.variation_label || '',
    is_simple: row.is_simple === true,
    sku: row.sku || '',
    barcode: row.barcode || '',
    attributes: row.attributes || null,
    default_price: num(row.default_price),
    image_url: row.image_url || null,
    min_stock: num(row.min_stock),
    quantity: num(row.quantity),
    reserved: num(row.reserved),
    available: num(row.available),
    in_transit: num(row.in_transit),
    consign_qty: num(row.consign_qty),
    status: row.status,
    updated_at: row.updated_at,
    by_warehouse: (row.by_warehouse || []).map(w => ({
      warehouse_id: w.warehouse_id,
      name: w.name,
      type: w.type,
      customer_id: w.customer_id ?? null,
      customer_name: w.customer_name ?? null,
      quantity: num(w.quantity),
      reserved: num(w.reserved),
      available: num(w.available),
      in_transit: num(w.in_transit),
    })),
    in_transit_breakdown: (row.in_transit_breakdown || []).map(t => ({
      customer_id: t.customer_id,
      customer_name: t.customer_name,
      qty: num(t.qty),
    })),
  }));

  return NextResponse.json({
    items,
    total: num(result.total),
    status_counts: result.status_counts ?? null,
    page,
    limit,
  });
}

interface ScopeInvRow {
  variation_id: string;
  quantity: number | string | null;
  reserved_quantity: number | string | null;
  in_transit_quantity: number | string | null;
  updated_at: string | null;
}

/**
 * ยอดต่อตัวเลือกในขอบเขตคลัง (คลังเดียว หรือคลังฝากขายทุกใบของตัวแทน) — ครบทุกแถว ไม่ติดเพดาน 1,000
 * คืนเฉพาะตัวเลือกที่มีแถว inventory ในคลังนั้น · ตัวแทน: แนบ consign_breakdown ให้ผู้เรียกเดิมอ่านต่อได้
 */
async function inventoryScopeView(companyId: string, warehouseId: string | null, dealerId: string | null) {
  let warehouseIds: string[];
  let dealerName = '';
  if (dealerId) {
    const [{ data: dealerWarehouses }, { data: customer }] = await Promise.all([
      supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('company_id', companyId)
        .eq('warehouse_type', 'consignment')
        .eq('customer_id', dealerId),
      supabaseAdmin.from('customers').select('name').eq('id', dealerId).eq('company_id', companyId).maybeSingle(),
    ]);
    warehouseIds = (dealerWarehouses || []).map(w => w.id);
    dealerName = customer?.name || '';
    if (warehouseIds.length === 0) {
      return NextResponse.json({ items: [], total: 0, page: 1, limit: 0 });
    }
  } else {
    warehouseIds = [warehouseId!];
  }

  // query builder ใช้ซ้ำไม่ได้ — สร้างใหม่ทุกหน้า (ดู lib/supabase-paging.ts)
  const { rows, error } = await fetchAllRows<ScopeInvRow>((from, to) =>
    supabaseAdmin
      .from('inventory')
      .select('variation_id, quantity, reserved_quantity, in_transit_quantity, updated_at')
      .eq('company_id', companyId)
      .in('warehouse_id', warehouseIds)
      .order('variation_id')
      .range(from, to),
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const agg = new Map<string, { quantity: number; reserved_quantity: number; in_transit_quantity: number; updated_at: string | null }>();
  for (const r of rows) {
    const cur = agg.get(r.variation_id) ?? { quantity: 0, reserved_quantity: 0, in_transit_quantity: 0, updated_at: null };
    cur.quantity += num(r.quantity);
    cur.reserved_quantity += num(r.reserved_quantity);
    cur.in_transit_quantity += num(r.in_transit_quantity);
    if (r.updated_at && (!cur.updated_at || r.updated_at > cur.updated_at)) cur.updated_at = r.updated_at;
    agg.set(r.variation_id, cur);
  }

  const items = [...agg.entries()].map(([variation_id, v]) => ({
    variation_id,
    quantity: v.quantity,
    reserved_quantity: v.reserved_quantity,
    in_transit_quantity: v.in_transit_quantity,
    available: v.quantity - v.reserved_quantity,
    updated_at: v.updated_at,
    ...(dealerId
      ? {
          consign_qty: v.quantity,
          consign_breakdown: v.quantity > 0
            ? [{ customer_id: dealerId, customer_name: dealerName, qty: v.quantity }]
            : [],
        }
      : {}),
  }));

  return NextResponse.json({ items, total: items.length, page: 1, limit: items.length });
}

// GET - List inventory (stock levels) — shows ALL products, including those with no stock
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'stock');
    if (blocked) return blocked;

    const stockConfig = await getStockConfig(auth.companyId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // เส้นทางใหม่ของหน้าสต็อก — ตอบจบที่นี่ ไม่ลงไปเส้นทางเดิมด้านล่าง
    if (searchParams.get('view') === 'list') {
      return await inventoryListView(searchParams, auth.companyId!);
    }

    // ── เส้นทางเดิม: ยอดต่อตัวเลือกในขอบเขตคลัง ──
    // ผู้เรียก: OrderForm (สลับคลัง) · ReplenishmentForm · หน้า PO · รายงานตัวแทน/ห้าง · DealerOrderForm
    // ใช้แค่ variation_id · quantity · reserved_quantity · available · consign_breakdown (ตัวแทน)
    // เดิมผ่าน RPC get_inventory_filtered + 4 query และ limit=9999 ซึ่ง PostgREST ตัดที่ 1,000 แถวเงียบ ๆ
    // ตอนนี้อ่าน inventory ของคลังที่ขอ "ทั้งหมด" ผ่าน fetchAllRows แล้วรวมต่อตัวเลือก ไม่ต้อง join สินค้า
    const warehouseId = searchParams.get('warehouse_id');
    const dealerId = searchParams.get('dealer_id');
    if (!warehouseId && !dealerId) {
      return NextResponse.json(
        { error: 'ระบุ warehouse_id หรือ dealer_id (หน้ารายการสต็อกใช้ view=list)' },
        { status: 400 },
      );
    }
    return await inventoryScopeView(auth.companyId!, warehouseId, dealerId);
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
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'stock');
    if (blocked) return blocked;
    if (!can(auth, 'inventory.manage')) {
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
    after(() => import('@/lib/marketplace/stock-push').then(m => m.syncStockNow([variation_id], [warehouse_id])));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST inventory error:', error);
    return NextResponse.json({ error: 'Failed to adjust inventory' }, { status: 500 });
  }
}

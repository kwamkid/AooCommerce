import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

/** วันเปล่า `YYYY-MM-DD` → ขอบเขตตามเวลาไทย (ปลายทางเป็น timestamptz) */
function toBoundary(value: string | null, end: boolean): string | null {
  if (!value) return null;
  if (value.includes('T')) return value;
  return end ? `${value}T23:59:59.999+07:00` : `${value}T00:00:00+07:00`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

interface RawItem {
  id: string;
  type: string;
  quantity: unknown;
  balance_after: unknown;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string | null;
  warehouse_id: string | null;
  warehouse_name: string | null;
  warehouse_type: string | null;
  variation_id: string | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  is_simple: boolean | null;
  variation_label: string | null;
  attributes: Record<string, string> | null;
  sku: string | null;
  image_url: string | null;
}

interface RawSummary { type: string; count: unknown; total_qty: unknown }

// GET — ความเคลื่อนไหวสต็อก (แท็บ movements ของ /inventory) — RPC รอบเดียวได้ทั้งหน้า + ยอดรวม + การ์ดสรุป
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const companyId = auth.companyId;

    const stockConfig = await getStockConfig(companyId);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const warehouseId = searchParams.get('warehouse_id');
    const dealerId = searchParams.get('dealer_id');
    const variationId = searchParams.get('variation_id');
    const referenceType = searchParams.get('reference_type');
    const search = searchParams.get('search');
    const dateFrom = toBoundary(searchParams.get('date_from'), false);
    const dateTo = toBoundary(searchParams.get('date_to'), true);

    const types = (searchParams.get('types') || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    // ตัวแทน 1 รายมีคลังฝากขายได้หลายใบ — ส่งมาทั้ง dealer + warehouse ให้ dealer ชนะ (เหมือน /api/inventory)
    let warehouseIds: string[] | null = null;
    if (dealerId) {
      const { data: dealerWarehouses } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('company_id', companyId)
        .eq('warehouse_type', 'consignment')
        .eq('customer_id', dealerId);
      const ids = (dealerWarehouses || []).map(w => w.id);
      // ตัวแทนที่ยังไม่มีคลัง = ไม่มีความเคลื่อนไหวแน่นอน ไม่ต้องรบกวน DB
      if (ids.length === 0) {
        return NextResponse.json({ items: [], total: 0, summary: [], page, limit });
      }
      warehouseIds = ids;
    } else if (warehouseId) {
      warehouseIds = [warehouseId];
    }

    const { data, error } = await supabaseAdmin.rpc('get_inventory_transactions', {
      p_company_id: companyId,
      p_page: page,
      p_limit: limit,
      p_warehouse_ids: warehouseIds,
      p_variation_id: variationId || null,
      p_types: types.length > 0 ? types : null,
      p_reference_type: referenceType || null,
      p_search: search || null,
      p_date_from: dateFrom,
      p_date_to: dateTo,
    });

    if (error) {
      console.error('get_inventory_transactions error:', error);
      return NextResponse.json({ error: error.message || 'Failed to fetch transactions' }, { status: 500 });
    }

    const result = (data || {}) as { total?: unknown; summary?: RawSummary[]; items?: RawItem[] };

    const items = (result.items || []).map(row => ({
      id: row.id,
      type: row.type,
      quantity: num(row.quantity),
      balance_after: num(row.balance_after),
      reference_type: row.reference_type || null,
      reference_id: row.reference_id || null,
      notes: row.notes || null,
      created_at: row.created_at,
      created_by: row.created_by || null,
      created_by_name: row.created_by_name || null,
      warehouse_id: row.warehouse_id || null,
      warehouse_name: row.warehouse_name || '',
      warehouse_type: row.warehouse_type || null,
      variation_id: row.variation_id || null,
      product_id: row.product_id || null,
      product_code: row.product_code || '',
      product_name: row.product_name || '',
      is_simple: row.is_simple === true,
      variation_label: row.variation_label || '',
      attributes: row.attributes || null,
      sku: row.sku || '',
      image_url: row.image_url || null,
    }));

    const summary = (result.summary || []).map(s => ({
      type: s.type,
      count: num(s.count),
      total_qty: num(s.total_qty),
    }));

    return NextResponse.json({
      items,
      total: num(result.total),
      summary,
      page,
      limit,
    });
  } catch (error) {
    console.error('GET inventory/transactions error:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

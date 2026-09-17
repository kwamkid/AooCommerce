import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { guardFeature } from '@/lib/package-gates-server';

/** วันเปล่า `YYYY-MM-DD` → ขอบเขตตามเวลาไทย (ปลายทางเป็น timestamptz) */
function toBoundary(value: string | null, end: boolean): string | null {
  if (!value) return null;
  if (value.includes('T')) return value;
  return end ? `${value}T23:59:59.999+07:00` : `${value}T00:00:00+07:00`;
}

/** ค่าที่ผู้ใช้พิมพ์ต้องไม่ทำให้ไวยากรณ์ `or=(…)` ของ PostgREST พัง */
function safeSearch(value: string | null): string {
  return (value || '').replace(/[,()\\"']/g, ' ').trim();
}

/** สถานะที่ต้องมีในแท็บเสมอ แม้จะยังไม่มีเอกสารสักใบ */
const STATUS_KEYS = [
  'draft', 'sent', 'partial_received', 'received', 'received_mismatch', 'closed', 'cancelled',
];

// GET - List purchase orders
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'supplier');
    if (blocked) return blocked;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';
    const supplierId = searchParams.get('supplier_id') || '';
    const warehouseId = searchParams.get('warehouse_id') || '';
    const createdBy = searchParams.get('created_by') || '';
    const dateFrom = toBoundary(searchParams.get('date_from'), false);
    const dateTo = toBoundary(searchParams.get('date_to'), true);
    const search = safeSearch(searchParams.get('search'));
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    // ผู้เรียกที่ไม่ได้ขอหน้า/จำนวน (ตัวเลือก PO ในหน้ารับเข้า) ต้องได้ใบที่เปิดอยู่ครบ ไม่ใช่แค่ 20 ใบแรก
    const legacyCaller = !searchParams.get('page') && !searchParams.get('limit');
    const limit = Math.min(200, Math.max(1, parseInt(
      searchParams.get('limit') || (legacyCaller ? '200' : '20'), 10,
    ) || 20));
    const rangeFrom = (page - 1) * limit;

    let listQuery = supabaseAdmin
      .from('purchase_orders')
      .select(`
        id, po_number, status, order_date, expected_date, notes, total_amount, created_at, created_by,
        supplier:suppliers(id, name, supplier_type),
        warehouse:warehouses(id, name, code),
        items:purchase_order_items(id, quantity, received_quantity)
      `, { count: 'exact' })
      .eq('company_id', auth.companyId);

    // ตัวนับแท็บใช้ตัวกรองชุดเดียวกัน "ยกเว้นสถานะ" — แท็บอื่นถึงจะมีเลขให้เห็น
    let countQuery = supabaseAdmin
      .from('purchase_orders')
      .select('status', { count: 'exact' })
      .eq('company_id', auth.companyId);

    if (search) {
      const or = `po_number.ilike.%${search}%,notes.ilike.%${search}%`;
      listQuery = listQuery.or(or);
      countQuery = countQuery.or(or);
    }
    if (supplierId) {
      listQuery = listQuery.eq('supplier_id', supplierId);
      countQuery = countQuery.eq('supplier_id', supplierId);
    }
    if (warehouseId) {
      listQuery = listQuery.eq('warehouse_id', warehouseId);
      countQuery = countQuery.eq('warehouse_id', warehouseId);
    }
    if (createdBy) {
      listQuery = listQuery.eq('created_by', createdBy);
      countQuery = countQuery.eq('created_by', createdBy);
    }
    if (dateFrom) {
      listQuery = listQuery.gte('created_at', dateFrom);
      countQuery = countQuery.gte('created_at', dateFrom);
    }
    if (dateTo) {
      listQuery = listQuery.lte('created_at', dateTo);
      countQuery = countQuery.lte('created_at', dateTo);
    }
    if (status && status !== 'all') {
      listQuery = listQuery.eq('status', status);
    }

    const [listRes, countRes, creatorRes] = await Promise.all([
      listQuery.order('created_at', { ascending: false }).range(rangeFrom, rangeFrom + limit - 1),
      countQuery.range(0, 4999),
      supabaseAdmin
        .from('purchase_orders')
        .select('created_by')
        .eq('company_id', auth.companyId)
        .not('created_by', 'is', null)
        .range(0, 4999),
    ]);

    if (listRes.error) throw listRes.error;

    const statusCounts: Record<string, number> = { all: countRes.count ?? 0 };
    for (const key of STATUS_KEYS) statusCounts[key] = 0;
    for (const row of countRes.data || []) {
      const key = row.status || 'unknown';
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }

    // รายชื่อผู้สร้างของทั้งบริษัท (ตัวเลือกในตัวกรอง) — ใช้ map เดียวกันเติมชื่อให้แถวในหน้าด้วย
    const creatorIds = [...new Set((creatorRes.data || []).map(r => r.created_by).filter(Boolean) as string[])];
    let userMap: Record<string, { id: string; name: string }> = {};
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name')
        .in('id', creatorIds);
      if (profiles) userMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    }
    const users = creatorIds
      .map(id => userMap[id])
      .filter(Boolean)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));

    const items = (listRes.data || []).map(po => ({
      ...po,
      created_by_name: po.created_by ? userMap[po.created_by]?.name || null : null,
    }));

    return NextResponse.json({
      items,
      // ชื่อเดิมของคีย์ — หน้ารับเข้ายังอ่าน `purchase_orders` อยู่
      purchase_orders: items,
      total: listRes.count ?? 0,
      status_counts: statusCounts,
      users,
      page,
      limit,
    });
  } catch (error) {
    console.error('GET purchase-orders error:', error);
    return NextResponse.json({ error: 'Failed to fetch purchase orders' }, { status: 500 });
  }
}

// POST - Create purchase order
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'inventory.manage')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ดำเนินการนี้' }, { status: 403 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'supplier');
    if (blocked) return blocked;

    const body = await request.json();
    const { supplier_id, warehouse_id, items, notes, order_date, expected_date } = body;

    if (!supplier_id) {
      return NextResponse.json({ error: 'Supplier is required' }, { status: 400 });
    }
    if (!warehouse_id) {
      return NextResponse.json({ error: 'Warehouse is required' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'At least one item is required' }, { status: 400 });
    }

    // Generate PO number
    const { data: poNumberData, error: poNumErr } = await supabaseAdmin
      .rpc('generate_po_number', { p_company_id: auth.companyId });

    if (poNumErr) throw poNumErr;
    const poNumber = poNumberData as string;

    // Calculate total amount
    const totalAmount = items.reduce((sum: number, item: { quantity: number; unit_cost: number }) => {
      return sum + (item.quantity * (item.unit_cost || 0));
    }, 0);

    // Insert PO header
    const { data: po, error: poErr } = await supabaseAdmin
      .from('purchase_orders')
      .insert({
        company_id: auth.companyId,
        po_number: poNumber,
        supplier_id,
        warehouse_id,
        status: 'draft',
        order_date: order_date || new Date().toISOString().split('T')[0],
        expected_date: expected_date || null,
        notes: notes || null,
        total_amount: totalAmount,
        created_by: auth.userId,
      })
      .select()
      .single();

    if (poErr) throw poErr;

    // Insert PO items
    const poItems = items.map((item: { variation_id: string; quantity: number; unit_cost: number; notes?: string }) => ({
      po_id: po.id,
      variation_id: item.variation_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost || 0,
      notes: item.notes || null,
    }));

    const { error: itemsErr } = await supabaseAdmin
      .from('purchase_order_items')
      .insert(poItems);

    if (itemsErr) throw itemsErr;

    return NextResponse.json({ success: true, po_id: po.id, po_number: poNumber });
  } catch (error) {
    console.error('POST purchase-orders error:', error);
    return NextResponse.json({ error: 'Failed to create purchase order' }, { status: 500 });
  }
}

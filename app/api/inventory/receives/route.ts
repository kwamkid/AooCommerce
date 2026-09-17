// Path: app/api/inventory/receives/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getStockConfig, parseStockDocLines } from '@/lib/stock-utils';
import { addStock, updateWeightedAverageCost } from '@/lib/stock-service';
import { pushStockAfter } from '@/lib/marketplace/push-after';
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
const STATUS_KEYS = ['completed', 'cancelled'];

// GET - List receives or get single
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'stock');
    if (blocked) return blocked;

    const { searchParams } = new URL(request.url);
    const receiveId = searchParams.get('id');

    if (receiveId) {
      // Fetch receive header
      const { data: receiveHeader, error: headerErr } = await supabaseAdmin
        .from('inventory_receives')
        .select('*')
        .eq('id', receiveId)
        .eq('company_id', auth.companyId)
        .single();

      if (headerErr || !receiveHeader) {
        console.error('GET receive detail error:', headerErr?.message, headerErr?.details);
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      // Fetch warehouse
      let warehouse = null;
      if (receiveHeader.warehouse_id) {
        const { data: wh } = await supabaseAdmin
          .from('warehouses')
          .select('id, name, code')
          .eq('id', receiveHeader.warehouse_id)
          .single();
        warehouse = wh;
      }

      // Fetch items with nested variation + product
      const { data: itemsRaw } = await supabaseAdmin
        .from('inventory_receive_items')
        .select(`
          id, variation_id, quantity, unit_cost, notes,
          variation:product_variations(
            id, variation_label, sku, barcode, attributes,
            product:products(id, code, name, image)
          )
        `)
        .eq('receive_id', receiveId);

      const data = {
        ...receiveHeader,
        warehouse,
        items: itemsRaw || [],
      } as Record<string, unknown>;

      // Fetch created_by user name
      if (data.created_by) {
        const { data: profile } = await supabaseAdmin
          .from('user_profiles')
          .select('id, name, email')
          .eq('id', data.created_by)
          .single();
        (data as Record<string, unknown>).created_by_user = profile || null;
      }

      // Fetch PO reference if linked
      if (receiveHeader.po_id) {
        const { data: po } = await supabaseAdmin
          .from('purchase_orders')
          .select('po_number')
          .eq('id', receiveHeader.po_id)
          .single();
        data.po = po || null;
      }

      // Fetch supplier reference if linked
      if (receiveHeader.supplier_id) {
        const { data: supplier } = await supabaseAdmin
          .from('suppliers')
          .select('id, name')
          .eq('id', receiveHeader.supplier_id)
          .single();
        data.supplier = supplier || null;
      }

      return NextResponse.json({ receive: data });
    }

    // ── รายการ: กรอง / นับ / แบ่งหน้า ที่ DB ทั้งหมด ──
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const status = searchParams.get('status') || 'all';
    const warehouseId = searchParams.get('warehouse_id') || '';
    const createdBy = searchParams.get('created_by') || '';
    const dateFrom = toBoundary(searchParams.get('date_from'), false);
    const dateTo = toBoundary(searchParams.get('date_to'), true);
    const search = safeSearch(searchParams.get('search'));
    const rangeFrom = (page - 1) * limit;

    let listQuery = supabaseAdmin
      .from('inventory_receives')
      .select(`
        id, receive_number, status, notes, created_at, created_by, deal_type,
        warehouse:warehouses!inventory_receives_warehouse_id_fkey(id, name, code),
        supplier:suppliers(id, name),
        items:inventory_receive_items(id)
      `, { count: 'exact' })
      .eq('company_id', auth.companyId);

    // ตัวนับแท็บใช้ตัวกรองชุดเดียวกัน "ยกเว้นสถานะ" — แท็บอื่นถึงจะมีเลขให้เห็น
    let countQuery = supabaseAdmin
      .from('inventory_receives')
      .select('status', { count: 'exact' })
      .eq('company_id', auth.companyId);

    if (search) {
      const or = `receive_number.ilike.%${search}%,notes.ilike.%${search}%`;
      listQuery = listQuery.or(or);
      countQuery = countQuery.or(or);
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
        .from('inventory_receives')
        .select('created_by')
        .eq('company_id', auth.companyId)
        .not('created_by', 'is', null)
        .range(0, 4999),
    ]);

    if (listRes.error) {
      console.error('GET receives DB error:', listRes.error.message, listRes.error.details, listRes.error.hint);
      return NextResponse.json({ error: listRes.error.message }, { status: 500 });
    }

    const statusCounts: Record<string, number> = { all: countRes.count ?? 0 };
    for (const key of STATUS_KEYS) statusCounts[key] = 0;
    for (const row of countRes.data || []) {
      const key = row.status || 'unknown';
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }

    // รายชื่อผู้ทำรายการของทั้งบริษัท (ตัวเลือกในตัวกรอง) — ใช้ map เดียวกันเติมชื่อให้แถวในหน้าด้วย
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

    const items = (listRes.data || []).map(r => ({
      ...r,
      created_by_user: r.created_by ? userMap[r.created_by] || null : null,
    }));

    return NextResponse.json({
      items,
      total: listRes.count ?? 0,
      status_counts: statusCounts,
      users,
      page,
      limit,
    });
  } catch (error) {
    console.error('GET receives error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create receive
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
      return NextResponse.json({ error: 'ไม่มีสิทธิ์รับเข้าสินค้า' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.companyId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const { warehouse_id, items, notes, po_id, supplier_id, deal_type, credit_due_date } = body;

    // ดีลของล็อตนี้ — ซื้อสด / เครดิต / ฝากขาย (กติกาเต็มใน .claude/rules/domains/inventory.md)
    // ไม่ส่งมา = ใช้ดีลตั้งต้นของ supplier รายนั้น · ไม่มี supplier เลยก็ปล่อยว่าง (ใบเก่าก่อน 17 ก.ย. 2569 เป็น null)
    const DEAL_TYPES = ['cash', 'credit', 'consignment'] as const;
    type DealType = (typeof DEAL_TYPES)[number];
    let dealType: DealType | null = DEAL_TYPES.includes(deal_type) ? (deal_type as DealType) : null;
    if (!dealType && supplier_id) {
      const { data: supplierRow } = await supabaseAdmin
        .from('suppliers')
        .select('supplier_type')
        .eq('id', supplier_id)
        .eq('company_id', auth.companyId)
        .single();
      const fallback = supplierRow?.supplier_type;
      if (DEAL_TYPES.includes(fallback)) dealType = fallback as DealType;
    }

    if (!warehouse_id) {
      return NextResponse.json({ error: 'กรุณาเลือกคลังสินค้า' }, { status: 400 });
    }

    // ตรวจทุกบรรทัดให้ครบ **ก่อน** สร้างหัวเอกสาร/แตะสต็อก — ไม่งั้นได้ใบรับเข้าครึ่ง ๆ กลาง ๆ
    const { lines, errors: lineErrors } = parseStockDocLines(items);
    if (lineErrors.length > 0) {
      return NextResponse.json(
        { error: `รายการไม่ถูกต้อง: ${lineErrors.join(' · ')}`, errors: lineErrors },
        { status: 400 },
      );
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

    // Generate receive number
    const { data: rvNum } = await supabaseAdmin.rpc('generate_receive_number', { p_company_id: auth.companyId });
    const receiveNumber = rvNum || `RV-${Date.now()}`;

    // Create header
    const insertData: Record<string, unknown> = {
      company_id: auth.companyId,
      receive_number: receiveNumber,
      warehouse_id,
      notes: notes || null,
      created_by: auth.userId,
    };
    if (po_id) insertData.po_id = po_id;
    if (supplier_id) insertData.supplier_id = supplier_id;
    if (dealType) insertData.deal_type = dealType;
    // วันครบกำหนดใช้กับล็อตเครดิตเท่านั้น — ดีลอื่นส่งมาก็ไม่เก็บ
    if (dealType === 'credit' && credit_due_date) insertData.credit_due_date = credit_due_date;

    const { data: receive, error: headerError } = await supabaseAdmin
      .from('inventory_receives')
      .insert(insertData)
      .select('id, receive_number')
      .single();

    if (headerError || !receive) {
      console.error('Create receive error:', headerError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างใบรับเข้าได้' }, { status: 500 });
    }

    const results = [];
    for (const line of lines) {
      const { variation_id, quantity } = line;
      const unit_cost = Number(line.raw.unit_cost) || 0;
      const itemNotes = typeof line.raw.notes === 'string' ? line.raw.notes : null;

      // Insert item
      const itemInsert: Record<string, unknown> = { receive_id: receive.id, variation_id, quantity, notes: itemNotes || null };
      if (unit_cost) itemInsert.unit_cost = unit_cost;
      const { error: itemError } = await supabaseAdmin
        .from('inventory_receive_items')
        .insert(itemInsert);
      if (itemError) {
        console.error('Insert receive item error:', itemError.message);
      }

      // Add stock via centralized service
      const result = await addStock({
        supabase: supabaseAdmin,
        companyId: auth.companyId!,
        warehouseId: warehouse_id,
        variationId: variation_id,
        qty: quantity,
        referenceType: 'receive',
        referenceId: receive.id,
        notes: itemNotes || notes || `รับเข้า ${receiveNumber}`,
        createdBy: auth.userId,
        unitCost: unit_cost || undefined,
      });
      const newQuantity = result.balanceAfter;

      // Update WAC (Weighted Average Cost) on variation when unit_cost is provided
      // ⛔ ของฝากขาย **ห้ามเข้า WAC** — ยังเป็นของ supplier และต้นทุนจริงรู้ตอนขาย
      //    (= ราคาขาย × (1 − ส่วนแบ่งที่เราได้)) ไม่ใช่ตอนรับเข้า · ปนเข้า WAC แล้วต้นทุน
      //    ของล็อตซื้อขาดจะเพี้ยนตามไปด้วย — แผนเต็ม memo/plan-supplier-deals-2026-09-17.md
      if (unit_cost && unit_cost > 0 && dealType !== 'consignment') {
        await updateWeightedAverageCost(
          supabaseAdmin,
          auth.companyId!,
          variation_id,
          quantity,
          unit_cost,
        );
      }

      results.push({ variation_id, quantity, new_balance: newQuantity });
    }

    // Update PO received quantities if po_id provided
    if (po_id) {
      for (const line of lines) {
        const { variation_id, quantity: qty } = line;

        // Find the PO item and increment received_quantity
        const { data: poItem } = await supabaseAdmin
          .from('purchase_order_items')
          .select('id, received_quantity')
          .eq('po_id', po_id)
          .eq('variation_id', variation_id)
          .single();

        if (poItem) {
          await supabaseAdmin
            .from('purchase_order_items')
            .update({ received_quantity: (poItem.received_quantity || 0) + qty })
            .eq('id', poItem.id);
        }
      }

      // Check if all PO items are fully received → auto update PO status
      const { data: allPoItems } = await supabaseAdmin
        .from('purchase_order_items')
        .select('quantity, received_quantity')
        .eq('po_id', po_id);

      if (allPoItems && allPoItems.length > 0) {
        const allAtLeast = allPoItems.every(i => (i.received_quantity || 0) >= i.quantity);
        const allExact = allPoItems.every(i => (i.received_quantity || 0) === i.quantity);
        const someReceived = allPoItems.some(i => (i.received_quantity || 0) > 0);

        // Check if receive contains extra items not in PO
        const poVariationIds = new Set(
          (await supabaseAdmin.from('purchase_order_items').select('variation_id').eq('po_id', po_id)).data?.map(i => i.variation_id) || []
        );
        const hasExtraItems = lines.some(l => !poVariationIds.has(l.variation_id));

        let newPoStatus: string | null = null;
        if (allAtLeast) {
          // All PO items received at least the ordered quantity
          newPoStatus = (allExact && !hasExtraItems) ? 'received' : 'received_mismatch';
        } else if (someReceived) {
          newPoStatus = 'partial_received';
        }

        if (newPoStatus) {
          await supabaseAdmin
            .from('purchase_orders')
            .update({ status: newPoStatus })
            .eq('id', po_id)
            .in('status', ['sent', 'partial_received', 'received', 'received_mismatch']);
        }
      }
    }

    // ของเข้าคลังจริงแล้ว → ร้านที่ผูกไว้ต้องเห็นยอดใหม่ ไม่งั้นรับเข้า 200 ชิ้นแต่ร้านยังโชว์ 0
    pushStockAfter(results.map(r => r.variation_id), [warehouse_id]);

    return NextResponse.json({ success: true, receive_id: receive.id, receive_number: receiveNumber, results });
  } catch (error) {
    console.error('POST receives error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update notes
export async function PATCH(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'stock');
    if (blocked) return blocked;

    const body = await request.json();
    const { id, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('inventory_receives')
      .update({ notes: notes || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH receives error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

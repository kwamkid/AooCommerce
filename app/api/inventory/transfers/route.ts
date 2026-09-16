// Path: app/api/inventory/transfers/route.ts
// Three-step transfer: pending (reserve) → shipping (deduct) → received (add dest)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole, can } from '@/lib/supabase-admin';
import { getStockConfig, parseStockDocLines, checkStockAvailability } from '@/lib/stock-utils';
import { reserveStock, shipToTransit, receiveFromTransit, cancelFromShipped, unreserveStock } from '@/lib/stock-service';
import { pushStockAfter } from '@/lib/marketplace/push-after';

/** แถว `inventory_transfer_items` เท่าที่ route นี้ใช้ */
interface TransferItemRow {
  id: string;
  variation_id: string;
  qty_sent: number;
  qty_received?: number | null;
  confirmed_quantity?: number | null;
}

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
const STATUS_KEYS = ['pending', 'shipping', 'pending_confirm', 'received', 'cancelled'];

function canManageWarehouse(roles: string[] | undefined, memberWarehouseIds: string[] | null, warehouseId: string): boolean {
  if (isAdminRole(roles)) return true;
  if (!Array.isArray(memberWarehouseIds)) return true; // null/undefined = all access
  return memberWarehouseIds.includes(warehouseId); // [] = no access, ['id'] = specific
}

// GET - List transfers
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const transferId = searchParams.get('id');

    // Single transfer detail
    if (transferId) {
      const { data: transfer, error } = await supabaseAdmin
        .from('inventory_transfers')
        .select(`
          *,
          from_warehouse:warehouses!inventory_transfers_from_warehouse_id_fkey(id, name, code),
          to_warehouse:warehouses!inventory_transfers_to_warehouse_id_fkey(id, name, code),
          items:inventory_transfer_items(
            id, variation_id, qty_sent, qty_received, confirmed_quantity, notes,
            variation:product_variations(
              id, variation_label, sku, attributes,
              product:products(id, code, name, image)
            )
          )
        `)
        .eq('id', transferId)
        .eq('company_id', auth.companyId)
        .single();

      if (error || !transfer) {
        console.error('GET transfer by id error:', { transferId, error: error?.message, code: error?.code, details: error?.details, hint: error?.hint });
        return NextResponse.json({ error: 'Transfer not found' }, { status: 404 });
      }

      // Fetch user profiles for created_by, shipped_by, received_by
      const profileIds = [transfer.created_by, transfer.shipped_by, transfer.received_by].filter(Boolean);
      let profileMap: Record<string, { id: string; name: string; email: string }> = {};
      if (profileIds.length > 0) {
        const { data: profiles } = await supabaseAdmin.from('user_profiles').select('id, name, email').in('id', profileIds);
        if (profiles) profileMap = Object.fromEntries(profiles.map(p => [p.id, p]));
      }
      const t = transfer as Record<string, unknown>;
      t.created_by_user = transfer.created_by ? profileMap[transfer.created_by] || null : null;
      t.shipped_by_user = transfer.shipped_by ? profileMap[transfer.shipped_by] || null : null;
      t.received_by_user = transfer.received_by ? profileMap[transfer.received_by] || null : null;

      return NextResponse.json({ transfer });
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
      .from('inventory_transfers')
      .select(`
        id, transfer_number, status, notes, created_at, shipped_at, received_at, created_by, receive_token,
        receiver_name, receive_photo_url,
        from_warehouse:warehouses!inventory_transfers_from_warehouse_id_fkey(id, name, code),
        to_warehouse:warehouses!inventory_transfers_to_warehouse_id_fkey(id, name, code),
        items:inventory_transfer_items(id)
      `, { count: 'exact' })
      .eq('company_id', auth.companyId);

    // ตัวนับแท็บใช้ตัวกรองชุดเดียวกัน "ยกเว้นสถานะ" — แท็บอื่นถึงจะมีเลขให้เห็น
    let countQuery = supabaseAdmin
      .from('inventory_transfers')
      .select('status', { count: 'exact' })
      .eq('company_id', auth.companyId);

    if (search) {
      const or = `transfer_number.ilike.%${search}%,notes.ilike.%${search}%`;
      listQuery = listQuery.or(or);
      countQuery = countQuery.or(or);
    }
    // คลังหนึ่งใบเกี่ยวข้องได้ทั้งต้นทางและปลายทาง
    if (warehouseId) {
      const whOr = `from_warehouse_id.eq.${warehouseId},to_warehouse_id.eq.${warehouseId}`;
      listQuery = listQuery.or(whOr);
      countQuery = countQuery.or(whOr);
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
        .from('inventory_transfers')
        .select('created_by')
        .eq('company_id', auth.companyId)
        .not('created_by', 'is', null)
        .range(0, 4999),
    ]);

    if (listRes.error) {
      console.error('GET transfers DB error:', listRes.error.message, listRes.error.details, listRes.error.hint);
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
      const { data: profiles } = await supabaseAdmin.from('user_profiles').select('id, name').in('id', creatorIds);
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
    console.error('GET transfers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create and ship transfer
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'inventory.manage')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์สร้างใบโอนย้าย' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.companyId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const { from_warehouse_id, to_warehouse_id, items, notes } = body;

    if (!from_warehouse_id || !to_warehouse_id) {
      return NextResponse.json({ error: 'กรุณาเลือกคลังต้นทางและปลายทาง' }, { status: 400 });
    }
    if (from_warehouse_id === to_warehouse_id) {
      return NextResponse.json({ error: 'คลังต้นทางและปลายทางต้องไม่เป็นคลังเดียวกัน' }, { status: 400 });
    }

    // ตรวจทุกบรรทัดให้ครบ **ก่อน** สร้างหัวเอกสาร/จองสต็อก — ของเดิมยอมให้ผ่านแบบบางส่วน
    // (บรรทัดที่ของไม่พอหายไปเงียบ ๆ ผู้ใช้ได้ใบโอนที่ไม่ตรงกับที่กรอก)
    const { lines, errors: lineErrors } = parseStockDocLines(items);
    if (lineErrors.length > 0) {
      return NextResponse.json(
        { error: `รายการไม่ถูกต้อง: ${lineErrors.join(' · ')}`, errors: lineErrors },
        { status: 400 },
      );
    }

    // Check warehouse permission for source warehouse
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('warehouse_ids')
      .eq('company_id', auth.companyId)
      .eq('user_id', auth.userId)
      .single();

    if (!canManageWarehouse(auth.companyRoles, membership?.warehouse_ids, from_warehouse_id)) {
      return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดการคลังต้นทางนี้' }, { status: 403 });
    }

    // Verify both warehouses belong to company
    const [fromWh, toWh] = await Promise.all([
      supabaseAdmin.from('warehouses').select('id').eq('id', from_warehouse_id).eq('company_id', auth.companyId).eq('is_active', true).single(),
      supabaseAdmin.from('warehouses').select('id').eq('id', to_warehouse_id).eq('company_id', auth.companyId).eq('is_active', true).single(),
    ]);

    if (!fromWh.data) return NextResponse.json({ error: 'คลังต้นทางไม่พบ' }, { status: 404 });
    if (!toWh.data) return NextResponse.json({ error: 'คลังปลายทางไม่พบ' }, { status: 404 });

    // ยอดพร้อมโอนในคลังต้นทางต้องพอ **ทุกบรรทัด** ไม่งั้นตีกลับทั้งใบ
    const shortages = await checkStockAvailability(auth.companyId!, from_warehouse_id, lines);
    if (shortages.length > 0) {
      return NextResponse.json(
        { error: `สต็อกไม่พอโอน — ${shortages.join(' · ')}`, errors: shortages },
        { status: 400 },
      );
    }

    // Generate transfer number
    const { data: tfNum } = await supabaseAdmin.rpc('generate_transfer_number', { p_company_id: auth.companyId });
    const transferNumber = tfNum || `TF-${Date.now()}`;

    // Create transfer header (status = pending, reserve stock)
    const { data: transfer, error: transferError } = await supabaseAdmin
      .from('inventory_transfers')
      .insert({
        company_id: auth.companyId,
        transfer_number: transferNumber,
        from_warehouse_id,
        to_warehouse_id,
        status: 'pending',
        notes: notes || null,
        created_by: auth.userId,
      })
      .select('id, transfer_number, receive_token')
      .single();

    if (transferError || !transfer) {
      console.error('Create transfer error:', transferError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างใบโอนย้ายได้' }, { status: 500 });
    }

    // Create items and reserve stock at source
    const results: { variation_id: string; qty_sent: number }[] = [];

    for (const item of lines) {
      // Insert transfer item
      await supabaseAdmin
        .from('inventory_transfer_items')
        .insert({
          transfer_id: transfer.id,
          variation_id: item.variation_id,
          qty_sent: item.quantity,
        });

      // Reserve stock at source warehouse
      await reserveStock({
        supabase: supabaseAdmin,
        companyId: auth.companyId!,
        warehouseId: from_warehouse_id,
        variationId: item.variation_id,
        qty: item.quantity,
        referenceType: 'transfer',
        referenceId: transfer.id,
        notes: `จองสินค้าโอนย้าย ${transferNumber}`,
        createdBy: auth.userId,
      });

      results.push({ variation_id: item.variation_id, qty_sent: item.quantity });
    }

    // จองที่ต้นทางแล้ว = ยอดพร้อมขายลดทันที ร้านต้องเห็นเลย ไม่ต้องรอส่งจริง
    pushStockAfter(results.map(r => r.variation_id), [from_warehouse_id]);

    return NextResponse.json({
      success: true,
      transfer_id: transfer.id,
      transfer_number: transfer.transfer_number,
      results,
      errors: [],
    });
  } catch (error) {
    console.error('POST transfers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Receive transfer (or cancel)
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { transfer_id, action, items: receivedItems, receive_notes } = body;

    if (!transfer_id || !action) {
      return NextResponse.json({ error: 'Missing transfer_id or action' }, { status: 400 });
    }

    // Get transfer
    const { data: transfer, error: tfError } = await supabaseAdmin
      .from('inventory_transfers')
      .select('*, items:inventory_transfer_items(*)')
      .eq('id', transfer_id)
      .eq('company_id', auth.companyId)
      .single();

    if (tfError || !transfer) {
      return NextResponse.json({ error: 'ไม่พบใบโอนย้าย' }, { status: 404 });
    }

    // Check warehouse permission for destination
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('warehouse_ids')
      .eq('company_id', auth.companyId)
      .eq('user_id', auth.userId)
      .single();

    // === ACTION: SHIP (pending → shipping) ===
    if (action === 'ship') {
      if (transfer.status !== 'pending') {
        return NextResponse.json({ error: 'สามารถจัดส่งได้เฉพาะใบที่อยู่ในสถานะ "ที่ต้องจัดส่ง" เท่านั้น' }, { status: 400 });
      }

      if (!canManageWarehouse(auth.companyRoles, membership?.warehouse_ids, transfer.from_warehouse_id)) {
        return NextResponse.json({ error: 'คุณไม่มีสิทธิ์จัดส่งจากคลังต้นทางนี้' }, { status: 403 });
      }

      /**
       * ล็อกกันกดซ้ำก่อนแตะสต็อก — กดส่งรัว ๆ สองครั้งเคยหักของสองรอบ
       */
      const { data: shipLocked } = await supabaseAdmin
        .from('inventory_transfers')
        .update({
          status: 'shipping',
          shipped_at: new Date().toISOString(),
          shipped_by: auth.userId,
        })
        .eq('id', transfer_id)
        .eq('status', 'pending')
        .select('id');

      if (!shipLocked || shipLocked.length === 0) {
        return NextResponse.json({ error: 'ใบโอนย้ายนี้ถูกจัดส่งไปแล้ว' }, { status: 409 });
      }

      /**
       * ของระหว่างทางต้องอยู่ใน `in_transit` ไม่ใช่หายไปเฉย ๆ
       * เดิมใช้ deductAndUnreserve = ตัดออกจาก quantity ล้วน ๆ ระหว่างที่ยังไม่ถึงปลายทาง
       * ของก้อนนี้ไม่ปรากฏที่ไหนในระบบเลย รับไม่ครบ/ยกเลิกทีหลังก็ไม่มีตัวเลขให้เทียบว่าหายไปเท่าไร
       */
      for (const item of transfer.items as TransferItemRow[]) {
        await shipToTransit({
          supabase: supabaseAdmin,
          companyId: auth.companyId!,
          warehouseId: transfer.from_warehouse_id,
          variationId: item.variation_id,
          qty: item.qty_sent,
          referenceType: 'transfer',
          referenceId: transfer.id,
          notes: `โอนย้ายออก ${transfer.transfer_number}`,
          createdBy: auth.userId,
        });
      }

      // ไม่ต้องกระจายขึ้นร้าน: deductAndUnreserve ลดทั้ง quantity และ reserved เท่ากัน
      // → ยอดพร้อมขายเท่าเดิม (ของถูกกันไว้ตั้งแต่ตอนสร้างใบแล้ว) ยิงไปก็เปลืองโควตาเปล่า
      return NextResponse.json({ success: true, status: 'shipping' });
    }

    // === ACTION: RECEIVE (shipping → received) ===
    if (action === 'receive') {
      if (transfer.status !== 'shipping') {
        return NextResponse.json({ error: 'ใบโอนย้ายนี้ไม่อยู่ในสถานะกำลังส่ง' }, { status: 400 });
      }

      if (!canManageWarehouse(auth.companyRoles, membership?.warehouse_ids, transfer.to_warehouse_id)) {
        return NextResponse.json({ error: 'คุณไม่มีสิทธิ์รับสินค้าที่คลังปลายทางนี้' }, { status: 403 });
      }

      if (!receivedItems || !Array.isArray(receivedItems) || receivedItems.length === 0) {
        return NextResponse.json({ error: 'กรุณาระบุจำนวนที่รับ' }, { status: 400 });
      }

      const sentItems = transfer.items as TransferItemRow[];
      const receivedMap = new Map<string, number>();
      for (const ri of (receivedItems as { item_id: string; qty_received: number | null }[])) {
        if (ri.qty_received === undefined || ri.qty_received === null) continue;
        const sentItem = sentItems.find(i => i.id === ri.item_id);
        if (!sentItem) continue;
        if (ri.qty_received < 0) {
          return NextResponse.json({ error: 'จำนวนรับไม่สามารถติดลบได้' }, { status: 400 });
        }
        if (ri.qty_received > sentItem.qty_sent) {
          return NextResponse.json(
            { error: `จำนวนรับไม่สามารถมากกว่าจำนวนส่ง (${sentItem.qty_sent})` },
            { status: 400 }
          );
        }
        receivedMap.set(ri.item_id, ri.qty_received);
      }

      /**
       * ล็อกกันกดซ้ำก่อนแตะสต็อก — รับซ้ำสองรอบ = ของเข้าปลายทางสองเท่า in_transit ติดลบ
       */
      const { data: recvLocked } = await supabaseAdmin
        .from('inventory_transfers')
        .update({
          status: 'received',
          received_at: new Date().toISOString(),
          received_by: auth.userId,
          receive_notes: receive_notes || null,
        })
        .eq('id', transfer_id)
        .eq('status', 'shipping')
        .select('id');

      if (!recvLocked || recvLocked.length === 0) {
        return NextResponse.json({ error: 'ใบโอนย้ายนี้ถูกรับไปแล้ว' }, { status: 409 });
      }

      /**
       * วนจาก**รายการที่ส่งจริง** ไม่ใช่เฉพาะแถวที่หน้าจอกรอกมา — เดิมวนจาก `receivedItems`
       * แถวที่ผู้รับไม่ได้กรอก (หรือ payload ตกหล่น) จะไม่ถูกแตะเลย ของค้างใน in_transit
       * ทั้งที่ใบปิดเป็น "รับแล้ว" = ของหายถาวร ไม่กรอก → ถือว่ารับ 0 แล้วคืนต้นทางให้หมด
       */
      for (const sentItem of sentItems) {
        const qtyReceived = receivedMap.get(sentItem.id) ?? 0;

        await supabaseAdmin
          .from('inventory_transfer_items')
          .update({ qty_received: qtyReceived })
          .eq('id', sentItem.id);

        if (qtyReceived > 0) {
          // in_transit ต้นทาง -= , quantity ปลายทาง +=
          await receiveFromTransit({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            sourceWarehouseId: transfer.from_warehouse_id,
            destWarehouseId: transfer.to_warehouse_id,
            variationId: sentItem.variation_id,
            qty: qtyReceived,
            referenceType: 'transfer',
            referenceId: transfer.id,
            notes: `รับโอนย้ายเข้า ${transfer.transfer_number}`,
            createdBy: auth.userId,
          });
        }

        const shortfall = sentItem.qty_sent - qtyReceived;
        if (shortfall > 0) {
          // ของที่ไม่ถึงปลายทาง กลับเข้าคลังต้นทาง (in_transit -= , quantity +=)
          await cancelFromShipped({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: transfer.from_warehouse_id,
            variationId: sentItem.variation_id,
            qty: shortfall,
            referenceType: 'transfer',
            referenceId: transfer.id,
            notes: `คืนจากโอนย้าย ${transfer.transfer_number} (รับไม่ครบ)`,
            createdBy: auth.userId,
          });
        }
      }

      // รับเข้าปลายทาง + ส่วนที่รับไม่ครบคืนต้นทาง → ยอดเปลี่ยนสองคลัง ต้องดันทั้งคู่
      pushStockAfter(
        (transfer.items as TransferItemRow[]).map(i => i.variation_id),
        [transfer.to_warehouse_id, transfer.from_warehouse_id],
      );

      return NextResponse.json({ success: true, status: 'received' });
    }

    // === ACTION: CONFIRM (pending_confirm → received/partial) ===
    if (action === 'confirm') {
      if (transfer.status !== 'pending_confirm') {
        return NextResponse.json({ error: 'สามารถยืนยันได้เฉพาะสถานะ "รอยืนยัน" เท่านั้น' }, { status: 400 });
      }

      const { confirmed_items } = body;
      if (confirmed_items && Array.isArray(confirmed_items)) {
        for (const ci of confirmed_items as { item_id: string; confirmed_quantity: number }[]) {
          await supabaseAdmin
            .from('inventory_transfer_items')
            .update({ confirmed_quantity: ci.confirmed_quantity })
            .eq('id', ci.item_id);
        }
      }

      // Determine final status
      const { data: allItems } = await supabaseAdmin
        .from('inventory_transfer_items')
        .select('qty_sent, qty_received, confirmed_quantity')
        .eq('transfer_id', transfer_id);

      const allConfirmed = ((allItems || []) as TransferItemRow[]).every(
        i => (i.confirmed_quantity || i.qty_received || 0) >= i.qty_sent
      );

      await supabaseAdmin
        .from('inventory_transfers')
        .update({
          status: allConfirmed ? 'received' : 'received',
          received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer_id);

      return NextResponse.json({ success: true, status: 'received' });
    }

    // === ACTION: CANCEL (pending or shipping → cancelled) ===
    if (action === 'cancel') {
      if (transfer.status !== 'pending' && transfer.status !== 'shipping') {
        return NextResponse.json({ error: 'สามารถยกเลิกได้เฉพาะใบที่อยู่ในสถานะ "ที่ต้องจัดส่ง" หรือ "กำลังส่ง" เท่านั้น' }, { status: 400 });
      }

      // Only admin/owner or source warehouse user can cancel
      if (!isAdminRole(auth.companyRoles) && !canManageWarehouse(auth.companyRoles, membership?.warehouse_ids, transfer.from_warehouse_id)) {
        return NextResponse.json({ error: 'ไม่มีสิทธิ์ยกเลิกใบโอนย้ายนี้' }, { status: 403 });
      }

      /**
       * ล็อกกันกดซ้ำก่อนแตะสต็อก — ยกเลิกสองรอบ = ปลดจอง/คืนของซ้ำ ของงอก
       */
      const { data: cancelLocked } = await supabaseAdmin
        .from('inventory_transfers')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', transfer_id)
        .eq('status', transfer.status)
        .select('id');

      if (!cancelLocked || cancelLocked.length === 0) {
        return NextResponse.json({ error: 'ใบโอนย้ายนี้ถูกยกเลิกไปแล้ว' }, { status: 409 });
      }

      if (transfer.status === 'pending') {
        for (const item of transfer.items as TransferItemRow[]) {
          await unreserveStock({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: transfer.from_warehouse_id,
            variationId: item.variation_id,
            qty: item.qty_sent,
            referenceType: 'transfer',
            referenceId: transfer.id,
            notes: `ยกเลิกจองโอนย้าย ${transfer.transfer_number}`,
            createdBy: auth.userId,
          });
        }
      } else {
        // shipping → cancelled: ของอยู่ใน in_transit → ดึงกลับเข้า quantity ต้นทาง
        for (const item of transfer.items as TransferItemRow[]) {
          await cancelFromShipped({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: transfer.from_warehouse_id,
            variationId: item.variation_id,
            qty: item.qty_sent,
            referenceType: 'transfer',
            referenceId: transfer.id,
            notes: `คืนจากยกเลิกโอนย้าย ${transfer.transfer_number}`,
            createdBy: auth.userId,
          });
        }
      }

      // ปลดจอง (pending) หรือคืนของเข้าคลัง (shipping) — ทั้งสองแบบยอดพร้อมขายต้นทางเพิ่ม
      pushStockAfter((transfer.items as TransferItemRow[]).map(i => i.variation_id), [transfer.from_warehouse_id]);

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('PUT transfers error:', error);
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

    const body = await request.json();
    const { id, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('inventory_transfers')
      .update({ notes: notes || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH transfers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

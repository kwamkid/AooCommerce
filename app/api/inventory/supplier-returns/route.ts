// Path: app/api/inventory/supplier-returns/route.ts
//
// ใบคืนของให้ supplier (ของชำรุด · กล่องเสีย · ส่งผิด · หมดอายุ)
//
// ⛔ คนละเรื่องกับ `return_notes` ซึ่งเป็น "ลูกค้าคืนของให้เรา" (ผูก customer + ใบกำกับ + ใบลดหนี้)
// ของออกจากคลังจริง จึงตัดสต็อกผ่าน `deductStock` ด้วย referenceType `supplier_return`
// ผลต่อเงินขึ้นกับดีลของล็อต — กติกาเต็มใน .claude/rules/domains/inventory.md
//   cash        → รอเงินคืน/ของเปลี่ยน (ไม่แตะยอดขาย)
//   credit      → หักออกจากยอดที่ต้องจ่าย supplier
//   consignment → หักของที่เราถืออยู่ ไม่แตะยอดที่ต้องจ่าย (ยังไม่เคยขาย = ยังไม่เคยเป็นหนี้)

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getStockConfig, parseStockDocLines, checkStockAvailability } from '@/lib/stock-utils';
import { deductStock, InsufficientStockError } from '@/lib/stock-service';
import { pushStockAfter } from '@/lib/marketplace/push-after';
import { guardFeature } from '@/lib/package-gates-server';
import { consignmentUnitCost, fetchConsignmentTerms } from '@/lib/consignment-cost';

/** วันเปล่า `YYYY-MM-DD` → ขอบเขตตามเวลาไทย */
function toBoundary(value: string | null, end: boolean): string | null {
  if (!value) return null;
  if (value.includes('T')) return value;
  return end ? `${value}T23:59:59.999+07:00` : `${value}T00:00:00+07:00`;
}

function safeSearch(value: string | null): string {
  return (value || '').replace(/[,()\\"']/g, ' ').trim();
}

const STATUS_KEYS = ['issued', 'cancelled'];

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'inventory.view')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (id) {
      const { data: header } = await supabaseAdmin
        .from('supplier_return_notes')
        .select('*, supplier:suppliers(id, name, supplier_type), warehouse:warehouses(id, name, code)')
        .eq('id', id)
        .eq('company_id', auth.companyId)
        .single();
      if (!header) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      const { data: items } = await supabaseAdmin
        .from('supplier_return_note_items')
        .select(`
          id, variation_id, quantity, unit_cost, reason, notes,
          variation:product_variations(
            id, variation_label, sku, barcode,
            product:products(id, code, name, image)
          )
        `)
        .eq('return_note_id', id);

      const data: Record<string, unknown> = { ...header, items: items || [] };
      if (header.created_by) {
        const { data: profile } = await supabaseAdmin
          .from('user_profiles')
          .select('id, name, email')
          .eq('id', header.created_by)
          .single();
        data.created_by_user = profile || null;
      }
      if (header.receive_id) {
        const { data: receive } = await supabaseAdmin
          .from('inventory_receives')
          .select('id, receive_number')
          .eq('id', header.receive_id)
          .single();
        data.receive = receive || null;
      }
      return NextResponse.json({ return_note: data });
    }

    // ── รายการ: กรอง/นับ/แบ่งหน้าที่ DB (ชุดเดียวกับหน้าเอกสารคลังอื่น) ──
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const status = searchParams.get('status') || 'all';
    const warehouseId = searchParams.get('warehouse_id') || '';
    const supplierId = searchParams.get('supplier_id') || '';
    const createdBy = searchParams.get('created_by') || '';
    const dateFrom = toBoundary(searchParams.get('date_from'), false);
    const dateTo = toBoundary(searchParams.get('date_to'), true);
    const search = safeSearch(searchParams.get('search'));
    const rangeFrom = (page - 1) * limit;

    let listQuery = supabaseAdmin
      .from('supplier_return_notes')
      .select(`
        id, return_number, status, reason, notes, total_amount, deal_type, return_date, created_at, created_by,
        supplier:suppliers(id, name),
        warehouse:warehouses(id, name, code),
        items:supplier_return_note_items(id)
      `, { count: 'exact' })
      .eq('company_id', auth.companyId);

    let countQuery = supabaseAdmin
      .from('supplier_return_notes')
      .select('status', { count: 'exact' })
      .eq('company_id', auth.companyId);

    if (search) {
      const or = `return_number.ilike.%${search}%,notes.ilike.%${search}%`;
      listQuery = listQuery.or(or);
      countQuery = countQuery.or(or);
    }
    for (const [col, value] of [['warehouse_id', warehouseId], ['supplier_id', supplierId], ['created_by', createdBy]] as const) {
      if (value) {
        listQuery = listQuery.eq(col, value);
        countQuery = countQuery.eq(col, value);
      }
    }
    if (dateFrom) {
      listQuery = listQuery.gte('created_at', dateFrom);
      countQuery = countQuery.gte('created_at', dateFrom);
    }
    if (dateTo) {
      listQuery = listQuery.lte('created_at', dateTo);
      countQuery = countQuery.lte('created_at', dateTo);
    }
    if (status && status !== 'all') listQuery = listQuery.eq('status', status);

    const [listRes, countRes, creatorRes] = await Promise.all([
      listQuery.order('created_at', { ascending: false }).range(rangeFrom, rangeFrom + limit - 1),
      countQuery.range(0, 4999),
      supabaseAdmin
        .from('supplier_return_notes')
        .select('created_by')
        .eq('company_id', auth.companyId),
    ]);

    // ตัวนับแท็บใช้ตัวกรองชุดเดียวกัน "ยกเว้นสถานะ" — แท็บอื่นถึงจะมีเลขให้เห็น
    const statusCounts: Record<string, number> = Object.fromEntries(STATUS_KEYS.map(k => [k, 0]));
    for (const row of countRes.data || []) {
      const key = (row as { status: string }).status;
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }
    statusCounts.all = (countRes.data || []).length;

    const creatorIds = [...new Set((creatorRes.data || []).map(r => (r as { created_by: string }).created_by).filter(Boolean))];
    let users: { id: string; name: string }[] = [];
    if (creatorIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name')
        .in('id', creatorIds);
      users = (profiles || []) as { id: string; name: string }[];
    }
    const userById = new Map(users.map(u => [u.id, u]));

    const items = (listRes.data || []).map(row => ({
      ...row,
      created_by_user: userById.get((row as { created_by: string }).created_by) || null,
    }));

    return NextResponse.json({
      items,
      total: listRes.count || 0,
      status_counts: statusCounts,
      users,
    });
  } catch (error) {
    console.error('GET supplier-returns error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'inventory.manage')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const blocked = await guardFeature(auth.companyId, 'stock');
    if (blocked) return blocked;
    const stockConfig = await getStockConfig(auth.companyId);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const { warehouse_id, supplier_id, items, reason, notes, receive_id, return_date } = body;

    if (!supplier_id) return NextResponse.json({ error: 'กรุณาเลือก Supplier' }, { status: 400 });
    if (!warehouse_id) return NextResponse.json({ error: 'กรุณาเลือกคลังสินค้า' }, { status: 400 });

    // ตรวจทุกบรรทัดก่อนแตะสต็อกบรรทัดแรก — ไม่งั้นได้ใบคืนครึ่ง ๆ กลาง ๆ
    const { lines, errors: lineErrors } = parseStockDocLines(items);
    if (lineErrors.length > 0) {
      return NextResponse.json(
        { error: `รายการไม่ถูกต้อง: ${lineErrors.join(' · ')}`, errors: lineErrors },
        { status: 400 },
      );
    }

    const [{ data: warehouse }, { data: supplier }] = await Promise.all([
      supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('id', warehouse_id)
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .single(),
      supabaseAdmin
        .from('suppliers')
        .select('id, supplier_type')
        .eq('id', supplier_id)
        .eq('company_id', auth.companyId)
        .single(),
    ]);
    if (!warehouse) return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });

    const shortages = await checkStockAvailability(auth.companyId!, warehouse_id, lines);
    if (shortages.length > 0) {
      return NextResponse.json(
        { error: `สต็อกไม่พอคืน — ${shortages.join(' · ')}`, errors: shortages },
        { status: 400 },
      );
    }

    // ดีลของล็อต: มาจากใบรับที่อ้างถึง (ตรงที่สุด) ไม่มีก็ใช้ดีลตั้งต้นของ supplier
    let dealType: string | null = null;
    if (receive_id) {
      const { data: receive } = await supabaseAdmin
        .from('inventory_receives')
        .select('deal_type')
        .eq('id', receive_id)
        .eq('company_id', auth.companyId)
        .single();
      dealType = receive?.deal_type || null;
    }
    if (!dealType) dealType = supplier.supplier_type || null;

    // มูลค่าที่หักคืน: ของฝากขาย = เงินที่ต้องจ่าย (ยังไม่เคยจ่าย จึงเป็นการหักของที่ถืออยู่)
    // ของซื้อขาด/เครดิต = ต้นทุนเฉลี่ยที่รับเข้ามา
    const variationIds = lines.map(l => l.variation_id);
    const [{ data: variations }, consignTerms] = await Promise.all([
      supabaseAdmin.from('product_variations').select('id, cost_price').in('id', variationIds),
      fetchConsignmentTerms(supabaseAdmin, variationIds),
    ]);
    const wacById = new Map((variations || []).map(v => [v.id as string, v.cost_price as number | null]));
    const unitCostOf = (variationId: string): number | null => {
      const term = consignTerms.get(variationId);
      if (term) return consignmentUnitCost(term);
      return wacById.get(variationId) ?? null;
    };

    const { data: numData } = await supabaseAdmin.rpc('generate_supplier_return_number', { p_company_id: auth.companyId });
    const returnNumber = numData || `SR-${Date.now()}`;

    const { data: note, error: headerError } = await supabaseAdmin
      .from('supplier_return_notes')
      .insert({
        company_id: auth.companyId,
        return_number: returnNumber,
        supplier_id,
        warehouse_id,
        receive_id: receive_id || null,
        deal_type: dealType,
        reason: reason || null,
        notes: notes || null,
        ...(return_date ? { return_date } : {}),
        created_by: auth.userId,
      })
      .select('id, return_number')
      .single();

    if (headerError || !note) {
      console.error('Create supplier return error:', headerError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างใบคืนได้' }, { status: 500 });
    }

    const results: { variation_id: string; quantity: number; new_balance: number }[] = [];
    const errors: { variation_id: string; error: string }[] = [];
    let totalAmount = 0;

    for (const line of lines) {
      const { variation_id, quantity } = line;
      const itemReason = typeof line.raw.reason === 'string' ? line.raw.reason : null;
      const itemNotes = typeof line.raw.notes === 'string' ? line.raw.notes : null;
      const unitCost = unitCostOf(variation_id);
      const noteText = [itemReason, itemNotes, notes].filter(Boolean).join(' - ') || `คืนของให้ supplier ${returnNumber}`;

      try {
        const result = await deductStock({
          supabase: supabaseAdmin,
          companyId: auth.companyId!,
          warehouseId: warehouse_id,
          variationId: variation_id,
          qty: quantity,
          referenceType: 'supplier_return',
          referenceId: note.id,
          notes: noteText,
          createdBy: auth.userId,
          checkAvailable: true,
        });

        // insert รายการ **หลัง** ตัดสต็อกสำเร็จ — ใบต้องไม่มีบรรทัดที่สต็อกไม่เคยขยับ
        await supabaseAdmin
          .from('supplier_return_note_items')
          .insert({
            return_note_id: note.id,
            variation_id,
            quantity,
            unit_cost: unitCost,
            reason: itemReason || null,
            notes: itemNotes || null,
          });

        if (unitCost != null) totalAmount += unitCost * quantity;
        results.push({ variation_id, quantity, new_balance: result.balanceAfter });
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          errors.push({ variation_id, error: err.message });
          continue;
        }
        throw err;
      }
    }

    if (results.length === 0) {
      await supabaseAdmin.from('supplier_return_notes').delete().eq('id', note.id);
      return NextResponse.json({ error: errors[0]?.error || 'ไม่สามารถคืนของได้', errors }, { status: 400 });
    }

    await supabaseAdmin
      .from('supplier_return_notes')
      .update({ total_amount: Math.round(totalAmount * 100) / 100 })
      .eq('id', note.id);

    // ของออกจากคลังจริงแล้ว → กระจายยอดขึ้นร้าน marketplace ไม่งั้นร้านโชว์เกินจริง
    pushStockAfter(results.map(r => r.variation_id), [warehouse_id]);

    return NextResponse.json({
      success: true,
      return_note_id: note.id,
      return_number: returnNumber,
      total_amount: Math.round(totalAmount * 100) / 100,
      results,
      errors,
    });
  } catch (error) {
    console.error('POST supplier-returns error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'inventory.manage')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const blocked = await guardFeature(auth.companyId, 'stock');
    if (blocked) return blocked;

    const { id, notes } = await request.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // แก้ได้แค่หมายเหตุ — ⛔ ห้ามเปิดให้แก้จำนวน/ยกเลิกใบที่ตัดสต็อกไปแล้ว
    // ของคืนไปถึงมือ supplier แล้ว คืนสต็อกกลับต้องเป็น "ใบรับเข้าใหม่" ให้มีร่องรอย
    const { error } = await supabaseAdmin
      .from('supplier_return_notes')
      .update({ notes: notes || null })
      .eq('id', id)
      .eq('company_id', auth.companyId);
    if (error) return NextResponse.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH supplier-returns error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

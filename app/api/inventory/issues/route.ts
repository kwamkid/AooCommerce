// Path: app/api/inventory/issues/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getStockConfig, parseStockDocLines, checkStockAvailability } from '@/lib/stock-utils';
import { deductStock, InsufficientStockError } from '@/lib/stock-service';
import { pushStockAfter } from '@/lib/marketplace/push-after';

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

// GET - List issues or get single
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get('id');

    if (issueId) {
      const { data, error } = await supabaseAdmin
        .from('inventory_issues')
        .select(`
          *,
          warehouse:warehouses(id, name, code),
          items:inventory_issue_items(
            id, variation_id, quantity, reason, notes,
            variation:product_variations(
              id, variation_label, sku, barcode, attributes,
              product:products(id, code, name, image)
            )
          )
        `)
        .eq('id', issueId)
        .eq('company_id', auth.companyId)
        .single();

      if (error || !data) {
        console.error('GET issue by id error:', { issueId, error: error?.message, code: error?.code });
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      if (data.created_by) {
        const { data: profile } = await supabaseAdmin
          .from('user_profiles').select('id, name, email').eq('id', data.created_by).single();
        (data as Record<string, unknown>).created_by_user = profile || null;
      }

      return NextResponse.json({ issue: data });
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
      .from('inventory_issues')
      .select(`
        id, issue_number, reason, status, notes, created_at, created_by,
        warehouse:warehouses!inventory_issues_warehouse_id_fkey(id, name, code),
        items:inventory_issue_items(id)
      `, { count: 'exact' })
      .eq('company_id', auth.companyId);

    // ตัวนับแท็บใช้ตัวกรองชุดเดียวกัน "ยกเว้นสถานะ" — แท็บอื่นถึงจะมีเลขให้เห็น
    let countQuery = supabaseAdmin
      .from('inventory_issues')
      .select('status', { count: 'exact' })
      .eq('company_id', auth.companyId);

    if (search) {
      const or = `issue_number.ilike.%${search}%,notes.ilike.%${search}%,reason.ilike.%${search}%`;
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
        .from('inventory_issues')
        .select('created_by')
        .eq('company_id', auth.companyId)
        .not('created_by', 'is', null)
        .range(0, 4999),
    ]);

    if (listRes.error) {
      console.error('GET issues DB error:', listRes.error.message, listRes.error.details, listRes.error.hint);
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
    console.error('GET issues error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create issue
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'inventory.manage')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เบิกสินค้า' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.companyId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const { warehouse_id, items, reason, notes } = body;

    if (!warehouse_id) {
      return NextResponse.json({ error: 'กรุณาเลือกคลังสินค้า' }, { status: 400 });
    }

    // ตรวจทุกบรรทัดให้ครบ **ก่อน** สร้างหัวเอกสาร/ตัดสต็อก — ของเดิมตัดไปเรื่อย ๆ
    // แล้วค่อยพบว่าบรรทัดท้ายของไม่พอ จบด้วยใบเบิกที่มีของแค่บางรายการ
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

    const shortages = await checkStockAvailability(auth.companyId!, warehouse_id, lines);
    if (shortages.length > 0) {
      return NextResponse.json(
        { error: `สต็อกไม่พอเบิก — ${shortages.join(' · ')}`, errors: shortages },
        { status: 400 },
      );
    }

    // Generate issue number
    const { data: isNum } = await supabaseAdmin.rpc('generate_issue_number', { p_company_id: auth.companyId });
    const issueNumber = isNum || `IS-${Date.now()}`;

    // Create header
    const { data: issue, error: headerError } = await supabaseAdmin
      .from('inventory_issues')
      .insert({
        company_id: auth.companyId,
        issue_number: issueNumber,
        warehouse_id,
        reason: reason || null,
        notes: notes || null,
        created_by: auth.userId,
      })
      .select('id, issue_number')
      .single();

    if (headerError || !issue) {
      console.error('Create issue error:', headerError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างใบเบิกออกได้' }, { status: 500 });
    }

    const results = [];
    const errors: { variation_id: string; error: string }[] = [];

    for (const line of lines) {
      const { variation_id, quantity } = line;
      const itemReason = typeof line.raw.reason === 'string' ? line.raw.reason : null;
      const itemNotes = typeof line.raw.notes === 'string' ? line.raw.notes : null;

      const noteText = [itemReason, itemNotes, notes].filter(Boolean).join(' - ') || `เบิกออก ${issueNumber}`;

      try {
        const result = await deductStock({
          supabase: supabaseAdmin,
          companyId: auth.companyId!,
          warehouseId: warehouse_id,
          variationId: variation_id,
          qty: quantity,
          referenceType: 'issue',
          referenceId: issue.id,
          notes: noteText,
          createdBy: auth.userId,
          checkAvailable: true,
        });

        // Insert item after successful stock deduction
        await supabaseAdmin
          .from('inventory_issue_items')
          .insert({ issue_id: issue.id, variation_id, quantity, reason: itemReason || null, notes: itemNotes || null });

        results.push({ variation_id, quantity, new_balance: result.balanceAfter });
      } catch (err) {
        if (err instanceof InsufficientStockError) {
          errors.push({ variation_id, error: err.message });
          continue;
        }
        throw err;
      }
    }

    if (errors.length > 0 && results.length === 0) {
      // Delete empty header
      await supabaseAdmin.from('inventory_issues').delete().eq('id', issue.id);
      return NextResponse.json({ error: errors[0].error, errors }, { status: 400 });
    }

    // ของออกจากคลังจริงแล้ว (เบิกใช้ · ตัดของเสีย) → ไม่กระจาย = ร้านโชว์เกินจริง ขายเกิน
    pushStockAfter(results.map(r => r.variation_id), [warehouse_id]);

    return NextResponse.json({ success: true, issue_id: issue.id, issue_number: issueNumber, results, errors });
  } catch (error) {
    console.error('POST issues error:', error);
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
      .from('inventory_issues')
      .update({ notes: notes || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH issues error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

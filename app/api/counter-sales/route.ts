// Path: app/api/counter-sales/route.ts
// Daily sales recorded by PC at a branch counter — informational overlay ONLY.
// Never creates orders/documents and never moves real stock; stock still moves via
// replenishment receive (in) and DSR confirm (out). report_id null = not yet
// absorbed into a DSR (used by the stock overlay + Phase 3 reconciliation).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

async function isAssignedToCounter(companyId: string, counterId: string, userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('counter_assignments')
    .select('id')
    .eq('company_id', companyId)
    .eq('counter_id', counterId)
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

// GET — List counter sales (?counter_id=&date=&from=&to=&limit=&page=)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'counter.record')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const counterId = searchParams.get('counter_id');
    const date = searchParams.get('date');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const page = parseInt(searchParams.get('page') || '1');

    const isManager = can(auth.companyRoles, 'counter.manage');
    if (!isManager) {
      // PC: must ask for a specific counter they are assigned to
      if (!counterId) {
        return NextResponse.json({ error: 'กรุณาระบุสาขา' }, { status: 400 });
      }
      if (!auth.userId || !(await isAssignedToCounter(auth.companyId, counterId, auth.userId))) {
        return NextResponse.json({ error: 'คุณไม่ได้รับมอบหมายสาขานี้' }, { status: 403 });
      }
    }

    let query = supabaseAdmin
      .from('counter_sales')
      .select(`
        id, counter_id, sale_date, variation_id, quantity, unit_price, amount, note,
        report_id, recorded_by, created_at,
        counter:consignment_counters(id, name, customer:customers(id, name)),
        variation:product_variations(id, variation_label, sku, product:products(id, name, image))
      `, { count: 'exact' })
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (counterId) query = query.eq('counter_id', counterId);
    if (date) query = query.eq('sale_date', date);
    if (from) query = query.gte('sale_date', from);
    if (to) query = query.lte('sale_date', to);

    const { data: sales, error, count } = await query;
    if (error) {
      console.error('GET counter-sales error:', error);
      return NextResponse.json({ error: 'ไม่สามารถดึงข้อมูลยอดขายได้' }, { status: 500 });
    }

    // Resolve recorder names (no FK on recorded_by → separate lookup)
    const recorderIds = [...new Set((sales || []).map(s => s.recorded_by).filter(Boolean))] as string[];
    const nameMap: Record<string, string> = {};
    if (recorderIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name')
        .in('id', recorderIds);
      for (const p of profiles || []) nameMap[p.id] = p.name;
    }

    const rows = (sales || []).map(s => ({
      ...s,
      recorded_by_name: s.recorded_by ? (nameMap[s.recorded_by] || null) : null,
    }));

    const totalQty = rows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
    const totalAmount = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);

    return NextResponse.json({
      sales: rows,
      total: count ?? rows.length,
      page,
      limit,
      summary: { total_qty: totalQty, total_amount: totalAmount },
    });
  } catch (error) {
    console.error('GET counter-sales error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Record sales (batch): { counter_id, items: [{ variation_id, quantity, unit_price, amount?, note? }] }
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'counter.record')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { counter_id, items } = body as {
      counter_id: string;
      items: Array<{ variation_id: string; quantity: number; unit_price: number; amount?: number; note?: string }>;
    };

    if (!counter_id) {
      return NextResponse.json({ error: 'กรุณาระบุสาขา' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'กรุณาระบุรายการขาย' }, { status: 400 });
    }

    const { data: counter } = await supabaseAdmin
      .from('consignment_counters')
      .select('id, is_active')
      .eq('id', counter_id)
      .eq('company_id', auth.companyId)
      .maybeSingle();
    if (!counter || !counter.is_active) {
      return NextResponse.json({ error: 'ไม่พบสาขา หรือสาขาถูกปิดใช้งาน' }, { status: 404 });
    }

    if (!can(auth.companyRoles, 'counter.manage')) {
      if (!(await isAssignedToCounter(auth.companyId, counter_id, auth.userId))) {
        return NextResponse.json({ error: 'คุณไม่ได้รับมอบหมายสาขานี้' }, { status: 403 });
      }
    }

    const saleDate = bangkokToday();
    const rows = [];
    for (const item of items) {
      const qty = Number(item.quantity || 0);
      const unitPrice = Number(item.unit_price || 0);
      if (!item.variation_id || qty <= 0) {
        return NextResponse.json({ error: 'รายการขายไม่ถูกต้อง' }, { status: 400 });
      }
      rows.push({
        company_id: auth.companyId,
        counter_id,
        variation_id: item.variation_id,
        sale_date: saleDate,
        quantity: qty,
        unit_price: unitPrice,
        amount: item.amount !== undefined ? Number(item.amount) : qty * unitPrice,
        note: item.note || null,
        recorded_by: auth.userId,
      });
    }

    const { data: inserted, error } = await supabaseAdmin
      .from('counter_sales')
      .insert(rows)
      .select('id');

    if (error) {
      console.error('POST counter-sales error:', error);
      return NextResponse.json({ error: 'ไม่สามารถบันทึกยอดขายได้' }, { status: 500 });
    }

    return NextResponse.json({ success: true, count: inserted?.length || 0, sale_date: saleDate });
  } catch (error) {
    console.error('POST counter-sales error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — Remove one entry (?id=). PC: own entries recorded today only; admin: any unsettled entry.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'counter.record')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'กรุณาระบุรายการ' }, { status: 400 });
    }

    const { data: sale } = await supabaseAdmin
      .from('counter_sales')
      .select('id, sale_date, recorded_by, report_id')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .maybeSingle();
    if (!sale) {
      return NextResponse.json({ error: 'ไม่พบรายการ' }, { status: 404 });
    }
    if (sale.report_id) {
      return NextResponse.json({ error: 'รายการนี้ถูกรวมเข้ารายงานห้างแล้ว ลบไม่ได้' }, { status: 400 });
    }

    if (!can(auth.companyRoles, 'counter.manage')) {
      if (sale.recorded_by !== auth.userId) {
        return NextResponse.json({ error: 'ลบได้เฉพาะรายการที่ตัวเองบันทึก' }, { status: 403 });
      }
      if (sale.sale_date !== bangkokToday()) {
        return NextResponse.json({ error: 'ลบได้เฉพาะรายการของวันนี้ — ติดต่อแอดมินหากต้องแก้ย้อนหลัง' }, { status: 400 });
      }
    }

    const { error } = await supabaseAdmin
      .from('counter_sales')
      .delete()
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) {
      console.error('DELETE counter-sales error:', error);
      return NextResponse.json({ error: 'ไม่สามารถลบรายการได้' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE counter-sales error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

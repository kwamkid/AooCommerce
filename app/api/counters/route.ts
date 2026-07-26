// Path: app/api/counters/route.ts
// Branch counters (จุดขาย/สาขา) for consignment customers — 1 counter = 1 consignment warehouse.
// Counter sales recorded by PC are an informational overlay; stock still moves only
// via replenishment receive (in) and DSR confirm (out).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { isPcRover } from '@/lib/counter-access';

const COUNTER_CUSTOMER_TYPES = ['department_store', 'consignment_dealer'];

// GET — List counters (?customer_id=xxx, ?active=false includes inactive)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customer_id');
    const activeOnly = searchParams.get('active') !== 'false';

    let query = supabaseAdmin
      .from('consignment_counters')
      .select(`
        id, customer_id, warehouse_id, name, is_active, created_at,
        customer:customers(id, name, customer_code, customer_type),
        warehouse:warehouses(id, name)
      `)
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: true });

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }
    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    // PC users (no counter.manage) only see counters they are assigned to —
    // unless they are a rover (pc_all_counters = หน่วยแทน), who sees every counter
    if (auth.companyRoles?.includes('pc') && !can(auth.companyRoles, 'counter.manage') && auth.userId) {
      const rover = await isPcRover(supabaseAdmin, auth.companyId, auth.userId);
      if (!rover) {
        const { data: assignments } = await supabaseAdmin
          .from('counter_assignments')
          .select('counter_id')
          .eq('company_id', auth.companyId)
          .eq('user_id', auth.userId);
        const assignedIds = (assignments || []).map(a => a.counter_id);
        if (assignedIds.length === 0) {
          return NextResponse.json({ counters: [] });
        }
        query = query.in('id', assignedIds);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error('GET counters error:', error);
      return NextResponse.json({ error: 'ไม่สามารถดึงข้อมูลสาขาได้' }, { status: 500 });
    }

    return NextResponse.json({ counters: data || [] });
  } catch (error) {
    console.error('GET counters error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Create counter (+ its consignment warehouse)
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'counter.manage')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { customer_id, name } = body as { customer_id: string; name: string };

    if (!customer_id || !name?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุลูกค้าและชื่อสาขา' }, { status: 400 });
    }

    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id, name, customer_type')
      .eq('id', customer_id)
      .eq('company_id', auth.companyId)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 });
    }
    if (!COUNTER_CUSTOMER_TYPES.includes(customer.customer_type)) {
      return NextResponse.json({ error: 'สร้างสาขาได้เฉพาะลูกค้าฝากขาย (ห้าง/ตัวแทนฝากขาย)' }, { status: 400 });
    }

    // Warehouse for this counter: adopt the customer's existing consignment warehouse
    // if it's not linked to any counter yet (counter #1 keeps the original stock),
    // otherwise create a fresh consignment warehouse for the new branch.
    const [{ data: warehouses }, { data: linked }] = await Promise.all([
      supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('company_id', auth.companyId)
        .eq('customer_id', customer_id)
        .eq('warehouse_type', 'consignment')
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('consignment_counters')
        .select('warehouse_id')
        .eq('company_id', auth.companyId)
        .eq('customer_id', customer_id),
    ]);

    const linkedIds = new Set((linked || []).map(l => l.warehouse_id));
    const unlinkedWarehouse = (warehouses || []).find(w => !linkedIds.has(w.id));

    let warehouseId = unlinkedWarehouse?.id ?? null;
    if (!warehouseId) {
      const { data: newWarehouse, error: whError } = await supabaseAdmin
        .from('warehouses')
        .insert({
          company_id: auth.companyId,
          customer_id,
          warehouse_type: 'consignment',
          name: `${customer.name} - ${name.trim()}`,
          is_default: false,
          is_active: true,
          created_by: auth.userId,
        })
        .select('id')
        .single();

      if (whError || !newWarehouse) {
        console.error('Create counter warehouse error:', whError);
        return NextResponse.json({ error: 'ไม่สามารถสร้างคลังของสาขาได้' }, { status: 500 });
      }
      warehouseId = newWarehouse.id;
    }

    const { data: counter, error } = await supabaseAdmin
      .from('consignment_counters')
      .insert({
        company_id: auth.companyId,
        customer_id,
        warehouse_id: warehouseId,
        name: name.trim(),
        is_active: true,
        created_by: auth.userId,
      })
      .select('id, customer_id, warehouse_id, name, is_active')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'ชื่อสาขาซ้ำ กรุณาใช้ชื่ออื่น' }, { status: 400 });
      }
      console.error('Create counter error:', error);
      return NextResponse.json({ error: 'ไม่สามารถสร้างสาขาได้' }, { status: 500 });
    }

    return NextResponse.json({ success: true, counter });
  } catch (error) {
    console.error('POST counters error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — Update counter (rename / activate / deactivate)
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'counter.manage')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, is_active } = body as { id: string; name?: string; is_active?: boolean };

    if (!id) {
      return NextResponse.json({ error: 'กรุณาระบุสาขา' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'ชื่อสาขาจำเป็นต้องกรอก' }, { status: 400 });
      }
      updates.name = name.trim();
    }
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabaseAdmin
      .from('consignment_counters')
      .update(updates)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .select('id, customer_id, warehouse_id, name, is_active')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'ชื่อสาขาซ้ำ กรุณาใช้ชื่ออื่น' }, { status: 400 });
      }
      console.error('Update counter error:', error);
      return NextResponse.json({ error: 'ไม่สามารถแก้ไขสาขาได้' }, { status: 500 });
    }

    return NextResponse.json({ success: true, counter: data });
  } catch (error) {
    console.error('PUT counters error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE — Soft-archive only (warehouse + sales history must survive)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'counter.manage')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'กรุณาระบุสาขา' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('consignment_counters')
      .update({ is_active: false })
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) {
      console.error('Archive counter error:', error);
      return NextResponse.json({ error: 'ไม่สามารถปิดสาขาได้' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE counters error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

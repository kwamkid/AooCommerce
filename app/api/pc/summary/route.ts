// Path: app/api/pc/summary/route.ts
// Consolidated data for the PC counter page (stock overlay + replenishment history +
// monthly totals) — 1 call per tab switch instead of several.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getCustomerConsignmentWarehouse } from '@/lib/consignment-warehouse';
import { canAccessCounter } from '@/lib/counter-access';

const bangkokNow = () => new Date(Date.now() + 7 * 3600_000);

// GET ?counter_id=xxx&year=&month=
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'counter.record')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const counterId = searchParams.get('counter_id');
    if (!counterId) {
      return NextResponse.json({ error: 'กรุณาระบุสาขา' }, { status: 400 });
    }

    const now = bangkokNow();
    const year = parseInt(searchParams.get('year') || String(now.getUTCFullYear()));
    const month = parseInt(searchParams.get('month') || String(now.getUTCMonth() + 1));
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

    const { data: counter } = await supabaseAdmin
      .from('consignment_counters')
      .select('id, name, warehouse_id, customer_id, is_active, customer:customers(id, name)')
      .eq('id', counterId)
      .eq('company_id', auth.companyId)
      .maybeSingle();
    if (!counter) {
      return NextResponse.json({ error: 'ไม่พบสาขา' }, { status: 404 });
    }

    if (!can(auth.companyRoles, 'counter.manage')) {
      if (!(await canAccessCounter(supabaseAdmin, auth.companyId, counterId, auth.userId))) {
        return NextResponse.json({ error: 'คุณไม่ได้รับมอบหมายสาขานี้' }, { status: 403 });
      }
    }

    // Legacy shipments (created before this counter existed) have counter_id null —
    // attribute them to this counter only if it adopted the customer's original warehouse.
    const oldest = await getCustomerConsignmentWarehouse(supabaseAdmin, auth.companyId, counter.customer_id);
    const isAdoptedCounter = oldest?.id === counter.warehouse_id;

    const [invRes, unsettledRes, monthSalesRes, replenRes, deptRes] = await Promise.all([
      supabaseAdmin
        .from('inventory')
        .select(`
          variation_id, quantity, reserved_quantity,
          variation:product_variations(id, variation_label, sku, product:products(id, name, image))
        `)
        .eq('company_id', auth.companyId)
        .eq('warehouse_id', counter.warehouse_id),
      supabaseAdmin
        .from('counter_sales')
        .select('variation_id, quantity')
        .eq('company_id', auth.companyId)
        .eq('counter_id', counterId)
        .is('report_id', null),
      supabaseAdmin
        .from('counter_sales')
        .select('sale_date, quantity, amount')
        .eq('company_id', auth.companyId)
        .eq('counter_id', counterId)
        .gte('sale_date', monthStart)
        .lte('sale_date', monthEnd),
      supabaseAdmin
        .from('replenishments')
        .select('id, replenishment_number, received_at, counter_id, customer_id, items:replenishment_items(quantity, received_quantity, confirmed_quantity)')
        .eq('company_id', auth.companyId)
        .eq('customer_id', counter.customer_id)
        .in('status', ['received', 'partial_received'])
        .gte('received_at', `${monthStart}T00:00:00Z`)
        .order('received_at', { ascending: false }),
      supabaseAdmin
        .from('department_orders')
        .select('id, department_order_number, received_at, counter_id, customer_id, items:department_order_items(quantity, received_quantity, confirmed_quantity)')
        .eq('company_id', auth.companyId)
        .eq('customer_id', counter.customer_id)
        .in('status', ['received', 'partial_received'])
        .gte('received_at', `${monthStart}T00:00:00Z`)
        .order('received_at', { ascending: false }),
    ]);

    // Stock overlay: remaining = on-hand − PC sales not yet absorbed into a DSR
    const unsettledMap = new Map<string, number>();
    for (const row of unsettledRes.data || []) {
      unsettledMap.set(row.variation_id, (unsettledMap.get(row.variation_id) || 0) + Number(row.quantity || 0));
    }
    const stock = (invRes.data || []).map(inv => {
      const v = inv.variation as any;
      const onHand = Number(inv.quantity || 0);
      const unsettled = unsettledMap.get(inv.variation_id) || 0;
      return {
        variation_id: inv.variation_id,
        product_name: v?.product?.name || '',
        variation_label: v?.variation_label || '',
        sku: v?.sku || null,
        image: v?.product?.image || null,
        on_hand: onHand,
        unsettled_qty: unsettled,
        remaining: onHand - unsettled,
      };
    }).filter(s => s.on_hand !== 0 || s.unsettled_qty !== 0)
      .sort((a, b) => a.product_name.localeCompare(b.product_name, 'th'));

    // Replenishments received this month (counter-targeted, or legacy rows for the adopted counter)
    type ShipmentRow = { id: string; number: string; received_at: string | null; total_qty: number; type: string };
    const belongsToCounter = (row: { counter_id: string | null }) =>
      row.counter_id === counterId || (row.counter_id === null && isAdoptedCounter);
    const sumQty = (items: Array<{ quantity: number; received_quantity: number; confirmed_quantity: number }> | null) =>
      (items || []).reduce((s, i) => s + Number(i.confirmed_quantity || i.received_quantity || i.quantity || 0), 0);

    const replenishmentsMonth: ShipmentRow[] = [
      ...(replenRes.data || []).filter(belongsToCounter).map(r => ({
        id: r.id, number: r.replenishment_number, received_at: r.received_at,
        total_qty: sumQty(r.items as any), type: 'replenishment',
      })),
      ...(deptRes.data || []).filter(belongsToCounter).map(r => ({
        id: r.id, number: r.department_order_number, received_at: r.received_at,
        total_qty: sumQty(r.items as any), type: 'department_order',
      })),
    ].sort((a, b) => (b.received_at || '').localeCompare(a.received_at || ''));

    // Monthly totals + per-day breakdown
    const dayMap = new Map<string, { qty: number; amount: number }>();
    let monthQty = 0;
    let monthAmount = 0;
    for (const row of monthSalesRes.data || []) {
      const qty = Number(row.quantity || 0);
      const amount = Number(row.amount || 0);
      monthQty += qty;
      monthAmount += amount;
      const day = dayMap.get(row.sale_date) || { qty: 0, amount: 0 };
      day.qty += qty;
      day.amount += amount;
      dayMap.set(row.sale_date, day);
    }
    const days = [...dayMap.entries()]
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      counter: {
        id: counter.id,
        name: counter.name,
        warehouse_id: counter.warehouse_id,
        is_active: counter.is_active,
        customer: counter.customer,
      },
      stock,
      replenishments_month: replenishmentsMonth,
      month: { year, month, total_qty: monthQty, total_amount: monthAmount, days },
    });
  } catch (error) {
    console.error('GET pc summary error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

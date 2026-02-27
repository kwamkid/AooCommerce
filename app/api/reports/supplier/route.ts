// Path: app/api/reports/supplier/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, hasAnyRole } from '@/lib/supabase-admin';

// GET - List snapshots (optionally filtered by supplier)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const supplierId = searchParams.get('supplier_id');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    let query = supabaseAdmin
      .from('supplier_snapshots')
      .select(`
        id, supplier_id, supplier_type, period_year, period_month,
        snapshot_date, status,
        total_stock_remaining, total_sold_quantity, total_sold_amount,
        total_received_quantity, total_received_amount,
        notes, created_by, created_at
      `)
      .eq('company_id', auth.companyId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });

    if (supplierId) query = query.eq('supplier_id', supplierId);
    if (year) query = query.eq('period_year', parseInt(year));
    if (month) query = query.eq('period_month', parseInt(month));

    const { data, error } = await query;

    if (error) {
      console.error('GET supplier snapshots error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Batch fetch supplier names
    const supplierIds = [...new Set((data || []).map(s => s.supplier_id))];
    let supplierMap: Record<string, { id: string; name: string; supplier_type: string }> = {};
    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabaseAdmin
        .from('suppliers')
        .select('id, name, supplier_type')
        .in('id', supplierIds);
      if (suppliers) {
        supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s]));
      }
    }

    // Batch fetch user names
    const userIds = [...new Set((data || []).map(s => s.created_by).filter(Boolean))];
    let userMap: Record<string, { id: string; name: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name')
        .in('id', userIds);
      if (profiles) {
        userMap = Object.fromEntries(profiles.map(p => [p.id, p]));
      }
    }

    const snapshots = (data || []).map(s => ({
      ...s,
      supplier: supplierMap[s.supplier_id] || null,
      created_by_user: s.created_by ? userMap[s.created_by] || null : null,
    }));

    return NextResponse.json({ snapshots });
  } catch (error) {
    console.error('GET supplier reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Generate a new snapshot
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasAnyRole(auth.companyRoles, ['owner', 'admin', 'account'])) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์สร้างรายงาน' }, { status: 403 });
    }

    const body = await request.json();
    const { supplier_id, year, month } = body;

    if (!supplier_id || !year || !month) {
      return NextResponse.json({ error: 'กรุณาระบุ supplier, ปี และเดือน' }, { status: 400 });
    }

    // Verify supplier
    const { data: supplier } = await supabaseAdmin
      .from('suppliers')
      .select('id, name, supplier_type')
      .eq('id', supplier_id)
      .eq('company_id', auth.companyId)
      .single();

    if (!supplier) {
      return NextResponse.json({ error: 'ไม่พบ supplier' }, { status: 404 });
    }

    // Check existing snapshot
    const { data: existing } = await supabaseAdmin
      .from('supplier_snapshots')
      .select('id')
      .eq('company_id', auth.companyId)
      .eq('supplier_id', supplier_id)
      .eq('period_year', year)
      .eq('period_month', month)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'มีรายงานของเดือนนี้แล้ว', existing_id: existing.id }, { status: 409 });
    }

    // Find supplier's brands → products → variations
    const { data: brands } = await supabaseAdmin
      .from('product_brands')
      .select('id')
      .eq('supplier_id', supplier_id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true);

    const brandIds = (brands || []).map(b => b.id);
    let variationIds: string[] = [];

    if (brandIds.length > 0) {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .in('brand_id', brandIds);

      const productIds = (products || []).map(p => p.id);

      if (productIds.length > 0) {
        const { data: variations } = await supabaseAdmin
          .from('product_variations')
          .select('id')
          .in('product_id', productIds)
          .eq('is_active', true);

        variationIds = (variations || []).map(v => v.id);
      }
    }

    // Create snapshot header
    const snapshotInsert = {
      company_id: auth.companyId,
      supplier_id,
      supplier_type: supplier.supplier_type,
      period_year: year,
      period_month: month,
      snapshot_date: new Date().toISOString(),
      status: 'draft',
      created_by: auth.userId,
    };

    const { data: snapshot, error: snapErr } = await supabaseAdmin
      .from('supplier_snapshots')
      .insert(snapshotInsert)
      .select('id')
      .single();

    if (snapErr || !snapshot) {
      console.error('Create snapshot error:', snapErr);
      return NextResponse.json({ error: 'สร้างรายงานไม่สำเร็จ' }, { status: 500 });
    }

    let totalStockRemaining = 0;
    let totalSoldQuantity = 0;
    let totalSoldAmount = 0;
    let totalReceivedQuantity = 0;
    let totalReceivedAmount = 0;

    if (variationIds.length > 0) {
      // === Freeze stock snapshot ===
      const { data: inventoryData } = await supabaseAdmin
        .from('inventory')
        .select('warehouse_id, variation_id, quantity')
        .eq('company_id', auth.companyId)
        .in('variation_id', variationIds)
        .gt('quantity', 0);

      if (inventoryData && inventoryData.length > 0) {
        const stockRows = inventoryData.map(inv => ({
          snapshot_id: snapshot.id,
          warehouse_id: inv.warehouse_id,
          variation_id: inv.variation_id,
          quantity: inv.quantity,
        }));
        await supabaseAdmin.from('supplier_snapshot_stock').insert(stockRows);
        totalStockRemaining = inventoryData.reduce((s, i) => s + Number(i.quantity), 0);
      }

      // Date range for the month
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endMonth = month === 12 ? 1 : month + 1;
      const endYear = month === 12 ? year + 1 : year;
      const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

      if (supplier.supplier_type === 'consignment') {
        // === Consignment: Sales data ===
        // Query completed orders in the period with items matching supplier's variations
        const { data: orderItems } = await supabaseAdmin
          .from('order_items')
          .select(`
            variation_id, quantity, subtotal,
            order:orders!inner(id, source, pos_terminal_id, order_date, order_status)
          `)
          .in('variation_id', variationIds)
          .gte('order.order_date', startDate)
          .lt('order.order_date', endDate)
          .eq('order.order_status', 'completed')
          .eq('order.company_id', auth.companyId);

        if (orderItems && orderItems.length > 0) {
          // Group by variation_id + source + pos_terminal_id
          const salesMap = new Map<string, { variation_id: string; source: string; pos_terminal_id: string | null; quantity_sold: number; revenue: number }>();

          for (const oi of orderItems) {
            const order = oi.order as unknown as { source: string; pos_terminal_id: string | null };
            const key = `${oi.variation_id}_${order.source}_${order.pos_terminal_id || ''}`;
            const existing = salesMap.get(key);
            if (existing) {
              existing.quantity_sold += Number(oi.quantity);
              existing.revenue += Number(oi.subtotal || 0);
            } else {
              salesMap.set(key, {
                variation_id: oi.variation_id,
                source: order.source || 'manual',
                pos_terminal_id: order.pos_terminal_id || null,
                quantity_sold: Number(oi.quantity),
                revenue: Number(oi.subtotal || 0),
              });
            }
          }

          const salesRows = Array.from(salesMap.values()).map(s => ({
            snapshot_id: snapshot.id,
            variation_id: s.variation_id,
            source: s.source,
            pos_terminal_id: s.pos_terminal_id,
            quantity_sold: s.quantity_sold,
            revenue: s.revenue,
          }));

          await supabaseAdmin.from('supplier_snapshot_sales').insert(salesRows);
          totalSoldQuantity = salesRows.reduce((s, r) => s + r.quantity_sold, 0);
          totalSoldAmount = salesRows.reduce((s, r) => s + r.revenue, 0);
        }
      }

      if (supplier.supplier_type === 'credit') {
        // === Credit: Receives data ===
        const { data: receives } = await supabaseAdmin
          .from('inventory_receives')
          .select('id, po_id')
          .eq('company_id', auth.companyId)
          .eq('supplier_id', supplier_id)
          .eq('status', 'completed')
          .gte('created_at', startDate)
          .lt('created_at', endDate);

        if (receives && receives.length > 0) {
          const receiveIds = receives.map(r => r.id);
          const { data: receiveItems } = await supabaseAdmin
            .from('inventory_receive_items')
            .select('receive_id, variation_id, quantity, unit_cost')
            .in('receive_id', receiveIds)
            .in('variation_id', variationIds);

          if (receiveItems && receiveItems.length > 0) {
            const receiveMap = Object.fromEntries(receives.map(r => [r.id, r]));
            const recRows = receiveItems.map(ri => ({
              snapshot_id: snapshot.id,
              receive_id: ri.receive_id,
              po_id: receiveMap[ri.receive_id]?.po_id || null,
              variation_id: ri.variation_id,
              quantity: Number(ri.quantity),
              amount: Number(ri.quantity) * Number(ri.unit_cost || 0),
            }));

            await supabaseAdmin.from('supplier_snapshot_receives').insert(recRows);
            totalReceivedQuantity = recRows.reduce((s, r) => s + r.quantity, 0);
            totalReceivedAmount = recRows.reduce((s, r) => s + r.amount, 0);
          }
        }
      }
    }

    // Update totals on snapshot header
    await supabaseAdmin
      .from('supplier_snapshots')
      .update({
        total_stock_remaining: totalStockRemaining,
        total_sold_quantity: totalSoldQuantity,
        total_sold_amount: totalSoldAmount,
        total_received_quantity: totalReceivedQuantity,
        total_received_amount: totalReceivedAmount,
      })
      .eq('id', snapshot.id);

    return NextResponse.json({ success: true, snapshot_id: snapshot.id });
  } catch (error) {
    console.error('POST supplier report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

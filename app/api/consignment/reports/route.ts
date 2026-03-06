// Admin API for consignment reports — requires authentication
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — List consignment reports with filters
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId } = auth;
    const { searchParams } = new URL(request.url);

    // Special mode: load stock for admin report entry
    if (searchParams.get('stock') === 'true' && searchParams.get('customer_id')) {
      const custId = searchParams.get('customer_id')!;

      // Find consignment warehouse
      const { data: warehouse } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('company_id', companyId)
        .eq('customer_id', custId)
        .eq('warehouse_type', 'consignment')
        .single();

      if (!warehouse) {
        return NextResponse.json({ stock: [], error: 'ไม่พบคลังฝากขาย' });
      }

      // Get customer GP rate
      const { data: customer } = await supabaseAdmin
        .from('customers')
        .select('consignment_gp_rate')
        .eq('id', custId)
        .single();

      const defaultGpRate = customer?.consignment_gp_rate ?? 0;

      // Get inventory with product info
      const { data: inventory } = await supabaseAdmin
        .from('inventory')
        .select(`
          variation_id, quantity,
          variation:product_variations(
            id, sku, label, barcode,
            product:products(id, name, product_code, retail_price)
          )
        `)
        .eq('company_id', companyId)
        .eq('warehouse_id', warehouse.id)
        .gt('quantity', 0);

      // Get brand-level GP overrides for this customer
      const { data: brandCommissions } = await supabaseAdmin
        .from('customer_brand_commissions')
        .select('brand_id, gp_rate')
        .eq('customer_id', custId);

      const brandGpMap = new Map<string, number>();
      for (const bc of brandCommissions || []) {
        brandGpMap.set(bc.brand_id, bc.gp_rate);
      }

      const stock = (inventory || []).map((inv: any) => {
        const v = inv.variation;
        const p = v?.product;
        return {
          variation_id: inv.variation_id,
          quantity: inv.quantity,
          product_name: p?.name || '',
          product_code: p?.product_code || null,
          variation_label: v?.label || null,
          sku: v?.sku || null,
          barcode: v?.barcode || null,
          unit_price: p?.retail_price || 0,
          gp_rate: defaultGpRate,
        };
      });

      return NextResponse.json({ stock });
    }

    const status = searchParams.get('status');
    const customerId = searchParams.get('customer_id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build query
    let query = supabaseAdmin
      .from('consignment_reports')
      .select(`
        id, report_number, period_year, period_month, status,
        total_qty_sold, our_amount, due_date, report_token, statement_id,
        created_at, confirmed_at, received_at, notes,
        customer:customers(id, name, customer_code)
      `, { count: 'exact' })
      .eq('company_id', companyId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    const { data: reports, error, count } = await query;

    if (error) {
      console.error('GET consignment reports error:', error);
      return NextResponse.json({ error: 'ไม่สามารถดึงข้อมูลรายงานได้' }, { status: 500 });
    }

    // Get status counts
    const { data: statusData } = await supabaseAdmin
      .from('consignment_reports')
      .select('status')
      .eq('company_id', companyId);

    const statusCounts: Record<string, number> = {
      draft: 0,
      received: 0,
      invoiced: 0,
      billed: 0,
      paid: 0,
      overdue: 0,
    };

    for (const row of statusData || []) {
      if (row.status in statusCounts) {
        statusCounts[row.status]++;
      }
    }

    return NextResponse.json({
      reports: reports ?? [],
      total: count ?? 0,
      page,
      limit,
      status_counts: statusCounts,
    });
  } catch (error) {
    console.error('GET consignment reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Create new consignment report
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId, userId } = auth;

    const body = await request.json();
    const {
      customer_id,
      period_year,
      period_month,
      notes,
      items,
      source, // 'admin' = คีย์เอง → status=invoiced + หักสต๊อกทันที
    } = body as {
      customer_id: string;
      period_year: number;
      period_month: number;
      notes?: string;
      source?: 'admin' | 'portal';
      items: Array<{
        batch_item_id?: string;
        variation_id: string;
        qty_sold: number;
        qty_returned: number;
        unit_price: number;
        gp_rate: number;
      }>;
    };

    const isAdminKeyed = source === 'admin';

    if (!customer_id || !period_year || !period_month) {
      return NextResponse.json(
        { error: 'กรุณาระบุลูกค้า และรอบรายงาน' },
        { status: 400 }
      );
    }

    // Verify customer belongs to this company
    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('id, company_id')
      .eq('id', customer_id)
      .eq('company_id', companyId)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 });
    }

    // Generate report_number via RPC
    const { data: reportNumber, error: rpcError } = await supabaseAdmin
      .rpc('generate_consignment_report_number', { p_company_id: companyId });

    if (rpcError || !reportNumber) {
      console.error('RPC generate_consignment_report_number error:', rpcError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างเลขรายงานได้' }, { status: 500 });
    }

    // Generate report_token
    const reportToken = crypto.randomUUID();

    // Calculate totals
    let totalQtySold = 0;
    let totalOurAmount = 0;

    const itemsWithAmounts = (items || []).map(item => {
      // unit_price is already net (after per-item GP deduction)
      const ourAmount = item.qty_sold * item.unit_price;
      totalQtySold += item.qty_sold;
      totalOurAmount += ourAmount;
      return { ...item, our_amount: ourAmount };
    });

    // Calculate due_date: period end of month + report_due_days from customer
    const { data: customerDetails } = await supabaseAdmin
      .from('customers')
      .select('consignment_report_due_days')
      .eq('id', customer_id)
      .single();

    const dueDays = customerDetails?.consignment_report_due_days ?? 15;
    const periodEnd = new Date(period_year, period_month, 0); // last day of period month
    const dueDate = new Date(periodEnd);
    dueDate.setDate(dueDate.getDate() + dueDays);

    // Insert consignment report
    // Admin-keyed → invoiced (skip draft/received), portal → draft
    const initialStatus = isAdminKeyed ? 'invoiced' : 'draft';
    const now = new Date().toISOString();

    const { data: report, error: insertError } = await supabaseAdmin
      .from('consignment_reports')
      .insert({
        company_id: companyId,
        customer_id,
        report_number: reportNumber,
        report_token: reportToken,
        period_year,
        period_month,
        status: initialStatus,
        total_qty_sold: totalQtySold,
        our_amount: totalOurAmount,
        due_date: dueDate.toISOString().split('T')[0],
        notes: notes ?? null,
        created_by: userId ?? null,
        ...(isAdminKeyed ? {
          received_at: now,
          confirmed_at: now,
          confirmed_by: userId ?? null,
        } : {}),
      })
      .select('id')
      .single();

    if (insertError || !report) {
      console.error('Insert consignment report error:', insertError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างรายงานได้' }, { status: 500 });
    }

    // Insert report items
    if (itemsWithAmounts.length > 0) {
      const itemRows = itemsWithAmounts.map(item => ({
        report_id: report.id,
        variation_id: item.variation_id,
        qty_sold: item.qty_sold,
        qty_returned: item.qty_returned,
        unit_price: item.unit_price,
        gp_rate: item.gp_rate,
        our_amount: item.our_amount,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('consignment_report_items')
        .insert(itemRows);

      if (itemsError) {
        console.error('Insert report items error:', itemsError);
        // Rollback report
        await supabaseAdmin.from('consignment_reports').delete().eq('id', report.id);
        return NextResponse.json({ error: 'ไม่สามารถบันทึกรายการได้' }, { status: 500 });
      }

    }

    // Admin-keyed: deduct stock from consignment warehouse immediately
    if (isAdminKeyed && itemsWithAmounts.length > 0) {
      const { data: warehouse } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('company_id', companyId)
        .eq('customer_id', customer_id)
        .eq('warehouse_type', 'consignment')
        .single();

      if (warehouse) {
        for (const item of itemsWithAmounts) {
          if (!item.variation_id || item.qty_sold <= 0) continue;

          const { data: inv } = await supabaseAdmin
            .from('inventory')
            .select('id, quantity')
            .eq('company_id', companyId)
            .eq('warehouse_id', warehouse.id)
            .eq('variation_id', item.variation_id)
            .single();

          if (!inv) continue;

          const newQty = Math.max(0, (inv.quantity || 0) - item.qty_sold);

          await supabaseAdmin
            .from('inventory')
            .update({ quantity: newQty, updated_at: now })
            .eq('id', inv.id);

          await supabaseAdmin
            .from('inventory_transactions')
            .insert({
              company_id: companyId,
              warehouse_id: warehouse.id,
              variation_id: item.variation_id,
              type: 'out',
              quantity: item.qty_sold,
              balance_after: newQty,
              reference_type: 'consignment_report',
              reference_id: report.id,
              notes: `ตัดสต๊อกจากรายงาน (คีย์โดย admin) ${reportNumber}`,
              created_by: userId ?? null,
            });
        }
      }
    }

    // Auto create statement for admin-keyed reports
    let stResult = null;
    if (isAdminKeyed) {
      try {
        const { createStatementForReport } = await import('@/lib/statement-service');
        stResult = await createStatementForReport(
          report.id, customer_id, companyId, userId ?? null,
          totalOurAmount, period_year, period_month
        );
      } catch (err) {
        console.error('Auto create statement error:', err);
      }
    }

    return NextResponse.json({
      success: true,
      report_id: report.id,
      report_number: reportNumber,
      status: stResult?.statementId ? 'billed' : initialStatus,
      statement_id: stResult?.statementId || null,
      statement_number: stResult?.statementNumber || null,
    });
  } catch (error) {
    console.error('POST consignment reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

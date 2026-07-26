// Admin API for department store reports — requires authentication
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { deductStock } from '@/lib/stock-service';
import { createStatementForReport } from '@/lib/statement-service';

// GET — List department store reports with filters
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId } = auth;
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status');
    const customerId = searchParams.get('customer_id');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build query
    let query = supabaseAdmin
      .from('department_store_reports')
      .select(`
        id, report_number, period_year, period_month, status,
        total_qty_sold, our_amount, due_date, statement_id,
        printed_invoice_at, printed_statement_at,
        created_at, confirmed_at, notes,
        customer:customers(id, name, customer_code),
        counter:consignment_counters(id, name)
      `, { count: 'exact' })
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (customerId) {
      query = query.eq('customer_id', customerId);
    }

    const { data: reports, error, count } = await query;

    if (error) {
      console.error('GET department store reports error:', error);
      return NextResponse.json({ error: 'ไม่สามารถดึงข้อมูลรายงานได้' }, { status: 500 });
    }

    // Get status counts
    const { data: statusData } = await supabaseAdmin
      .from('department_store_reports')
      .select('status')
      .eq('company_id', companyId);

    const statusCounts: Record<string, number> = {
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
    console.error('GET department store reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Create new department store report
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
      counter_id,
      period_year,
      period_month,
      notes,
      items,
    } = body as {
      customer_id: string;
      counter_id?: string | null;
      period_year: number;
      period_month: number;
      notes?: string;
      items: Array<{
        variation_id: string;
        qty_sold: number;
        qty_returned: number;
        unit_price: number;
        gp_rate: number;
      }>;
    };

    if (!customer_id || !period_year || !period_month) {
      return NextResponse.json(
        { error: 'กรุณาระบุลูกค้า และรอบรายงาน' },
        { status: 400 }
      );
    }

    // Verify customer belongs to this company
    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('id, company_id, type, credit_days')
      .eq('id', customer_id)
      .eq('company_id', companyId)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 });
    }

    // Validate branch counter belongs to this customer
    if (counter_id) {
      const { data: counter } = await supabaseAdmin
        .from('consignment_counters')
        .select('id')
        .eq('id', counter_id)
        .eq('company_id', companyId)
        .eq('customer_id', customer_id)
        .eq('is_active', true)
        .maybeSingle();
      if (!counter) {
        return NextResponse.json({ error: 'ไม่พบสาขาของลูกค้ารายนี้' }, { status: 400 });
      }
    }

    // Generate report_number via RPC
    const { data: reportNumber, error: rpcError } = await supabaseAdmin
      .rpc('generate_department_store_report_number', { p_company_id: companyId });

    if (rpcError || !reportNumber) {
      console.error('RPC generate_department_store_report_number error:', rpcError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างเลขรายงานได้' }, { status: 500 });
    }

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

    // Calculate due_date using credit_days
    const creditDays = customer.credit_days ?? 30;
    const periodEnd = new Date(period_year, period_month, 0); // last day of period month
    const dueDate = new Date(periodEnd);
    dueDate.setDate(dueDate.getDate() + creditDays);

    // Insert department store report as 'draft' (INV + ST issued on confirm)
    const { data: report, error: insertError } = await supabaseAdmin
      .from('department_store_reports')
      .insert({
        company_id: companyId,
        customer_id,
        counter_id: counter_id || null,
        report_number: reportNumber,
        period_year,
        period_month,
        status: 'draft',
        total_qty_sold: totalQtySold,
        our_amount: totalOurAmount,
        due_date: dueDate.toISOString().split('T')[0],
        notes: notes ?? null,
        created_by: userId ?? null,
      })
      .select('id')
      .single();

    if (insertError || !report) {
      console.error('Insert department store report error:', insertError);
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
        .from('department_store_report_items')
        .insert(itemRows);

      if (itemsError) {
        console.error('Insert report items error:', itemsError);
        // Rollback report
        await supabaseAdmin.from('department_store_reports').delete().eq('id', report.id);
        return NextResponse.json({ error: 'ไม่สามารถบันทึกรายการได้' }, { status: 500 });
      }
    }

    // Stock deduction + INV + ST will be done on confirm (พร้อมวางบิล)

    return NextResponse.json({
      success: true,
      report_id: report.id,
      report_number: reportNumber,
      status: 'draft',
    });
  } catch (error) {
    console.error('POST department store reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

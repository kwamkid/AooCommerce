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
        total_qty_sold, our_amount, due_date, report_token,
        created_at, confirmed_at, received_at, notes,
        customer:customers(id, name, customer_code),
        created_by_profile:user_profiles!consignment_reports_created_by_fkey(id, full_name)
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
    } = body as {
      customer_id: string;
      period_year: number;
      period_month: number;
      notes?: string;
      items: Array<{
        batch_item_id?: string;
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
      const ourAmount = item.qty_sold * item.unit_price * (1 - item.gp_rate / 100);
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
    const { data: report, error: insertError } = await supabaseAdmin
      .from('consignment_reports')
      .insert({
        company_id: companyId,
        customer_id,
        report_number: reportNumber,
        report_token: reportToken,
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
      console.error('Insert consignment report error:', insertError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างรายงานได้' }, { status: 500 });
    }

    // Insert report items
    if (itemsWithAmounts.length > 0) {
      const itemRows = itemsWithAmounts.map(item => ({
        consignment_report_id: report.id,
        batch_item_id: item.batch_item_id ?? null,
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

      // Update consignment_batch_items — fetch then increment
      for (const item of itemsWithAmounts) {
        if (item.batch_item_id) {
          const { data: batchItem } = await supabaseAdmin
            .from('consignment_batch_items')
            .select('qty_sold, qty_returned')
            .eq('id', item.batch_item_id)
            .single();

          if (batchItem) {
            await supabaseAdmin
              .from('consignment_batch_items')
              .update({
                qty_sold: (batchItem.qty_sold ?? 0) + item.qty_sold,
                qty_returned: (batchItem.qty_returned ?? 0) + item.qty_returned,
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.batch_item_id);
          }
        }
      }
    }

    return NextResponse.json({ success: true, report_id: report.id, report_number: reportNumber });
  } catch (error) {
    console.error('POST consignment reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

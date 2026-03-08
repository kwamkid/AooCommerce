import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — List statements with filters
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
    const month = searchParams.get('month'); // YYYYMM
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('statements')
      .select(`
        id, statement_number, status, statement_date, due_date,
        period_year, period_month,
        total_amount, paid_amount, outstanding_amount,
        printed_statement_at,
        notes, created_at,
        customer:customers(id, name, customer_code)
      `, { count: 'exact' })
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }
    if (customerId) {
      query = query.eq('customer_id', customerId);
    }
    if (month && month.length === 6) {
      const year = parseInt(month.slice(0, 4));
      const mon = parseInt(month.slice(4, 6));
      query = query.eq('period_year', year).eq('period_month', mon);
    }
    if (search) {
      query = query.or(
        `statement_number.ilike.%${search}%`
      );
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('GET statements error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Status counts
    const { data: statusData } = await supabaseAdmin
      .from('statements')
      .select('status')
      .eq('company_id', companyId);

    const statusCounts: Record<string, number> = {
      draft: 0, sent: 0, partially_paid: 0, paid: 0, overdue: 0,
    };
    for (const row of statusData || []) {
      if (row.status in statusCounts) statusCounts[row.status]++;
    }

    // Enrich with document data from document tables
    const statementIds = (data || []).map((s: any) => s.id);
    let docMap: Record<string, { tax_invoice_number?: string; receipt_number?: string }> = {};
    if (statementIds.length > 0) {
      const [taxRes, recRes] = await Promise.all([
        supabaseAdmin.from('tax_invoices')
          .select('source_id, invoice_number')
          .eq('source_type', 'statement').eq('company_id', companyId)
          .in('source_id', statementIds),
        supabaseAdmin.from('receipts')
          .select('source_id, receipt_number')
          .eq('source_type', 'statement').eq('company_id', companyId)
          .in('source_id', statementIds),
      ]);
      for (const row of taxRes.data || []) {
        docMap[row.source_id] = { ...docMap[row.source_id], tax_invoice_number: row.invoice_number };
      }
      for (const row of recRes.data || []) {
        docMap[row.source_id] = { ...docMap[row.source_id], receipt_number: row.receipt_number };
      }
    }
    const enrichedStatements = (data || []).map((s: any) => ({
      ...s,
      tax_invoice_number: docMap[s.id]?.tax_invoice_number || null,
      receipt_number: docMap[s.id]?.receipt_number || null,
    }));

    return NextResponse.json({
      statements: enrichedStatements,
      total: count || 0,
      status_counts: statusCounts,
    });
  } catch (error) {
    console.error('GET statements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Create statement from confirmed consignment report(s)
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId, userId } = auth;
    const body = await request.json();
    const { customer_id, report_ids, notes } = body as {
      customer_id: string;
      report_ids: string[];
      notes?: string;
    };

    if (!customer_id || !report_ids?.length) {
      return NextResponse.json({ error: 'กรุณาระบุลูกค้าและรายงานที่ต้องการวางบิล' }, { status: 400 });
    }

    // Validate reports: must be invoiced, same customer, same company
    const { data: reports, error: reportsErr } = await supabaseAdmin
      .from('consignment_reports')
      .select('id, status, customer_id, our_amount, period_year, period_month, statement_id')
      .eq('company_id', companyId)
      .eq('customer_id', customer_id)
      .in('id', report_ids);

    if (reportsErr || !reports?.length) {
      return NextResponse.json({ error: 'ไม่พบรายงานที่ระบุ' }, { status: 404 });
    }

    // Check all reports are in 'invoiced' status and not already billed
    const invalidReports = reports.filter(r => r.status !== 'invoiced' || r.statement_id);
    if (invalidReports.length > 0) {
      return NextResponse.json({
        error: `มีรายงานที่ไม่สามารถวางบิลได้ (สถานะต้องเป็น "ออก invoice" และยังไม่เคยวางบิล)`,
      }, { status: 400 });
    }

    // Calculate totals
    const totalAmount = reports.reduce((sum, r) => sum + (r.our_amount || 0), 0);

    // Use period from first report (or current date)
    const periodYear = reports[0].period_year;
    const periodMonth = reports[0].period_month;

    // Get customer payment terms for due_date
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('consignment_payment_terms')
      .eq('id', customer_id)
      .single();

    const paymentTerms = customer?.consignment_payment_terms ?? 30;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTerms);

    // Generate statement number
    const { data: statementNumber, error: rpcErr } = await supabaseAdmin
      .rpc('generate_statement_number', { p_company_id: companyId });

    if (rpcErr || !statementNumber) {
      console.error('RPC generate_statement_number error:', rpcErr);
      return NextResponse.json({ error: 'ไม่สามารถสร้างเลขที่ใบวางบิลได้' }, { status: 500 });
    }

    // Create statement
    const { data: statement, error: insertErr } = await supabaseAdmin
      .from('statements')
      .insert({
        company_id: companyId,
        customer_id,
        statement_number: statementNumber,
        status: 'sent',
        statement_date: new Date().toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        period_year: periodYear,
        period_month: periodMonth,
        total_amount: totalAmount,
        paid_amount: 0,
        notes: notes || null,
        created_by: userId ?? null,
      })
      .select('id, statement_number')
      .single();

    if (insertErr || !statement) {
      console.error('Insert statement error:', insertErr);
      return NextResponse.json({ error: 'ไม่สามารถสร้างใบวางบิลได้' }, { status: 500 });
    }

    // Link reports to statement and update status → billed
    for (const report of reports) {
      await supabaseAdmin
        .from('consignment_reports')
        .update({
          statement_id: statement.id,
          status: 'billed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', report.id);
    }

    return NextResponse.json({
      success: true,
      statement_id: statement.id,
      statement_number: statement.statement_number,
    });
  } catch (error) {
    console.error('POST statements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

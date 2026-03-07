import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — Statement detail with linked reports and payments
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId } = auth;
    const { id } = await context.params;

    // Fetch statement
    const { data: statement, error } = await supabaseAdmin
      .from('statements')
      .select(`
        id, statement_number, status, statement_date, due_date,
        period_year, period_month,
        total_amount, paid_amount, outstanding_amount,
        notes, created_at,
        customer_id,
        customer:customers(id, name, customer_code, phone,
          tax_company_name, tax_id, tax_branch,
          billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code
        )
      `)
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (error || !statement) {
      return NextResponse.json({ error: 'ไม่พบใบวางบิล' }, { status: 404 });
    }

    // Fetch linked consignment reports
    const { data: reports } = await supabaseAdmin
      .from('consignment_reports')
      .select(`
        id, report_number, period_year, period_month,
        total_qty_sold, our_amount, status,
        items:consignment_report_items(
          id, variation_id, qty_sold, unit_price, gp_rate, our_amount,
          variation:product_variations(id, sku, variation_label, product_id, products(name))
        )
      `)
      .eq('statement_id', id)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });

    // Fetch payments
    const { data: payments } = await supabaseAdmin
      .from('statement_payments')
      .select('id, amount, paid_at, payment_method, reference, notes, created_by')
      .eq('statement_id', id)
      .order('paid_at', { ascending: false });

    // Enrich with document data from document tables
    const [taxRes, recRes] = await Promise.all([
      supabaseAdmin.from('tax_invoices')
        .select('invoice_number, invoice_date')
        .eq('source_type', 'statement').eq('source_id', id).eq('company_id', companyId)
        .maybeSingle(),
      supabaseAdmin.from('receipts')
        .select('receipt_number, receipt_date')
        .eq('source_type', 'statement').eq('source_id', id).eq('company_id', companyId)
        .maybeSingle(),
    ]);

    const enrichedStatement = {
      ...statement,
      tax_invoice_number: taxRes.data?.invoice_number || null,
      tax_invoice_date: taxRes.data?.invoice_date || null,
      receipt_number: recRes.data?.receipt_number || null,
      receipt_date: recRes.data?.receipt_date || null,
    };

    return NextResponse.json({
      statement: enrichedStatement,
      reports: reports || [],
      payments: payments || [],
    });
  } catch (error) {
    console.error('GET statement detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — Actions on statement (record payment, issue invoices)
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId, userId } = auth;
    const { id } = await context.params;

    const body = await request.json();
    const { action } = body as { action: string };

    // Validate statement
    const { data: statement, error: fetchErr } = await supabaseAdmin
      .from('statements')
      .select('id, status, total_amount, paid_amount, customer_id')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (fetchErr || !statement) {
      return NextResponse.json({ error: 'ไม่พบใบวางบิล' }, { status: 404 });
    }

    if (action === 'record_payment') {
      const { amount, payment_method, reference, notes } = body as {
        amount: number;
        payment_method?: string;
        reference?: string;
        notes?: string;
      };

      if (!amount || amount <= 0) {
        return NextResponse.json({ error: 'กรุณาระบุจำนวนเงิน' }, { status: 400 });
      }

      if (['paid'].includes(statement.status)) {
        return NextResponse.json({ error: 'ใบวางบิลนี้ชำระครบแล้ว' }, { status: 400 });
      }

      // Insert payment
      const { error: payErr } = await supabaseAdmin
        .from('statement_payments')
        .insert({
          statement_id: id,
          amount,
          paid_at: new Date().toISOString(),
          payment_method: payment_method || null,
          reference: reference || null,
          notes: notes || null,
          created_by: userId ?? null,
        });

      if (payErr) {
        console.error('Insert payment error:', payErr);
        return NextResponse.json({ error: 'ไม่สามารถบันทึกการชำระเงินได้' }, { status: 500 });
      }

      // Update statement paid_amount and status
      const newPaid = (statement.paid_amount || 0) + amount;
      const newStatus = newPaid >= statement.total_amount ? 'paid' : 'partially_paid';

      await supabaseAdmin
        .from('statements')
        .update({
          paid_amount: newPaid,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      // If fully paid, update linked reports to 'paid' + auto issue invoices
      let autoInvoiceResult: { taxNumber?: string; recNumber?: string } | null = null;
      if (newStatus === 'paid') {
        await supabaseAdmin
          .from('consignment_reports')
          .update({ status: 'paid', updated_at: new Date().toISOString() })
          .eq('statement_id', id);

        // Auto issue invoices
        try {
          const { data: cust } = await supabaseAdmin
            .from('customers')
            .select('consignment_mode')
            .eq('id', statement.customer_id)
            .single();

          if (cust?.consignment_mode === 'dn') {
            // DN mode: จด VAT → ใบกำกับภาษี/ใบเสร็จ (TAX เลขเดียว), ไม่จด → ใบเสร็จ (REC เลขเดียว)
            const { issueConsignmentInvoices } = await import('@/lib/invoice-service');
            const result = await issueConsignmentInvoices(id, companyId);
            if (result.success) {
              autoInvoiceResult = { taxNumber: result.taxNumber, recNumber: result.recNumber };
            }
          } else {
            // Invoice mode: TAX ออกตอน ship แล้ว → ออกแค่ REC
            const { data: recNumber } = await supabaseAdmin
              .rpc('generate_receipt_number', { p_company_id: companyId });
            if (recNumber) {
              const recDate = new Date().toISOString().split('T')[0];
              // Insert into document table (single source of truth)
              const { insertReceipt } = await import('@/lib/invoice-service');
              await insertReceipt({
                company_id: companyId, receipt_number: recNumber, receipt_date: recDate,
                source_type: 'statement', source_id: id, customer_id: statement.customer_id,
                total_amount: statement.total_amount ?? 0,
              });
              autoInvoiceResult = { recNumber };
            }
          }
        } catch (err) {
          console.error('Auto issue invoices on payment error:', err);
          // ไม่ให้ payment fail — ปุ่ม manual ยังเป็น fallback
        }
      }

      return NextResponse.json({
        success: true,
        paid_amount: newPaid,
        status: newStatus,
        tax_invoice_number: autoInvoiceResult?.taxNumber || null,
        receipt_number: autoInvoiceResult?.recNumber || null,
      });
    }

    if (action === 'issue_invoices') {
      // Issue TAX + REC for fully-paid statement
      if (statement.status !== 'paid') {
        return NextResponse.json({
          error: 'ต้องชำระเงินครบก่อนจึงจะออกใบกำกับภาษีและใบเสร็จได้',
        }, { status: 400 });
      }

      const { issueConsignmentInvoices } = await import('@/lib/invoice-service');
      const result = await issueConsignmentInvoices(id, companyId);

      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        tax_invoice_number: result.taxNumber,
        receipt_number: result.recNumber,
      });
    }

    return NextResponse.json({ error: `Action "${action}" ไม่รองรับ` }, { status: 400 });
  } catch (error) {
    console.error('PUT statement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

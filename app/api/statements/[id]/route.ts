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

    // Enrich reports with TAX/INV numbers
    if (reports?.length) {
      const reportIds = reports.map((r: { id: string }) => r.id);
      const [{ data: taxDocs }, { data: invDocs }] = await Promise.all([
        supabaseAdmin.from('tax_invoices')
          .select('source_id, invoice_number')
          .eq('source_type', 'consignment_report').in('source_id', reportIds)
          .eq('company_id', companyId).is('voided_at', null),
        supabaseAdmin.from('invoices')
          .select('source_id, invoice_number')
          .eq('source_type', 'consignment_report').in('source_id', reportIds)
          .eq('company_id', companyId).is('voided_at', null),
      ]);
      const taxMap = new Map((taxDocs || []).map(d => [d.source_id, d.invoice_number]));
      const invMap = new Map((invDocs || []).map(d => [d.source_id, d.invoice_number]));
      for (const r of reports as any[]) {
        r.doc_number = taxMap.get(r.id) || invMap.get(r.id) || null;
      }
    }

    // Fetch payments
    const { data: payments } = await supabaseAdmin
      .from('statement_payments')
      .select('id, amount, paid_at, payment_method, reference, notes, created_by')
      .eq('statement_id', id)
      .order('paid_at', { ascending: false });

    // Enrich with document data from document tables
    // 1. Try TAX/REC linked directly to statement
    const [taxRes, recRes] = await Promise.all([
      supabaseAdmin.from('tax_invoices')
        .select('invoice_number, invoice_date')
        .eq('source_type', 'statement').eq('source_id', id).eq('company_id', companyId)
        .is('voided_at', null)
        .maybeSingle(),
      supabaseAdmin.from('receipts')
        .select('receipt_number, receipt_date')
        .eq('source_type', 'statement').eq('source_id', id).eq('company_id', companyId)
        .maybeSingle(),
    ]);

    // 2. If no TAX on statement, look for TAX on linked consignment reports
    let taxNumber = taxRes.data?.invoice_number || null;
    let taxDate = taxRes.data?.invoice_date || null;
    if (!taxNumber && reports?.length) {
      const reportIds = reports.map((r: { id: string }) => r.id);
      const { data: reportTax } = await supabaseAdmin.from('tax_invoices')
        .select('invoice_number, invoice_date')
        .eq('source_type', 'consignment_report').in('source_id', reportIds)
        .eq('company_id', companyId).is('voided_at', null)
        .limit(1)
        .maybeSingle();
      if (reportTax) {
        taxNumber = reportTax.invoice_number;
        taxDate = reportTax.invoice_date;
      }
    }
    // 3. If still no TAX, try INV (invoices table) on linked reports
    let invNumber: string | null = null;
    let invDate: string | null = null;
    if (!taxNumber && reports?.length) {
      const reportIds = reports.map((r: { id: string }) => r.id);
      const { data: reportInv } = await supabaseAdmin.from('invoices')
        .select('invoice_number, invoice_date')
        .eq('source_type', 'consignment_report').in('source_id', reportIds)
        .eq('company_id', companyId).is('voided_at', null)
        .limit(1)
        .maybeSingle();
      if (reportInv) {
        invNumber = reportInv.invoice_number;
        invDate = reportInv.invoice_date;
      }
    }

    const enrichedStatement = {
      ...statement,
      tax_invoice_number: taxNumber,
      tax_invoice_date: taxDate,
      invoice_number: invNumber,
      invoice_date: invDate,
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
      const { amount, payment_method, reference, notes, receipt_date } = body as {
        amount: number;
        payment_method?: string;
        reference?: string;
        notes?: string;
        receipt_date?: string;
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

      // If fully paid, update linked reports to 'paid' + issue receipt
      let receiptResult: { receiptNumber?: string } | null = null;
      if (newStatus === 'paid') {
        // Update consignment reports status
        await supabaseAdmin
          .from('consignment_reports')
          .update({ status: 'paid', updated_at: new Date().toISOString() })
          .eq('statement_id', id);

        // Update department store reports status
        await supabaseAdmin
          .from('department_store_reports')
          .update({ status: 'paid', updated_at: new Date().toISOString() })
          .eq('statement_id', id);

        // Find reference document number (TAX or INV issued at report creation)
        let refNumber: string | null = null;
        // Check TAX first (Flow C จด VAT)
        const { data: linkedReports } = await supabaseAdmin
          .from('consignment_reports')
          .select('id')
          .eq('statement_id', id)
          .limit(1);
        const { data: linkedDeptReports } = await supabaseAdmin
          .from('department_store_reports')
          .select('id')
          .eq('statement_id', id)
          .limit(1);

        const reportIds = [
          ...(linkedReports || []).map(r => r.id),
          ...(linkedDeptReports || []).map(r => r.id),
        ];

        if (reportIds.length > 0) {
          // Check tax_invoices for TAX ref
          const { data: taxDoc } = await supabaseAdmin
            .from('tax_invoices')
            .select('invoice_number')
            .in('source_id', reportIds)
            .is('voided_at', null)
            .limit(1)
            .maybeSingle();
          if (taxDoc) refNumber = taxDoc.invoice_number;

          // If no TAX, check invoices for INV ref
          if (!refNumber) {
            const { data: invDoc } = await supabaseAdmin
              .from('invoices')
              .select('invoice_number')
              .in('source_id', reportIds)
              .is('voided_at', null)
              .limit(1)
              .maybeSingle();
            if (invDoc) refNumber = invDoc.invoice_number;
          }
        }

        // Issue REC with custom date + reference
        try {
          const { issuePaymentReceipt } = await import('@/lib/invoice-service');
          const result = await issuePaymentReceipt(
            id, companyId, statement.customer_id, statement.total_amount,
            receipt_date || undefined,
            refNumber || undefined,
          );
          if (result.success) receiptResult = { receiptNumber: result.receiptNumber };
        } catch (err) {
          console.error('Auto issue receipt on payment error:', err);
        }
      }

      return NextResponse.json({
        success: true,
        paid_amount: newPaid,
        status: newStatus,
        receipt_number: receiptResult?.receiptNumber || null,
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

    if (action === 'reverse_payment') {
      // Allow reversing paid OR already-sent (fix stale reports)
      if (!['paid', 'sent'].includes(statement.status)) {
        return NextResponse.json({ error: 'ไม่สามารถยกเลิกการชำระได้ในสถานะนี้' }, { status: 400 });
      }

      const now = new Date().toISOString();
      const voidReason = 'ยกเลิกการชำระ (reverse payment)';

      // 1. Void tax_invoices linked to this statement
      await supabaseAdmin
        .from('tax_invoices')
        .update({ voided_at: now, voided_reason: voidReason })
        .eq('source_type', 'statement')
        .eq('source_id', id)
        .is('voided_at', null);

      // 2. Void receipts linked to this statement
      await supabaseAdmin
        .from('receipts')
        .update({ voided_at: now, voided_reason: voidReason })
        .eq('source_type', 'statement')
        .eq('source_id', id)
        .is('voided_at', null);

      // 3. Delete all payment records for this statement
      await supabaseAdmin
        .from('statement_payments')
        .delete()
        .eq('statement_id', id);

      // 4. Reset statement to 'sent' with paid_amount = 0
      await supabaseAdmin
        .from('statements')
        .update({
          status: 'sent',
          paid_amount: 0,
          updated_at: now,
        })
        .eq('id', id);

      // 5. Revert linked consignment_reports back from 'paid' to 'billed'
      await supabaseAdmin
        .from('consignment_reports')
        .update({ status: 'billed', updated_at: now })
        .eq('statement_id', id)
        .eq('status', 'paid');

      return NextResponse.json({ success: true, status: 'sent' });
    }

    return NextResponse.json({ error: `Action "${action}" ไม่รองรับ` }, { status: 400 });
  } catch (error) {
    console.error('PUT statement error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

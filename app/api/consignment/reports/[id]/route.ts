// Admin API for consignment report detail — requires authentication
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { deductStock } from '@/lib/stock-service';

// GET — Fetch single report detail with items, customer, batch info
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
    const { id: reportId } = await context.params;

    const { data: report, error } = await supabaseAdmin
      .from('consignment_reports')
      .select(`
        id, report_number, period_year, period_month, status,
        total_qty_sold, our_amount, due_date, report_token, statement_id,
        created_at, updated_at, confirmed_at, received_at, notes,
        customer:customers(
          id, name, customer_code, phone, email, contact_person,
          consignment_mode, portal_token,
          tax_company_name, tax_id, tax_branch,
          billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code
        ),
        items:consignment_report_items(
          id, variation_id, qty_sold, qty_returned, unit_price, gp_rate, our_amount,
          batch_item_id,
          variation:product_variations(id, sku, variation_label, product_id, products(name, image))
        )
      `)
      .eq('id', reportId)
      .eq('company_id', companyId)
      .single();

    if (error || !report) {
      console.error('GET consignment report query error:', error);
      return NextResponse.json({ error: 'ไม่พบรายงาน' }, { status: 404 });
    }

    // Fetch linked documents (TAX/INV)
    const [taxRes, invRes] = await Promise.all([
      supabaseAdmin.from('tax_invoices')
        .select('invoice_number, invoice_date, document_subtype')
        .eq('source_type', 'consignment_report').eq('source_id', reportId)
        .eq('company_id', companyId).is('voided_at', null)
        .maybeSingle(),
      supabaseAdmin.from('invoices')
        .select('invoice_number, invoice_date')
        .eq('source_type', 'consignment_report').eq('source_id', reportId)
        .eq('company_id', companyId).is('voided_at', null)
        .maybeSingle(),
    ]);

    // Get company VAT status
    const { data: companyData } = await supabaseAdmin
      .from('companies').select('vat_registered').eq('id', companyId).single();

    const enriched = {
      ...report,
      tax_invoice_number: taxRes.data?.invoice_number || null,
      tax_invoice_date: taxRes.data?.invoice_date || null,
      document_subtype: taxRes.data?.document_subtype || null,
      invoice_number: invRes.data?.invoice_number || null,
      invoice_date: invRes.data?.invoice_date || null,
      vat_registered: companyData?.vat_registered ?? false,
    };

    return NextResponse.json({ report: enriched });
  } catch (error) {
    console.error('GET consignment report detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — Perform actions on a report
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
    const { id: reportId } = await context.params;

    const body = await request.json();
    const { action } = body as { action: 'confirm' | 'cancel' | 'update_items' | 'void' };

    if (!action) {
      return NextResponse.json({ error: 'กรุณาระบุ action' }, { status: 400 });
    }

    // Fetch report to validate state
    const { data: report, error: fetchError } = await supabaseAdmin
      .from('consignment_reports')
      .select('id, status, company_id, customer_id, our_amount, period_year, period_month, statement_id')
      .eq('id', reportId)
      .eq('company_id', companyId)
      .single();

    if (fetchError || !report) {
      return NextResponse.json({ error: 'ไม่พบรายงาน' }, { status: 404 });
    }

    if (action === 'confirm') {
      // Confirm: draft/received → invoiced + deduct stock from consignment warehouse
      if (!['draft', 'received'].includes(report.status)) {
        return NextResponse.json(
          { error: `ไม่สามารถยืนยันรายงานที่มีสถานะ "${report.status}" ได้` },
          { status: 400 }
        );
      }

      // 1. Find dealer's consignment warehouse
      const { data: warehouse } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('company_id', companyId)
        .eq('customer_id', report.customer_id)
        .eq('warehouse_type', 'consignment')
        .single();

      if (!warehouse) {
        return NextResponse.json({ error: 'ไม่พบคลังฝากขายของตัวแทนนี้' }, { status: 400 });
      }

      // 2. Fetch report items
      const { data: reportItems } = await supabaseAdmin
        .from('consignment_report_items')
        .select('id, variation_id, qty_sold')
        .eq('report_id', reportId);

      // 3. Deduct stock for each item
      for (const item of reportItems || []) {
        if (!item.variation_id || item.qty_sold <= 0) continue;

        await deductStock({
          supabase: supabaseAdmin,
          companyId,
          warehouseId: warehouse.id,
          variationId: item.variation_id,
          qty: item.qty_sold,
          referenceType: 'consignment_report',
          referenceId: reportId,
          notes: `ตัดสต๊อกจากรายงานฝากขาย ${reportId}`,
          createdBy: userId ?? null,
        });
      }

      // 4. Update report status
      const { error: updateError } = await supabaseAdmin
        .from('consignment_reports')
        .update({
          status: 'invoiced',
          confirmed_at: new Date().toISOString(),
          confirmed_by: userId ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reportId);

      if (updateError) {
        console.error('Confirm report error:', updateError);
        return NextResponse.json({ error: 'ไม่สามารถยืนยันรายงานได้' }, { status: 500 });
      }

      // Auto create statement (ใบวางบิล)
      let stResult = null;
      try {
        const { createStatementForReport } = await import('@/lib/statement-service');
        stResult = await createStatementForReport(
          reportId, report.customer_id, companyId, userId ?? null,
          report.our_amount, report.period_year, report.period_month
        );
      } catch (err) {
        console.error('Auto create statement error:', err);
      }

      return NextResponse.json({
        success: true,
        status: stResult?.statementId ? 'billed' : 'invoiced',
        statement_id: stResult?.statementId || null,
        statement_number: stResult?.statementNumber || null,
      });
    }

    if (action === 'void') {
      // Void: billed/invoiced → cancelled + void linked documents
      if (!['billed', 'invoiced'].includes(report.status)) {
        return NextResponse.json({ error: `สถานะ "${report.status}" ไม่สามารถ void ได้` }, { status: 400 });
      }

      const now = new Date().toISOString();
      const voidReason = 'ยกเลิกรายงานยอดขาย';

      // Void TAX invoices linked to this report
      await supabaseAdmin.from('tax_invoices')
        .update({ voided_at: now, voided_reason: voidReason })
        .eq('source_type', 'consignment_report').eq('source_id', reportId)
        .is('voided_at', null);

      // Void INV invoices linked to this report
      await supabaseAdmin.from('invoices')
        .update({ voided_at: now, voided_reason: voidReason })
        .eq('source_type', 'consignment_report').eq('source_id', reportId)
        .is('voided_at', null);

      // Void linked statement
      if (report.statement_id) {
        await supabaseAdmin.from('statements')
          .update({ status: 'cancelled', updated_at: now })
          .eq('id', report.statement_id);
      }

      // Cancel report
      await supabaseAdmin.from('consignment_reports')
        .update({ status: 'cancelled', updated_at: now })
        .eq('id', reportId);

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    if (action === 'cancel') {
      // Cancel: draft → cancelled
      if (report.status !== 'draft') {
        return NextResponse.json(
          { error: `ไม่สามารถยกเลิกรายงานที่มีสถานะ "${report.status}" ได้` },
          { status: 400 }
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from('consignment_reports')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', reportId);

      if (updateError) {
        console.error('Cancel report error:', updateError);
        return NextResponse.json({ error: 'ไม่สามารถยกเลิกรายงานได้' }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    if (action === 'update_items') {
      // Only allow editing for draft/received (before stock deduction)
      if (!['draft', 'received'].includes(report.status)) {
        return NextResponse.json(
          { error: `ไม่สามารถแก้ไขรายงานที่มีสถานะ "${report.status}" ได้` },
          { status: 400 }
        );
      }

      const { items, notes, period_year, period_month } = body as {
        items: Array<{
          variation_id: string;
          qty_sold: number;
          qty_returned: number;
          unit_price: number;
          gp_rate: number;
        }>;
        notes?: string;
        period_year?: number;
        period_month?: number;
      };

      if (!items || items.length === 0) {
        return NextResponse.json({ error: 'กรุณาเพิ่มรายการสินค้า' }, { status: 400 });
      }

      // Delete existing items
      await supabaseAdmin
        .from('consignment_report_items')
        .delete()
        .eq('report_id', reportId);

      // Calculate totals and insert new items
      let totalQtySold = 0;
      let totalOurAmount = 0;

      const itemRows = items.map(item => {
        // unit_price is already net (after per-item GP deduction)
        const ourAmount = item.qty_sold * item.unit_price;
        totalQtySold += item.qty_sold;
        totalOurAmount += ourAmount;
        return {
          report_id: reportId,
          variation_id: item.variation_id,
          qty_sold: item.qty_sold,
          qty_returned: item.qty_returned,
          unit_price: item.unit_price,
          gp_rate: item.gp_rate,
          our_amount: ourAmount,
        };
      });

      const { error: itemsError } = await supabaseAdmin
        .from('consignment_report_items')
        .insert(itemRows);

      if (itemsError) {
        console.error('Update report items error:', itemsError);
        return NextResponse.json({ error: 'ไม่สามารถบันทึกรายการได้' }, { status: 500 });
      }

      // Update report totals + fields
      const updateFields: Record<string, unknown> = {
        total_qty_sold: totalQtySold,
        our_amount: totalOurAmount,
        updated_at: new Date().toISOString(),
      };
      if (notes !== undefined) updateFields.notes = notes ?? null;
      if (period_year) updateFields.period_year = period_year;
      if (period_month) updateFields.period_month = period_month;

      const { error: updateError } = await supabaseAdmin
        .from('consignment_reports')
        .update(updateFields)
        .eq('id', reportId);

      if (updateError) {
        console.error('Update report error:', updateError);
        return NextResponse.json({ error: 'ไม่สามารถบันทึกรายงานได้' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Action "${action}" ไม่รองรับ` }, { status: 400 });
  } catch (error) {
    console.error('PUT consignment report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
